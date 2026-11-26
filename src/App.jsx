import { useState, useCallback, useEffect, useMemo } from "react";
import Recorder from "./screens/Recorder";
import Dashboard from "./screens/Dashboard";
import Onboarding from "./screens/Onboarding";
import Settings from "./screens/Settings";
import CommandPalette from "./components/CommandPalette";
import UpdatePrompt from "./components/UpdatePrompt";
import GuidedTour from "./components/GuidedTour";
import { LayoutDashboard, Mic, Settings as SettingsIcon, Download, Check, Search, Moon, Sun } from "lucide-react";
import usePersistence, { ensureLoaded, writeStore } from "./hooks/usePersistence";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { FONT, COLORS, GRADIENTS, applyTheme, CTA, isLight } from "./ui/theme";
import { IconButton } from "./ui/kit";
import * as T from "./ui/theme";
import { ANIM_CSS } from "./ui/anim";

// The window's chrome is three things: a wordmark, a floating icon pill, and
// one appearance toggle. Nothing else competes for attention.
const NAV_ITEMS = [
  { id: "dashboard", icon: <LayoutDashboard size={17} strokeWidth={1.9} />, label: "Dashboard" },
  { id: "recorder", icon: <Mic size={17} strokeWidth={1.9} />, label: "Recorder" },
  { id: "settings", icon: <SettingsIcon size={17} strokeWidth={1.9} />, label: "Settings" },
];

// Brand mark: a small waveform glyph — Ovio turns speech into signal.
function Logomark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="2" y="7" width="2.4" height="6" rx="1.2" fill={COLORS.text} />
      <rect x="6.2" y="3.6" width="2.4" height="12.8" rx="1.2" fill={COLORS.text} />
      <rect x="10.4" y="6" width="2.4" height="8" rx="1.2" fill={COLORS.accent} />
      <rect x="14.6" y="8.4" width="2.4" height="3.2" rx="1.2" fill={COLORS.text} />
    </svg>
  );
}

const MODEL_LABELS = { "qwen2.5-1.5b": "Qwen 2.5 · 1.5B", "qwen2.5-3b": "Qwen 2.5 · 3B", "qwen2.5-7b": "Qwen 2.5 · 7B" };

// The onboarding walkthrough. Each step names the view it belongs to and a
// data-tour anchor in that view; the shell switches tabs before the spotlight
// measures, so the tour can cross Dashboard → Recorder → Settings.
const TOUR_STEPS = [
  {
    view: "dashboard",
    target: '[data-tour="nav"]',
    title: "This is your whole app",
    body: "Dashboard, Recorder and Settings live in this pill. Everything else stays out of the way.",
  },
  {
    view: "dashboard",
    target: '[data-tour="record"]',
    title: "Start recording",
    body: "One click opens the recorder. A global shortcut can capture a thought from any app.",
  },
  {
    view: "dashboard",
    target: '[data-tour="ask"]',
    title: "Ask across every recording",
    body: "Ask in plain language and Ovio answers using transcripts, your notes and AI notes from the whole library — with citations.",
  },
  {
    view: "dashboard",
    target: '[data-tour="projects"]',
    title: "Your library",
    body: "Every recording lives in a project folder. Open one to see the recordings inside, or move items between folders.",
  },
  {
    view: "dashboard",
    target: '[data-tour="search"]',
    title: "Search everything",
    body: "⌘K searches titles, transcripts, AI notes, projects and vault files. It also jumps between views.",
  },
  {
    view: "recorder",
    target: '[data-tour="recorder-sidebar"]',
    title: "The recorder's source list",
    body: "Projects and folders sit on the left. The General Folder catches quick recordings made with the global shortcut.",
  },
  {
    view: "recorder",
    target: '[data-tour="recorder-stage"]',
    title: "Pick a folder to record into",
    body: "Choose a folder from the sidebar, or make a project first. Press record and the live transcript and AI notes fill the right side.",
  },
  {
    view: "settings",
    target: '[data-tour="settings-appearance"]',
    title: "Make it yours",
    body: "Switch light or dark, tune animation, and replay this tour any time. AI keys and transcription models live further up this page.",
  },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function AppShell() {
  const { settings, loading, update, refresh } = useSettings();
  const [view, setView] = useState("dashboard");
  const {
    projects,
    setProjects,
    recordingsBySub,
    setRecordingsBySub,
    clearAll,
    exportData,
    importData,
  } = usePersistence();

  const [navProjectId, setNavProjectId] = useState(null);
  const [navSubprojectId, setNavSubprojectId] = useState(null);
  const [navRecordingId, setNavRecordingId] = useState(null);
  const [mode, setModeState] = useState(settings?.mode || "local");
  const [localSttModel, setLocalSttModelState] = useState(settings?.localSttModel || "parakeet");
  const [aiProvider, setAiProviderState] = useState(settings?.aiProvider || "cloud");
  const [localLlmModel, setLocalLlmModelState] = useState(settings?.localLlmModel || "qwen2.5-3b");
  const [importRef, setImportRef] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [recStatus, setRecStatus] = useState(null);
  // Universal search (⌘K): one palette over recordings, notes, files, projects.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  // Onboarding ends in a guided spotlight tour; Settings can replay it.
  const [tourOpen, setTourOpen] = useState(false);
  // Setup fades out over the app instead of cutting to it. The flag keeps the
  // overlay mounted for the length of the fade, then the gate below drops it.
  const [onboardingExiting, setOnboardingExiting] = useState(false);
  const ONBOARDING_FADE_MS = 760;
  // The ask-bar hands its text to the palette so "search" and "ask" are the
  // same surface with different entry points.
  const openSearch = useCallback((q = "") => {
    setPaletteQuery(typeof q === "string" ? q : "");
    setPaletteOpen(true);
  }, []);
  // Vault metadata (per-subfolder file attachments) lives here so both the
  // recorder and the ⌘K palette can see it. Binaries stay in userData/files,
  // metadata lives in the durable disk store (was: localStorage).
  const [vaultBySub, setVaultBySubState] = useState(null);
  useEffect(() => {
    let alive = true;
    ensureLoaded("vault").then((v) => { if (alive) setVaultBySubState(v || {}); });
    return () => { alive = false; };
  }, []);
  const setVaultBySub = useCallback((updater) => {
    setVaultBySubState((prev) => {
      const base = prev || {};
      const next = typeof updater === "function" ? updater(base) : updater;
      writeStore("vault", next);
      return next;
    });
  }, []);

  // Ambient recording: commands arrive from the floating popup (gestured by
  // the global shortcut in the main process) and are forwarded to the recorder.
  const [ambientSignal, setAmbientSignal] = useState(null);
  // Chords actually registered in the main process (announced over IPC) so the
  // UI can show the shortcut that really works, even after a fallback.
  const [ambientShortcutLabel, setAmbientShortcutLabel] = useState("");
  useEffect(() => {
    if (!window.electronAPI?.ambient?.onCommand) return;
    const off = window.electronAPI.ambient.onCommand((cmd) => {
      setAmbientSignal((s) => ({ cmd, ts: (s?.ts || 0) + 1 }));
    });
    // Announce readiness so a shortcut pressed during the splash screen is
    // replayed instead of silently dropped by the startup race.
    window.electronAPI.ambient.ready?.();
    const offShortcut = window.electronAPI.ambient.onShortcut?.((info) => {
      setAmbientShortcutLabel(info?.label || "");
    });
    return () => {
      off?.();
      offShortcut?.();
    };
  }, []);

  // Live status feed back to the popup (recording / paused / off + label).
  const forwardAmbientStatus = useCallback((status) => {
    window.electronAPI?.ambient?.status?.(status);
  }, []);

  // Keep local UI state in sync with persisted settings once loaded.
  useEffect(() => {
    if (!settings) return;
    setModeState(settings.mode || "local");
    setLocalSttModelState(settings.localSttModel || "parakeet");
    setAiProviderState(settings.aiProvider || "cloud");
    setLocalLlmModelState(settings.localLlmModel || "qwen2.5-3b");
  }, [settings]);

  // Recorder is kept mounted (so a live session survives switching views)
  // but we restart its entrance animation every time it becomes visible by
  // flipping between two identical keyframes (animationName swap).
  const [recN, setRecN] = useState(0);
  const openRecorder = useCallback(() => {
    setRecN((n) => n + 1);
    setView("recorder");
  }, []);
  const goView = useCallback((id) => {
    if (id === "recorder") setRecN((n) => n + 1);
    setView(id);
  }, []);

  // The tour crosses tabs; switch the view before each step's spotlight is
  // measured. `goView` restarts the recorder entrance animation each time.
  const handleTourIndex = useCallback((index) => {
    const next = TOUR_STEPS[index];
    if (!next?.view) return;
    if (next.view === "recorder") setRecN((n) => n + 1);
    setView(next.view);
  }, []);

  const finishTour = useCallback((startRecording) => {
    setTourOpen(false);
    update({ tourComplete: true });
    if (startRecording) openRecorder();
  }, [update, openRecorder]);

  // ⌘, jumps to Settings; ⌘K opens the universal search palette.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setView("settings");
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Setup dissolves into the app rather than snapping to it: the overlay is
  // faded first (it sits above the already-mounted shell), then the gate is
  // cleared. Keeping the shell mounted underneath is what makes the reveal
  // show the real Dashboard instead of an empty window.
  const fadeOutOnboarding = useCallback(
    () => new Promise((resolve) => {
      setOnboardingExiting(true);
      setTimeout(resolve, ONBOARDING_FADE_MS);
    }),
    [ONBOARDING_FADE_MS]
  );

  const handleOnboardingComplete = useCallback(async () => {
    await fadeOutOnboarding();
    await refresh();
    setView("dashboard");
    // Hand off from setup straight into the walkthrough.
    setTourOpen(true);
    setOnboardingExiting(false);
  }, [fadeOutOnboarding, refresh]);

  const handleOnboardingSkip = useCallback(async () => {
    await fadeOutOnboarding();
    await window.settingsAPI.update({ onboardingSkipped: true, onboardingComplete: true, mode: mode });
    // Refresh the context so the onboarding gate reads the new flags —
    // without this, skipping left the setup screen mounted.
    await refresh();
    setView("dashboard");
    setOnboardingExiting(false);
  }, [fadeOutOnboarding, mode, refresh]);

  const setMode = useCallback((m) => {
    setModeState(m);
    update({ mode: m });
    refresh();
  }, [update, refresh]);

  const setLocalSttModel = useCallback((m) => {
    setLocalSttModelState(m);
    update({ localSttModel: m });
  }, [update]);

  const setAiProvider = useCallback((p) => {
    setAiProviderState(p);
    update({ aiProvider: p });
  }, [update]);

  const setLocalLlmModel = useCallback((m) => {
    setLocalLlmModelState(m);
    update({ localLlmModel: m });
  }, [update]);

  // Fully local preset: on-device Parakeet STT + Ovio's local GGUF runtime.
  const setFullyLocal = useCallback(() => {
    setModeState("local");
    setAiProviderState("localOnly");
    update({ mode: "local", aiProvider: "localOnly" });
  }, [update]);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) importData(file);
  };

  // Theme mode: applyTheme mutates the live COLORS object in place. Running
  // it DURING render (memoized on the mode) means the styles computed for
  // this same pass already use the new palette; an effect ran after commit
  // and left the UI one render behind, so toggling looked broken.
  useMemo(() => {
    applyTheme(settings?.theme || "light");
  }, [settings?.theme]);

  if (loading || vaultBySub === null) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.windowBg, fontFamily: FONT }}>
        <div style={{ fontSize: 13, color: COLORS.textTertiary }}>Loading…</div>
      </div>
    );
  }

  // Onboarding gating: only when NOT complete AND not skipped — but the app
  // shell below is always mounted. Setup is drawn as a full-window overlay on
  // top, so finishing it can fade the overlay away and reveal the real app
  // (and the Recorder is already mounted for the ambient hotkey either way).
  const onboardingGated = !settings?.onboardingComplete && !settings?.onboardingSkipped;
  const showOnboarding = onboardingGated || onboardingExiting;

  // Settings → Animation level, applied as a real DOM class on the root so it
  // governs every view, pill, toast and popup (it previously sat inside the
  // style object where React silently dropped it — the setting did nothing).
  const animClass = settings?.animations === "reduced"
    ? "ovio-anim-reduced"
    : settings?.animations === "off"
      ? "ovio-anim-off"
      : "";
  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={animClass}
      style={{
        fontFamily: FONT,
        background: GRADIENTS.pageGlow,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* ===== Backdrop — flat, calm, no glow fields. ===== */}
      <style>{`${ANIM_CSS}
@keyframes ovioSkeleton {
  0% { background-position: -160% 0; }
  100% { background-position: 260% 0; }
}
button { -webkit-tap-highlight-color: transparent; font-family: inherit; }
button:active { transform: scale(0.955); }
button:focus-visible { outline: 2px solid rgba(198,245,95,0.42); outline-offset: 2px; }
/* Settings → Animation level. Applied on the app root so EVERY view, pill,
   toast and popup obeys. Levels are deliberately very different:
   • reduced — looping pulses/waves stop after one play, transitions snap to
     100ms, entrance animations are stripped (pages appear, they don't glide)
   • off — every animation and transition is removed entirely; the UI is
     instant, like a static document */
.ovio-anim-reduced *, .ovio-anim-reduced *::before, .ovio-anim-reduced *::after {
  animation-iteration-count: 1 !important;
  animation-duration: 1ms !important;
  transition-duration: 100ms !important;
}
.ovio-anim-off *, .ovio-anim-off *::before, .ovio-anim-off *::after {
  animation: none !important;
  transition: none !important;
}
.ovio-anim-off button:active, .ovio-anim-off *:active { transform: none !important; }
`}</style>
      {/* Window chrome — wordmark left, floating icon pill centered, one
          appearance toggle right. The window drags by the empty space. */}
      <div
        style={{
          position: "relative",
          height: 72,
          minHeight: 72,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: window.electronAPI?.platform === "darwin" ? 78 : 18,
          // Windows draws its caption buttons over the top-right of the header.
          paddingRight: window.electronAPI?.platform === "win32" ? 148 : 18,
          WebkitAppRegion: "drag",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, WebkitAppRegion: "no-drag" }}>
          <Logomark />
          <span style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: "-0.025em", color: COLORS.text }}>
            Ovio
          </span>
        </div>

        {/* The nav: icons only, the active one inverts to a solid white tile. */}
        <div
          data-tour="nav"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 3,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 999,
            padding: 5,
            WebkitAppRegion: "no-drag",
            boxShadow: settings?.theme === "light" ? "0 4px 14px rgba(10,10,10,0.06)" : "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {NAV_ITEMS.map((v) => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => goView(v.id)}
                title={v.label}
                aria-label={v.label}
                style={{
                  width: 44, height: 38, border: "none", borderRadius: 13,
                  background: active ? CTA.bg : "transparent",
                  color: active ? CTA.fg : COLORS.textSecondary,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", fontFamily: FONT,
                  transition: "background 200ms ease, color 200ms ease, transform 160ms cubic-bezier(.16,1,.3,1)",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = COLORS.surface2; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                {v.icon}
              </button>
            );
          })}
          <span style={{ width: 1, height: 20, background: COLORS.border, margin: "0 3px" }} />
          <button
            data-tour="search"
            onClick={() => setPaletteOpen(true)}
            title="Search everything (⌘K)"
            aria-label="Search"
            style={{
              width: 44, height: 38, border: "none", borderRadius: 13,
              background: "transparent", color: COLORS.textSecondary,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", fontFamily: FONT,
              transition: "background 200ms ease, color 200ms ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surface2; e.currentTarget.style.color = COLORS.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = COLORS.textSecondary; }}
          >
            <Search size={17} strokeWidth={1.9} />
          </button>
        </div>

        {/* The bar is a window drag region; every control inside needs its
            own no-drag island or Electron swallows the click. */}
        <div style={{ WebkitAppRegion: "no-drag", display: "flex", flexShrink: 0 }}>
          <IconButton
            title={settings?.theme === "light" ? "Switch to dark" : "Switch to light"}
            ariaLabel={settings?.theme === "light" ? "Switch to dark appearance" : "Switch to light appearance"}
            size={40}
            onClick={() => update({ theme: settings?.theme === "light" ? "dark" : "light" })}
          >
            {settings?.theme === "light" ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
          </IconButton>
        </div>
      </div>

      {/* Settings — now a full tab (no more overlay). It receives its own
          navigation callback instead of Done/Close buttons. */}
      {view === "settings" && (
        <Settings
          onNavigate={(tab) => setView(tab)}
          mode={mode}
          setMode={setMode}
          localSttModel={localSttModel}
          setLocalSttModel={setLocalSttModel}
          aiProvider={aiProvider}
          setAiProvider={setAiProvider}
          localLlmModel={localLlmModel}
          setLocalLlmModel={setLocalLlmModel}
          setFullyLocal={setFullyLocal}
          onExport={exportData}
          onImport={() => { setImportRef((r) => r || document.createElement("input")); if (importRef) { importRef.type = "file"; importRef.accept = ".json"; importRef.onchange = (e) => { const f = e.target.files?.[0]; if (f) importData(f); }; importRef.click(); } }}
          onClearAll={clearAll}
          onKeysChanged={refresh}
          ambientShortcutLabel={ambientShortcutLabel}
          onReplayTour={() => setTourOpen(true)}
        />
      )}

      {/* Content — the recorder stays mounted (hidden) so a running
          session keeps transcribing while the Dashboard is open.
          On the Settings tab the wrapper collapses to zero so Settings
          owns the full window (it must not share space 50/50). */}
      <div style={{
        flex: view === "settings" ? "0 0 0%" : 1,
        display: view === "settings" ? "none" : "flex",
        minHeight: 0,
        overflow: "hidden",
        position: "relative",
        zIndex: 1,
      }}>
        {view === "dashboard" && (
          <div style={{ flex: 1, display: "flex", minWidth: 0, animation: "ovioViewIn 480ms cubic-bezier(.22,1,.36,1) both" }}>
            <Dashboard
              projects={projects}
              recordingsBySub={recordingsBySub}
              onClearAll={clearAll}
              onOpenRecorder={openRecorder}
              onOpenSearch={openSearch}
              onRenameProject={(pid, name) => {
                setProjects((prev) => prev.map((p) => (p.id === pid ? { ...p, name } : p)));
              }}
              onSelectRecording={(pid, sid, rec) => {
                setNavProjectId(pid);
                setNavSubprojectId(sid);
                setNavRecordingId(rec.id);
                openRecorder();
              }}
              onNavigateToProject={(pid, sid) => {
                setNavProjectId(pid);
                setNavSubprojectId(sid);
                setNavRecordingId(null);
                openRecorder();
              }}
            />
          </div>
        )}
        <div
          style={{
            display: view === "recorder" ? "flex" : "none",
            flex: 1,
            minWidth: 0,
            animation: view === "recorder" ? `ovioViewSwap${recN % 2 ? "B" : "A"} 440ms cubic-bezier(.22,1,.36,1) both` : undefined,
          }}
        >
          <Recorder
            projects={projects}
            setProjects={setProjects}
            recordingsBySub={recordingsBySub}
            setRecordingsBySub={setRecordingsBySub}
            navProjectId={navProjectId}
            navSubprojectId={navSubprojectId}
            navRecordingId={navRecordingId}
            clearNavRecording={() => setNavRecordingId(null)}
            onNavigateToDashboard={() => setView("dashboard")}
            onRecordingStatus={setRecStatus}
            ambientSignal={ambientSignal}
            onAmbientStatus={forwardAmbientStatus}
            ambientShortcutLabel={ambientShortcutLabel}
            vaultBySub={vaultBySub}
            setVaultBySub={setVaultBySub}
          />
        </div>
      </div>

      {/* Background recording pill */}
      {view === "dashboard" && recStatus?.isRecording && (
        <FloatingRecPill status={recStatus} onBack={openRecorder} />
      )}

      {/* Universal search palette (⌘K) */}
      <UpdatePrompt />
      <CommandPalette
        open={paletteOpen}
        initialQuery={paletteQuery}
        onClose={() => { setPaletteOpen(false); setPaletteQuery(""); }}
        projects={projects}
        recordingsBySub={recordingsBySub}
        vaultBySub={vaultBySub}
        nav={{
          go: (id) => { if (id === "recorder") openRecorder(); else setView(id); },
          openRecording: (pid, sid, rid) => {
            setNavProjectId(pid);
            setNavSubprojectId(sid);
            setNavRecordingId(rid);
            openRecorder();
          },
          openProject: (pid, sid) => {
            setNavProjectId(pid);
            setNavSubprojectId(sid);
            setNavRecordingId(null);
            openRecorder();
          },
        }}
      />

      {/* Model download progress / completion popup */}
      <ModelDownloadToast />

      {/* First-run walkthrough — also replayed from Settings → Appearance */}
      <GuidedTour
        open={tourOpen}
        steps={TOUR_STEPS}
        onIndexChange={handleTourIndex}
        onSkip={() => finishTour(false)}
        onFinish={() => finishTour(true)}
      />

      {/* Setup lives above the live app so finishing it is a dissolve, not a
          page swap: opacity falls slowly, the Dashboard rises underneath, and
          only then does the gate drop and the tour open. */}
      {showOnboarding && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            background: COLORS.windowBg,
            opacity: onboardingExiting ? 0 : 1,
            transform: onboardingExiting ? "scale(1.012)" : "scale(1)",
            transition: `opacity ${ONBOARDING_FADE_MS}ms cubic-bezier(.4,0,.2,1), transform ${ONBOARDING_FADE_MS + 160}ms cubic-bezier(.4,0,.2,1)`,
            pointerEvents: onboardingExiting ? "none" : "auto",
            willChange: "opacity, transform",
          }}
        >
          <Onboarding
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingSkip}
            recStatus={recStatus}
          />
          <EntranceVeil />
        </div>
      )}

    </div>
  );
}

// ===== In-app cinematic entrance =====
// Replaces the old separate splash window entirely. When the app boots, a
// near-black veil sits on top with a breathing blue orb and the wordmark;
// content rises out from underneath it; then the veil "ripples" away — a
// circular clip-path reveal from the orb outward. Pure CSS + one timer.
function EntranceVeil() {
  const [phase, setPhase] = useState("hold"); // hold → ripple → gone
  useEffect(() => {
    const a = setTimeout(() => setPhase("ripple"), 950);
    const b = setTimeout(() => setPhase("gone"), 1750);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);
  if (phase === "gone") return null;
  const isLight = COLORS.windowBg && String(COLORS.windowBg).startsWith("#F");
  return (
    <div
      aria-hidden
      style={{
        position: "fixed", inset: 0, zIndex: 9000, pointerEvents: "none",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isLight ? "#F7F5F0" : "#050507",
        // Release: a quiet fade — no ripple theatrics.
        opacity: phase === "ripple" ? 0 : 1,
        transition: "opacity 600ms cubic-bezier(.3,0,.2,1)",
      }}
    >
      <style>{`
        @keyframes ovioVeilMark {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          fontSize: 21, fontWeight: 800, color: isLight ? "#0B0C10" : "#F5F6F8",
          animation: "ovioVeilMark 600ms cubic-bezier(.22,1,.36,1) both",
        }}>Ovio</div>
      </div>
    </div>
  );
}

// Small floating pill shown on the Dashboard while a recording runs in
// the background. Clicking it returns to the live recording view.
function FloatingRecPill({ status, onBack }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((Date.now() - (status.startedAtMs || Date.now())) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  const time = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <div
      onClick={onBack}
      title="Recording continues in the background — click to go back"
      style={{
        position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", zIndex: 200,
        display: "flex", alignItems: "center", gap: 10,
        background: COLORS.glass, color: COLORS.text,
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: `1px solid ${COLORS.glassBorder}`,
        borderRadius: 999, padding: "8px 8px 8px 16px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)", cursor: "pointer",
        fontFamily: FONT, maxWidth: "calc(100% - 40px)",
        animation: "ovioToastIn 420ms cubic-bezier(.16,1,.3,1) both",
      }}
    >
      <style>{`@keyframes ovioPulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.75); } 100% { opacity: 1; transform: scale(1); } }`}</style>
      <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
        <span style={{
          position: "absolute", inset: -3, borderRadius: 999, background: COLORS.red,
          animation: "ovioHalo 1.6s ease-out infinite",
        }} />
        <span style={{
          width: 8, height: 8, borderRadius: 999, background: COLORS.red,
          position: "relative", flexShrink: 0,
        }} />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {status.label}
      </span>
      <span style={{ fontSize: 12, color: COLORS.textSecondary, fontVariantNumeric: "tabular-nums" }}>
        {time}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: COLORS.blueBright,
        background: COLORS.accentSoft, borderRadius: 999, padding: "4px 12px",
        flexShrink: 0,
      }}>
        Back to recording →
      </span>
    </div>
  );
}

// Global local-AI model download popup.
function ModelDownloadToast() {
  const [dl, setDl] = useState(null);   // { id, progress }
  const [done, setDone] = useState(null); // { id }

  useEffect(() => {
    if (!window.electronAPI?.localLlm?.onDownloadProgress) return;
    const off = window.electronAPI.localLlm.onDownloadProgress(({ id, progress }) => {
      if (progress >= 1) {
        setDl(null);
        setDone({ id });
        setTimeout(() => setDone(null), 6000);
      } else {
        setDone(null);
        setDl({ id, progress });
      }
    });
    return off;
  }, []);

  if (!dl && !done) return null;
  const label = MODEL_LABELS[done?.id || dl?.id] || "local AI model";

  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 300,
      background: COLORS.glass, color: COLORS.text, borderRadius: 16,
      backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      border: `1px solid ${COLORS.glassBorder}`,
      padding: "12px 16px", minWidth: 260, maxWidth: 320,
      boxShadow: isLight() ? "0 16px 50px rgba(10,10,10,0.14)" : "0 16px 50px rgba(0,0,0,0.6)", fontFamily: FONT,
      display: "flex", alignItems: "center", gap: 12,
      animation: "ovioToastIn 420ms cubic-bezier(.16,1,.3,1) both",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: COLORS.surface2, border: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done ? <Check size={16} color={COLORS.textSecondary} /> : <Download size={15} color={COLORS.textSecondary} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {done ? `${label} downloaded` : `Downloading ${label}…`}
        </div>
        {dl ? (
          <>
            <div style={{ height: 4, borderRadius: 2, background: COLORS.border, marginTop: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${Math.round(dl.progress * 100)}%`,
                background: COLORS.blueBright, borderRadius: 2,
                 transition: "width 400ms ease",
              }} />
            </div>
            <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 4 }}>
              {Math.round(dl.progress * 100)}% · runs in the background
            </div>
          </>
        ) : (
          <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 3 }}>
            Local transcription is ready to use.
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}
