import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { saveCustomEndpoint } from '@/hermes'
import { useI18n } from '@/i18n'
import { notifyError } from '@/store/notifications'

import catalog from './opencode-providers.json'

interface CatalogProvider {
  api: string
  env: string
  id: string
  model: string
  name: string
}

const PROVIDERS = catalog as CatalogProvider[]

/** OpenCode's models.dev catalog, shipped offline. Adding one writes a custom
 *  endpoint without a key; the key stays on the endpoint page. */
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
      <div className="grid max-h-80 gap-1 overflow-auto">
        {visible.length === 0 && <p className="text-xs text-muted-foreground">{copy.noMatch}</p>}
        {visible.map(provider => (
          <div className="flex items-center gap-2 px-1 py-0.5" key={provider.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{provider.name}</p>
              <p className="truncate text-xs text-muted-foreground">{provider.api || copy.noAddress}</p>
            </div>
            <Button
              disabled={!provider.api || adding === provider.id}
              onClick={() => {
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
              size="sm"
              variant="secondary"
            >
              {adding === provider.id ? copy.adding : copy.add}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
