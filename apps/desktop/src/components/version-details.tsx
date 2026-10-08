import type { ReactNode } from 'react'

import type { DesktopVersionInfo, RuntimeSource } from '@/global'
import { useI18n } from '@/i18n'
import { distributionLabelKey } from '@/lib/distribution-label'
import { ExternalLink } from '@/lib/external-link'
import { shortVersion } from '@/lib/version-label'

/** Local hermes-local fork — About page points at this repo, not upstream. */
export const HERMES_LOCAL_REPO_URL = 'https://github.com/argb6/hermes-local'
export const HERMES_LOCAL_REPO_LABEL = 'argb6/hermes-local'

/**
 * Human label for an external build's runtime source: the resolution rung
 * plus the location it resolved from, when there is one.
 */
function runtimeSourceLabel(source: RuntimeSource): string {
  const where = 'root' in source && source.root ? source.root : 'command' in source ? source.command : null

  return where ? `${source.type} (${where})` : source.type
}

function DetailBox({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-3 text-sm">{children}</div>
  )
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  )
}

/**
 * Shared build-provenance display. Reads from `$desktopVersion`
 * (populated from the build stamp / `hermes:version` IPC), so every
 * surface — the About settings page, the updates overlay — shows the
 * same version, branch, commit, distribution, runtime, and install id
 * from one source of truth.
 *
 * hermes-local About layout (three boxes):
 * 1. Fork project notice
 * 2. This fork's repository
 * 3. Version / build basics
 */
export function VersionDetails({ version }: { version: DesktopVersionInfo }) {
  const { t } = useI18n()
  const u = t.updates

  const source =
    version.source === 'ci' ? 'CI' : version.source ? version.source[0].toUpperCase() + version.source.slice(1) : null

  // The Distribution row: one resolver owns the label policy — see
  // distribution-label.ts. Nix and Docker are product names, rendered
  // verbatim; every other shape comes from the stamp via i18n.
  const distributionKey = distributionLabelKey(version)

  const distribution =
    version.distribution === 'nix'
      ? 'Nix'
      : version.distribution === 'docker'
        ? 'Docker'
        : distributionKey
          ? u[distributionKey]
          : null

  const runtime =
    version.hermesRuntime?.type === 'embedded'
      ? u.versionDetailsRuntimeEmbedded
      : version.hermesRuntime?.type === 'external' && version.hermesRuntime.source
        ? runtimeSourceLabel(version.hermesRuntime.source)
        : version.hermesRuntime?.type === 'external'
          ? u.versionDetailsRuntimeExternal
          : null

  const commitHref = version.commit ? `${HERMES_LOCAL_REPO_URL}/commit/${version.commit}` : null

  return (
    <div className="grid gap-3">
      <DetailBox>
        <DetailRow label={u.versionDetailsProject}>
          <span className="text-left text-foreground/90">{u.versionDetailsProjectBody}</span>
        </DetailRow>
      </DetailBox>

      <DetailBox>
        <DetailRow label={u.versionDetailsRepository}>
          <ExternalLink className="break-all font-mono text-xs" href={HERMES_LOCAL_REPO_URL} native>
            {HERMES_LOCAL_REPO_LABEL}
          </ExternalLink>
        </DetailRow>
      </DetailBox>

      <DetailBox>
        <div className="mb-1 text-xs font-medium text-muted-foreground">{u.versionDetailsBasics}</div>
        <dl className="grid gap-2">
          <DetailRow label={u.versionDetailsVersion}>
            {version.appVersion ? `v${shortVersion(version.appVersion)}` : u.versionUnavailable}
            {version.dirty && <span className="text-warning"> (!)</span>}
          </DetailRow>
          {version.commit && commitHref && (
            <DetailRow label={u.versionDetailsCommit}>
              <span className="break-all">
                <ExternalLink className="break-all font-mono text-xs" href={commitHref} native>
                  {version.commit.slice(0, 14)}
                </ExternalLink>
                {version.dirty && <span className="text-warning"> {u.versionDetailsUncommittedChanges}</span>}
              </span>
            </DetailRow>
          )}
          {source && (
            <DetailRow label={u.versionDetailsBuildOrigin}>
              {source}
              {version.branch && version.branch !== 'main' ? ` (${version.branch})` : ''}
            </DetailRow>
          )}
          {distribution && <DetailRow label={u.versionDetailsDistribution}>{distribution}</DetailRow>}
          {runtime && (
            <DetailRow label={u.versionDetailsRuntime}>
              <span className="break-all">{runtime}</span>
            </DetailRow>
          )}
          {version.installId && (
            <DetailRow label={u.versionDetailsInstallId}>
              <span className="break-all font-mono text-xs">
                {version.installId} ({version.hermesRoot})
              </span>
            </DetailRow>
          )}
        </dl>
      </DetailBox>
    </div>
  )
}
