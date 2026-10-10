import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

import type { ExtensionRow } from './ext-client'
import { ExtensionIcon } from './ide-extensions'
import { requestExtensionToggle } from './ide-state'

/** The extension a clicked row opened — shown in the file preview area like
 *  any other preview, flat and page-scale rather than a boxed card. */
export function IdeExtensionDetail({ row }: { row: ExtensionRow }) {
  const { t } = useI18n()
  const contributed = contributedLabels(row)

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-8">
        <div className="flex items-start gap-4">
          <ExtensionIcon className="size-16 shrink-0 rounded-lg text-2xl" iconUrl={row.iconUrl} title={row.title} />
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-xl font-semibold text-foreground">{row.title}</h2>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              {row.publisher} · v{row.version}
              {typeof row.downloadCount === 'number' && <> · {t.ide.extensionsDownloads(row.downloadCount)}</>}
            </p>
            {row.description && <p className="m-0 mt-2 text-sm text-foreground">{row.description}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button onClick={() => requestExtensionToggle(row)} size="sm" variant="secondary">
              {row.installed ? t.ide.extensionsUninstall : t.ide.extensionsInstall}
            </Button>
            {row.installed && <span className="text-[11px] text-muted-foreground">{t.ide.extensionsInstalled}</span>}
          </div>
        </div>
        {contributed.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t.ide.extensionsProvides}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {contributed.map(label => (
                <span
                  className="rounded-full bg-(--ui-control-hover-background) px-2 py-0.5 text-[11px] text-foreground"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function contributedLabels(row: ExtensionRow): string[] {
  const contributes = row.contributes

  if (!contributes) {
    return []
  }

  const labels = [
    ...contributes.themes.map(theme => theme.label),
    ...contributes.languages.map(language => language.id),
    ...contributes.snippets.map(snippet => snippet.language ?? leaf(snippet.path)),
    ...contributes.grammars.map(grammar => grammar.scopeName ?? leaf(grammar.path))
  ]

  return [...new Set(labels.filter(Boolean))]
}

function leaf(path: string) {
  return path.split(/[\\/]/).pop() || path
}
