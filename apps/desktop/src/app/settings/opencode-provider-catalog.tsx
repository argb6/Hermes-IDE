import { useMemo, useState } from 'react'

import { saveCustomEndpoint } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

import catalog from './opencode-providers.json'
import { LIST_ROW_COLUMNS } from './primitives'

interface CatalogProvider {
  api: string
  env: string
  id: string
  model: string
  name: string
}

const PROVIDERS = catalog as CatalogProvider[]

/** OpenCode's models.dev catalog, shipped offline. Adding one writes a custom
 *  endpoint without a key; the key stays on the endpoint page. Rows match the
 *  Hermes credential list (bullet + name + bare paste-style action). */
export function OpencodeProviderCatalog({
  profile,
  onAdded
}: {
  profile?: null | string
  onAdded: () => void
}) {
  const { t } = useI18n()
  const copy = t.settings.providers.opencodeCatalog
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState<null | string>(null)
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    if (!needle) {
      return PROVIDERS
    }

    return PROVIDERS.filter(provider =>
      [provider.name, provider.id, provider.api, provider.env].some(part => part.toLowerCase().includes(needle))
    )
  }, [query])

  return (
    <div className="mt-6 grid gap-2">
      <p className="text-sm font-medium">{copy.title(PROVIDERS.length)}</p>
      <p className="text-xs text-muted-foreground">{copy.hint}</p>
      <input
        className="rounded border border-(--ui-stroke-secondary) bg-transparent px-2 py-1 text-sm"
        onChange={event => setQuery(event.target.value)}
        placeholder={copy.search}
        value={query}
      />
      <div className="grid max-h-80 gap-2 overflow-auto">
        {visible.length === 0 && <p className="text-xs text-muted-foreground">{copy.noMatch}</p>}
        {visible.map(provider => {
          const busy = adding === provider.id
          const disabled = !provider.api || busy
          const action = busy ? copy.adding : t.settings.credentials.pasteLabelKey(provider.name)

          return (
            <button
              className={cn(
                '@container group/card w-full rounded-[6px] p-3 text-left transition-colors',
                'row-hover',
                disabled && 'cursor-not-allowed opacity-60'
              )}
              disabled={disabled}
              key={provider.id}
              onClick={() => {
                if (disabled) {
                  return
                }

                setAdding(provider.id)
                void saveCustomEndpoint(
                  {
                    base_url: provider.api,
                    discover_models: true,
                    make_default: false,
                    model: provider.model || provider.id,
                    name: provider.name
                  },
                  profile
                )
                  .then(() => onAdded())
                  .catch(error => notifyError(error, provider.name))
                  .finally(() => setAdding(null))
              }}
              type="button"
            >
              <div className={cn('grid grid-cols-1 items-start gap-x-3 gap-y-1.5 @2xl:gap-y-3', LIST_ROW_COLUMNS)}>
                <div className="flex h-8 min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full bg-(--ui-stroke-secondary)" />
                  <span className="min-w-0 truncate text-[length:var(--conversation-text-font-size)] font-medium text-foreground">
                    {provider.name}
                  </span>
                </div>
                <div className="flex h-8 min-w-0 items-center @2xl:justify-self-end">
                  <span className="truncate text-[length:var(--conversation-text-font-size)] text-muted-foreground">
                    {action}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
