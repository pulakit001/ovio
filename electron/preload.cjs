const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  transcribePcm: (chunk, model) => ipcRenderer.invoke("whisper:transcribe", chunk, model),
  whisperStatus: () => ipcRenderer.invoke("whisper:status"),
  modelsStatus: () => ipcRenderer.invoke("whisper:modelsStatus"),
  downloadModel: (id) => ipcRenderer.invoke("whisper:downloadModel", id),
  onDownloadProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("whisper:download-progress", listener);
    return () => ipcRenderer.removeListener("whisper:download-progress", listener);
  },
});

contextBridge.exposeInMainWorld("settingsAPI", {
  get: () => ipcRenderer.invoke("settings:get"),
  getPlain: () => ipcRenderer.invoke("settings:getPlain"),
  update: (patch) => ipcRenderer.invoke("settings:update", patch),
  set: (patch) => ipcRenderer.invoke("settings:set", patch),
});
