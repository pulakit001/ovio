const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  // Durable library storage — atomic JSON files in userData/library/.
  // The renderer's localStorage is a cache; the disk store is the truth.
  store: {
    read: (key) => ipcRenderer.invoke("store:read", key),
    write: (key, value) => ipcRenderer.invoke("store:write", key, value),
    importOnce: (key, value) => ipcRenderer.invoke("store:import", key, value),
    remove: (key) => ipcRenderer.invoke("store:remove", key),
  },
  // Version/build info for Settings → About.
  appInfo: () => ipcRenderer.invoke("app:info"),
  transcribePcm: (chunk, model) => ipcRenderer.invoke("whisper:transcribe", chunk, model),
  whisperStatus: () => ipcRenderer.invoke("whisper:status"),
  modelsStatus: () => ipcRenderer.invoke("whisper:modelsStatus"),
  downloadModel: (id) => ipcRenderer.invoke("whisper:downloadModel", id),
  onDownloadProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("whisper:download-progress", listener);
    return () => ipcRenderer.removeListener("whisper:download-progress", listener);
  },
  parakeetAPI: {
    status: () => ipcRenderer.invoke("parakeet:status"),
    installEngine: () => ipcRenderer.invoke("parakeet:installEngine"),
    downloadWeights: () => ipcRenderer.invoke("parakeet:downloadWeights"),
    ensureServer: () => ipcRenderer.invoke("parakeet:ensureServer"),
    transcribeFile: (filePath) => ipcRenderer.invoke("parakeet:transcribeFile", filePath),
    onStatus: (cb) => {
      const listener = (_e, status) => cb(status);
      ipcRenderer.on("parakeet:status", listener);
      return () => ipcRenderer.removeListener("parakeet:status", listener);
    },
  },
  ollamaAPI: {
    tags: (url) => ipcRenderer.invoke("ollama:tags", url),
    pull: (url, model) => ipcRenderer.invoke("ollama:pull", url, model),
    onPullProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on("ollama:pull-progress", listener);
      return () => ipcRenderer.removeListener("ollama:pull-progress", listener);
    },
  },
  // Ambient recording popup (floating panel spawned by the global shortcut):
  // the main renderer receives commands and reports live status.
  ambient: {
    status: (status) => ipcRenderer.send("ambient:status", status),
    // Tell the main process this page can receive ambient commands; any
    // shortcut press that fired during startup is replayed in response.
    ready: () => ipcRenderer.send("ambient:ready"),
    onCommand: (cb) => {
      const listener = (_e, cmd) => cb(cmd);
      ipcRenderer.on("ambient:command", listener);
      return () => ipcRenderer.removeListener("ambient:command", listener);
    },
    // Which chords are actually registered (may differ from the default hint).
    onShortcut: (cb) => {
      const listener = (_e, info) => cb(info);
      ipcRenderer.on("ambient:shortcut", listener);
      return () => ipcRenderer.removeListener("ambient:shortcut", listener);
    },
  },
  // Settings-tab control surface for the global shortcut: enable/disable,
  // customize the chords, query live registration info, or start recording
  // programmatically (welcome-screen CTA).
  ambientAPI: {
    configure: (config) => ipcRenderer.invoke("ambient:configure", config),
    getInfo: () => ipcRenderer.invoke("ambient:getInfo"),
    trigger: () => ipcRenderer.send("ambient:trigger"),
  },
  // Vault: per-folder file attachments ("Add Files"). Pick copies files into
  // the app's userData and returns metadata; open/read/remove act on the
  // stored copy by relative path.
  vaultAPI: {
    pick: (folderId) => ipcRenderer.invoke("vault:pick", folderId),
    open: (relPath) => ipcRenderer.invoke("vault:open", relPath),
    read: (relPath) => ipcRenderer.invoke("vault:read", relPath),
    remove: (relPath) => ipcRenderer.invoke("vault:remove", relPath),
  },
  // Updater: the app checks GitHub releases + a remote message feed on its
  // own; the renderer just listens and shows the popup when told.
  updater: {
    onUpdateAvailable: (cb) => {
      const listener = (_e, info) => cb(info);
      ipcRenderer.on("updater:update", listener);
      return () => ipcRenderer.removeListener("updater:update", listener);
    },
    onRemoteMessage: (cb) => {
      const listener = (_e, msg) => cb(msg);
      ipcRenderer.on("updater:message", listener);
      return () => ipcRenderer.removeListener("updater:message", listener);
    },
    openPage: (url) => ipcRenderer.send("update:openPage", url),
  },
  // Control surface exposed to the floating panel window itself.
  ambientPanel: {
    send: (cmd) => ipcRenderer.send("ambient:panel", cmd),
    onState: (cb) => {
      const listener = (_e, state) => cb(state);
      ipcRenderer.on("ambient:state", listener);
      return () => ipcRenderer.removeListener("ambient:state", listener);
    },
    // Main process cursor-watch → hover state (drives expand/collapse).
    onHover: (cb) => {
      const listener = (_e, h) => cb(h);
      ipcRenderer.on("ambient:panel-hover", listener);
      return () => ipcRenderer.removeListener("ambient:panel-hover", listener);
    },
  },
});

contextBridge.exposeInMainWorld("settingsAPI", {
  get: () => ipcRenderer.invoke("settings:get"),
  getPlain: () => ipcRenderer.invoke("settings:getPlain"),
  update: (patch) => ipcRenderer.invoke("settings:update", patch),
  set: (patch) => ipcRenderer.invoke("settings:set", patch),
});
