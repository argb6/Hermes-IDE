import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'

import { applyExtension } from './ext-apply'
import { extInstall, extList, extSearch, extUninstall } from './ext-client'
import type { ExtSummary, InstalledExtension } from './ipc-types'

export function IdeExtensions() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ExtSummary[]>([])
  const [installed, setInstalled] = useState<InstalledExtension[]>([])
  const [offline, setOffline] = useState(false)
  const [note, setNote] = useState('')

  const refresh = async () => {
    const listed = await extList()

    setInstalled(listed.extensions)
    setOffline(Boolean(listed.unavailable))

    for (const extension of listed.extensions) {
      await applyExtension(extension)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void extSearch(query).then(next => {
        setResults(next.extensions)
        setOffline('unavailable' in next && Boolean(next.unavailable))
      })
    }, 200)

    return () => window.clearTimeout(handle)
  }, [query])

  const install = async (id: string) => {
    setNote('')
    const result = await extInstall(id)

    if (result.state === 'unavailable') {
      setOffline(true)

      return
    }

    if (result.extension?.rejected) {
      setNote(result.extension.reason || t.ide.extensionsRejected)

      return
    }

    if (result.extension) {
      await applyExtension(result.extension)
    }

    await refresh()
  }

  const shown = query.trim() ? results : installed

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        className="m-2 rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-xs"
        onChange={event => setQuery(event.target.value)}
        placeholder={t.ide.extensionsSearch}
        value={query}
      />
      <p className="px-3 pb-1 text-[11px] text-muted-foreground">{t.ide.extensionsDeclarative}</p>
      {offline && <p className="px-3 pb-1 text-[11px] text-muted-foreground">{t.ide.extensionsUnavailable}</p>}
      {note && <p className="px-3 pb-1 text-[11px] text-[#cca700]">{note}</p>}
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {shown.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t.ide.extensionsEmpty}</p>}
        {shown.map(item => {
          const owned = installed.some(row => row.id === item.id) || item.installed

          return (
            <div className="mb-2 rounded border border-(--ui-stroke-secondary) px-2 py-1.5" key={item.id}>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-xs text-foreground">{item.name || item.id}</p>
                <button
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => void (owned ? extUninstall(item.id).then(refresh) : install(item.id))}
                  type="button"
                >
                  {owned ? t.ide.extensionsUninstall : t.ide.extensionsInstall}
                </button>
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {item.publisher} {item.version}
              </p>
              {item.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
