import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'

import { applyExtension } from './ext-apply'
import { extInstall, extList, extSearch, extUninstall } from './ext-client'
import type { ExtensionSearchHit, InstalledExtension } from '../../../electron/ide/contract'

interface ExtensionRow {
  description: string
  id: string
  installed: boolean
  publisher: string
  title: string
  version: string
}

export function IdeExtensions() {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ExtensionRow[]>([])
  const [installed, setInstalled] = useState<ExtensionRow[]>([])
  const [offline, setOffline] = useState(false)
  const [note, setNote] = useState('')

  const refresh = async () => {
    const listed = await extList()

    setInstalled(listed.extensions.map(installedRow))
    setOffline(!listed.ok)

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
        setResults((next.extensions ?? []).map(searchRow))
        setOffline(next.status === 'unavailable')
      })
    }, 200)

    return () => window.clearTimeout(handle)
  }, [query])

  const install = async (id: string) => {
    setNote('')
    const result = await extInstall(id)

    if (result.status === 'unavailable') {
      setOffline(true)

      return
    }

    if (result.status === 'rejected' || result.reason === 'code-extension') {
      const fields = result.fields?.length ? ` (${result.fields.join(', ')})` : ''

      setNote(`${t.ide.extensionsRejected}${fields}`)

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
        {shown.map(item => (
          <div className="mb-2 rounded border border-(--ui-stroke-secondary) px-2 py-1.5" key={item.id}>
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-xs text-foreground">{item.title}</p>
              <button
                className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => void (item.installed ? extUninstall(item.id).then(() => refresh()) : install(item.id))}
                type="button"
              >
                {item.installed ? t.ide.extensionsUninstall : t.ide.extensionsInstall}
              </button>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {item.publisher} {item.version}
            </p>
            {item.description && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function searchRow(hit: ExtensionSearchHit): ExtensionRow {
  return {
    description: hit.description ?? '',
    id: hit.id,
    installed: false,
    publisher: hit.namespace,
    title: hit.displayName || hit.name,
    version: hit.version
  }
}

function installedRow(extension: InstalledExtension): ExtensionRow {
  const publisher = extension.id.includes('.') ? extension.id.slice(0, extension.id.indexOf('.')) : extension.id

  return {
    description: extension.description ?? '',
    id: extension.id,
    installed: true,
    publisher,
    title: extension.displayName || extension.id,
    version: extension.version
  }
}
