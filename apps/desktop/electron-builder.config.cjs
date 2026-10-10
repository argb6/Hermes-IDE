// THE electron-builder configuration — the whole thing, one file. There is
// no "build" field in package.json: run-electron-builder.mjs always passes
// --config for this file, so a stray package.json field would be silently
// ignored anyway, and splitting the config across JSON + this overlay is
// how the two halves drift.
//
// A .cjs module (not JSON) so the variant is decided at require time:
// HERMES_DESKTOP_VARIANT=light builds "Hermes Light". The whole config
// derives from that one flag.
// @ts-check
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const feedContract = require('./update-feed.cjs')

const {
  store,
  storeMsix,
  displayName,
  appId,
  appNamePascal,
  artifactNamePascal,
  windowsExecutableName,
  channel,
  msixAppIdWithOrg,
  token
} = require('./product-identity.cjs')

// `storeMsix` is optional on the identity type but guaranteed present when
// `store` is true (product-identity.cjs spreads it only in that branch).
// The `store` flag is typed `boolean` in the identity, so checkJs cannot
// correlate the two; `mustStoreMsix` is the single assertion point and the
// invariant lives in product-identity.cjs:33-34/58-68.
/** @type {NonNullable<typeof storeMsix> | undefined} */
const storeMsixWhenStore = storeMsix
const releaseBuild = Boolean(process.env.HERMES_PAYLOAD_TAG)
/** Local Hermes-IDE Windows installer with a choosable path (NSIS). Default remains MSIX. */
const winNsis = process.env.HERMES_DESKTOP_WIN_TARGET === 'nsis'

/**
 * The store MSIX packaging identity. Callers must only invoke this when
 * `store` is true (see the invariant note above).
 * @param {NonNullable<typeof storeMsix> | undefined} value
 * @returns {NonNullable<typeof storeMsix>}
 */
function mustStoreMsix(value) {
  return /** @type {NonNullable<typeof storeMsix>} */ (value)
}

// The out-of-store MSIX publisher (ATS cert subject) — single source, shared
// with the .appinstaller generator so the manifest and the App Installer can
// never drift (see scripts/msix-shared.mjs).
const { OUT_OF_STORE_PUBLISHER, channelBuildRequest, stageChannelManifest } = require('../../scripts/msix-shared.mjs')
const channelRequest = channelBuildRequest()

/** @typedef {import("app-builder-lib").Configuration} Configuration */

const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'argb6/Hermes-IDE').split('/')
if (!owner || !repo) {
  throw new Error(`invalid GITHUB_REPOSITORY ${process.env.GITHUB_REPOSITORY}`)
}
const electronVersion = require('./package.json').devDependencies.electron
if (!/^\d+\.\d+\.\d+$/.test(electronVersion)) {
  throw new Error(`invalid electron version ${electronVersion} in package.json`)
}

const publicUrl = feedContract.feedBaseUrl(process.env.CLOUDFLARE_R2_PUBLIC_URL)

/** @satisfies {Configuration} */
module.exports = {
  electronVersion,
  appId,
  productName: displayName,
  executableName: displayName,
  // No copyright / company / author anywhere in the PE or the installer — the
  // package carries no producer identity (user requirement). An explicit empty
  // string beats electron-builder's generated default.
  copyright: '',
  protocols: [
    {
      name: `${displayName} Protocol`,
      schemes: ['hermes']
    }
  ],
  // A store build is archived, never served to a feed — prefix its artifact
  // so it can't collide with the out-of-store MSIX of the same tag/arch, and
  // the release pipeline can keep the two apart.
  // Local Windows NSIS: fixed marketing name per product decision.
  artifactName: winNsis
    ? 'Hermes-IDE-win-x64-1.0.0beta.${ext}'
    : `${store ? 'Store-' : ''}${artifactNamePascal}-\${version}-\${os}-\${arch}.\${ext}`,
  icon: 'assets/icon',
  // The electron-updater feed. CI builds set CLOUDFLARE_R2_PUBLIC_URL (the R2
  // public bucket / custom domain) and publish there — the feed yml, blockmaps
  // and installers all live in the same flat R2 bucket, and electron-updater
  // resolves the yml's relative artifact paths against it. Builds without the
  // var (local, or a fork without the R2 vars) keep the github provider, which
  // is exactly today's behavior. The store build has no feed at all (the Store
  // owns its distribution and updates).
  // Local NSIS builds are never published; keep publish null so missing GH_TOKEN
  // cannot fail the run after the installer is already written.
  publish: winNsis || channelRequest || !channel
    ? null
    : [
        publicUrl
          ? { provider: 'generic', url: publicUrl, channel }
          : { provider: 'github', owner, repo, channel }
      ],
  extraMetadata: {
    name: appNamePascal,
    // Electron bootstrap reads package.productName before main.ts. Keep the
    // shipped stable default, but isolate nonstable userData from first access.
    // A stable-branded channel has no token and keeps stable's userData.
    ...((channelRequest && token) || appNamePascal !== artifactNamePascal ? { productName: displayName } : {}),
    desktopName: appId
  },
  directories: {
    // Temporary alternate dir while a live Hermes holds release\win-unpacked.
    output: process.env.HERMES_DESKTOP_RELEASE_DIR || 'release'
  },
  // Whitelist. Production node_modules are not copied unless named here.
  // @vscode/ripgrep@1.18.0 (PR #5) is external in the main bundle. Its rg.exe
  // lives in the optional package @vscode/ripgrep-<platform>-<arch> (published
  // tarball, no postinstall download). Windows x64 CI gets
  // @vscode/ripgrep-win32-x64 from npm; do not omit optional dependencies.
  files: [
    'dist/**',
    'assets/**',
    'public/**',
    'package.json',
    // electron-builder injects `!**/node_modules/**` before these includes.
    // before-pack stages node-pty, get-windows, and @vscode/ripgrep* into
    // dist/node_modules (workspace hoist leaves apps/desktop/node_modules empty).
    'dist/node_modules/**/*'
  ],
  beforeBuild: channelRequest ? async () => {
    await require(path.join(__dirname, 'scripts/before-build.mjs')).default()
    stageChannelManifest(__dirname, channelRequest)
    return false
  } : 'scripts/before-build.mjs',
  beforePack: 'scripts/before-pack.mjs',
  // The exe identity stamp runs here, on the pristine electron.exe, because
  // ASAR integrity rewrites the PE later and rcedit cannot commit to that
  // rewritten file (#105629). afterPack keeps the signing/payload work.
  afterExtract: 'scripts/after-extract.mjs',
  afterPack: 'scripts/after-pack.mjs',
  extraResources: [
    {
      from: 'build/install-stamp.json',
      to: 'install-stamp.json'
    },
    // The vscode-js-debug DAP bundle (fetched by scripts/fetch-js-debug.mjs at
    // build time, never committed) — debugging must not download at runtime.
    {
      from: 'resources/js-debug',
      to: 'js-debug'
    },
    ...(['bundled', 'store'].includes(process.env.HERMES_DESKTOP_VARIANT || '')
      ? [{ from: 'build/agent-payload', to: 'agent-payload' }]
      : []),
    {
      from: 'assets/icon.ico',
      to: 'icon.ico'
    }
  ],
  asar: {
    // Platform ripgrep packages unpack to
    // resources/app.asar.unpacked/node_modules/@vscode/ripgrep-<platform>-<arch>/
    // so Windows x64 can spawn bin/rg.exe. The meta package stays in app.asar
    // (require.resolve reads JS from the archive). PR #5's unpackAsarPath
    // rewrites app.asar + separator to app.asar.unpacked.
    unpack: [
      '**/*.node',
      '**/prebuilds/**',
      'dist/**',
      '**/node_modules/@vscode/ripgrep-*/**/*'
    ]
  },
  win: {
    executableName: windowsExecutableName,
    target: winNsis ? ['nsis'] : ['msix'],
    // The updaters' relaunch waiter is PowerShell run outside the package. The
    // sealed payload's snapshot omits scripts/, so it ships as a resource
    // (RELAUNCH_WAITER_SCRIPT in electron/updater/relaunch-waiter.ts).
    extraResources: [
      { from: 'scripts/update-relaunch-waiter.ps1', to: 'update-relaunch-waiter.ps1' },
      // Bootstrap installs from this fork; ship install.ps1 so first-run does
      // not depend on NousResearch raw.githubusercontent.com.
      { from: '../../scripts/install.ps1', to: 'install.ps1' }
    ],
    ...windowsSigning()
  },
  // Hermes-IDE assisted installer: pick a folder. Setup nests an app-named
  // subfolder when needed, refuses drive roots and common user/system
  // directories, and aborts if that folder is not empty (an /updated upgrade
  // may reuse it). It never deletes existing files.
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: displayName,
    installerLanguages: ['zh_CN', 'en_US'],
    include: 'assets/installer-user-data.nsh',
    // Must stay false. The built-in flag deletes $APPDATA\${APP_FILENAME}
    // (roaming), and a silent /S uninstall — including electron-updater's
    // upgrade — must not delete anything under %LOCALAPPDATA%\hermes.
    // Opt-in removal of that folder is assets/installer-user-data.nsh.
    deleteAppDataOnUninstall: false,
    runAfterFinish: true,
    menuCategory: false
  },
  msix: {
    // A store build uses the Partner Center packaging identity (the Store
    // re-signs + rewrites the publisher on submission); everything else uses
    // the out-of-store ATS-cert identity.
    identityName: store ? mustStoreMsix(storeMsixWhenStore).identityName : msixAppIdWithOrg,
    applicationId: appNamePascal,
    displayName,
    publisher: store ? mustStoreMsix(storeMsixWhenStore).publisher : OUT_OF_STORE_PUBLISHER,
    publisherDisplayName: store ? mustStoreMsix(storeMsixWhenStore).publisherDisplayName : 'Hermes-IDE',
    // The native quad is the build time (scripts/msix-shared.mjs::nativeQuad),
    // baked into the manifest template, so the builder's own build-number
    // override would stamp a second, conflicting version.
    setBuildNumber: false,
    // Store versions are baked into a build-time template. App semver and
    // artifact filenames stay unchanged; the Store reserves revision zero.
    // Floor Windows 11 22H2. Below build 18307 the manifest schema caps
    // AppExtension Name at 39 chars and Microsoft's own
    // "com.microsoft.windows.copilotkeyprovider" is 40 (makeappx
    // 0x80080204 — A/B-verified against the 26100 kit; 18307 exactly
    // still failed on it, 22621 passes), and 22621 is the documented
    // Copilot hardware key floor anyway.
    minVersion: '10.0.22621.0',
    maxVersionTested: '10.0.26100.0',
    // Static path: the file itself is written by scripts/before-build.mjs at
    // build time (see the comment on the hook) — never at config require
    // time, so typecheck/test imports don't touch the filesystem.
    customExtensionsPath: 'build/msix-extensions.xml',
    customManifestPath: store ? 'build/store-msix-manifest.xml'
      : releaseBuild || channelRequest || appNamePascal !== artifactNamePascal
        ? 'build/msix-manifest.xml' : 'assets/msix-manifest.xml',
    // Hermes state is deliberately shared with unpackaged CLI/gateway
    // processes. Pair the manifest's disabled virtualization properties with
    // the restricted capability that permits unvirtualized AppData/HKCU writes.
    capabilities: ['unvirtualizedResources'],
    showNameOnTiles: true
  }
}

if (channelRequest) {
  Object.assign(module.exports, { buildVersion: channelRequest.version })
  Object.assign(module.exports.extraMetadata, {
    version: channelRequest.version,
    shortVersion: channelRequest.windowsVersion,
    shortVersionWindows: channelRequest.windowsVersion
  })
}

// MSIX build-time staging (build/appx icons + build/msix-extensions.xml)
// lives in scripts/before-build.mjs — an electron-builder lifecycle hook —
// NOT here at require time, so importing this config for typecheck/tests
// never writes to the filesystem.

// Azure Trusted Signing. The hook signs the .msix package itself and the
// product exe (after electron-builder's rcedit — the batch in afterPack runs
// too early for the exe); every other payload binary is batch-signed in
// afterPack via scripts/batch-sign-binaries.mjs, which this hook acknowledges
// with `true` so electron-builder never re-signs one-by-one. The package
// signature is all Windows install validation checks; inner Authenticode
// covers SmartScreen/WDAC tree scans. See batch-sign-binaries.mjs for the
// ordering contract.
function windowsSigning() {
  if (!process.env.AZURE_SIGN_ENDPOINT || !process.env.AZURE_CLIENT_ID) {
    return {}
  }
  return {
    sign: {
      type: 'signtool',
      sign: './scripts/batch-sign-binaries.mjs',
      signingHashAlgorithms: ['sha256'],
      publisherName: process.env.AZURE_SIGN_PUBLISHER
    }
  }
}
