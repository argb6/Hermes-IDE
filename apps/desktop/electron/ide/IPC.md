# IDE intelligence IPC

Main-process contract for code intelligence, debugging, and declarative extensions.
The renderer talks to these channels through `window.hermesDesktop.lsp`, `.dap`, and `.ext`
(see `preload.ts`). Nothing in this surface throws into the renderer: download, launch, and
protocol failures resolve as a status payload so the editor keeps working.

Payload types live in `contract.ts`.

## Contract changes

Additive. Existing `lsp:*`, `dap:*`, and `ext:*` channel names and payloads are unchanged.

- The desktop listens on `127.0.0.1` for the Python `code_intelligence` tool. See Agent bridge. Local backend spawns receive `HERMES_IDE_BRIDGE_HOST`, `HERMES_IDE_BRIDGE_PORT`, and `HERMES_IDE_BRIDGE_TOKEN` in the process environment for that launch only. They are not config and are not written into the repo.
- Each LSP session remembers the latest `textDocument/publishDiagnostics` body so the agent bridge can read it. The `lsp:diagnostics` push payload is unchanged.

## Status

`unavailable | downloading | ready | crashed`

| Value | Meaning |
|---|---|
| `unavailable` | Not started, offline, missing interpreter, launch failed, or stopped. `reason` says which. The editor should ignore intelligence. |
| `downloading` | First-use install (or the launch that follows it) is in progress. |
| `ready` | Process is up. LSP has finished `initialize`. DAP has spawned the adapter; the frontend still speaks the DAP session. |
| `crashed` | The process exited after it was ready. LSP restarts with backoff (500ms, 1s, 2s, 4s, 8s, five times) and `reason` is `restarting` until it is `ready` again, or `restart-limit` when it gives up. DAP does not auto-restart. |

`reason: "not-started"` is the idle `unavailable` before the first `start`. `reason: "offline"` means a download could not reach the network.

## Where files go

Downloads never touch the install directory (Program Files, `process.execPath`, `resources`, `app.asar`). They go under the per-user data root:

| Platform | Root |
|---|---|
| Windows | `%LOCALAPPDATA%\Hermes` |
| macOS | `~/Library/Application Support/Hermes` |
| Linux | `$XDG_DATA_HOME/Hermes` or `~/.local/share/Hermes` |

| Tree | Contents |
|---|---|
| `<root>/lsp/<server>/<version>/` | pyright, typescript-language-server + typescript (tsserver) |
| `<root>/dap/debugpy/<version>/` | debugpy only when the agent interpreter does not already import it (`pip --target`) |
| `<root>/dap/vscode-js-debug/<version>/` | vscode-js-debug DAP tarball |
| `<root>/extensions/<publisher>.<name>/` | unpacked declarative extension (`package.json` at the folder root) |

Pinned versions are in `lsp/catalog.ts`, `dap/debugpy.ts`, and `dap/js-debug.ts`.

Uninstall should keep `<root>/lsp`, `<root>/dap`, and `<root>/extensions` by default. On Windows that root is the same directory as the agent home (`%LOCALAPPDATA%\hermes`, case-insensitive), so a full wipe of that folder must spare those three children.

## LSP

One process per language server per workspace root. `javascript` and `typescript` (and the react variants) share `typescript-language-server`. Python uses `pyright`. Both are spawned with Electron's Node: `process.execPath` and `ELECTRON_RUN_AS_NODE=1`. Servers are not bundled; the first `lsp:start` downloads them.

Pyright's `initializationOptions.python.pythonPath` is the agent interpreter when one can be resolved. The TypeScript server's `initializationOptions.tsserver.path` points at the downloaded `typescript/lib/tsserver.js` (the server may still prefer a workspace TypeScript that ships `tsserver.js`).

### `lsp:start`

```ts
{ language: string, workspaceRoot: string }
→ { ok: boolean, status: IdeRuntimeStatus, reason?: string, language: string, workspaceRoot?: string }
```

Idempotent while `ready`. A second call joins an in-flight start.

### `lsp:stop`

```ts
{ language?: string, workspaceRoot?: string }
→ { ok: true }
```

Omit `language` to stop every server for that workspace. Omit both to stop all. Also runs on app quit.

### `lsp:didOpen` / `lsp:didChange` / `lsp:didClose`

```ts
didOpen:    { language, workspaceRoot, uri, languageId, version, text }
didChange:  { language, workspaceRoot, uri, version, contentChanges }
didClose:   { language, workspaceRoot, uri }
→ { ok: boolean, status?: IdeRuntimeStatus, reason?: string }
```

Notifications forwarded to the server. `ok: false` with `reason: "not-ready"` means start has not reached `ready` yet; retry after `lsp:status`. `contentChanges` is the LSP array (`{ text }` for a full replace, or ranged edits).

### `lsp:request`

```ts
{ language, workspaceRoot, method, params? }
→ { ok: boolean, status?: IdeRuntimeStatus, reason?: string, result?: unknown }
```

Forwards an LSP request and returns the result. Typical methods: `textDocument/completion`, `textDocument/hover`, `textDocument/definition`, `textDocument/references`, `textDocument/rename`, `textDocument/documentSymbol`, `textDocument/prepareRename`. `exit` and `shutdown` are rejected (`lsp:stop` owns the process).

### `lsp:status`

```ts
{ language?: string, workspaceRoot?: string }
→ { languages: Array<{ language, status, reason?, workspaceRoot? }> }
```

With no query, returns `python`, `typescript`, and `javascript`.

### `lsp:diagnostics` (main → renderer)

```ts
{ language: string, workspaceRoot: string, uri: string, diagnostics: unknown[] }
```

Pushed for every `textDocument/publishDiagnostics`. `language` is the `languageId` from `didOpen` when that uri is known. Subscribe with `hermesDesktop.lsp.onDiagnostics`; the return value unsubscribes.

## DAP

The frontend speaks DAP. `dap:start` only spawns the adapter. The frontend then sends `initialize`, `launch` / `attach`, `setBreakpoints`, `configurationDone`, `continue`, `next`, `stepIn`, `stepOut`, `pause`, `threads`, `stackTrace`, `scopes`, `variables`, `evaluate`, and `disconnect` through `dap:send`.

| Adapter | Process |
|---|---|
| `python` | Agent Python (bundled payload store python, else `HERMES_DESKTOP_PYTHON`, else the checkout or install virtualenv — the same rungs as the desktop backend). Args: `-m debugpy.adapter`. If that interpreter cannot `import debugpy`, `pip install --target <root>/dap/debugpy/<version>`. No extra Python is downloaded. |
| `node` | `process.execPath` with `ELECTRON_RUN_AS_NODE=1` running `js-debug/src/dapDebugServer.js` from the downloaded vscode-js-debug tarball. This is the adapter host, not the debuggee. The DAP `launch` request chooses the debuggee runtime. |

`pythonPath` on the start result is the interpreter to put in the debugpy `launch` request's `python` field. `nodeExecPath` is the Electron binary used for the adapter; do not assume the user's program runs on it.

Adapter-initiated DAP requests (for example `runInTerminal`) are answered `success: false` / `not-supported` in this phase so the adapter does not stall.

### `dap:start`

```ts
{
  adapter: 'python' | 'node',
  workspaceRoot: string,
  launch?: {
    request?: 'launch' | 'attach',
    program?: string,
    args?: string[],
    cwd?: string,
    env?: Record<string, string>,
    port?: number,
    stopOnEntry?: boolean,
    console?: string,
    justMyCode?: boolean,
    runtimeExecutable?: string,
    runtimeArgs?: string[],
    python?: string,
    pythonArgs?: string[]
  }
}
→ {
  ok: boolean,
  status: IdeRuntimeStatus,
  reason?: string,
  sessionId?: string,
  adapter?: 'python' | 'node',
  pythonPath?: string,
  nodeExecPath?: string
}
```

`launch.cwd` and `launch.env` apply to the adapter process. `launch.env` cannot clear `ELECTRON_RUN_AS_NODE` for the node adapter. The rest of `launch` is for the frontend to send as the DAP `launch`/`attach` arguments; the backend does not send it.

### `dap:send`

```ts
{ sessionId: string, command: string, arguments?: unknown }
→ { ok: boolean, status?: IdeRuntimeStatus, reason?: string, response?: DapResponse }
```

`response` is the DAP response: `{ type: 'response', request_seq, success, command, message?, body? }`. The backend assigns `seq`.

### `dap:stop`

```ts
{ sessionId?: string, workspaceRoot?: string }
→ { ok: true }
```

Sends DAP `disconnect` (`terminateDebuggee: true`) when the adapter is still up, then kills the process. App quit kills every session.

### `dap:status`

```ts
→ {
  adapters: Array<{ adapter: 'python' | 'node', status, reason? }>,
  sessions: Array<{ sessionId, adapter, workspaceRoot, status, reason? }>
}
```

### `dap:event` (main → renderer)

```ts
{ sessionId: string, event: { type: 'event', event: string, seq?: number, body?: unknown } }
```

Every DAP event (`stopped`, `continued`, `output`, `terminated`, `exited`, `thread`, `breakpoint`, …). Subscribe with `hermesDesktop.dap.onEvent`.

## Extensions

Registry is Open VSX (`https://open-vsx.org`), not the Visual Studio Marketplace. Only declarative contributions are installed: themes, TextMate grammars, snippets, language configuration. A manifest with a non-empty `main` or `browser` is refused and not written to disk.

### `ext:search`

```ts
{ query?: string, size?: number, offset?: number }
→ { ok: boolean, status?: 'unavailable', reason?: string, extensions?: SearchHit[], total?: number }
```

`SearchHit`: `{ id, namespace, name, version, displayName?, description?, downloadCount? }`. `id` is `namespace.name`. Search does not know whether a hit contains code; `ext:install` is the gate.

### `ext:install`

```ts
{ id: string, version?: string }
→ {
  ok: boolean,
  status?: 'unavailable' | 'rejected',
  reason?: string,
  fields?: string[],
  extension?: InstalledExtension
}
```

`status: "rejected"`, `reason: "code-extension"`, `fields: ['main']` and/or `['browser']` means the vsix was not unpacked. Offline and bad ids are `unavailable`.

`InstalledExtension`:

```ts
{
  id, version, displayName?, description?,
  path, // absolute directory containing package.json
  contributes: {
    themes: Array<{ label, id?, uiTheme?, path }>,
    grammars: Array<{ scopeName?, language?, path, embeddedLanguages? }>,
    snippets: Array<{ language?, path }>,
    languages: Array<{ id, aliases?, extensions?, filenames?, configuration? }>
  }
}
```

Every `path` inside `contributes` is absolute and stays inside `extension.path`. The frontend can load those files into Monaco. No extension host runs.

### `ext:uninstall`

```ts
{ id: string }
→ { ok: boolean, reason?: string }
```

### `ext:list`

```ts
→ { ok: true, extensions: InstalledExtension[] }
```

## Agent bridge

`getIdeIntelligenceHost()` in `host.ts` is the in-process owner of the language servers. The Python agent is a different process, so it does not call that function. `registerIdeIpc()` also binds an HTTP listener to `127.0.0.1` on an ephemeral port and mints a random token for that desktop launch.

The token and port are placed on local backend children (`HERMES_IDE_BRIDGE_HOST`, `HERMES_IDE_BRIDGE_PORT`, `HERMES_IDE_BRIDGE_TOKEN`), the same way `HERMES_DASHBOARD_SESSION_TOKEN` is passed. CLI processes and remote backends do not receive them. The tool `code_intelligence` (`desktop_ui`, read-only) returns `{"status":"unavailable",...}` when the variables are missing, the host is not loopback, the socket is down, or the language server is not already `ready`.

`POST /ide/query` with `Authorization: Bearer <token>` and a JSON body:

```ts
{
  action: 'definition' | 'references' | 'hover' | 'documentSymbol' | 'diagnostics',
  path: string,          // source file
  line?: number,         // 1-based; required for definition, references, hover
  character?: number,    // 1-based; defaults to 1
  workspaceRoot?: string
}
→ { status: 'ok', result?: unknown, diagnostics?: unknown[] }
  | { status: 'unavailable', reason: string }
```

The bridge never calls `lsp.start`. It uses a server that is already `ready` for that file's workspace (the renderer's `lsp:start`). If the document is not open yet, the bridge sends `didOpen` with the on-disk text to that same process. File URIs use `pathToFileUri` in `lsp/manager.ts` (`file://` + encoded absolute path). The renderer should use the same URI so a later agent `didOpen` does not replace an unsaved buffer.

A missing or wrong token is HTTP 401 `{ status: 'unavailable', reason: 'unauthorized' }`. Connections whose peer address is not loopback are rejected.

## Packaging

No language server, debug adapter, or extension is shipped in the installer, so this change does not need `asarUnpack`. If a later build vendors `js-debug` or pyright inside the app, those files must be unpacked: they are spawned as real scripts via `process.execPath`, and native `.node` addons in the js-debug tarball cannot load from inside `app.asar`.

Node for vscode-js-debug and the language servers is Electron itself (`ELECTRON_RUN_AS_NODE=1`). Do not bundle a second Node. debugpy uses the agent interpreter already located by the desktop (`payload.storePython` or the install virtualenv) and only then a `--target` install under the user data root.
