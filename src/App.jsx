import { useState, useCallback, useEffect } from "react";
import MacNoteTaker from "./MacNoteTaker";
import Dashboard from "./Dashboard";
import Onboarding from "./Onboarding";
import Settings from "./Settings";
import { LayoutDashboard, Mic, Settings as SettingsIcon, Download, Check } from "lucide-react";
import usePersistence from "./hooks/usePersistence";
import { SettingsProvider, useSettings } from "./context/SettingsContext";
import { FONT, COLORS } from "./theme";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setModeState] = useState(settings?.mode || "hybrid");
  const [sttModel, setSttModelState] = useState(settings?.sttModel || "whisper-large-v3-turbo");
  const [localSttModel, setLocalSttModelState] = useState(settings?.localSttModel || "turbo");
  const [agentSkills, setAgentSkillsState] = useState(settings?.agentSkills || {});
  const [aiProvider, setAiProviderState] = useState(settings?.aiProvider || "cloud");
  const [ollamaUrl, setOllamaUrlState] = useState(settings?.ollamaUrl || "http://localhost:11434");
  const [ollamaModel, setOllamaModelState] = useState(settings?.ollamaModel || "");
  const [importRef, setImportRef] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [recStatus, setRecStatus] = useState(null);

  // Keep local UI state in sync with persisted settings once loaded.
  useEffect(() => {
    if (!settings) return;
    setModeState(settings.mode || "hybrid");
    setSttModelState(settings.sttModel || "whisper-large-v3-turbo");
    setLocalSttModelState(settings.localSttModel || "turbo");
    setAgentSkillsState(settings.agentSkills || {});
    setAiProviderState(settings.aiProvider || "cloud");
    setOllamaUrlState(settings.ollamaUrl || "http://localhost:11434");
    setOllamaModelState(settings.ollamaModel || "");
  }, [settings]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
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

  const setAgentSkills = useCallback((fn) => {
    setAgentSkillsState((prev) => {
      const next = typeof fn === "function" ? fn(prev) : fn;
      update({ agentSkills: next });
      return next;
    });
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

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.windowBg, fontFamily: FONT }}>
        <div style={{ fontSize: 13, color: COLORS.textTertiary }}>Loading…</div>
      </div>
    );
  }

  // Onboarding gating: only when NOT complete AND not skipped
  if (!settings?.onboardingComplete && !settings?.onboardingSkipped) {
    return (
      <div style={{ flex: 1, display: "flex" }}>
        <Onboarding onComplete={handleOnboardingComplete} onSkip={handleOnboardingSkip} />
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        fontFamily: FONT,
        background: `radial-gradient(120% 90% at 50% 0%, ${COLORS.surface} 0%, ${COLORS.windowBg} 100%)`,
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Top nav bar */}
      <div
        style={{
          height: 48,
          minHeight: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
          paddingLeft: 78,
          paddingRight: 8,
        }}
      >
        <span style={{
          fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: COLORS.text,
          marginRight: 12, WebkitAppRegion: "no-drag",
        }}>
          Ovio
        </span>
        {[
          { id: "dashboard", icon: <LayoutDashboard size={13} />, label: "Dashboard" },
          { id: "recorder", icon: <Mic size={13} />, label: "Recorder" },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "none",
              background: view === v.id ? COLORS.accentSoft : "transparent",
              color: view === v.id ? COLORS.accent : COLORS.textSecondary,
              fontSize: 12, fontWeight: 600, borderRadius: 7, padding: "5px 12px",
              cursor: "pointer", fontFamily: FONT, transition: "background 120ms ease",
            }}
          >
            {v.icon}
            {v.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 2, paddingRight: 8, alignItems: "center" }}>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings (Cmd+,)"
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "none",
              background: "transparent", color: COLORS.textSecondary, cursor: "pointer",
              fontFamily: FONT, padding: "5px 8px", borderRadius: 6,
              fontSize: 12.5, fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#ECE5D9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </div>

      {/* Content — the recorder stays mounted (hidden) so a running
          session keeps transcribing while the Dashboard is open */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {view === "dashboard" && (
          <Dashboard
            projects={projects}
            recordingsBySub={recordingsBySub}
            onSelectRecording={(pid, sid, rec) => {
              setNavProjectId(pid);
              setNavSubprojectId(sid);
              setNavRecordingId(rec.id);
              setView("recorder");
            }}
            onNavigateToProject={(pid, sid) => {
              setNavProjectId(pid);
              setNavSubprojectId(sid);
              setNavRecordingId(null);
              setView("recorder");
            }}
          />
        )}
        <div style={{ display: view === "recorder" ? "flex" : "none", flex: 1, minWidth: 0 }}>
          <MacNoteTaker
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
          />
        </div>
      </div>

      {/* Background recording pill */}
      {view === "dashboard" && recStatus?.isRecording && (
        <FloatingRecPill status={recStatus} onBack={() => setView("recorder")} />
      )}

      {/* Model download progress / completion popup */}
      <ModelDownloadToast />

      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          mode={mode}
          setMode={setMode}
          sttModel={sttModel}
          setSttModel={setSttModel}
          localSttModel={localSttModel}
          setLocalSttModel={setLocalSttModel}
          agentSkills={agentSkills}
          setAgentSkills={setAgentSkills}
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
        />
      )}
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
        position: "fixed", top: 48, left: "50%", transform: "translateX(-50%)", zIndex: 200,
        display: "flex", alignItems: "center", gap: 10,
        background: COLORS.text, color: "#fff",
        borderRadius: 999, padding: "8px 8px 8px 16px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.28)", cursor: "pointer",
        fontFamily: FONT, maxWidth: "calc(100% - 40px)",
      }}
    >
      <style>{`@keyframes ovioPulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.75); } 100% { opacity: 1; transform: scale(1); } }`}</style>
      <span style={{
        width: 8, height: 8, borderRadius: 999, background: "#FF6B5E",
        animation: "ovioPulse 1.4s ease-in-out infinite", flexShrink: 0,
      }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {status.label}
      </span>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>
        {time}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 600, color: "#fff",
        background: "rgba(255,255,255,0.16)", borderRadius: 999, padding: "4px 12px",
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
      background: COLORS.text, color: "#fff", borderRadius: 14,
      padding: "12px 16px", minWidth: 260, maxWidth: 320,
      boxShadow: "0 14px 40px rgba(0,0,0,0.32)", fontFamily: FONT,
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <style>{`@keyframes ovioToastIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: dl ? "rgba(255,255,255,0.12)" : "rgba(93,132,88,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {done ? <Check size={16} color="#9FD49B" /> : <Download size={15} color="#fff" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {done ? `${label} downloaded` : `Downloading ${label}…`}
        </div>
        {dl ? (
          <>
            <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)", marginTop: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${Math.round(dl.progress * 100)}%`,
                background: "#fff", borderRadius: 2, transition: "width 400ms ease",
              }} />
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
              {Math.round(dl.progress * 100)}% · runs in the background
            </div>
          </>
        ) : (
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", marginTop: 3 }}>
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
