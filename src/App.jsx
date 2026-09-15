import { useState, useCallback, useEffect } from "react";
import Recorder from "./screens/Recorder";
import Dashboard from "./screens/Dashboard";
import Onboarding from "./screens/Onboarding";
import Settings from "./screens/Settings";
import CommandPalette from "./components/CommandPalette";
import { LayoutDashboard, Mic, Settings as SettingsIcon, Download, Check, Search } from "lucide-react";
import usePersistence from "./hooks/usePersistence";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { FONT, COLORS, GRADIENTS, applyTheme } from "./ui/theme";
import * as T from "./ui/theme";
import { ANIM_CSS } from "./ui/anim";

const MODEL_LABELS = {
  small: "Whisper Small",
  turbo: "Whisper Turbo",
  large: "Whisper Large v3",
};

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
  const [sttModel, setSttModelState] = useState(settings?.sttModel || "whisper-large-v3-turbo");
  const [localSttModel, setLocalSttModelState] = useState(settings?.localSttModel || "large");
  const [aiProvider, setAiProviderState] = useState(settings?.aiProvider || "cloud");
  const [ollamaUrl, setOllamaUrlState] = useState(settings?.ollamaUrl || "http://localhost:11434");
  const [ollamaModel, setOllamaModelState] = useState(settings?.ollamaModel || "");
  const [importRef, setImportRef] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [recStatus, setRecStatus] = useState(null);
  // Universal search (⌘K): one palette over recordings, notes, files, projects.
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Vault metadata (per-subfolder file attachments) lives here so both the
  // recorder and the ⌘K palette can see it. Binaries stay in userData/files.
  const [vaultBySub, setVaultBySub] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ovio_vault") || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("ovio_vault", JSON.stringify(vaultBySub)); } catch {}
  }, [vaultBySub]);

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
    setSttModelState(settings.sttModel || "whisper-large-v3-turbo");
    setLocalSttModelState(settings.localSttModel || "large");
    setAiProviderState(settings.aiProvider || "cloud");
    setOllamaUrlState(settings.ollamaUrl || "http://localhost:11434");
    setOllamaModelState(settings.ollamaModel || "");
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

  const handleOnboardingComplete = useCallback(async () => {
    await refresh();
    setView("dashboard");
  }, [refresh]);

  const handleOnboardingSkip = useCallback(async () => {
    await window.settingsAPI.update({ onboardingSkipped: true, onboardingComplete: true, mode: mode });
    setView("dashboard");
  }, [mode]);

  const setMode = useCallback((m) => {
    setModeState(m);
    update({ mode: m });
    refresh();
  }, [update, refresh]);

  const setSttModel = useCallback((m) => {
    setSttModelState(m);
    update({ sttModel: m });
  }, [update]);

  const setLocalSttModel = useCallback((m) => {
    setLocalSttModelState(m);
    update({ localSttModel: m });
  }, [update]);

  const setAiProvider = useCallback((p) => {
    setAiProviderState(p);
    update({ aiProvider: p });
  }, [update]);

  const setOllamaUrl = useCallback((u) => {
    setOllamaUrlState(u);
    update({ ollamaUrl: u });
  }, [update]);

  const setOllamaModel = useCallback((m) => {
    setOllamaModelState(m);
    update({ ollamaModel: m });
  }, [update]);

  // "Fully local" preset: on-device Whisper STT + Ollama for AI notes.
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

  // Theme mode: applyTheme mutates the live COLORS object in place so every
  // inline style reading COLORS re-resolves on the next render. Lives above
  // every early return so the hook order stays stable.
  useEffect(() => {
    applyTheme(settings?.theme || "dark");
  }, [settings?.theme]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.windowBg, fontFamily: FONT }}>
        <div style={{ fontSize: 13, color: COLORS.textTertiary }}>Loading…</div>
      </div>
    );
  }

  // Onboarding gating: only when NOT complete AND not skipped. The recorder
  // stays mounted (hidden) underneath so the global hotkey — and the
  // walkthrough's own "Try it now" button — spawn a REAL recording even
  // before onboarding is finished. Previously the ambient "record" command
  // arrived here but nothing was listening (Recorder wasn't mounted), so
  // the popup appeared and nothing ever recorded on the walkthrough screen.
  if (!settings?.onboardingComplete && !settings?.onboardingSkipped) {
    return (
      <div style={{ width: "100vw", height: "100vh", display: "flex", position: "relative", overflow: "hidden" }}>
        <EntranceVeil />
        <Onboarding onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} recStatus={recStatus} />
        {/* Hidden ambient recorder — mounted ONLY so it can receive ambient
            commands while the walkthrough is up. It must not affect layout. */}
        <div
          aria-hidden
          style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", opacity: 0, pointerEvents: "none" }}
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
    );
  }

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
button:focus-visible { outline: 2px solid rgba(47,107,255,0.45); outline-offset: 2px; }
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
      {/* Top nav — floating dark pill on black, the references' header language. */}
      <div
        style={{
          height: 52,
          minHeight: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          background: "transparent",
          paddingLeft: 78,
          paddingRight: 8,
        }}
      >        <span style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: COLORS.text,
          marginRight: 14, WebkitAppRegion: "no-drag",
        }}>
          Ovio
        </span>
        <div style={{
          display: "flex", alignItems: "center", gap: 2,
          background: COLORS.surface2, border: `1px solid ${COLORS.border}`,
          borderRadius: 999, padding: 3, WebkitAppRegion: "no-drag",
          boxShadow: "0 8px 30px rgba(0,0,0,0.45)",
        }}>
        {[
          { id: "dashboard", icon: <LayoutDashboard size={13} />, label: "Dashboard" },
          { id: "recorder", icon: <Mic size={13} />, label: "Recorder" },
          { id: "settings", icon: <SettingsIcon size={13} />, label: "Settings" },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => goView(v.id)}
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "none",
              background: view === v.id ? COLORS.accentSoft : "transparent",
              color: view === v.id ? COLORS.blueBright : COLORS.textSecondary,
              fontSize: 12, fontWeight: 600, borderRadius: 999, padding: "5px 13px",
              cursor: "pointer", fontFamily: FONT,
              transition: "background 220ms ease, color 220ms ease, transform 160ms cubic-bezier(.16,1,.3,1), box-shadow 220ms ease",
              boxShadow: view === v.id ? "inset 0 0 0 1px rgba(47,107,255,0.45)" : "none",
            }}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
        </div>
        {/* Universal search — always visible in the nav. Click or ⌘K. */}
        <button
          onClick={() => setPaletteOpen(true)}
          title="Search everything (⌘K)"
          style={{
            display: "flex", alignItems: "center", gap: 7,
            marginLeft: 10, border: `1px solid ${COLORS.border}`,
            background: COLORS.surface2, color: COLORS.textTertiary,
            fontSize: 11.5, fontWeight: 500, borderRadius: 999,
            padding: "5px 12px", cursor: "pointer", fontFamily: FONT,
            transition: "border-color 160ms ease, color 160ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.color = COLORS.textSecondary; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.textTertiary; }}
        >
          <Search size={12} />
          Search
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: COLORS.textTertiary,
            border: `1px solid ${COLORS.border}`, borderRadius: 4,
            padding: "0 4px", lineHeight: "14px",
          }}>⌘K</span>
        </button>
        <div style={{ flex: 1 }} />
      </div>

      {/* Settings — now a full tab (no more overlay). It receives its own
          navigation callback instead of Done/Close buttons. */}
      {view === "settings" && (
        <Settings
          onNavigate={(tab) => setView(tab)}
          mode={mode}
          setMode={setMode}
          sttModel={sttModel}
          setSttModel={setSttModel}
          localSttModel={localSttModel}
          setLocalSttModel={setLocalSttModel}
          aiProvider={aiProvider}
          setAiProvider={setAiProvider}
          ollamaUrl={ollamaUrl}
          setOllamaUrl={setOllamaUrl}
          ollamaModel={ollamaModel}
          setOllamaModel={setOllamaModel}
          setFullyLocal={setFullyLocal}
          onExport={exportData}
          onImport={() => { setImportRef((r) => r || document.createElement("input")); if (importRef) { importRef.type = "file"; importRef.accept = ".json"; importRef.onchange = (e) => { const f = e.target.files?.[0]; if (f) importData(f); }; importRef.click(); } }}
          onClearAll={clearAll}
          onKeysChanged={refresh}
          ambientShortcutLabel={ambientShortcutLabel}
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
              setRecordingsBySub={setRecordingsBySub}
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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
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
  const isLight = T.windowBg && String(T.windowBg).startsWith("#F");
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

// Global model-download popup: appears bottom-right whenever a local
// Whisper model is downloading, and shows a completion toast when done.
function ModelDownloadToast() {
  const [dl, setDl] = useState(null);   // { id, progress }
  const [done, setDone] = useState(null); // { id }

  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return;
    const off = window.electronAPI.onDownloadProgress(({ id, progress }) => {
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
  const label = MODEL_LABELS[done?.id || dl?.id] || "Whisper model";

  return (
    <div style={{
      position: "fixed", right: 20, bottom: 20, zIndex: 300,
      background: "rgba(17,18,22,0.88)", color: COLORS.text, borderRadius: 16,
      backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
      border: "1px solid rgba(255,255,255,0.1)",
      padding: "12px 16px", minWidth: 260, maxWidth: 320,
      boxShadow: "0 16px 50px rgba(0,0,0,0.6)", fontFamily: FONT,
      display: "flex", alignItems: "center", gap: 12,
      animation: "ovioToastIn 420ms cubic-bezier(.16,1,.3,1) both",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: dl ? COLORS.accentSoft : "rgba(50,213,131,0.16)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done ? <Check size={16} color={COLORS.green} /> : <Download size={15} color={COLORS.blueBright} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {done ? `${label} downloaded` : `Downloading ${label}…`}
        </div>
        {dl ? (
          <>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", marginTop: 6, overflow: "hidden" }}>
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
