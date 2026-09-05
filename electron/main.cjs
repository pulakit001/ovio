const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const {
  initWhisper, transcribePcm, destroyWhisper, isInitialized,
  modelStatus, downloadModel, LOCAL_MODELS,
} = require("./whisper.cjs");
const { registerSettingsIpc, loadSettings } = require("./settings.cjs");

let mainWindow;
let splashWindow;

const LOGO_PATH = path.join(__dirname, "..", "logo.png");
const DOCK_ICON = path.join(__dirname, "..", "build", "icon", "icon_1024.png");

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 380,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    center: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    icon: LOGO_PATH,
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));

  // Keep splash on top of main window
  splashWindow.setAlwaysOnTop(true, "screen-saver");
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.destroy();
  }
  splashWindow = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#F6F3EC",
    show: false,
    icon: LOGO_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // When the main window is ready, close the splash and show the app
  mainWindow.once("ready-to-show", () => {
    setTimeout(() => {
      mainWindow.show();
      mainWindow.focus();
      closeSplash();
    }, 900);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("console-message", (_e, level, message, line, source) => {
    console.log(`[renderer:${level}] ${message} (${source}:${line})`);
  });
  mainWindow.webContents.on("did-fail-load", (_e, code, desc) => {
    console.log(`[did-fail-load] ${code} ${desc}`);
  });
  mainWindow.webContents.on("preload-error", (_e, p, err) => {
    console.log(`[preload-error] ${p} ${err}`);
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  registerSettingsIpc();

  if (process.platform === "darwin" && app.dock) {
    try {
      const dockIcon = require("fs").existsSync(DOCK_ICON) ? DOCK_ICON : LOGO_PATH;
      app.dock.setIcon(dockIcon);
    } catch (err) {
      console.warn("[ovio] Could not set dock icon:", err.message);
    }
  }

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allow = ["media", "microphone", "notifications"].includes(permission);
      callback(allow);
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => true
  );

  try {
    // Pre-load the user's preferred local model (falls back silently if absent).
    initWhisper(loadSettings().localSttModel);
    console.log("[ovio] Whisper engine ready");
  } catch (err) {
    console.error("[ovio] Whisper init failed:", err.message);
  }

  ipcMain.handle("whisper:transcribe", async (_event, chunk, model) => {
    const pcm = Float32Array.from(chunk);
    return await transcribePcm(pcm, model);
  });

  ipcMain.handle("whisper:modelsStatus", () => modelStatus());

  ipcMain.handle("whisper:downloadModel", async (_event, id) => {
    if (!LOCAL_MODELS[id]) throw new Error(`Unknown model: ${id}`);
    return downloadModel(id, (progress, received, total) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("whisper:download-progress", { id, progress, received, total });
      }
    });
  });

  ipcMain.handle("whisper:status", () => ({
    initialized: isInitialized(),
  }));

  createSplash();
  createWindow();
});

app.on("before-quit", () => {
  destroyWhisper();
  closeSplash();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});