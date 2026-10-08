import { useStore } from '@nanostores/react'
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import type { HermesRepoCommit, HermesRepoStatusFile } from '@/global'
import { useI18n } from '@/i18n'
import { desktopGit } from '@/lib/desktop-git'
import { requestOneShot } from '@/lib/oneshot'
import { cn } from '@/lib/utils'
import { $repoStatusByCwd, refreshRepoStatus } from '@/store/coding-status'

import { IdeDisclosure } from './ide-disclosure'

const LETTER_TINT: Record<string, string> = {
  A: 'text-[#73c991]',
  C: 'text-[#e4676b]',
  D: 'text-[#c74e39]',
  M: 'text-[#e2c08d]',
  R: 'text-[#73c991]',
  U: 'text-[#73c991]'
}

export function IdeGit({
  cwd,
  onDiff
}: {
  cwd: null | string
  onDiff: (text: null | string) => void
}) {
  const { t } = useI18n()
  const byCwd = useStore($repoStatusByCwd)
  const status = cwd ? (byCwd[cwd] ?? null) : null
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [menu, setMenu] = useState(false)
  const [error, setError] = useState('')
  const [changesOpen, setChangesOpen] = useState(true)
  const [logOpen, setLogOpen] = useState(true)
  const [commits, setCommits] = useState<HermesRepoCommit[]>([])
  const menuRef = useRef<HTMLDivElement>(null)
  const branch = status?.branch || 'HEAD'
  const files = status?.files ?? []

  useEffect(() => {
    if (!cwd) {
      return
    }

    let cancelled = false

    const loadLog = () => {
      void desktopGit()
        ?.repoLog(cwd)
        .then(result => {
          if (!cancelled) {
            setCommits(result?.commits ?? [])
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCommits([])
          }
        })
    }

    loadLog()

    const timer = window.setInterval(() => {
      void refreshRepoStatus(cwd)
      loadLog()
    }, 4000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [cwd, status?.branch, status?.changed])

  useEffect(() => {
    if (!menu) {
      return
    }

    const close = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenu(false)
      }
    }

    window.addEventListener('pointerdown', close)

    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  if (!cwd || status === null) {
    return <p className="p-3 text-xs text-muted-foreground">{t.ide.gitNoRepo}</p>
  }

  const commit = (push: boolean) => {
    const text = message.trim()

    if (!text || busy) {
      return
    }

    setBusy(true)
    setMenu(false)
    setError('')
    void desktopGit()
      ?.review.commit(cwd, text, push)
      .then(() => {
        setMessage('')
        return refreshRepoStatus(cwd)
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false))
  }

  const draft = () => {
    if (drafting) {
      return
    }

    setDrafting(true)
    setError('')
    void desktopGit()
      ?.review.commitContext(cwd)
      .then(async context => {
        if (!context?.diff.trim()) {
          return
        }

        const text = await requestOneShot({
          template: 'commit_message',
          temperature: 0.8,
          variables: { avoid: message, diff: context.diff, recent_commits: context.recent }
        })

        if (text.trim()) {
          setMessage(text.trim())
        }
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setDrafting(false))
  }

  const runReview = (action: 'revert' | 'stage' | 'unstage', filePath?: string, label?: string) => {
    if (busy) {
      return
    }

    if (action === 'revert') {
      const name = label || filePath || ''

      if (!window.confirm(t.ide.discardConfirm(name))) {
        return
      }
    }

    setBusy(true)
    setError('')
    const review = desktopGit()?.review
    const task =
      action === 'stage'
        ? review?.stage(cwd, filePath ?? null)
        : action === 'unstage'
          ? review?.unstage(cwd, filePath ?? null)
          : review?.revert(cwd, filePath ?? null)

    void Promise.resolve(task)
      .then(() => refreshRepoStatus(cwd))
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 px-2 pt-2">
        <div className="relative">
          <textarea
            className="h-16 w-full resize-none rounded-md border border-(--ui-stroke-secondary) bg-transparent px-2 py-1.5 pr-7 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            onChange={event => setMessage(event.target.value)}
            onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault()
                commit(false)
              }
            }}
            placeholder={t.ide.commitMessage(branch)}
            value={message}
          />
          <button
            className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
            disabled={drafting || files.length === 0}
            onClick={draft}
            title={t.ide.commitMessage(branch)}
            type="button"
          >
            <Codicon name="sparkle" size={14} />
          </button>
        </div>
        <div className="relative flex" ref={menuRef}>
          <button
            className="h-8 flex-1 rounded-l-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={busy || !message.trim()}
            onClick={() => commit(false)}
            type="button"
          >
            {t.ide.commit}
          </button>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-r-md border-l border-primary-foreground/20 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setMenu(open => !open)}
            type="button"
          >
            <Codicon name="chevron-down" size={14} />
          </button>
          {menu && (
            <div className="absolute top-9 right-0 z-20 w-44 rounded-md border border-(--ui-stroke-secondary) bg-popover py-1 shadow-lg">
              <MenuRow label={t.ide.commit} onClick={() => commit(false)} />
              <MenuRow label={t.ide.commitAndPush} onClick={() => commit(true)} />
            </div>
          )}
        </div>
        {error && <p className="text-xs text-[#c74e39]">{error}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pt-2">
        <IdeDisclosure count={files.length} onToggle={() => setChangesOpen(open => !open)} open={changesOpen} title={t.ide.changesPane}>
          {files.length > 0 && (
            <div className="flex items-center justify-end gap-2 px-3 pb-1">
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={busy}
                onClick={() => void runReview('stage')}
                type="button"
              >
                {t.ide.stageAll}
              </button>
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
                disabled={busy || !files.some(file => file.staged)}
                onClick={() => void runReview('unstage')}
                type="button"
              >
                {t.ide.unstageAll}
              </button>
            </div>
          )}
          {files.length === 0 && <p className="px-6 py-1 text-xs text-muted-foreground">{t.ide.gitEmpty}</p>}
          {files.map(file => (
            <ChangeRow
              busy={busy}
              file={file}
              key={file.path}
              onDiscard={() => void runReview('revert', file.path, file.path.split(/[\\/]/).pop() || file.path)}
              onOpen={() => void showDiff(cwd, file, onDiff)}
              onStage={() => void runReview('stage', file.path)}
              onUnstage={() => void runReview('unstage', file.path)}
              root={cwd}
            />
          ))}
        </IdeDisclosure>
        <IdeDisclosure count={commits.length} onToggle={() => setLogOpen(open => !open)} open={logOpen} title={t.ide.gitLog}>
          {commits.length === 0 && <p className="px-6 py-1 text-xs text-muted-foreground">{t.ide.gitLogEmpty}</p>}
          {commits.map(commitRow => (
            <div className="flex h-6 min-w-0 items-center gap-2 px-3" key={commitRow.hash} title={commitRow.subject}>
              <span className="size-1.5 shrink-0 rounded-full bg-sky-500" />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{commitRow.subject}</span>
            </div>
          ))}
        </IdeDisclosure>
      </div>
    </div>
  )
}

function MenuRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="flex h-7 w-full items-center px-2 text-left text-xs hover:bg-(--ui-control-hover-background)"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

function ChangeRow({
  busy,
  file,
  root,
  onDiscard,
  onOpen,
  onStage,
  onUnstage
}: {
  busy: boolean
  file: HermesRepoStatusFile
  root: string
  onDiscard: () => void
  onOpen: () => void
  onStage: () => void
  onUnstage: () => void
}) {
  const { t } = useI18n()
  const { name, dir } = splitGitPath(file.path)
  const mark = changeLetter(file)
  const canStage = file.untracked || file.unstaged || Boolean(file.conflicted)
  const canUnstage = file.staged
  const canDiscard = file.untracked || file.unstaged || file.staged

  return (
    <div className="group/change flex h-6 w-full min-w-0 items-center gap-1 px-3 text-xs hover:bg-(--ui-control-hover-background)">
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={onOpen} title={file.path} type="button">
        <span className="min-w-0 shrink truncate text-foreground">{name}</span>
        {dir && <span className="min-w-0 flex-1 truncate text-muted-foreground">{displayDir(dir, root)}</span>}
      </button>
      <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 group-hover/change:opacity-100 focus-within:opacity-100">
        {canStage && (
          <ActionIcon disabled={busy} label={t.ide.stage} name="add" onClick={onStage} />
        )}
        {canUnstage && (
          <ActionIcon disabled={busy} label={t.ide.unstage} name="remove" onClick={onUnstage} />
        )}
        {canDiscard && (
          <ActionIcon disabled={busy} label={t.ide.discard} name="discard" onClick={onDiscard} />
        )}
      </span>
      <span className={cn('w-4 shrink-0 text-right font-medium', letterTint(file, mark))}>{mark}</span>
    </div>
  )
}

function ActionIcon({
  disabled,
  label,
  name,
  onClick
}: {
  disabled: boolean
  label: string
  name: string
  onClick: () => void
}) {
  return (
    <button
      className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
      disabled={disabled}
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      title={label}
      type="button"
    >
      <Codicon name={name} size={14} />
    </button>
  )
}

function splitGitPath(path: string) {
  const norm = path.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')

  if (slash < 0) {
    return { dir: '', name: norm }
  }

  return { dir: norm.slice(0, slash), name: norm.slice(slash + 1) }
}

function displayDir(dir: string, root: string) {
  return root.includes('\\') ? dir.replace(/\//g, '\\') : dir
}

function letterTint(file: HermesRepoStatusFile, mark: string) {
  if (mark === 'M' && file.staged && !file.unstaged) {
    return 'text-[#73c991]'
  }

  return LETTER_TINT[mark] || LETTER_TINT.M
}

function changeLetter(file: HermesRepoStatusFile) {
  if (file.mark && LETTER_TINT[file.mark]) {
    return file.mark
  }

  if (file.conflicted) {
    return 'C'
  }

  if (file.untracked) {
    return 'U'
  }

  return 'M'
}

async function showDiff(cwd: string, file: HermesRepoStatusFile, onDiff: (text: null | string) => void) {
  const diff = (await desktopGit()?.fileDiff(cwd, file.path)) ?? ''

  onDiff(diff || file.path)
}
