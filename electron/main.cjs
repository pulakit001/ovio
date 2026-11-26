const { app, BrowserWindow, ipcMain, session, dialog, shell, Menu, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
const { registerSettingsIpc, loadSettings, persistSettings } = require("./settings.cjs");
const parakeet = require("./parakeet.cjs");
const localLlm = require("./local-llm.cjs");
const { startUpdater, stopUpdater } = require("./updater.cjs");
const { registerStoreIpc } = require("./storage.cjs");

let mainWindow;

const IS_WIN = process.platform === "win32";
// Header height in App.jsx — the Windows caption buttons are centred in it.
const HEADER_H = 72;

// Colours for the Windows title-bar overlay, kept in step with the renderer
// palette so the caption buttons sit flush on Ovio's own header.
function windowChrome() {
  const dark = loadSettings().theme === "dark";
  return {
    background: dark ? "#050507" : "#FAFAF8",
    symbol: dark ? "#EDEDED" : "#141414",
  };
}

function applyWindowsTitleBar() {
  if (!IS_WIN || !mainWindow || mainWindow.isDestroyed()) return;
  const chrome = windowChrome();
  try {
    mainWindow.setTitleBarOverlay({ color: chrome.background, symbolColor: chrome.symbol, height: HEADER_H });
  } catch (err) {
    console.warn("[ovio] Could not update title bar overlay:", err.message);
  }
}
const LOGO_PATH = path.join(__dirname, "..", "logo.png");
const DOCK_ICON = path.join(__dirname, "..", "build", "icon", "icon_1024.png");
const DOCK_ICON_DARK = path.join(__dirname, "..", "build", "icon", "icon_dark_1024.png");

// NOTE: the separate splash window is gone by design. The app window itself
// shows a cinematic in-app entrance animation (see src/App.jsx) the moment
// its content is ready — one window, no flash, no double-draw.

function createWindow() {
  const chrome = windowChrome();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    // macOS gets the inset traffic lights; Windows hides the native title bar
    // and overlays its caption buttons on the app header (macOS-style chrome
    // with working snap layouts); Linux keeps its native frame.
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    ...(IS_WIN
      ? {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: chrome.background,
            symbolColor: chrome.symbol,
            height: HEADER_H,
          },
        }
      : {}),
    backgroundColor: chrome.background,
    show: false,
    // Belt-and-braces against the default Electron menu: on Windows/Linux a
    // menu bar would add a whole "File Edit View Window Help" row above the
    // app's own header. macOS keeps its app menu for standard shortcuts.
    autoHideMenuBar: true,
    icon: LOGO_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Recorder app: keep timers, rAF and CSS animations running at full
      // speed even when the window is hidden or minimized — otherwise the
      // live elapsed counter, bars and the Settings exit animation stall
      // (Chromium throttles them to ~1s in hidden windows), which made the
      // "Done" button feel like it stopped working.
      backgroundThrottling: false,
    },
  });

  // Explicitly strip the menu from THIS window too (Menu.setApplicationMenu
  // only applies to windows that ask for the app menu) so no platform or
  // future default can bring the bar back, not even on Alt.
  if (process.platform !== "darwin") {
    mainWindow.setMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }

  // When the main window is ready, show it — the in-app entrance animation
  // (App.jsx EntranceVeil) takes it from there.
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isDev || new URL(url).origin !== "http://localhost:5173") event.preventDefault();
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// One Ovio at a time — a second launch focuses the existing window instead
// of running alongside (which used to fork your library into two stores).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = mainWindow || (BrowserWindow.getAllWindows()[0] ?? null);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

app.whenReady().then(() => {
  startUpdater({
    onUpdateAvailable: (info) => broadcastToMain("updater:update", info),
    onRemoteMessage: (msg) => broadcastToMain("updater:message", msg),
  });
  registerSettingsIpc({ onChange: applyWindowsTitleBar });
  registerStoreIpc(); // durable disk-backed library (replaces localStorage)

  // The default Electron menu (File/Edit/View/Window/Help) has no place in a
  // single-purpose app: it added a whole extra toolbar row on Windows and
  // Linux. macOS keeps its app menu for standard shortcuts.
  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  // Dock icon follows the system appearance: the light tile in light mode,
  // the near-black tile with white capsules in dark mode. nativeTheme fires
  // `updated` when the user switches, so the Dock changes with the system
  // instead of keeping whichever icon happened to load at launch.
  const applyDockIcon = () => {
    if (process.platform !== "darwin" || !app.dock) return;
    const wanted = nativeTheme.shouldUseDarkColors && fs.existsSync(DOCK_ICON_DARK)
      ? DOCK_ICON_DARK
      : (fs.existsSync(DOCK_ICON) ? DOCK_ICON : LOGO_PATH);
    try {
      app.dock.setIcon(wanted);
    } catch (err) {
      console.warn("[ovio] Could not set dock icon:", err.message);
    }
  };
  applyDockIcon();
  nativeTheme.on("updated", applyDockIcon);

  const allowedPermissions = new Set(["media", "microphone", "notifications"]);
  const isMainRenderer = (webContents) => webContents === mainWindow?.webContents;
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(isMainRenderer(webContents) && allowedPermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => isMainRenderer(webContents) && allowedPermissions.has(permission)
  );

  // ----- Parakeet (local streaming STT sidecar) -----
  parakeet.setNotify((event, st) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("parakeet:status", st);
    }
    // Decision: once Parakeet is fully installed (engine + weights ready and
    // the sidecar can serve), it becomes the default local STT model — once.
    // A one-time flag keeps us from overriding a model the user picked later.
    if (["server-ready", "engine-ready", "weights-downloaded"].includes(event)) {
      try {
        const s = loadSettings();
        if (
          !s.parakeetDefaulted &&
          s.localSttModel !== "parakeet" &&
          st?.weights?.downloaded &&
          st?.engine?.state === "ready"
        ) {
          persistSettings({ ...s, localSttModel: "parakeet", parakeetDefaulted: true });
          console.log("[ovio] Parakeet installed — set as the default local STT model");
        }
      } catch {}
    }
    // Warm the sidecar the moment engine + weights are both in place. Loading
    // the 0.6B model takes ~a minute, and a recording started before the socket
    // exists is the difference between text and silence.
    if (
      ["engine-ready", "weights-downloaded"].includes(event) &&
      st?.engine?.state === "ready" &&
      st?.weights?.downloaded &&
      !st?.server?.running
    ) {
      parakeet.ensureServer().catch(() => {});
    }
  });

  ipcMain.handle("parakeet:status", () => parakeet.status());
  ipcMain.handle("parakeet:installEngine", () => parakeet.installEngine());
  ipcMain.handle("parakeet:downloadWeights", () => parakeet.downloadWeights());
  ipcMain.handle("parakeet:ensureServer", () => parakeet.ensureServer());
  ipcMain.handle("parakeet:transcribeFile", (_event, filePath) => parakeet.transcribeFile(filePath));

  // ----- In-app local AI notes -----
  ipcMain.handle("local-llm:status", () => localLlm.status());
  ipcMain.handle("local-llm:download", async (event, id) => {
    const sender = event.sender;
    return localLlm.downloadModel(id, (progress) => {
      if (!sender.isDestroyed()) sender.send("local-llm:download-progress", progress);
    });
  });
  ipcMain.handle("local-llm:generate", async (event, request) => {
    const sender = event.sender;
    return localLlm.generate({ ...request, onToken: (text) => {
      if (!sender.isDestroyed()) sender.send("local-llm:token", { text });
    } });
  });

  createWindow();
  // ---------------- Vault: per-folder file attachments ----------------
  // Files the user attaches to a subfolder are copied into the app's userData
  // directory (files/<folderId>/<id>-<name>) so they survive the original
  // moving/deleting. The renderer keeps only metadata; binaries never enter
  // localStorage.
  const filesRoot = path.join(app.getPath("userData"), "files");
  try { fs.mkdirSync(filesRoot, { recursive: true }); } catch {}
  const resolveVaultPath = (relPath) => {
    const resolved = path.resolve(filesRoot, String(relPath || ""));
    const relative = path.relative(filesRoot, resolved);
    if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    return resolved;
  };
  const ATTACH_EXTS = new Set([
    "png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg", "tiff",
    "pdf", "txt", "md", "csv", "json", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip",
  ]);
  ipcMain.handle("vault:pick", async (_event, folderId) => {
    try {
      const safe = String(folderId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
      if (!safe) return { ok: false, error: "bad folder id" };
      const res = await dialog.showOpenDialog(mainWindow, {
        title: "Add files",
        properties: ["openFile", "multiSelections"],
        filters: [
          { name: "Supported files", extensions: [...ATTACH_EXTS] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (res.canceled || !res.filePaths?.length) return { ok: true, added: [] };
      const dir = path.join(filesRoot, safe);
      fs.mkdirSync(dir, { recursive: true });
      const added = [];
      for (const src of res.filePaths) {
        try {
          const ext = path.extname(src).slice(1).toLowerCase();
          if (ext === "mp4" || ext === "mov" || ext === "avi" || ext === "mkv" || ext === "webm") continue; // no videos
          if (ext && !ATTACH_EXTS.has(ext)) continue;
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          const safeName = path.basename(src).replace(/[/\\:*?"<>|]/g, "_").slice(0, 120);
          const dest = path.join(dir, `${id}-${safeName}`);
          fs.copyFileSync(src, dest);
          const st = fs.statSync(dest);
          added.push({
            id, name: safeName, ext,
            size: st.size,
            addedAt: Date.now(),
            relPath: `${safe}/${id}-${safeName}`,
          });
        } catch (e) {
          console.warn("[ovio] vault copy failed:", e.message);
        }
      }
      return { ok: true, added };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle("vault:open", async (_event, relPath) => {
    try {
      const p = resolveVaultPath(relPath);
      if (!p) return { ok: false, error: "bad path" };
      await shell.openPath(p);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("vault:read", async (_event, relPath) => {
    try {
      const p = resolveVaultPath(relPath);
      if (!p) return { ok: false, error: "bad path" };
      const data = fs.readFileSync(p);
      const ext = path.extname(p).slice(1).toLowerCase();
      const mime = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
        webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
        pdf: "application/pdf", txt: "text/plain", md: "text/plain", csv: "text/csv",
      }[ext] || "application/octet-stream";
      return { ok: true, mime, data: data.toString("base64") };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("vault:remove", (_event, relPath) => {
    try {
      const p = resolveVaultPath(relPath);
      if (!p) return { ok: false, error: "bad path" };
      fs.rmSync(p, { force: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  }));
  ipcMain.handle("app:userName", () => new Promise((resolve) => {
    const fallback = () => {
      try { return require("os").userInfo().username || ""; } catch { return ""; }
    };
    if (process.platform !== "darwin") return resolve(fallback());
    require("child_process").execFile("id", ["-F"], { timeout: 1500 }, (err, stdout) => {
      const full = !err && String(stdout || "").trim();
      resolve(full || fallback());
    });
  }));
  ipcMain.handle("update:openPage", (_e, url) => {
    if (typeof url === "string" && /^https:\/\/(github\.com|githubusercontent\.com)\//.test(url)) {
      shell.openExternal(url);
    }
  });
  // Pre-warm the sidecar if Parakeet is the selected (or defaulted) model.
  if (loadSettings().localSttModel === "parakeet") {
    parakeet
      .ensureServer()
      .then(({ port, device }) => console.log(`[ovio] Parakeet sidecar ready on :${port} (${device})`))
      .catch((err) => console.warn("[ovio] Parakeet sidecar not started:", err.message));
  }
});

app.on("before-quit", () => {
  stopUpdater();
  localLlm.dispose();
  parakeet.stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
