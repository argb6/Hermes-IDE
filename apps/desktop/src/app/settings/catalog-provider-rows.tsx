import { useState } from 'react'

import { saveCustomEndpoint, setEnvVar } from '@/hermes'
import { useI18n } from '@/i18n'
import { notify, notifyError } from '@/store/notifications'
import type { EnvVarInfo } from '@/types/hermes'

import { ProviderKeyRows } from './credential-key-ui'
import { withoutKey } from './helpers'
import catalog from './opencode-providers.json'
import { Pill } from './primitives'
import type { EnvRowProps } from './types'

interface CatalogProvider {
  api: string
  env: string
  id: string
  model: string
  name: string
}

const PROVIDERS = catalog as CatalogProvider[]

/** Search haystack for one catalog entry — name, id, env key, base URL, model. */
const matches = (entry: CatalogProvider, needle: string): boolean =>
  [entry.name, entry.id, entry.env, entry.api, entry.model].some(part => part.toLowerCase().includes(needle))

/**
 * The models.dev catalog rows, deduped against the built-in provider cards and
 * sorted by name. `hidden` carries the built-ins' lowercased names and env keys
 * — an entry that is already a first-class card must not render twice.
 */
export function visibleCatalogEntries(query: string, hidden: ReadonlySet<string>): CatalogProvider[] {
  const needle = query.trim().toLowerCase()

  return PROVIDERS.filter(
    entry =>
      !hidden.has(entry.name.toLowerCase()) &&
      !hidden.has(entry.env) &&
      (!needle || matches(entry, needle))
  ).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Every remaining catalog provider as a first-class key row: pasting the key
 * saves it AND registers the provider's endpoint in the same save, so one
 * paste adds a usable provider (the old preset wrote the endpoint first and
 * left the key for the endpoint page — two steps for one intent).
 */
export function CatalogProviderRows({
  entries,
  profile,
  vars
}: {
  entries: readonly CatalogProvider[]
  profile?: null | string
  vars: Record<string, EnvVarInfo> | null
}) {
  const { t } = useI18n()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<null | string>(null)
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())

  const onSave = (varKey: string, editKey = varKey) => {
    const value = edits[editKey]?.trim()
    const entry = entries.find(candidate => candidate.env === varKey)

    if (!value || !entry) {
      return
    }

    setSaving(varKey)

    void (async () => {
      try {
        await setEnvVar(varKey, value, profile)
        await saveCustomEndpoint(
          {
            base_url: entry.api,
            discover_models: true,
            make_default: false,
            model: entry.model || entry.id,
            name: entry.name
          },
          profile
        )
        setAdded(prev => new Set(prev).add(varKey))
        setEdits(c => withoutKey(c, editKey))
        notify({
          kind: 'success',
          title: t.settings.toolsets.savedTitle,
          message: t.settings.toolsets.savedMessage(varKey)
        })
      } catch (error) {
        notifyError(error, entry.name)
      } finally {
        setSaving(null)
      }
    })()
  }

  const rowProps: KeyRowProps = {
    edits,
    onClear: (key, editKey = key) => setEdits(c => withoutKey(c, editKey)),
    onReveal: key => setRevealed(c => withoutKey(c, key)),
    revealed,
    onSave,
    saving,
    setEdits
  }

  if (entries.length === 0) {
    return null
  }

  return (
    <div className="mt-3 grid gap-2" data-catalog-rows="">
      <p className="flex items-center gap-2 px-0.5 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary)">
        {t.settings.providers.otherProviders}
        <Pill>{entries.length}</Pill>
      </p>
      <div className="grid max-h-80 gap-2 overflow-auto">
        {entries.map(entry => {
          const isSet = added.has(entry.env) || Boolean(vars?.[entry.env]?.is_set)

          return (
            <div data-catalog-row={entry.id} key={entry.id}>
              <ProviderKeyRows
                expanded={false}
                group={{
                  advanced: [],
                  hasAnySet: isSet,
                  name: entry.name,
                  primary: [
                    entry.env,
                    {
                      advanced: false,
                      category: 'provider',
                      description: '',
                      is_password: true,
                      is_set: isSet,
                      redacted_value: vars?.[entry.env]?.redacted_value ?? null,
                      tools: [],
                      url: entry.api
                    }
                  ]
                }}
                onExpand={() => undefined}
                onToggle={() => undefined}
                rowProps={rowProps}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

type KeyRowProps = Omit<EnvRowProps, 'info' | 'varKey'>
