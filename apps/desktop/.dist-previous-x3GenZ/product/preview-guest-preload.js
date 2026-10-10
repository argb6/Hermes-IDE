"use strict";

// electron/preview-guest-preload.ts
var GUEST_EXTERNAL_CHANNEL = "preview-open-external";
function installGuestExternalHandoff(host) {
  host.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted !== true || (event.button ?? 0) !== 0) {
        return;
      }
      const target = event.target;
      if (!target || typeof target.closest !== "function") {
        return;
      }
      const anchor = target.closest('a[target="_blank"]');
      if (!anchor || typeof anchor.href !== "string" || anchor.href === "") {
        return;
      }
      host.sendToHost(GUEST_EXTERNAL_CHANNEL, anchor.href);
    },
    true
  );
}

// electron/preview-guest-preload-entry.ts
var electron = require("electron");
installGuestExternalHandoff({
  addEventListener: (type, listener, capture) => document.addEventListener(type, listener, capture),
  sendToHost: (channel, ...args) => electron.ipcRenderer.sendToHost(channel, ...args)
});
