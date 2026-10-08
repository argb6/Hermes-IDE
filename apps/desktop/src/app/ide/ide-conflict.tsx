import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { writeDesktopFileText } from '@/lib/desktop-fs'
import { desktopGit } from '@/lib/desktop-git'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

interface IdeConflictProps {
  cwd: string
  onSaved?: () => void
  path: string
}

/** Three-pane merge conflict editor: ours / result / theirs. */
export function IdeConflict({ cwd, onSaved, path }: IdeConflictProps) {
  const { t } = useI18n()
  const [ours, setOurs] = useState('')
  const [theirs, setTheirs] = useState('')
  const [result, setResult] = useState('')
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    setReady(false)
    setDirty(false)
    void desktopGit()
      ?.fileConflictSides(cwd, path)
      .then(sides => {
        if (cancelled || !sides) {
          return
        }

        setOurs(sides.ours)
        setTheirs(sides.theirs)
        setResult(sides.result)
        setReady(true)
      })
      .catch(error => {
        if (!cancelled) {
          notifyError(error, t.ide.conflictLoadFailed)
          setReady(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [cwd, path, t.ide.conflictLoadFailed])

  const save = async () => {
    if (busy) {
      return
    }

    setBusy(true)

    try {
      await writeDesktopFileText(path, result)
      setDirty(false)
      onSaved?.()
    } catch (error) {
      notifyError(error, t.ide.conflictSaveFailed)
    } finally {
      setBusy(false)
    }
  }

  const take = (side: 'ours' | 'theirs') => {
    setResult(side === 'ours' ? ours : theirs)
    setDirty(true)
  }

  if (!ready) {
    return <p className="p-3 text-xs text-muted-foreground">{t.ide.conflictLoading}</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e2c08d]/40 bg-[#e2c08d]/10 px-3 py-1.5">
        <p className="min-w-0 flex-1 text-xs text-[#e2c08d]">{t.ide.conflictBanner}</p>
        <Button disabled={busy} onClick={() => take('ours')} size="sm" variant="secondary">
          {t.ide.conflictTakeOurs}
        </Button>
        <Button disabled={busy} onClick={() => take('theirs')} size="sm" variant="secondary">
          {t.ide.conflictTakeTheirs}
        </Button>
        <Button disabled={busy || !dirty} onClick={() => void save()} size="sm" variant="secondary">
          {t.ide.conflictSave}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 divide-x divide-(--ui-stroke-secondary)">
        <ConflictPane label={t.ide.conflictOurs} readOnly value={ours} />
        <ConflictPane
          label={t.ide.conflictResult}
          onChange={value => {
            setResult(value)
            setDirty(true)
          }}
          value={result}
        />
        <ConflictPane label={t.ide.conflictTheirs} readOnly value={theirs} />
      </div>
    </div>
  )
}

function ConflictPane({
  label,
  onChange,
  readOnly,
  value
}: {
  label: string
  onChange?: (value: string) => void
  readOnly?: boolean
  value: string
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div
        className={cn(
          'shrink-0 border-b border-(--ui-stroke-secondary) px-2 py-1 text-[11px] font-semibold tracking-wide uppercase',
          readOnly ? 'bg-(--ui-bg-chrome) text-muted-foreground' : 'bg-background text-foreground'
        )}
      >
        {label}
      </div>
      <textarea
        className={cn(
          'min-h-0 flex-1 resize-none bg-transparent p-2 font-mono text-xs leading-5 text-foreground outline-none',
          readOnly && 'text-muted-foreground'
        )}
        onChange={event => onChange?.(event.target.value)}
        readOnly={readOnly}
        spellCheck={false}
        value={value}
      />
    </div>
  )
}
