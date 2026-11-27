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
  userName: () => ipcRenderer.invoke("app:userName"),
  parakeetAPI: {
    status: () => ipcRenderer.invoke("parakeet:status"),
    installEngine: () => ipcRenderer.invoke("parakeet:installEngine"),
    downloadWeights: () => ipcRenderer.invoke("parakeet:downloadWeights"),
    // Single press: engine install + model download together.
    setup: () => ipcRenderer.invoke("parakeet:setup"),
    ensureServer: () => ipcRenderer.invoke("parakeet:ensureServer"),
    transcribeFile: (filePath) => ipcRenderer.invoke("parakeet:transcribeFile", filePath),
    onStatus: (cb) => {
      const listener = (_e, status) => cb(status);
      ipcRenderer.on("parakeet:status", listener);
      return () => ipcRenderer.removeListener("parakeet:status", listener);
    },
  },
  localLlm: {
    status: () => ipcRenderer.invoke("local-llm:status"),
    download: (id) => ipcRenderer.invoke("local-llm:download", id),
    generate: (request) => ipcRenderer.invoke("local-llm:generate", request),
    onDownloadProgress: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on("local-llm:download-progress", listener);
      return () => ipcRenderer.removeListener("local-llm:download-progress", listener);
    },
    onToken: (cb) => {
      const listener = (_e, data) => cb(data);
      ipcRenderer.on("local-llm:token", listener);
      return () => ipcRenderer.removeListener("local-llm:token", listener);
    },
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
});

contextBridge.exposeInMainWorld("settingsAPI", {
  get: () => ipcRenderer.invoke("settings:get"),
  getPlain: () => ipcRenderer.invoke("settings:getPlain"),
  update: (patch) => ipcRenderer.invoke("settings:update", patch),
  set: (patch) => ipcRenderer.invoke("settings:set", patch),
});
