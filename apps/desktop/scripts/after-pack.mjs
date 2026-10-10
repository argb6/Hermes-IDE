/**
 * after-pack.mjs — electron-builder afterPack hook.
 *
 * Windows-only product scope: PE signature sanitizing and batch signing on
 * the unpacked app. The exe identity stamp lives in after-extract.mjs (#105629).
 *
 * electron-builder passes a context with:
 *   - electronPlatformName: 'win32'
 *   - appOutDir:            the unpacked app directory for this target
 *   - packager.appInfo.productFilename: the exe basename (e.g. 'Hermes')
 */

import path from 'node:path'

import { assertPackagedBackendReadyArtifact, resolvePackagedAsarPath } from './backend-ready-artifact.mjs'
import { batchSignAppTree } from './batch-sign-binaries.mjs'
import { rehashPayloadDigests } from './payload-digests.mjs'
import { sanitizeTree } from './sanitize-pe-signatures.mjs'

export default async function afterPack(context) {
  const platform = context.electronPlatformName
  // Artifact-skew guard (#60772): before any platform work, prove the packed
  // bundle's readiness parser still accepts both ready tokens. This runs for
  // every packed build — first install, `hermes desktop`, the installer's
  // --update rebuild — so a stale matcher fails the pack here instead of
  // killing healthy backends on user machines.
  const asarPath = resolvePackagedAsarPath(context)
  assertPackagedBackendReadyArtifact(asarPath)
  console.log(`[after-pack] verified backend readiness parser in ${asarPath}`)
  const payload = path.join(context.appOutDir, 'resources', 'agent-payload')
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const exe = path.join(context.appOutDir, `${productName}.exe`)

  // Repair dangling PE certificate tables BEFORE electron-builder signs the
  // tree. A stripped-but-still-declared signature makes signtool reject the
  // file with 0x800700C1, and AppxSIP inspects every PE inside the MSIX, so
  // one bad payload DLL fails the whole package. Unlike the stamp below this
  // is NOT best-effort: shipping past it means shipping an unsignable bundle.
  // this is a hack until https://github.com/astral-sh/python-build-standalone/pull/1217 is merged.
  const { scanned, repaired } = sanitizeTree(context.appOutDir)
  console.log(`[after-pack] ${scanned} PEs scanned, ${repaired.length} dangling certificate tables cleared`)
  for (const file of repaired) {
    console.log(`  ${file}`)
  }

  // The identity stamp already ran from afterExtract on the pristine exe
  // (scripts/after-extract.mjs, #105629); rcedit cannot commit to the
  // ASAR-integrity-rewritten PE we hold here.

  // Batch-sign every payload binary AFTER sanitize (above) and the rcedit
  // stamp: a dangling certificate table or a subsequent resource edit would
  // invalidate the signature. The product exe is excluded here and signed
  // per-file by the customSign hook (scripts/batch-sign-binaries.mjs) after
  // electron-builder's own rcedit + fuses pass. No-op with a loud warning when
  // the AZURE_SIGN_* environment is absent (unsigned/fork/canary lanes).
  await batchSignAppTree(context.appOutDir, exe, {
    config: context.packager.config,
    resourcesDir: context.packager.buildResourcesDir,
  })
  rehashPayloadDigests(payload)
}
