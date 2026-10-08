import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import type { HermesGithubIssue, HermesGithubPr, HermesGithubPrFile, HermesGithubSidebar } from '@/global'
import { getGhAuthStatus } from '@/hermes'
import { useI18n } from '@/i18n'
import { desktopGit } from '@/lib/desktop-git'
import { cn } from '@/lib/utils'

import { IdeDisclosure } from './ide-disclosure'

export const GITHUB_LOGIN_COMMAND = [
  '$g = $null',
  'if (Get-Command gh -ErrorAction SilentlyContinue) { $g = (Get-Command gh).Source }',
  'if (-not $g) { foreach ($p in @("$env:ProgramFiles\\GitHub CLI\\gh.exe", "$env:LOCALAPPDATA\\GitHub CLI\\gh.exe")) { if (Test-Path -LiteralPath $p) { $g = $p; break } } }',
  'if (-not $g) { winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements; $env:Path = [Environment]::GetEnvironmentVariable(\'Path\',\'Machine\') + \';\' + [Environment]::GetEnvironmentVariable(\'Path\',\'User\'); if (Get-Command gh -ErrorAction SilentlyContinue) { $g = (Get-Command gh).Source } else { $g = "$env:ProgramFiles\\GitHub CLI\\gh.exe" } }',
  '& $g auth login --hostname github.com --git-protocol https --web'
].join('; ')

const LETTER_TINT: Record<string, string> = {
  A: 'text-[#73c991]',
  D: 'text-[#c74e39]',
  M: 'text-[#e2c08d]',
  R: 'text-[#73c991]'
}

const EMPTY_SIDEBAR: HermesGithubSidebar = { issues: [], prs: [] }

export function IdeGithub({
  cwd,
  onClone,
  onComment,
  onLogin,
  onOpen,
  onOpenDoc,
  onPull,
  onPush
}: {
  cwd: null | string
  onClone: () => void
  onComment: (number: number, body: string) => void
  onLogin: () => void
  onOpen: (path: string) => void
  onOpenDoc: (title: string, markdown: string) => void
  onPull: () => void
  onPush: () => void
}) {
  const { t } = useI18n()
  const [ready, setReady] = useState<boolean | null>(null)
  const [account, setAccount] = useState('')
  const [sidebar, setSidebar] = useState<HermesGithubSidebar>(EMPTY_SIDEBAR)
  const [localBranches, setLocalBranches] = useState<string[]>([])
  const [open, setOpen] = useState({ all: true, created: false, issues: false, local: false, mine: false, recent: true, waiting: false })
  const [expanded, setExpanded] = useState<number | null>(null)
  const [prFiles, setPrFiles] = useState<Record<number, HermesGithubPrFile[]>>({})
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancelled = false
    let timer = 0

    const pull = () => {
      void getGhAuthStatus(true)
        .then(status => {
          if (cancelled) {
            return
          }

          const signedIn = status.available && status.authenticated

          setReady(signedIn)
          setAccount(status.account || '')

          if (!signedIn) {
            timer = window.setTimeout(pull, 4000)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setReady(false)
            timer = window.setTimeout(pull, 4000)
          }
        })
    }

    pull()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (!cwd || !ready) {
      return
    }

    let cancelled = false

    void desktopGit()
      ?.githubSidebar(cwd)
      .then(next => {
        if (!cancelled && next) {
          setSidebar(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSidebar(EMPTY_SIDEBAR)
        }
      })

    void desktopGit()
      ?.branchList(cwd)
      .then(branches => {
        if (!cancelled) {
          setLocalBranches((branches ?? []).filter(branch => !branch.isRemote).map(branch => branch.name))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalBranches([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [cwd, ready])

  const mine = (name: string) => sameName(name, account)
  const waiting = sidebar.prs.filter(pr => pr.reviewers.some(reviewer => mine(reviewer)))
  const created = sidebar.prs.filter(pr => mine(pr.author))
  const local = localBranches.filter(name => sidebar.prs.some(pr => sameName(pr.branch, name)))
  const myIssues = sidebar.issues.filter(issue => issue.assignees.some(assignee => mine(assignee)))
  const createdIssues = sidebar.issues.filter(issue => mine(issue.author))

  const runRemote = async (action: 'pull' | 'push') => {
    if (!cwd || busy) {
      return
    }

    setBusy(action === 'pull' ? t.ide.pull : t.ide.push)

    try {
      if (action === 'pull') {
        onPull()
      } else {
        onPush()
      }
    } finally {
      setBusy('')
    }
  }

  const openPrDoc = (pr: HermesGithubPr) => {
    const files = (prFiles[pr.number] ?? []).map(file => `- \`${file.mark}\` ${file.path}`).join('\n')

    onOpenDoc(
      `PR #${pr.number}`,
      [
        `# ${pr.title}`,
        '',
        pr.draft ? '_Draft pull request_' : '_Pull request_',
        '',
        `- Number: #${pr.number}`,
        `- Author: ${pr.author || 'unknown'}`,
        `- Branch: \`${pr.branch || 'unknown'}\``,
        `- URL: ${pr.url}`,
        '',
        '## Files',
        files || '_Expand the row to load files, or open the URL above._',
        '',
        '> Use **Comment** on the PR row to draft, confirm, then post with `gh pr comment`.'
      ].join('\n')
    )
  }

  const commentPr = (pr: HermesGithubPr) => {
    const body = window.prompt(t.ide.githubCommentPrompt)?.trim()

    if (!body) {
      if (body === '') {
        notifyEmptyComment()
      }

      return
    }

    if (!window.confirm(t.ide.githubCommentConfirm(body))) {
      return
    }

    onComment(pr.number, body)
  }

  const notifyEmptyComment = () => {
    window.alert(t.ide.githubCommentEmpty)
  }

  const togglePr = (pr: HermesGithubPr) => {
    if (expanded === pr.number) {
      setExpanded(null)

      return
    }

    setExpanded(pr.number)
    openPrDoc(pr)

    if (!cwd || prFiles[pr.number]) {
      return
    }

    void desktopGit()
      ?.githubPrFiles(cwd, pr.number)
      .then(result => setPrFiles(current => ({ ...current, [pr.number]: result?.files ?? [] })))
      .catch(() => setPrFiles(current => ({ ...current, [pr.number]: [] })))
  }

  if (!ready) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <p className="text-xs text-muted-foreground">{t.ide.githubNeedAuth}</p>
        <p className="text-xs text-muted-foreground">{t.ide.githubLoginHint}</p>
        <Button onClick={onLogin} size="sm" variant="secondary">
          {t.ide.githubLogin}
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto pb-3">
      <div className="flex flex-wrap gap-1 px-2 pt-2">
        <Button disabled={!cwd || Boolean(busy)} onClick={() => void runRemote('pull')} size="sm" variant="secondary">
          {t.ide.pull}
        </Button>
        <Button disabled={!cwd || Boolean(busy)} onClick={() => void runRemote('push')} size="sm" variant="secondary">
          {t.ide.push}
        </Button>
        <Button onClick={onClone} size="sm" variant="secondary">
          {t.ide.cloneRepo}
        </Button>
      </div>
      {busy && <p className="px-2 pt-1 text-[11px] text-muted-foreground">{busy}</p>}
      <p className="px-2 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {t.ide.githubPullRequests}
      </p>
      <IdeDisclosure
        count={local.length}
        onToggle={() => setOpen(state => ({ ...state, local: !state.local }))}
        open={open.local}
        title={t.ide.githubLocalBranches}
      >
        <Empty count={local.length} label={t.ide.githubNone} />
        {local.map(name => (
          <p className="truncate px-6 py-0.5 text-xs text-muted-foreground" key={name}>
            {name}
          </p>
        ))}
      </IdeDisclosure>
      <IdeDisclosure
        count={waiting.length}
        onToggle={() => setOpen(state => ({ ...state, waiting: !state.waiting }))}
        open={open.waiting}
        title={t.ide.githubWaiting}
      >
        <PrList
          cwd={cwd}
          empty={t.ide.githubNone}
          expanded={expanded}
          files={prFiles}
          onComment={commentPr}
          onOpen={onOpen}
          onOpenDoc={openPrDoc}
          onToggle={togglePr}
          prs={waiting}
        />
      </IdeDisclosure>
      <IdeDisclosure
        count={created.length}
        onToggle={() => setOpen(state => ({ ...state, created: !state.created }))}
        open={open.created}
        title={t.ide.githubCreated}
      >
        <PrList
          cwd={cwd}
          empty={t.ide.githubNone}
          expanded={expanded}
          files={prFiles}
          onComment={commentPr}
          onOpen={onOpen}
          onOpenDoc={openPrDoc}
          onToggle={togglePr}
          prs={created}
        />
      </IdeDisclosure>
      <IdeDisclosure
        count={sidebar.prs.length}
        onToggle={() => setOpen(state => ({ ...state, all: !state.all }))}
        open={open.all}
        title={t.ide.githubAllOpen}
      >
        <PrList
          cwd={cwd}
          empty={t.ide.githubNone}
          expanded={expanded}
          files={prFiles}
          onComment={commentPr}
          onOpen={onOpen}
          onOpenDoc={openPrDoc}
          onToggle={togglePr}
          prs={sidebar.prs}
        />
      </IdeDisclosure>
      <p className="px-2 pt-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t.ide.githubIssues}</p>
      <IdeDisclosure
        count={myIssues.length}
        onToggle={() => setOpen(state => ({ ...state, mine: !state.mine }))}
        open={open.mine}
        title={t.ide.githubMyIssues}
      >
        <IssueList empty={t.ide.githubNone} issues={myIssues} onOpenDoc={onOpenDoc} />
      </IdeDisclosure>
      <IdeDisclosure
        count={createdIssues.length}
        onToggle={() => setOpen(state => ({ ...state, issues: !state.issues }))}
        open={open.issues}
        title={t.ide.githubCreatedIssues}
      >
        <IssueList empty={t.ide.githubNone} issues={createdIssues} onOpenDoc={onOpenDoc} />
      </IdeDisclosure>
      <IdeDisclosure
        count={sidebar.issues.length}
        onToggle={() => setOpen(state => ({ ...state, recent: !state.recent }))}
        open={open.recent}
        title={t.ide.githubRecentIssues}
      >
        <IssueList empty={t.ide.githubNone} issues={sidebar.issues} onOpenDoc={onOpenDoc} />
      </IdeDisclosure>
    </div>
  )
}

function PrList({
  cwd,
  empty,
  expanded,
  files,
  prs,
  onComment,
  onOpen,
  onOpenDoc,
  onToggle
}: {
  cwd: null | string
  empty: string
  expanded: number | null
  files: Record<number, HermesGithubPrFile[]>
  prs: HermesGithubPr[]
  onComment: (pr: HermesGithubPr) => void
  onOpen: (path: string) => void
  onOpenDoc: (pr: HermesGithubPr) => void
  onToggle: (pr: HermesGithubPr) => void
}) {
  const { t } = useI18n()

  return (
    <>
      <Empty count={prs.length} label={empty} />
      {prs.map(pr => (
        <div key={pr.number}>
          <div className="flex h-6 min-w-0 items-center gap-1 pr-2 pl-4">
            <button className="text-muted-foreground hover:text-foreground" onClick={() => onToggle(pr)} type="button">
              <Codicon name={expanded === pr.number ? 'chevron-down' : 'chevron-right'} size={14} />
            </button>
            <button
              className="min-w-0 flex-1 truncate text-left text-xs hover:text-foreground"
              onClick={() => onOpenDoc(pr)}
              title={pr.title}
              type="button"
            >
              {pr.title}
            </button>
            <button
              className="shrink-0 px-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => onComment(pr)}
              title={t.ide.githubComment}
              type="button"
            >
              {t.ide.githubComment}
            </button>
          </div>
          {expanded === pr.number &&
            (files[pr.number] ?? []).map(file => (
              <button
                className="flex h-6 w-full min-w-0 items-center gap-2 pr-3 pl-8 text-left text-xs hover:bg-(--ui-control-hover-background)"
                key={file.path}
                onClick={() => cwd && onOpen(joinRepo(cwd, file.path))}
                title={file.path}
                type="button"
              >
                <span className="min-w-0 shrink truncate">{fileName(file.path)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{fileDir(file.path, cwd)}</span>
                <span className={cn('ml-auto w-4 shrink-0 text-right font-medium', LETTER_TINT[file.mark] || LETTER_TINT.M)}>
                  {file.mark}
                </span>
              </button>
            ))}
        </div>
      ))}
    </>
  )
}

function IssueList({
  empty,
  issues,
  onOpenDoc
}: {
  empty: string
  issues: HermesGithubIssue[]
  onOpenDoc: (title: string, markdown: string) => void
}) {
  return (
    <>
      <Empty count={issues.length} label={empty} />
      {issues.map(issue => (
        <button
          className="block h-6 w-full truncate px-6 text-left text-xs hover:bg-(--ui-control-hover-background)"
          key={issue.number}
          onClick={() =>
            onOpenDoc(
              `Issue #${issue.number}`,
              [`# ${issue.title}`, '', `- Number: #${issue.number}`, `- Author: ${issue.author || 'unknown'}`, `- URL: ${issue.url}`, '', '> Reply in chat on the right; confirm before posting to GitHub.'].join('\n')
            )
          }
          title={issue.title}
          type="button"
        >
          {issue.title}
        </button>
      ))}
    </>
  )
}

function Empty({ count, label }: { count: number; label: string }) {
  if (count > 0) {
    return null
  }

  return <p className="px-6 py-1 text-xs text-muted-foreground">{label}</p>
}

function sameName(left: string, right: string) {
  return Boolean(right) && left.trim().toLowerCase() === right.trim().toLowerCase()
}

function openUrl(url: string) {
  if (url) {
    void window.hermesDesktop?.openExternal?.(url)
  }
}

function fileName(path: string) {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')

  return slash < 0 ? norm : norm.slice(slash + 1)
}

function fileDir(path: string, root: null | string) {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  const dir = slash < 0 ? '' : norm.slice(0, slash)

  return root?.includes('\\') ? dir.replace(/\//g, '\\') : dir
}

function joinRepo(root: string, rel: string) {
  const base = root.replace(/[/\\]+$/, '')
  const file = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  const sep = base.includes('\\') ? '\\' : '/'

  return `${base}${sep}${file.replace(/\//g, sep)}`
}
