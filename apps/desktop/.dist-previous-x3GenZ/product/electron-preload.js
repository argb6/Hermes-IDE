"use strict";

// electron/preload.ts
var import_electron = require("electron");

// electron/window-controls.ts
function customWindowControlsEnabled(options = {}) {
  const platform = options.platform ?? process.platform;
  if (platform !== "linux") {
    return false;
  }
  const env = options.env ?? process.env;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) {
    return true;
  }
  return options.kernelRelease ? /microsoft|wsl/i.test(options.kernelRelease) : false;
}

// electron/api-expected-404.ts
var HERMES_API_EXPECTED_404 = "__hermesExpected404__";
function isExpectedNotFoundSentinel(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === HERMES_API_EXPECTED_404 && typeof value[HERMES_API_EXPECTED_404] === "string";
}
function unwrapExpectedNotFound(value) {
  if (isExpectedNotFoundSentinel(value)) {
    throw new Error(value[HERMES_API_EXPECTED_404]);
  }
  return value;
}

// electron/preload.ts
var translucencySupport = import_electron.ipcRenderer.sendSync("hermes:translucency:support");
var hudWindowing = import_electron.ipcRenderer.sendSync("hermes:hud:windowing");
var hudNativeDrag = hudWindowing?.nativeDrag === true;
var launchFlags = import_electron.ipcRenderer.sendSync("hermes:feature-flags");
var localSkin = import_electron.ipcRenderer.sendSync("hermes:skin:local");
import_electron.contextBridge.exposeInMainWorld("hermesDesktop", {
  glassSupported: translucencySupport?.glass === true,
  translucencySupported: translucencySupport?.translucency === true,
  // Launch-flag fact: the app was started with --local, so the renderer may
  // show the local-models surfaces. Static for the window's lifetime.
  localModelsEnabled: launchFlags?.localModels === true,
  // Launch-flag fact: the Nous free tier is on for this launch
  // (HERMES_GUEST_ONBOARDING=1 or --guest-onboarding). Read-only; the same
  // decision is stamped onto every backend the app spawns.
  guestOnboardingEnabled: launchFlags?.guestOnboarding === true,
  localSkin: localSkin && typeof localSkin === "object" ? localSkin : null,
  getConnection: (profile, opts) => import_electron.ipcRenderer.invoke("hermes:connection", profile, opts),
  // Loopback origin that hosts YouTube's player for the file:// renderer.
  getEmbedHostOrigin: () => import_electron.ipcRenderer.invoke("hermes:embed-host:origin"),
  // Registry-scoped backend resolution: { connectionId, profile } → descriptor.
  getConnectionFor: (payload) => import_electron.ipcRenderer.invoke("hermes:connection:for", payload),
  getProfileRoutes: (profiles) => import_electron.ipcRenderer.invoke("hermes:plugin-profile-routes", profiles),
  revalidateConnection: () => import_electron.ipcRenderer.invoke("hermes:connection:revalidate"),
  touchBackend: (profile, options) => import_electron.ipcRenderer.invoke("hermes:backend:touch", profile, options),
  getPoolLimits: () => import_electron.ipcRenderer.invoke("hermes:pool-limits:get"),
  setPoolLimits: (limits) => import_electron.ipcRenderer.invoke("hermes:pool-limits:set", limits),
  getGatewayWsUrl: (profile) => import_electron.ipcRenderer.invoke("hermes:gateway:ws-url", profile),
  // Registry-scoped fresh WS URL: { connectionId, profile } → result shape of
  // getGatewayWsUrl, minted against that connection's backend.
  getGatewayWsUrlFor: (payload) => import_electron.ipcRenderer.invoke("hermes:gateway:ws-url-for", payload),
  // Union agent roster across every registered connection.
  getAgentRoster: () => import_electron.ipcRenderer.invoke("hermes:agents:roster"),
  openSessionWindow: (sessionId, opts) => import_electron.ipcRenderer.invoke("hermes:window:openSession", sessionId, opts),
  openSessionInTerminal: (sessionId, opts) => import_electron.ipcRenderer.invoke("hermes:window:openInTerminal", sessionId, opts),
  openWindow: (options) => import_electron.ipcRenderer.invoke("hermes:window:openInstance", options),
  openBrowserWindow: (tabId) => import_electron.ipcRenderer.invoke("hermes:window:openBrowser", tabId),
  windowRelay: {
    send: (payload) => import_electron.ipcRenderer.send("hermes:window:relay", payload),
    onMessage: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:window:relay", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:window:relay", listener);
    }
  },
  onBrowserPopoutClosed: (callback) => {
    const listener = (_event, tabId) => callback(tabId);
    import_electron.ipcRenderer.on("hermes:browser-popout:closed", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:browser-popout:closed", listener);
  },
  claimAmbientCue: (key) => import_electron.ipcRenderer.invoke("hermes:ambient:claim", key),
  windowControls: {
    custom: customWindowControlsEnabled(),
    minimize: () => import_electron.ipcRenderer.send("hermes:window-control", "minimize"),
    toggleMaximize: () => import_electron.ipcRenderer.send("hermes:window-control", "toggle-maximize"),
    close: () => import_electron.ipcRenderer.send("hermes:window-control", "close")
  },
  wakeIndicator: {
    getState: () => import_electron.ipcRenderer.invoke("hermes:wake-indicator:get"),
    setState: (state) => import_electron.ipcRenderer.send("hermes:wake-indicator:set", state),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      import_electron.ipcRenderer.on("hermes:wake-indicator:state", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:wake-indicator:state", listener);
    }
  },
  chatOnboarding: {
    grow: (request) => import_electron.ipcRenderer.send("hermes:chat-onboarding:grow", request),
    soloBoot: () => import_electron.ipcRenderer.send("hermes:chat-onboarding:solo-boot")
  },
  // HUD mode: the chrome-free floating chat. A full app renderer (own gateway)
  // sized as a floating bar, so it mounts the real composer. Main owns the
  // window; `onChanged` keeps every window's toggle truthful.
  hud: {
    nativeDrag: hudNativeDrag,
    windowing: {
      clientPlacement: hudWindowing?.clientPlacement !== false,
      controlDrag: hudWindowing?.controlDrag === true,
      nativeDrag: hudNativeDrag,
      solid: hudWindowing?.solid === true,
      workspaceTransfer: hudWindowing?.workspaceTransfer === true
    },
    open: (request) => import_electron.ipcRenderer.invoke("hermes:hud:open", request),
    close: () => import_electron.ipcRenderer.invoke("hermes:hud:close"),
    setIgnoreMouse: (ignore) => import_electron.ipcRenderer.send("hermes:hud:ignore-mouse", ignore),
    beginMove: () => import_electron.ipcRenderer.send("hermes:hud:begin-move"),
    endMove: () => import_electron.ipcRenderer.send("hermes:hud:end-move"),
    moveBy: (delta) => import_electron.ipcRenderer.send("hermes:hud:move-by", delta),
    setWorkspaceTransfer: (transferring) => import_electron.ipcRenderer.send("hermes:hud:workspace-transfer", transferring),
    setBounds: (bounds) => import_electron.ipcRenderer.send("hermes:hud:set-bounds", bounds),
    resetLayout: () => import_electron.ipcRenderer.invoke("hermes:hud:reset-layout"),
    // Whether the band covers the window below the bar. Main pairs it with the
    // user's translucency setting to decide the native frost (macOS vibrancy /
    // Windows 11 DWM backdrop) — see hudFrostFor.
    setFrost: (showing) => import_electron.ipcRenderer.invoke("hermes:hud:frost", showing),
    // The HUD tells main which session it is on; main hands that back to the
    // app window when the HUD closes, so the app can re-home onto it.
    setSession: (sessionId) => import_electron.ipcRenderer.send("hermes:hud:session", sessionId),
    onGoto: (callback) => {
      const listener = (_event, sessionId) => callback(sessionId);
      import_electron.ipcRenderer.on("hermes:hud:goto", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:hud:goto", listener);
    },
    onChanged: (callback) => {
      const listener = (_event, state) => callback(state);
      import_electron.ipcRenderer.on("hermes:hud:changed", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:hud:changed", listener);
    },
    // Linux only, and silent elsewhere: where the cursor is, in page
    // coordinates, or null when it has left the window. Stands in for the
    // mousemove that `setIgnoreMouseEvents(true, { forward: true })` delivers on
    // macOS and Windows but not here.
    onCursor: (callback) => {
      const listener = (_event, point) => callback(point);
      import_electron.ipcRenderer.on("hermes:hud:cursor", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:hud:cursor", listener);
    },
    // Main's game-overlay watch: whether a fullscreen app (a game) is under
    // the HUD, so the renderer can step back to the low-opacity overlay
    // treatment while one owns the screen.
    onGameOverlay: (callback) => {
      const listener = (_event, state) => callback(state);
      import_electron.ipcRenderer.on("hermes:hud:game-overlay", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:hud:game-overlay", listener);
    }
  },
  // Quick Entry: the global-hotkey mini composer window. Main owns the OS
  // shortcut + the persisted preference; the quick window only captures text
  // and hands it back, and the primary renderer submits it through the normal
  // prompt path.
  quickEntry: {
    getSettings: () => import_electron.ipcRenderer.invoke("hermes:quick-entry:settings:get"),
    setSettings: (patch) => import_electron.ipcRenderer.invoke("hermes:quick-entry:settings:set", patch),
    // Invoke returns the delivery result so the draft is not lost (#85590).
    submit: (payload) => import_electron.ipcRenderer.invoke("hermes:quick-entry:submit", payload),
    // Main cannot invoke the primary renderer, so it receives this ack (#85590).
    ackSubmit: (correlationId, result) => import_electron.ipcRenderer.send("hermes:quick-entry:ack", { correlationId, result }),
    dismiss: () => import_electron.ipcRenderer.send("hermes:quick-entry:dismiss"),
    // Primary renderer → main → quick window: gateway connection state + the
    // recent-session options the target picker offers. Main caches the latest
    // payload so a freshly spawned quick window starts from truth.
    pushState: (payload) => import_electron.ipcRenderer.send("hermes:quick-entry:state", payload),
    // Quick window subscribes to those pushes.
    onState: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:quick-entry:state", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:quick-entry:state", listener);
    },
    // Main → primary renderer: a submit captured by the quick window.
    onSubmit: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:quick-entry:submit", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:quick-entry:submit", listener);
    },
    // Main → quick window: you were just summoned (reset draft + refocus).
    onShown: (callback) => {
      const listener = () => callback();
      import_electron.ipcRenderer.on("hermes:quick-entry:shown", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:quick-entry:shown", listener);
    },
    // Main → quick window: the outcome of a submit whose relay already timed
    // out. Delivery is now KNOWN — reconcile the unknown state instead of
    // leaving the user to resend a prompt that may already be delivered.
    onLateResult: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:quick-entry:late-result", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:quick-entry:late-result", listener);
    }
  },
  getBootProgress: () => import_electron.ipcRenderer.invoke("hermes:boot-progress:get"),
  getConnectionConfig: (profile) => import_electron.ipcRenderer.invoke("hermes:connection-config:get", profile),
  saveConnectionConfig: (payload) => import_electron.ipcRenderer.invoke("hermes:connection-config:save", payload),
  applyConnectionConfig: (payload) => import_electron.ipcRenderer.invoke("hermes:connection-config:apply", payload),
  testConnectionConfig: (payload) => import_electron.ipcRenderer.invoke("hermes:connection-config:test", payload),
  // Opt-in OS-keychain encryption for stored gateway secrets (default off —
  // see secret-storage-policy.ts). get never touches the OS keychain.
  getSecretStorageEncryption: () => import_electron.ipcRenderer.invoke("hermes:secret-storage:get"),
  setSecretStorageEncryption: (on) => import_electron.ipcRenderer.invoke("hermes:secret-storage:set", on),
  // v2 multi-connection registry: named agent sources (local / remote / cloud / ssh).
  connections: {
    list: () => import_electron.ipcRenderer.invoke("hermes:connections:list"),
    save: (payload) => import_electron.ipcRenderer.invoke("hermes:connections:save", payload),
    remove: (id) => import_electron.ipcRenderer.invoke("hermes:connections:remove", id),
    setPrimary: (id) => import_electron.ipcRenderer.invoke("hermes:connections:set-primary", id),
    setLaunchMode: (mode) => import_electron.ipcRenderer.invoke("hermes:connections:set-launch-mode", mode),
    setLastUsed: (id) => import_electron.ipcRenderer.invoke("hermes:connections:set-last-used", id),
    test: (id) => import_electron.ipcRenderer.invoke("hermes:connections:test", id),
    updateManaged: (id) => import_electron.ipcRenderer.invoke("hermes:connections:update-managed", id),
    // Fan out `hermes update` to every eligible registered connection.
    // Optional excludeIds skips rows the caller updates through another path.
    updateAll: (options) => import_electron.ipcRenderer.invoke("hermes:connections:update-all", options),
    // Registry lifecycle push (main → renderer): a connection was removed or
    // materially edited, so secondaries scoped to it must be disposed (and,
    // for edits, re-dialed at the new target).
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:connections:changed", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:connections:changed", listener);
    }
  },
  sshConfigHosts: () => import_electron.ipcRenderer.invoke("hermes:ssh-config:hosts"),
  sshResolveHost: (host) => import_electron.ipcRenderer.invoke("hermes:ssh-config:resolve", host),
  probeConnectionConfig: (remoteUrl) => import_electron.ipcRenderer.invoke("hermes:connection-config:probe", remoteUrl),
  // `options` lets a registry-editor draft sign in BEFORE it is saved: the
  // main process settles the draft's connection id up front so the login
  // window writes into the per-connection cookie jar the saved entry will
  // read (not the legacy shared jar an unsaved URL would fall back to).
  oauthLoginConnectionConfig: (remoteUrl, options) => import_electron.ipcRenderer.invoke("hermes:connection-config:oauth-login", remoteUrl, options),
  oauthLogoutConnectionConfig: (remoteUrl) => import_electron.ipcRenderer.invoke("hermes:connection-config:oauth-logout", remoteUrl),
  // Hermes Cloud: one portal login powers discovery + silent per-agent sign-in
  // (cloud-auto-discovery Phase 3).
  cloud: {
    status: () => import_electron.ipcRenderer.invoke("hermes:cloud:status"),
    login: () => import_electron.ipcRenderer.invoke("hermes:cloud:login"),
    logout: () => import_electron.ipcRenderer.invoke("hermes:cloud:logout"),
    discover: (org) => import_electron.ipcRenderer.invoke("hermes:cloud:discover", org),
    agentSignIn: (dashboardUrl) => import_electron.ipcRenderer.invoke("hermes:cloud:agent-sign-in", dashboardUrl)
  },
  profile: {
    getDefault: () => import_electron.ipcRenderer.invoke("hermes:profile:default:get"),
    setDefault: (route) => import_electron.ipcRenderer.invoke("hermes:profile:default:set", route),
    onDefaultChanged: (callback) => {
      const listener = (_event, route) => callback(route);
      import_electron.ipcRenderer.on("hermes:profile:default:changed", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:profile:default:changed", listener);
    },
    get: () => import_electron.ipcRenderer.invoke("hermes:profile:get"),
    remember: (name) => import_electron.ipcRenderer.invoke("hermes:profile:remember", name),
    set: (name) => import_electron.ipcRenderer.invoke("hermes:profile:set", name)
  },
  // The handler resolves an expected 404 with a sentinel instead of rejecting
  // (Electron logs a stack for every rejected invoke). Turn it back into the
  // rejection the renderer expects — see electron/api-expected-404.ts.
  api: (request) => import_electron.ipcRenderer.invoke("hermes:api", request).then(unwrapExpectedNotFound),
  notify: (payload) => import_electron.ipcRenderer.invoke("hermes:notify", payload),
  claimStartupLatency: () => import_electron.ipcRenderer.invoke("hermes:startup-latency:claim"),
  requestMicrophoneAccess: () => import_electron.ipcRenderer.invoke("hermes:requestMicrophoneAccess"),
  readWindowBelow: () => import_electron.ipcRenderer.invoke("hermes:window:readBelow"),
  readFileDataUrl: (filePath) => import_electron.ipcRenderer.invoke("hermes:readFileDataUrl", filePath),
  readFileDataUrlForAttach: (filePath) => import_electron.ipcRenderer.invoke("hermes:readFileDataUrlForAttach", filePath),
  dataUrlReadMax: {
    get: () => import_electron.ipcRenderer.invoke("hermes:data-url-read-max:get"),
    set: (maxMb) => import_electron.ipcRenderer.invoke("hermes:data-url-read-max:set", maxMb)
  },
  readFileText: (filePath, encoding) => import_electron.ipcRenderer.invoke("hermes:readFileText", filePath, encoding),
  readPluginSource: (filePath) => import_electron.ipcRenderer.invoke("hermes:readPluginSource", filePath),
  selectPaths: (options) => import_electron.ipcRenderer.invoke("hermes:selectPaths", options),
  selectSavePath: (options) => import_electron.ipcRenderer.invoke("hermes:selectSavePath", options),
  writeClipboard: (text) => import_electron.ipcRenderer.invoke("hermes:writeClipboard", text),
  readClipboard: () => import_electron.ipcRenderer.invoke("hermes:readClipboard"),
  saveGatewayFile: (payload) => import_electron.ipcRenderer.invoke("hermes:saveGatewayFile", payload),
  saveImageFromUrl: (url) => import_electron.ipcRenderer.invoke("hermes:saveImageFromUrl", url),
  contextMenuEdit: (command) => import_electron.ipcRenderer.invoke("hermes:context-menu:edit", command),
  contextMenuCopyImage: () => import_electron.ipcRenderer.invoke("hermes:context-menu:copy-image"),
  contextMenuSpellcheck: (action) => import_electron.ipcRenderer.invoke("hermes:context-menu:spellcheck", action),
  contextMenuGuestAddWord: (payload) => import_electron.ipcRenderer.invoke("hermes:context-menu:guest-add-word", payload),
  onContextMenuSpellcheck: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:context-menu-spellcheck", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:context-menu-spellcheck", listener);
  },
  saveImageBuffer: (data, ext, name) => import_electron.ipcRenderer.invoke("hermes:saveImageBuffer", { data, ext, name }),
  capturePreview: (payload) => import_electron.ipcRenderer.invoke("hermes:capturePreview", payload),
  savePastedText: (text) => import_electron.ipcRenderer.invoke("hermes:savePastedText", { text }),
  saveClipboardImage: () => import_electron.ipcRenderer.invoke("hermes:saveClipboardImage"),
  getPathForFile: (file) => {
    try {
      return import_electron.webUtils.getPathForFile(file) || "";
    } catch {
      return "";
    }
  },
  normalizePreviewTarget: (target, baseDir) => import_electron.ipcRenderer.invoke("hermes:normalizePreviewTarget", target, baseDir),
  watchPreviewFile: (url) => import_electron.ipcRenderer.invoke("hermes:watchPreviewFile", url),
  watchDirectory: (dir) => import_electron.ipcRenderer.invoke("hermes:watchDirectory", dir),
  stopPreviewFileWatch: (id) => import_electron.ipcRenderer.invoke("hermes:stopPreviewFileWatch", id),
  setActiveWork: (payload) => import_electron.ipcRenderer.send("hermes:active-work", payload),
  setTitleBarTheme: (payload) => import_electron.ipcRenderer.send("hermes:titlebar-theme", payload),
  setNativeTheme: (mode) => import_electron.ipcRenderer.send("hermes:native-theme", mode),
  setTranslucency: (payload) => import_electron.ipcRenderer.send("hermes:translucency", payload),
  setKeepAwake: (mode) => import_electron.ipcRenderer.send("hermes:keep-awake", mode),
  minimizeToTray: {
    get: () => import_electron.ipcRenderer.invoke("hermes:minimize-to-tray:get"),
    set: (on) => import_electron.ipcRenderer.invoke("hermes:minimize-to-tray:set", on),
    onChanged: (callback) => {
      const listener = (_event, status) => callback(status);
      import_electron.ipcRenderer.on("hermes:minimize-to-tray:changed", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:minimize-to-tray:changed", listener);
    }
  },
  setDisableF12: (blocked) => import_electron.ipcRenderer.send("hermes:devtools:disable-f12", blocked),
  setF12ShortcutActive: (active) => import_electron.ipcRenderer.send("hermes:f12ShortcutActive", Boolean(active)),
  onF12Shortcut: (callback) => {
    const listener = (_event, input) => callback(input);
    import_electron.ipcRenderer.on("hermes:f12-shortcut", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:f12-shortcut", listener);
  },
  setPreviewShortcutActive: (active) => import_electron.ipcRenderer.send("hermes:previewShortcutActive", Boolean(active)),
  setPreviewGuestHidden: (webContentsId, hidden) => import_electron.ipcRenderer.send("hermes:preview-guest-hidden", { webContentsId, hidden: Boolean(hidden) }),
  openExternal: (url) => import_electron.ipcRenderer.invoke("hermes:openExternal", url),
  mcpOauth: {
    // One-shot loopback listener for MCP OAuth against remote backends: bind
    // on this machine, hand redirectUri to mcp.servers.oauth.start, then wait
    // for the provider redirect and relay code/state via oauth.callback.
    listen: () => import_electron.ipcRenderer.invoke("hermes:mcp-oauth:listen"),
    wait: (id, timeoutMs) => import_electron.ipcRenderer.invoke("hermes:mcp-oauth:wait", id, timeoutMs),
    cancel: (id) => import_electron.ipcRenderer.invoke("hermes:mcp-oauth:cancel", id)
  },
  openPreviewInBrowser: (url) => import_electron.ipcRenderer.invoke("hermes:openPreviewInBrowser", url),
  reachPreviewUrl: (url) => import_electron.ipcRenderer.invoke("hermes:preview:reach", url),
  setActiveConnectionRoute: (route) => import_electron.ipcRenderer.send("hermes:connection:active-route", route),
  fetchLinkTitle: (url) => import_electron.ipcRenderer.invoke("hermes:fetchLinkTitle", url),
  resolveFavicon: (url) => import_electron.ipcRenderer.invoke("hermes:resolveFavicon", url),
  sanitizeWorkspaceCwd: (cwd) => import_electron.ipcRenderer.invoke("hermes:workspace:sanitize", cwd),
  settings: {
    getDefaultProjectDir: () => import_electron.ipcRenderer.invoke("hermes:setting:defaultProjectDir:get"),
    setDefaultProjectDir: (dir) => import_electron.ipcRenderer.invoke("hermes:setting:defaultProjectDir:set", dir),
    pickDefaultProjectDir: () => import_electron.ipcRenderer.invoke("hermes:setting:defaultProjectDir:pick")
  },
  zoom: {
    // Current zoom of this window, as { level, percent }.
    get: () => import_electron.ipcRenderer.invoke("hermes:zoom:get"),
    // Synchronous zoom factor (1 = 100%). Coordinate math needs it in the
    // same tick as the event it converts, so no IPC round-trip here.
    factor: () => import_electron.webFrame.getZoomFactor(),
    setPercent: (percent) => import_electron.ipcRenderer.send("hermes:zoom:set-percent", percent),
    // Fires on every zoom change, including the Ctrl/Cmd +/-/0 shortcuts,
    // so the settings UI can stay in sync with the keyboard.
    onChanged: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:zoom:changed", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:zoom:changed", listener);
    }
  },
  revealLogs: () => import_electron.ipcRenderer.invoke("hermes:logs:reveal"),
  getRecentLogs: () => import_electron.ipcRenderer.invoke("hermes:logs:recent"),
  // Fire-and-forget: persists a renderer error-boundary catch (with component
  // stack) to desktop.log so crashes survive the window (#79428).
  reportRendererError: (report) => import_electron.ipcRenderer.send("hermes:logs:renderer-error", report),
  logLine: (line) => import_electron.ipcRenderer.send("hermes:logs:renderer-line", line),
  readDir: (dirPath) => import_electron.ipcRenderer.invoke("hermes:fs:readDir", dirPath),
  gitRoot: (startPath) => import_electron.ipcRenderer.invoke("hermes:fs:gitRoot", startPath),
  revealPath: (targetPath) => import_electron.ipcRenderer.invoke("hermes:fs:reveal", targetPath),
  openDir: (dirPath) => import_electron.ipcRenderer.invoke("hermes:fs:openDir", dirPath),
  desktopPluginsRoot: () => import_electron.ipcRenderer.invoke("hermes:fs:desktopPluginsRoot"),
  reconcileDesktopPlugins: () => import_electron.ipcRenderer.invoke("hermes:fs:reconcileDesktopPlugins"),
  logsRoot: (profile) => import_electron.ipcRenderer.invoke("hermes:fs:logsRoot", profile),
  renamePath: (targetPath, newName) => import_electron.ipcRenderer.invoke("hermes:fs:rename", targetPath, newName),
  writeTextFile: (filePath, content, encoding) => import_electron.ipcRenderer.invoke("hermes:fs:writeText", filePath, content, encoding),
  trashPath: (targetPath) => import_electron.ipcRenderer.invoke("hermes:fs:trash", targetPath),
  git: {
    worktreeList: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:worktreeList", repoPath),
    worktreeAdd: (repoPath, options) => import_electron.ipcRenderer.invoke("hermes:git:worktreeAdd", repoPath, options),
    worktreeRemove: (repoPath, worktreePath, options) => import_electron.ipcRenderer.invoke("hermes:git:worktreeRemove", repoPath, worktreePath, options),
    branchSwitch: (repoPath, branch) => import_electron.ipcRenderer.invoke("hermes:git:branchSwitch", repoPath, branch),
    branchCheckout: (repoPath, options) => import_electron.ipcRenderer.invoke("hermes:git:branchCheckout", repoPath, options),
    branchList: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:branchList", repoPath),
    baseBranchList: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:baseBranchList", repoPath),
    repoStatus: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:repoStatus", repoPath),
    repoLog: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:repoLog", repoPath),
    fileHistory: (repoPath, filePath) => import_electron.ipcRenderer.invoke("hermes:git:fileHistory", repoPath, filePath),
    fileCommitDiff: (repoPath, filePath, rev) => import_electron.ipcRenderer.invoke("hermes:git:fileCommitDiff", repoPath, filePath, rev),
    fileConflictSides: (repoPath, filePath) => import_electron.ipcRenderer.invoke("hermes:git:fileConflictSides", repoPath, filePath),
    fileDiff: (repoPath, filePath) => import_electron.ipcRenderer.invoke("hermes:git:fileDiff", repoPath, filePath),
    scanRepos: (roots, options) => import_electron.ipcRenderer.invoke("hermes:git:scanRepos", roots, options),
    review: {
      list: (repoPath, scope, baseRef) => import_electron.ipcRenderer.invoke("hermes:git:review:list", repoPath, scope, baseRef),
      diff: (repoPath, filePath, scope, baseRef, staged) => import_electron.ipcRenderer.invoke("hermes:git:review:diff", repoPath, filePath, scope, baseRef, staged),
      stage: (repoPath, filePath) => import_electron.ipcRenderer.invoke("hermes:git:review:stage", repoPath, filePath),
      unstage: (repoPath, filePath) => import_electron.ipcRenderer.invoke("hermes:git:review:unstage", repoPath, filePath),
      revert: (repoPath, filePath) => import_electron.ipcRenderer.invoke("hermes:git:review:revert", repoPath, filePath),
      revParse: (repoPath, ref) => import_electron.ipcRenderer.invoke("hermes:git:review:revParse", repoPath, ref),
      commit: (repoPath, message, push) => import_electron.ipcRenderer.invoke("hermes:git:review:commit", repoPath, message, push),
      commitContext: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:review:commitContext", repoPath),
      push: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:review:push", repoPath),
      shipInfo: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:review:shipInfo", repoPath),
      prList: (repoPath, branches, numbers) => import_electron.ipcRenderer.invoke("hermes:git:review:prList", repoPath, branches, numbers),
      createPr: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:review:createPr", repoPath)
    },
    githubSidebar: (repoPath) => import_electron.ipcRenderer.invoke("hermes:git:githubSidebar", repoPath),
    githubPrFiles: (repoPath, number) => import_electron.ipcRenderer.invoke("hermes:git:githubPrFiles", repoPath, number),
    githubCheckoutPr: (repoPath, number) => import_electron.ipcRenderer.invoke("hermes:git:githubCheckoutPr", repoPath, number),
    githubStartIssue: (repoPath, number) => import_electron.ipcRenderer.invoke("hermes:git:githubStartIssue", repoPath, number),
    githubPrChecks: (repoPath, number) => import_electron.ipcRenderer.invoke("hermes:git:githubPrChecks", repoPath, number)
  },
  terminal: {
    attach: (id) => import_electron.ipcRenderer.invoke("hermes:terminal:attach", id),
    cwd: (id) => import_electron.ipcRenderer.invoke("hermes:terminal:cwd", id),
    dispose: (id) => import_electron.ipcRenderer.invoke("hermes:terminal:dispose", id),
    resize: (id, size) => import_electron.ipcRenderer.invoke("hermes:terminal:resize", id, size),
    start: (options) => import_electron.ipcRenderer.invoke("hermes:terminal:start", options),
    write: (id, data) => import_electron.ipcRenderer.invoke("hermes:terminal:write", id, data),
    onData: (id, callback) => {
      const channel = `hermes:terminal:${id}:data`;
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on(channel, listener);
      return () => import_electron.ipcRenderer.removeListener(channel, listener);
    },
    onExit: (id, callback) => {
      const channel = `hermes:terminal:${id}:exit`;
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on(channel, listener);
      return () => import_electron.ipcRenderer.removeListener(channel, listener);
    }
  },
  onClosePreviewRequested: (callback) => {
    const listener = () => callback();
    import_electron.ipcRenderer.on("hermes:close-preview-requested", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:close-preview-requested", listener);
  },
  onPreviewNav: (callback) => {
    const listener = (_event, command) => callback(command);
    import_electron.ipcRenderer.on("hermes:preview-nav", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:preview-nav", listener);
  },
  onOpenFolderRequested: (callback) => {
    const listener = () => callback();
    import_electron.ipcRenderer.on("hermes:open-folder-requested", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:open-folder-requested", listener);
  },
  onOpenUpdatesRequested: (callback) => {
    const listener = () => callback();
    import_electron.ipcRenderer.on("hermes:open-updates", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:open-updates", listener);
  },
  onDeepLink: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:deep-link", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:deep-link", listener);
  },
  signalDeepLinkReady: () => import_electron.ipcRenderer.invoke("hermes:deep-link-ready"),
  probePluginRepo: (payload) => import_electron.ipcRenderer.invoke("hermes:plugin:probe", payload),
  installDesktopPlugin: (payload) => import_electron.ipcRenderer.invoke("hermes:plugin:installDesktop", payload),
  removeDesktopPlugin: (payload) => import_electron.ipcRenderer.invoke("hermes:plugin:removeDesktop", payload),
  onWindowStateChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:window-state-changed", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:window-state-changed", listener);
  },
  onFocusSession: (callback) => {
    const listener = (_event, sessionId) => callback(sessionId);
    import_electron.ipcRenderer.on("hermes:focus-session", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:focus-session", listener);
  },
  onNotificationAction: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:notification-action", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:notification-action", listener);
  },
  onNotificationActivate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:notification-activate", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:notification-activate", listener);
  },
  onExternalOpenFailed: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:external-open-failed", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:external-open-failed", listener);
  },
  onPreviewFileChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:preview-file-changed", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:preview-file-changed", listener);
  },
  onBackendExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:backend-exit", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:backend-exit", listener);
  },
  // Cooperative pool retirement (main → renderer): the pooled backend under
  // `poolKey` is being stopped for a foreground open. Park that scope; do not
  // redial into the slot it vacated.
  onPoolBackendRetiring: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:pool:retiring", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:pool:retiring", listener);
  },
  // Soft gateway-mode apply finished tearing down the primary backend. Renderer
  // should wipe session lists + re-dial without a window reload.
  onConnectionApplied: (callback) => {
    const listener = () => callback();
    import_electron.ipcRenderer.on("hermes:connection:applied", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:connection:applied", listener);
  },
  onPowerResume: (callback) => {
    const listener = () => callback();
    import_electron.ipcRenderer.on("hermes:power-resume", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:power-resume", listener);
  },
  // AC ↔ battery transitions; renderers slow their backstop polls on battery.
  getOnBattery: () => import_electron.ipcRenderer.invoke("hermes:power-battery:get"),
  onBatteryChanged: (callback) => {
    const listener = (_event, onBattery) => callback(Boolean(onBattery));
    import_electron.ipcRenderer.on("hermes:power-battery", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:power-battery", listener);
  },
  onBootProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:boot-progress", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:boot-progress", listener);
  },
  // First-launch bootstrap progress -- emitted by the install.ps1 stage
  // runner in main.ts (apps/desktop/electron/bootstrap-runner.ts).
  // Renderer's install overlay subscribes to live events and queries the
  // current snapshot via getBootstrapState() to recover after a devtools
  // reload mid-bootstrap.
  getBootstrapState: () => import_electron.ipcRenderer.invoke("hermes:bootstrap:get"),
  probeLocalBackend: () => import_electron.ipcRenderer.invoke("hermes:local-backend:probe"),
  continueBootstrapLocal: () => import_electron.ipcRenderer.invoke("hermes:bootstrap:continue-local"),
  recycleBackend: (profile) => import_electron.ipcRenderer.invoke("hermes:backend:recycle", profile),
  resetBootstrap: () => import_electron.ipcRenderer.invoke("hermes:bootstrap:reset"),
  updateHold: {
    recheck: () => import_electron.ipcRenderer.invoke("hermes:update-hold:recheck"),
    quit: () => import_electron.ipcRenderer.invoke("hermes:update-hold:quit"),
    startAnyway: (request) => import_electron.ipcRenderer.invoke("hermes:update-hold:start-anyway", request)
  },
  repairBootstrap: () => import_electron.ipcRenderer.invoke("hermes:bootstrap:repair"),
  cancelBootstrap: () => import_electron.ipcRenderer.invoke("hermes:bootstrap:cancel"),
  onBootstrapEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    import_electron.ipcRenderer.on("hermes:bootstrap:event", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:bootstrap:event", listener);
  },
  getVersion: () => import_electron.ipcRenderer.invoke("hermes:version"),
  relaunchApp: () => import_electron.ipcRenderer.invoke("hermes:app:relaunch"),
  getMachineProfile: () => import_electron.ipcRenderer.invoke("hermes:machine:profile"),
  getRemoteDisplayReason: () => import_electron.ipcRenderer.invoke("hermes:get-remote-display-reason"),
  uninstall: {
    summary: () => import_electron.ipcRenderer.invoke("hermes:uninstall:summary"),
    run: (mode) => import_electron.ipcRenderer.invoke("hermes:uninstall:run", { mode })
  },
  updates: {
    check: (opts) => import_electron.ipcRenderer.invoke("hermes:updates:check", opts),
    apply: (opts) => import_electron.ipcRenderer.invoke("hermes:updates:apply", opts),
    getBranch: () => import_electron.ipcRenderer.invoke("hermes:updates:branch:get"),
    setBranch: (name) => import_electron.ipcRenderer.invoke("hermes:updates:branch:set", name),
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:updates:progress", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:updates:progress", listener);
    },
    takePendingRun: () => import_electron.ipcRenderer.invoke("hermes:updates:metric:take"),
    ackPendingRun: (sent) => import_electron.ipcRenderer.invoke("hermes:updates:metric:ack", sent),
    onPendingRun: (callback) => {
      const listener = () => callback();
      import_electron.ipcRenderer.on("hermes:updates:metric:pending", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:updates:metric:pending", listener);
    }
  },
  desktopMetrics: {
    setEnabled: (on, profile) => import_electron.ipcRenderer.invoke("hermes:desktop-metrics:set-enabled", on, profile),
    takeRendererCrashes: () => import_electron.ipcRenderer.invoke("hermes:desktop-metrics:crash:take"),
    ackRendererCrashes: (sent) => import_electron.ipcRenderer.invoke("hermes:desktop-metrics:crash:ack", sent)
  },
  themes: {
    fetchMarketplace: (id) => import_electron.ipcRenderer.invoke("hermes:vscode-theme:fetch", id),
    searchMarketplace: (query) => import_electron.ipcRenderer.invoke("hermes:vscode-theme:search", query)
  },
  // Find-in-page (Ctrl/Cmd+F): delegates to Electron's
  // webContents.findInPage on the IPC sender's window so a Cmd+F pressed
  // in a secondary session window searches THAT window, not the primary.
  // `onFoundInPage` returns the unsubscribe fn; the renderer wires it via
  // `initFindInPageListener` in store/find-in-page.ts and tears it down
  // when the FindBar unmounts.
  findInPage: (query, options) => import_electron.ipcRenderer.invoke("hermes:find-in-page", query, options),
  stopFindInPage: () => import_electron.ipcRenderer.invoke("hermes:stop-find-in-page"),
  onFoundInPage: (callback) => {
    const listener = (_event, result) => callback(result);
    import_electron.ipcRenderer.on("hermes:found-in-page", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:found-in-page", listener);
  },
  // Main-process `before-input-event` forwards Ctrl/Cmd+F here so renderer
  // can open the FindBar even when the GTK compositor has already grabbed
  // the chord at the windowing layer (#81727).
  onOpenFindBarRequested: (callback) => {
    const listener = () => callback();
    import_electron.ipcRenderer.on("hermes:open-find-bar", listener);
    return () => import_electron.ipcRenderer.removeListener("hermes:open-find-bar", listener);
  },
  // Workspace search runs ripgrep in this process. Code intelligence,
  // debug adapters, and declarative extensions are the backend bridge
  // (electron/ide/IPC.md). Failures resolve as a status; they don't reject.
  search: {
    start: (request) => import_electron.ipcRenderer.invoke("hermes:search:start", request),
    cancel: (id) => import_electron.ipcRenderer.invoke("hermes:search:cancel", id),
    replace: (request) => import_electron.ipcRenderer.invoke("hermes:search:replace", request),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("hermes:search:event", listener);
      return () => import_electron.ipcRenderer.removeListener("hermes:search:event", listener);
    }
  },
  // Same string as `pathToFileUri` in electron/ide/lsp/manager.ts. Sync because
  // Monaco builds the model URI during render; preload cannot import node:path.
  pathToFileUri: (filePath) => {
    const value = import_electron.ipcRenderer.sendSync("hermes:lsp-file-uri", filePath);
    return typeof value === "string" ? value : "";
  },
  lsp: {
    start: (request) => import_electron.ipcRenderer.invoke("lsp:start", request),
    stop: (request) => import_electron.ipcRenderer.invoke("lsp:stop", request),
    didOpen: (request) => import_electron.ipcRenderer.invoke("lsp:didOpen", request),
    didChange: (request) => import_electron.ipcRenderer.invoke("lsp:didChange", request),
    didClose: (request) => import_electron.ipcRenderer.invoke("lsp:didClose", request),
    request: (request) => import_electron.ipcRenderer.invoke("lsp:request", request),
    status: (query) => import_electron.ipcRenderer.invoke("lsp:status", query),
    onDiagnostics: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("lsp:diagnostics", listener);
      return () => import_electron.ipcRenderer.removeListener("lsp:diagnostics", listener);
    }
  },
  dap: {
    start: (request) => import_electron.ipcRenderer.invoke("dap:start", request),
    send: (request) => import_electron.ipcRenderer.invoke("dap:send", request),
    stop: (request) => import_electron.ipcRenderer.invoke("dap:stop", request),
    status: () => import_electron.ipcRenderer.invoke("dap:status"),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      import_electron.ipcRenderer.on("dap:event", listener);
      return () => import_electron.ipcRenderer.removeListener("dap:event", listener);
    }
  },
  ext: {
    search: (query) => import_electron.ipcRenderer.invoke("ext:search", query),
    install: (request) => import_electron.ipcRenderer.invoke("ext:install", request),
    uninstall: (request) => import_electron.ipcRenderer.invoke("ext:uninstall", request),
    list: () => import_electron.ipcRenderer.invoke("ext:list")
  }
});
