const { app, BrowserWindow, ipcMain, session, globalShortcut, screen, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  initWhisper, transcribePcm, destroyWhisper, isInitialized,
  modelStatus, downloadModel, LOCAL_MODELS,
} = require("./whisper.cjs");
const { registerSettingsIpc, loadSettings, persistSettings, AMBIENT_DEFAULT_CHORDS } = require("./settings.cjs");
const parakeet = require("./parakeet.cjs");
const { startUpdater, stopUpdater } = require("./updater.cjs");

let mainWindow;
let panelWindow;
// Panel window size — the card FILLS the window (see panel.html): one small
// horizontal bar, no expand/collapse. Because the window hugs the card, the
// cursor watch's bounds == the visible UI, so interactivity never overlaps
// the desktop behind it.
const PANEL_W = 320;
const PANEL_H = 46;
// Tracks intent: springPanelIn completes asynchronously (ready-to-show), so
// timers must know whether a show is still wanted — and must ignore a spring
// that a newer press already replaced.
let panelWantsVisible = false;
// Cursor watch: while visible, the main process decides when the bar is
// interactive. macOS has no mouse-event forwarding for click-through windows
// (setIgnoreMouseEvents forward:true is Windows-only), so polling the cursor
// against the window bounds (fast, 16ms) is the only reliable way to get
// "clicks pass through the empty canvas" AND "clicks land on the bar".
let panelMouseTimer = null;
// The user is typing in the bar's title field: the window must stay
// interactive (never flip click-through) until they're done editing.
let panelEditing = false;
// Cached interactive state so the poll only calls setIgnoreMouseEvents on
// change instead of every tick.
let panelInteractive = false;
// Global-shortcut state: every chord we successfully own, a retry timer for
// when the OS refuses them all at startup, and the handoff to the renderer.
const ambientShortcuts = new Set();
let shortcutRetryTimer = null;
let lastShortcutAnnouncement = { keys: [], label: "" };
let rendererReady = false;        // main renderer announced it can receive commands
let pendingAmbientCommand = null; // shortcut fired before the renderer was ready
const LOGO_PATH = path.join(__dirname, "..", "logo.png");
const DOCK_ICON = path.join(__dirname, "..", "build", "icon", "icon_1024.png");

// NOTE: the separate splash window is gone by design. The app window itself
// shows a cinematic in-app entrance animation (see src/App.jsx) the moment
// its content is ready — one window, no flash, no double-draw.

// ---------------- Ambient recording popup ----------------
// A tiny frameless, transparent, always-on-top pill that springs in from the
// right edge of the screen when the user presses the global shortcut. It has
// no title bar and is draggable by its pill body; the app itself does all the
// real work (record → transcript → General Folder) in the main renderer.
//
// The window is PRE-WARMED at boot and kept alive: showing a transparent
// BrowserWindow before its first paint renders as a solid BLACK rectangle on
// macOS — the "black screen" seen when pressing the shortcut. We now wait for
// ready-to-show before ever making it visible.

function createPanelWindow() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;
  panelWindow = new BrowserWindow({
    width: PANEL_W,
    height: PANEL_H,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false, // CSS shadow instead — native shadow on transparent windows glitches black
    roundedCorners: false,
    show: false,
    backgroundColor: "#00000000",
    icon: LOGO_PATH,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  panelWindow.loadFile(path.join(__dirname, "panel.html"));
  // macOS: appear over EVERY space — including fullscreen windows of other
  // apps. Without visibleOnFullScreen the pill silently fails to show whenever
  // another app owns a fullscreen space (the classic "works half the time,
  // dead outside the app" bug).
  panelWindow.setFullScreenable(false);
  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // The panel is created lazily (often long after registration), so push the
  // currently registered chord(s) into it as soon as it can listen.
  panelWindow.webContents.on("did-finish-load", () => {
    if (lastShortcutAnnouncement.label) sendToPanel("ambient:shortcut", lastShortcutAnnouncement);
  });
  panelWindow.on("closed", () => { panelWindow = null; });
  // Start click-through; the cursor watch flips it off when the user aims at
  // the pill itself.
  panelWindow.setIgnoreMouseEvents(true);
  return panelWindow;
}

// Poll the cursor against the bar's bounds (~60fps, only while visible).
// Inside → interactive; outside → click-through. While the title field is
// being edited the window is pinned interactive, so a rename can never be
// swallowed or interrupted by the click-through flip.
function startPanelMouseWatch() {
  if (panelMouseTimer) return;
  panelMouseTimer = setInterval(() => {
    if (!panelWindow || panelWindow.isDestroyed() || !panelWindow.isVisible()) return;
    if (panelEditing) {
      if (!panelInteractive) {
        panelWindow.setIgnoreMouseEvents(false);
        panelInteractive = true;
      }
      return;
    }
    const p = screen.getCursorScreenPoint();
    const b = panelWindow.getBounds();
    const inside = p.x >= b.x && p.x <= b.x + b.width &&
                   p.y >= b.y && p.y <= b.y + b.height;
    if (inside !== panelInteractive) {
      panelWindow.setIgnoreMouseEvents(!inside);
      panelInteractive = inside;
    }
  }, 16);
}
function stopPanelMouseWatch() {
  if (panelMouseTimer) { clearInterval(panelMouseTimer); panelMouseTimer = null; }
  panelEditing = false;
  panelInteractive = false;
}

// Show the pill. RECREATE the window every time: macOS strands a previously-
// shown panel on its old space ("worked once, then the popup never comes
// back"), and no combination of setVisibleOnAllWorkspaces/show dances fixes
// it reliably. A FRESH window always lands on the current space. The local
// file loads in ~50ms — imperceptible — and a fresh card also means zero
// stale CSS state. The ready-to-show wait prevents any black first paint.
function springPanelIn() {
  panelWantsVisible = true;
  panelEditing = false; // a fresh window starts with no focused field
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.destroy();
  panelWindow = null;
  const win = createPanelWindow();
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    // Only act if this spring is still the live one: a later press may have
    // already recreated the window, and this callback must never touch the
    // stale `win` (showing a destroyed/orphaned window = "popup never comes").
    if (!panelWantsVisible || panelWindow !== win || win.isDestroyed()) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const x = wa.x + wa.width - PANEL_W - 8;
    const y = wa.y + wa.height - PANEL_H - 16; // just above the work-area edge
    win.setBounds({ x, y, width: PANEL_W, height: PANEL_H }, false);
    win.showInactive();
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true); // start pass-through; the watch enables clicks
    panelInteractive = false;
    startPanelMouseWatch();
    console.log("[ovio] panel shown at", x, y);
  };
  win.once("ready-to-show", once);
  // Absolute fallback — never leave a press unanswered.
  setTimeout(() => { if (panelWantsVisible) once(); }, 1200);
}

function hidePanel() {
  panelWantsVisible = false;
  stopPanelMouseWatch();
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.hide();
  }
}

// The shortcut no longer toggles. Every press = a fresh popup + a brand-new
// recording; the popup is dismissed only by Done / Cancel / Escape ("close").
// The old show/hide toggle is exactly what made every second press feel dead.

function broadcastToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Route an ambient command to the main renderer. Before the page has loaded
// (splash still up / slow first paint) the command is parked and replayed as
// soon as the renderer announces readiness — otherwise a shortcut pressed
// during startup was silently dropped.
function dispatchAmbientCommand(cmd) {
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    broadcastToMain("ambient:command", cmd);
  } else {
    pendingAmbientCommand = { cmd, at: Date.now() };
  }
}

// Tell both windows (main renderer + floating panel) which chords are actually
// registered, so the UI never shows a hint for a key that doesn't fire.
function announceShortcutKeys() {
  const keys = [...ambientShortcuts];
  if (keys.length === 0) {
    // Feature disabled (or nothing registered): clear the announcement so UI
    // hint text falls back to "the shortcut" instead of stale chords.
    lastShortcutAnnouncement = { keys: [], label: "", shortLabel: "" };
    broadcastToMain("ambient:shortcut", lastShortcutAnnouncement);
    sendToPanel("ambient:shortcut", lastShortcutAnnouncement);
    return;
  }
  lastShortcutAnnouncement = {
    keys,
    label: humanizeChords(keys),
    // The floating pill has room for ~2 chords; the recorder tooltip gets all.
    shortLabel: humanizeChords(keys.slice(0, 2)),
  };
  broadcastToMain("ambient:shortcut", lastShortcutAnnouncement);
  sendToPanel("ambient:shortcut", lastShortcutAnnouncement);
}

// "CommandOrControl+Shift+Space" → "⌘⇧Space" (macOS) or "Ctrl+Shift+Space".
function humanizeChords(keys) {
  const isMac = process.platform === "darwin";
  const pretty = keys.map((k) =>
    k
      .replace("CommandOrControl", isMac ? "⌘" : "Ctrl")
      .replace("Alt", isMac ? "⌥" : "Alt")
      .replace("Shift", isMac ? "⇧" : "Shift")
  );
  return pretty.join(" or ");
}

function sendToPanel(channel, payload) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send(channel, payload);
  }
}

function destroyPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.destroy();
  panelWindow = null;
}

function createWindow() {
  rendererReady = false; // the fresh page must announce itself before commands flow
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: loadSettings().theme === "light" ? "#F7F5F0" : "#050507",
    show: false,
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
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  startUpdater({
    onUpdateAvailable: (info) => broadcastToMain("updater:update", info),
    onRemoteMessage: (msg) => broadcastToMain("updater:message", msg),
  });
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
  });

  ipcMain.handle("parakeet:status", () => parakeet.status());
  ipcMain.handle("parakeet:installEngine", () => parakeet.installEngine());
  ipcMain.handle("parakeet:downloadWeights", () => parakeet.downloadWeights());
  ipcMain.handle("parakeet:ensureServer", () => parakeet.ensureServer());
  ipcMain.handle("parakeet:transcribeFile", (_event, filePath) => parakeet.transcribeFile(filePath));

  // ----- Ollama (local AI notes) -----
  // Tags + pull are routed through the main process so they work regardless of
  // the renderer's origin (http://localhost:5173 in dev, file:// when packaged)
  // and so the streamed pull progress can be piped as IPC events.
  const normalizeOllamaUrl = (u) => (String(u || "").trim() || "http://localhost:11434").replace(/\/+$/, "");
  const activeOllamaPulls = new Set();

  ipcMain.handle("ollama:tags", async (_event, url) => {
    const base = normalizeOllamaUrl(url);
    try {
      const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return { ok: false, url: base, error: `Ollama responded with HTTP ${res.status}` };
      const data = await res.json();
      const models = (data.models || []).map((m) => ({ id: m.name, name: m.name, size: m.size }));
      return { ok: true, url: base, models };
    } catch (err) {
      const aborted = err?.name === "TimeoutError" || err?.name === "AbortError";
      return {
        ok: false, url: base,
        error: aborted ? "Ollama did not respond in time — is it running?" : "Ollama not reachable — start it with `ollama serve`",
      };
    }
  });

  ipcMain.handle("ollama:pull", async (event, url, model) => {
    if (!model) return { ok: false, error: "No model specified" };
    if (activeOllamaPulls.has(model)) return { ok: true, already: true };
    const base = normalizeOllamaUrl(url);
    const sender = event.sender;
    activeOllamaPulls.add(model);
    try {
      const res = await fetch(`${base}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: true }),
      });
      if (!res.ok || !res.body) throw new Error(`Ollama responded with HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastSent = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let j;
          try { j = JSON.parse(line); } catch { continue; }
          if (j.error) throw new Error(j.error);
          const total = j.total || 0;
          const completed = j.completed || 0;
          const percent = total > 0 ? completed / total : j.status === "success" ? 1 : 0;
          const finished = j.status === "success";
          // Throttle progress events to ~8/s to keep the renderer snappy.
          const now = Date.now();
          if (finished || now - lastSent > 120) {
            lastSent = now;
            if (!sender.isDestroyed()) {
              sender.send("ollama:pull-progress", { model, status: j.status, percent, done: finished });
            }
          }
          if (finished) {
            activeOllamaPulls.delete(model);
            return { ok: true };
          }
        }
      }
      activeOllamaPulls.delete(model);
      return { ok: true };
    } catch (err) {
      activeOllamaPulls.delete(model);
      try {
        if (!sender.isDestroyed()) {
          sender.send("ollama:pull-progress", { model, error: err.message, percent: 0, done: false });
        }
      } catch {}
      return { ok: false, error: err.message };
    }
  });

  createWindow();
  createPanelWindow(); // pre-warm the ambient pill — no black first paint, instant popup

  // Global shortcut → floating ambient recorder, working from ANY app.
  // Chords come from settings (ambient: { enabled, chords }) so the Settings
  // toggle and customizer re-bind the hotkeys live. Registration stays sticky:
  // a working chord is never swapped away mid-session.
  const SAFETY_CHORD = "CommandOrControl+Shift+U";
  // Fires-per-chord diagnostics: acc → timestamp of last activation.
  const firedAt = new Map();
  // Both historical user chords + the safety chord: more chances one survives
  // whatever else is running (Wispr Flow etc.). applyAmbientConfig de-dupes.
  const userChords = loadSettings().ambient?.chords || [];
  const shortcutCandidates = [...new Set([...userChords, "CommandOrControl+Alt+Shift+Space", "Alt+Shift+Space", SAFETY_CHORD])];
  // Debounce accidental OS double-fires (key repeat / aliased chords firing
  // together): two presses within 350ms count as ONE gesture. A real second
  // press still gets a FRESH popup + a BRAND-NEW recording.
  let lastAmbientPressAt = 0;
  const onAmbientShortcut = (acc) => {
    const now = Date.now();
    firedAt.set(acc, now);
    if (now - lastAmbientPressAt < 350) return;
    lastAmbientPressAt = now;
    console.log(`[ovio] ambient shortcut fired [${acc}] → fresh popup + new recording`);
    springPanelIn();
    dispatchAmbientCommand("record");
  };

  // (Re)bind ambient chords from a config { enabled, chords }.
  // rebind=true (Settings changed) drops the old chords first; the safety
  // chord always survives so recording can never be locked out. enabled=false
  // removes everything — the feature is off, nothing may fire.
  const applyAmbientConfig = (config, { rebind = false } = {}) => {
    const enabled = config?.enabled !== false;
    if (rebind) {
      for (const acc of [...ambientShortcuts]) {
        try { globalShortcut.unregister(acc); } catch {}
      }
      ambientShortcuts.clear();
      if (!enabled) {
        console.log("[ovio] Ambient shortcut disabled");
        announceShortcutKeys();
        return { ok: true, registered: [], missing: [] };
      }
    }
    const added = [];
    const missing = [];
    for (const acc of [...(config?.chords || []), SAFETY_CHORD]) {
      if (ambientShortcuts.has(acc)) continue;
      try {
        if (globalShortcut.register(acc, () => onAmbientShortcut(acc))) {
          ambientShortcuts.add(acc);
          added.push(acc);
        } else {
          missing.push(acc);
        }
      } catch {
        missing.push(acc); // owned by another app
      }
    }
    if (added.length) console.log(`[ovio] Ambient shortcut registered: ${added.join(", ")}`);
    if (missing.length) console.warn(`[ovio] Ambient chords taken by other apps: ${missing.join(", ")}`);
    // Known chord-eaters: apps running a CGEventTap (Wispr Flow, Superwhisper,
    // etc.) can swallow a chord BEFORE our Carbon-level hotkey ever fires —
    // register() succeeds but the callback never runs. Name the suspect so
    // "registered but dead" is diagnosable from the log alone.
    try {
      const { execSync } = require("child_process");
      const ps = execSync("ps -axo comm= 2>/dev/null", { timeout: 1500 }).toString();
      for (const app of ["Wispr Flow", "Superwhisper", "MacWhisper", "Audionotes"]) {
        if (ps.includes(app)) {
          console.warn(`[ovio] ⚠️ "${app}" is running — its event tap may swallow global shortcuts. If presses do nothing, quit it or pick a different chord in Settings.`);
        }
      }
    } catch {}
    announceShortcutKeys();
    return { ok: ambientShortcuts.size > 0, registered: [...ambientShortcuts], missing };
  };
  const registerAmbientShortcuts = () => {
    const s = loadSettings().ambient || {};
    // Runtime registration uses the WIDENED candidate list (every saved chord
    // variant + historical variants + safety). The saved file is untouched —
    // this only maximizes the chance one hotkey survives whatever else is
    // running. applyAmbientConfig de-dupes.
    return applyAmbientConfig({ enabled: s.enabled !== false, chords: shortcutCandidates });
  };
  registerAmbientShortcuts();
  // macOS: Electron's global shortcuts can be silently stolen back after the
  // app loses focus (other apps claim the chord while we're in background) —
  // the "works inside the app, dead everywhere else" report. Re-grab on every
  // focus gain; re-registering an owned chord is a no-op.
  app.on("browser-window-focus", () => {
    if (ambientShortcuts.size === 0) registerAmbientShortcuts();
  });
  if (ambientShortcuts.size === 0 && !shortcutRetryTimer) {
    // Every chord was taken at startup (e.g. a foreground app claimed one
    // before us). Keep trying quietly instead of giving up forever.
    console.warn("[ovio] No ambient shortcut yet — retrying every 15s");
    shortcutRetryTimer = setInterval(() => {
      registerAmbientShortcuts();
      if (ambientShortcuts.size > 0) {
        clearInterval(shortcutRetryTimer);
        shortcutRetryTimer = null;
      }
    }, 15000);
  }

  // ----- Ambient shortcut control (Settings tab) -----
  // Validate accelerators conservatively but correctly: one or more modifiers
  // plus a key token (letter, digit, Space, punctuation). The previous regex
  // rejected EVERY valid chord (broken `(\+.)+\+?` group), silently killing
  // presets and custom capture — the root cause of "choosing the shortcut
  // does not work at all".
  const CHORD_RE = /^(CommandOrControl|Command|Control|CmdOrCtrl|Alt|AltGr|Option|Shift|Super)(\+(CommandOrControl|Command|Control|CmdOrCtrl|Alt|AltGr|Option|Shift|Super))*\+\S{1,12}$/;
  const isValidChord = (c) =>
    typeof c === "string" &&
    c.length <= 64 &&
    CHORD_RE.test(c) &&
    // At least one non-Shift modifier: ⇧Space alone is not a usable global
    // chord, and Shift-only chords collide with normal typing.
    /(CommandOrControl|Command|Control|CmdOrCtrl|Alt|AltGr|Option|Super)/.test(c);
  // ---------------- Vault: per-folder file attachments ----------------
  // Files the user attaches to a subfolder are copied into the app's userData
  // directory (files/<folderId>/<id>-<name>) so they survive the original
  // moving/deleting. The renderer keeps only metadata; binaries never enter
  // localStorage.
  const filesRoot = path.join(app.getPath("userData"), "files");
  try { fs.mkdirSync(filesRoot, { recursive: true }); } catch {}
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
      const p = path.join(filesRoot, String(relPath || ""));
      if (!p.startsWith(filesRoot)) return { ok: false, error: "bad path" };
      await shell.openPath(p);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("vault:read", async (_event, relPath) => {
    try {
      const p = path.join(filesRoot, String(relPath || ""));
      if (!p.startsWith(filesRoot)) return { ok: false, error: "bad path" };
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
      const p = path.join(filesRoot, String(relPath || ""));
      if (!p.startsWith(filesRoot)) return { ok: false, error: "bad path" };
      fs.rmSync(p, { force: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  }));
  ipcMain.handle("update:openPage", (_e, url) => {
    if (typeof url === "string" && /^https:\/\/(github\.com|githubusercontent\.com)\//.test(url)) {
      shell.openExternal(url);
    }
  });
  ipcMain.handle("ambient:configure", (_event, config) => {
    const s = loadSettings();
    const previous = Array.isArray(s.ambient?.chords) ? s.ambient.chords : [];
    const incoming = Array.isArray(config?.chords)
      ? config.chords.filter(isValidChord)
      : previous;
    // Self-heal: a toggle-only update ({enabled:false} or a stale renderer
    // state) must never wipe the user's chords — an empty list would leave
    // only the safety chord working. Fall back to what was there (or defaults).
    const chords = incoming.length > 0 ? incoming : (previous.length > 0 ? previous : [...AMBIENT_DEFAULT_CHORDS]);
    const ambient = {
      enabled: config?.enabled !== undefined ? !!config.enabled : s.ambient?.enabled !== false,
      chords,
    };
    persistSettings({ ...s, ambient });
    const result = applyAmbientConfig(ambient, { rebind: true });
    console.log(`[ovio] ambient:configure → enabled=${ambient.enabled} chords=[${ambient.chords.join(', ')}] registered=[${result.registered.join(', ')}]`);
    return result;
  });
  ipcMain.handle("ambient:getInfo", () => {
    const s = loadSettings().ambient || {};
    return {
      enabled: s.enabled !== false,
      chords: s.chords || [],
      registered: [...ambientShortcuts],
      label: lastShortcutAnnouncement.label,
      shortLabel: lastShortcutAnnouncement.shortLabel || "",
    };
  });
  // In-app "start recording" button (welcome screen) — same as the hotkey:
  // always a fresh popup + a brand-new session.
  ipcMain.on("ambient:trigger", () => {
    springPanelIn();
    dispatchAmbientCommand("record");
  });

  // Panel window buttons → commands for the main renderer.
  ipcMain.on("ambient:panel", (_event, cmd) => {
    // The panel can send plain command strings (pause/done/…) or objects:
    // { cmd: "rename", name } from its editable title field, or
    // { cmd: "editing", value } while the title field is focused.
    if (cmd && typeof cmd === "object" && cmd.cmd === "rename") {
      const name = String(cmd.name || "").trim().slice(0, 120);
      if (name) dispatchAmbientCommand({ cmd: "rename", name });
      return;
    }
    if (cmd && typeof cmd === "object" && cmd.cmd === "editing") {
      panelEditing = !!cmd.value;
      if (panelEditing && panelWindow && !panelWindow.isDestroyed()) {
        panelWindow.setIgnoreMouseEvents(false);
        panelInteractive = true;
      }
      return;
    }
    if (cmd === "close") { hidePanel(); return; }
    if (cmd === "open") {
      // Click on the popup → jump to that recording in the Ovio window.
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      dispatchAmbientCommand({ cmd: "open" });
      return;
    }
    dispatchAmbientCommand(cmd);
  });

  // The renderer announces it can receive ambient commands. Any shortcut press
  // that happened during splash/startup is replayed here so the very first
  // hotkey is never swallowed by the load race.
  ipcMain.on("ambient:ready", (event) => {
    if (event.sender !== mainWindow?.webContents) return;
    rendererReady = true;
    if (lastShortcutAnnouncement.label) {
      mainWindow.webContents.send("ambient:shortcut", lastShortcutAnnouncement);
    }
    if (pendingAmbientCommand) {
      const { cmd, at } = pendingAmbientCommand;
      pendingAmbientCommand = null;
      if (Date.now() - at < 10000) {
        mainWindow.webContents.send("ambient:command", cmd);
      }
    }
  });

  // Main renderer → live recording state for the floating panel.
  ipcMain.on("ambient:status", (_event, state) => {
    sendToPanel("ambient:state", state);
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
  destroyWhisper();
  parakeet.stopServer();
  destroyPanel();
  if (shortcutRetryTimer) clearInterval(shortcutRetryTimer);
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});