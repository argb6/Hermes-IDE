import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import type { HermesGitBranch } from '@/global'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { desktopGit } from '@/lib/desktop-git'
import { $repoStatusByCwd, refreshRepoStatus } from '@/store/coding-status'

/** Branch checkout list opened from the status bar. */
export function IdeCheckout({
  cwd,
  onClose
}: {
  cwd: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const status = useStore($repoStatusByCwd)[cwd] ?? null
  const dirty = Boolean(status && status.changed > 0)
  const [branches, setBranches] = useState<HermesGitBranch[]>([])
  const [draft, setDraft] = useState('')
  const [from, setFrom] = useState('')
  const [pickingFrom, setPickingFrom] = useState(false)
  const [naming, setNaming] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    void desktopGit()
      ?.branchList(cwd)
      .then(list => {
        if (!cancelled) {
          setBranches(list ?? [])
        }
      })
      .catch(reason => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason))
        }
      })

    return () => {
      cancelled = true
    }
  }, [cwd])

  const run = async (mode: 'create' | 'detach' | 'switch' | 'track', name?: string, base?: string) => {
    setError('')

    if (dirty && (mode === 'switch' || mode === 'track' || mode === 'detach')) {
      setError(t.ide.dirtyBranch)

      return
    }

    try {
      const git = desktopGit()

      if (git?.branchCheckout) {
        await git.branchCheckout(cwd, { mode, name, from: base })
      } else if (mode === 'switch' && name) {
        await git?.branchSwitch(cwd, name)
      } else {
        throw new Error(t.ide.checkoutUnavailable)
      }

      refreshRepoStatus(cwd)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  const local = branches.filter(branch => !branch.isRemote)
  const remote = branches.filter(branch => branch.isRemote)

  return (
    <div className="absolute bottom-6 left-0 z-40 w-[28rem] overflow-hidden rounded-md border border-(--ui-stroke-secondary) bg-popover text-foreground shadow-lg">
      <div className="border-b border-(--ui-stroke-secondary) px-3 py-2 text-xs text-muted-foreground">
        {t.ide.checkoutTitle}
      </div>
      {dirty && <p className="px-3 py-1 text-xs text-[#e2c08d]">{t.ide.dirtyBranch}</p>}
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      {naming ? (
        <form
          className="p-2"
          onSubmit={event => {
            event.preventDefault()
            void run('create', draft.trim(), from)
          }}
        >
          <input
            autoFocus
            className="h-8 w-full rounded border border-(--ui-stroke-secondary) bg-transparent px-2 text-sm outline-none"
            onChange={event => setDraft(event.target.value)}
            placeholder={t.ide.checkoutCreate}
            value={draft}
          />
        </form>
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          <Row icon="add" label={t.ide.checkoutCreate} onClick={() => setNaming(true)} />
          <Row
            icon="add"
            label={t.ide.checkoutCreateFrom}
            onClick={() => {
              setPickingFrom(true)
              setNaming(false)
            }}
          />
          <Row icon="git-commit" label={t.ide.checkoutDetach} onClick={() => void run('detach')} />
          {pickingFrom && (
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">{t.ide.checkoutPickFrom}</p>
          )}
          <Section label={t.ide.checkoutBranches} />
          {local.map(branch => (
            <Row
              icon="source-control"
              key={branch.name}
              label={branch.name}
              onClick={() => {
                if (pickingFrom) {
                  setFrom(branch.name)
                  setPickingFrom(false)
                  setNaming(true)

                  return
                }

                void run('switch', branch.name)
              }}
            />
          ))}
          {remote.length > 0 && <Section label={t.ide.checkoutRemote} />}
          {remote.map(branch => (
            <Row
              icon="cloud"
              key={branch.name}
              label={branch.name}
              onClick={() => {
                if (pickingFrom) {
                  setFrom(branch.name)
                  setPickingFrom(false)
                  setNaming(true)

                  return
                }

                void run('track', branch.name)
              }}
            />
          ))}
          {branches.length === 0 && !error && (
            <p className="px-3 py-2 text-xs text-muted-foreground">{t.ide.gitNoRepo}</p>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label }: { label: string }) {
  return <div className="px-3 pt-2 pb-1 text-right text-[11px] text-muted-foreground">{label}</div>
}

function Row({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      className="flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-(--ui-control-hover-background)"
      onClick={onClick}
      type="button"
    >
      <Codicon name={icon} size={16} />
      <span className="truncate">{label}</span>
    </button>
  )
}
