# Hermes-IDE NSIS packaging

Local Windows x64 installer only. It is not the MSIX release feed. Publish
stays unset for this target (`--publish never`, and `publish` is null when
`HERMES_DESKTOP_WIN_TARGET=nsis`). The GitHub owner/repo fallback in
`electron-builder.config.cjs` is `argb6/Hermes-IDE`.

Build: `npm run dist:win:nsis` in `apps/desktop` (NSIS, x64). CI:
`.github/workflows/desktop-win-nsis.yml` on `windows-latest`. The job uploads
the `.exe` as an artifact. It does not create a GitHub Release and does not
read signing secrets. `CSC_IDENTITY_AUTO_DISCOVERY=false` skips certificate
lookup. Azure signing in `windowsSigning()` already no-ops when
`AZURE_SIGN_ENDPOINT` / `AZURE_CLIENT_ID` are unset.

## Staged natives (`node-pty`, `get-windows`)

`before-pack` copies prepared natives into `dist/node_modules/`. electron-builder
still injects `!**/node_modules/**`, so `files` must list `dist/node_modules/**/*`
or the installed app fails at launch with `Cannot find package 'node-pty'`.

After install they unpack under:

`<install dir>\resources\app.asar.unpacked\dist\node_modules\node-pty\`

## ripgrep

`@vscode/ripgrep@1.18.0` (added by the IDE frontend PR) has no `postinstall`.
`rg.exe` is a file inside the optional npm package
`@vscode/ripgrep-win32-x64` (`package/bin/rg.exe`). A Windows x64 `npm ci`
installs that package from the npm registry. No GitHub token and no download
from `github.com` are required. Do not pass `--omit=optional` /
`npm_config_omit=optional`.

`files` is a whitelist, so the meta package and
`node_modules/@vscode/ripgrep-*/**` are listed explicitly. `asar.unpack`
extracts the platform package. After install the binary is a normal Windows
`.exe` at:

`<install dir>\resources\app.asar.unpacked\node_modules\@vscode\ripgrep-win32-x64\bin\rg.exe`

The per-user default install dir is `%LOCALAPPDATA%\Programs\<app folder>`.
The npm tarball mode is `0644`. Windows runs `rg.exe` by its PE extension;
that mode is not an execute bit.

The meta package stays inside `app.asar`. The frontend PR's `unpackAsarPath`
already rewrites an `app.asar` + separator path to `app.asar.unpacked` and
leaves an already-unpacked path alone. This packaging change does not edit
that runtime code.

## Uninstall and `%LOCALAPPDATA%\hermes`

On Windows that directory is the agent home and the IDE download root
(`lsp`, `dap`, `extensions`) from the backend PR. `installer-user-data.nsh`
is the only custom uninstall script. `customRemoveFiles` is not defined, so
electron-builder still removes only the install directory.
`deleteAppDataOnUninstall` is false, so the built-in flag does not delete
`$APPDATA\${APP_FILENAME}`.

Deletion runs only when all of these are true:

- the uninstall is not silent (`/S` is how electron-updater invokes the old
  uninstaller on every update; it also passes `--updated`)
- `${isUpdated}` is false
- the checkbox "同时删除用户数据 / Also delete user data" was checked

The checkbox is unchecked by default. The path is removed only when it is
exactly `$LOCALAPPDATA\hermes` (case-insensitive), the final directory name
is `hermes`, and the path is not empty, a drive or UNC root, or the user
profile. `LOCALAPPDATA` itself must not be a root. Comparison uses
`lstrcmpiW` plus `GetFileName` / `GetRoot`, not a substring match. Per-machine
install mode switches to the current-user shell context for the lookup and
restores it afterward.

| Uninstall | `%LOCALAPPDATA%\hermes` |
|---|---|
| Interactive, checkbox unchecked (default) | Kept |
| Interactive, checkbox checked, path passes the checks | Removed (`RMDir /r`) |
| Interactive, checkbox checked, path fails the checks | Kept |
| Silent `/S`, including auto-update | Kept |

`FileFunc.nsh` is included once (`FILEFUNC_INCLUDED`). `nsDialogs.nsh` is not
included again; MUI2 already loaded it before `customUnWelcomePage` expands.
