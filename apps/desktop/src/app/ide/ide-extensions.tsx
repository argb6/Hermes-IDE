import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import type { ExtensionSearchHit, InstalledExtension } from '../../../electron/ide/contract'

import { applyExtension } from './ext-apply'
import { type ExtensionRow, extInstall, extList, extSearch, extUninstall } from './ext-client'
import { $ideExtensionChangeTick, requestExtensionToggle } from './ide-state'

export interface ExtensionToggleOutcome {
  fields?: string[]
  status: 'installed' | 'offline' | 'rejected' | 'uninstalled'
}

/** Install/uninstall one row through the bridge and apply its contributions.
 *  Module-level so the workspace — which owns the detail view in the file
 *  preview area — can run it even while this panel is unmounted. */
export async function toggleExtension(row: ExtensionRow): Promise<ExtensionToggleOutcome> {
  if (row.installed) {
    await extUninstall(row.id)

    return { status: 'uninstalled' }
  }

  const result = await extInstall(row.id)

  if (result.status === 'unavailable') {
    return { status: 'offline' }
  }

  if (result.status === 'rejected' || result.reason === 'code-extension') {
    return {
      status: 'rejected',
      ...(result.fields?.length ? { fields: result.fields } : {})
    }
  }

  if (result.extension) {
    await applyExtension(result.extension)
  }

  return { status: 'installed' }
}

export function IdeExtensions({
  detailId,
  onDetail
}: {
  detailId: null | string
  onDetail: (row: ExtensionRow) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ExtensionRow[]>([])
  const [installed, setInstalled] = useState<ExtensionRow[]>([])
  const [offline, setOffline] = useState(false)

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

  // The workspace runs every install/uninstall — row buttons and the detail
  // view alike — then ticks this store. The list is this panel's only state,
  // so it just re-pulls here.
  useEffect(() => {
    return $ideExtensionChangeTick.listen(() => {
      void refresh()
    })
    // refresh closes over stable setters only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
        {shown.length === 0 && <p className="px-1 text-xs text-muted-foreground">{t.ide.extensionsEmpty}</p>}
        {shown.map(item => (
          <div
            className={cn(
              'mb-2 flex items-start gap-2 rounded border px-2 py-1.5',
              detailId === item.id ? 'border-(--ui-sash-hover-border)' : 'border-(--ui-stroke-secondary)'
            )}
            key={item.id}
          >
            <button
              className="flex min-w-0 flex-1 items-start gap-2 text-left"
              onClick={() => onDetail(item)}
              type="button"
            >
              <ExtensionIcon className="size-8 shrink-0 rounded text-xs" iconUrl={item.iconUrl} title={item.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-foreground">{item.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {item.publisher} {item.version}
                </span>
                {item.description && (
                  <span className="mt-0.5 line-clamp-2 block text-[11px] text-muted-foreground">{item.description}</span>
                )}
              </span>
            </button>
            <button
              className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => requestExtensionToggle(item)}
              type="button"
            >
              {item.installed ? t.ide.extensionsUninstall : t.ide.extensionsInstall}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Marketplace icon when one ships, else a quiet letter tile. A dead URL
 *  degrades to the tile instead of a broken image. */
export function ExtensionIcon({ className, iconUrl, title }: { className?: string; iconUrl?: string; title: string }) {
  const [failed, setFailed] = useState(false)

  if (iconUrl && !failed) {
    return <img alt="" className={cn('shrink-0 object-cover', className)} onError={() => setFailed(true)} src={iconUrl} />
  }

  return (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-(--ui-control-hover-background) font-semibold text-muted-foreground',
        className
      )}
    >
      {title.trim().slice(0, 1).toUpperCase()}
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
    version: hit.version,
    ...(typeof hit.downloadCount === 'number' ? { downloadCount: hit.downloadCount } : {}),
    ...(hit.iconUrl ? { iconUrl: hit.iconUrl } : {})
  }
}

function installedRow(extension: InstalledExtension): ExtensionRow {
  const publisher = extension.id.includes('.') ? extension.id.slice(0, extension.id.indexOf('.')) : extension.id

  return {
    contributes: extension.contributes,
    description: extension.description ?? '',
    id: extension.id,
    installed: true,
    publisher,
    title: extension.displayName || extension.id,
    version: extension.version,
    ...(extension.iconUrl ? { iconUrl: extension.iconUrl } : {})
  }
}
