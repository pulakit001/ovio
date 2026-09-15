import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, Cloud, Cpu, Rocket, ArrowRight, ArrowLeft, Check, X,
  Sparkles, MessageSquareText, Download, Keyboard, FolderInput,
} from "lucide-react";
import { verifyGroqKey, verifyOpenRouterKey } from "../services/verifyKeys";
import { checkOllama, OLLAMA_DEFAULT_URL, OLLAMA_TOP_MODELS } from "../services/ollama";
import { FONT, COLORS, GRADIENTS, PILL } from "../ui/theme";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const MODEL_LABELS = {
  parakeet: "Parakeet-TDT v3",
  large: "Whisper Large v3",
};

const MODEL_CARDS = [
  { id: "parakeet", title: "Parakeet v3", desc: "Most accurate · streams live", size: "~2.5 GB", recommended: true },
  { id: "large", title: "Large v3", desc: "Most accurate Whisper", size: "~3.1 GB" },
];

// Brand accent used for progress fills — flat solid color, Typeform-style
// (deliberately no gradients anywhere in onboarding).

// Onboarding motion — the dark cinematic vocabulary: steps rise from blur,
// cards light their borders on hover, the hero orb breathes.
const ONBOARDING_CSS = `
@keyframes ovioStepIn { from { opacity: 0; transform: translateY(18px) scale(.985); filter: blur(5px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
@keyframes ovioFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ovioPillIn { from { opacity: 0; transform: translateX(-120%) translateY(-50%); } to { opacity: 1; transform: translateX(0) translateY(-50%); } }
@keyframes ovioSpin { to { transform: rotate(360deg); } }
@keyframes ovioPop { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.18); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes ovioOrbFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
@keyframes ovioOrbMorph { 0%, 100% { border-radius: 44% 56% 52% 48% / 48% 46% 54% 52%; } 33% { border-radius: 56% 44% 46% 54% / 52% 56% 44% 48%; } 66% { border-radius: 48% 52% 58% 42% / 44% 50% 50% 56%; } }
.ovio-card { transition: border-color 200ms ease, background 200ms ease, transform 200ms cubic-bezier(.16,1,.3,1), box-shadow 240ms ease; }
.ovio-card:hover { transform: translateY(-2px); border-color: rgba(77,141,255,0.5); }
@keyframes ovioRingPulse { 0% { transform: scale(1); opacity: .5; } 70% { transform: scale(1.42); opacity: 0; } 100% { transform: scale(1.42); opacity: 0; } }
@keyframes ovioWave { 0%, 100% { transform: scaleY(.25); } 50% { transform: scaleY(1); } }
@keyframes ovioSpringIn { 0% { opacity: 0; transform: translateY(22px) scale(.94); } 62% { opacity: 1; transform: translateY(-4px) scale(1.015); } 84% { transform: translateY(1.5px) scale(.998); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes ovioRecPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.ovio-ring { position: absolute; inset: 0; border: 2px solid ${COLORS.blueBright}; border-radius: 24%; animation: ovioRingPulse 2.8s cubic-bezier(.16,1,.3,1) infinite; pointer-events: none; }
.ovio-keycap { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 8px; border-radius: 7px; background: var(--ovio-keycap-bg); border: 1px solid var(--ovio-border-strong); box-shadow: 0 2px 0 var(--ovio-border-strong); font-size: 12px; font-weight: 700; color: var(--ovio-text); letter-spacing: .3px; }
/* Quiet scrollbar for the step column — the chunky default one read as a
   broken progress bar in the mode step. */
.ovio-steps::-webkit-scrollbar { width: 5px; }
.ovio-steps::-webkit-scrollbar-thumb { background: rgba(130,142,168,0.28); border-radius: 3px; }
.ovio-steps::-webkit-scrollbar-track { background: transparent; }
`;

const inputStyle = {
  flex: 1,
  border: `1px solid ${COLORS.borderStrong}`,
  outline: "none",
  fontSize: 13,
  fontFamily: FONT,
  color: COLORS.text,
  background: COLORS.surface,
  borderRadius: 8,
  padding: "10px 12px",
};

// Staggered entrance helper — each child rises 80ms after the previous one.
// spring: overshooting variant for the bouncy walkthrough rows.
const fade = (i, base = 0, spring = false) => ({
  animation: `${spring ? "ovioSpringIn" : "ovioFadeUp"} ${spring ? 620 : 500}ms ${spring ? "cubic-bezier(.3,1.4,.4,1)" : "cubic-bezier(.22,1,.36,1)"} both`,
  animationDelay: `${base + i * (spring ? 90 : 80)}ms`,
});

// Slim left-edge pill that tracks any active model download / Ollama pull so
// the user always sees WHAT is downloading and WHAT percentage it reached,
// on every step. On the download step it yields to the full progress card.
function DownloadPill({ label, percent, hidden }) {
  if (!label || hidden) return null;
  const pct = Math.round((percent || 0) * 100);
  return (
    <div style={{
      position: "fixed", left: 0, top: "50%", zIndex: 400, pointerEvents: "none",
      animation: "ovioPillIn 450ms cubic-bezier(.22,1,.36,1) both",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 9,
        background: "rgba(17,18,22,0.92)", color: COLORS.text,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.12)", borderTop: "none", borderLeft: "none",
        borderRadius: "0 999px 999px 0", padding: "9px 14px 9px 13px",
        boxShadow: "8px 10px 32px rgba(0,0,0,0.5)", minWidth: 210,
      }}>
        <span style={{
          width: 12, height: 12, borderRadius: 999, flexShrink: 0,
          border: `2px solid rgba(255,255,255,.2)`, borderTopColor: COLORS.blueBright,
          animation: "ovioSpin .8s linear infinite",
        }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 132 }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontVariantNumeric: "tabular-nums", color: COLORS.textSecondary, width: 32, textAlign: "right" }}>{pct}%</span>
        <span style={{ position: "relative", width: 64, height: 4, borderRadius: 2, background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
          <span style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${pct}%`, borderRadius: 2,
            background: COLORS.blueBright,
            
            transition: "width 300ms ease",
          }} />
        </span>
      </div>
    </div>
  );
}

// A full-size physical keycap for the welcome hero. `pressed` sinks it —
// driven by the REAL recording state, so when the user hits the chord the
// keys visibly go down.
function BigKeycap({ label, pressed }) {
  const wide = label === "space" || label.length > 2;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: wide ? 104 : 56, height: 56, padding: wide ? "0 20px" : "0 10px",
        borderRadius: 13, background: COLORS.surface2,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: pressed
          ? "inset 0 3px 9px rgba(0,0,0,0.30)"
          : `0 4px 0 ${COLORS.borderStrong}, 0 12px 24px rgba(0,0,0,0.28)`,
        transform: pressed ? "translateY(3px)" : "translateY(0)",
        transition: "transform 110ms cubic-bezier(.3,.7,.4,1), box-shadow 110ms ease",
        fontSize: wide ? 15 : 21, fontWeight: 600, letterSpacing: 0.4,
        color: COLORS.text, fontFamily: FONT,
        userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {label}
    </span>
  );
}

// Live seconds since the current recording started (500ms tick, tabular so
// digits never jitter).
function LiveTimer({ startedAtMs }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);
  const s = Math.max(0, Math.floor((Date.now() - (startedAtMs || Date.now())) / 1000));
  return <>{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</>;
}

// --- Global-shortcut showcase (welcome step) -------------------------------

const IS_MAC = (window.electronAPI?.platform || navigator.platform || "").toLowerCase().includes("mac");
const KEY_GLYPHS = IS_MAC
  ? { CommandOrControl: "⌘", Alt: "⌥", Shift: "⇧", Space: "space" }
  : { CommandOrControl: "Ctrl", Alt: "Alt", Shift: "Shift", Space: "Space" };

// "CommandOrControl+Shift+Space" → ["⌘", "⇧", "space"]
const chordToKeys = (chord) =>
  String(chord || "").split("+").filter(Boolean).map((k) => KEY_GLYPHS[k] || k);

function Keycap({ label, accent }) {
  return (
    <span
      className="ovio-keycap"
      style={accent ? {
        background: `${COLORS.blue}14`, borderColor: COLORS.blue,
        color: COLORS.blue, boxShadow: `0 2px 0 ${COLORS.blue}`,
      } : undefined}
    >
      {label}
    </span>
  );
}

// Renders one chord as physical-looking keycaps; the final key is accented.
function ChordKeys({ chord }) {
  const keys = chordToKeys(chord);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {keys.map((k, i) => (
        <Keycap key={i} label={k} accent={i === keys.length - 1} />
      ))}
    </div>
  );
}

// Gentle animated waveform — echoes the recorder without anything loud.
function WaveBars({ count = 14 }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 22 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{
          width: 3, height: "100%", borderRadius: 2, background: COLORS.blue,
          opacity: 0.3, transformOrigin: "bottom",
          animation: `ovioWave ${900 + (i % 5) * 170}ms ease-in-out ${i * 80}ms infinite`,
        }} />
      ))}
    </div>
  );
}

export default function Onboarding({ onComplete, onSkip, recStatus }) {
  const [step, setStep] = useState(0);
  const [mode, setModeState] = useState("local");
  const [localModel, setLocalModel] = useState(
    window.electronAPI?.parakeetAPI ? "parakeet" : "large"
  );
  const [aiProvider, setAiProvider] = useState("cloud");

  // Cloud keys
  const [groqKey, setGroqKey] = useState("");
  const [groqStatus, setGroqStatus] = useState(null);
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [orStatus, setOrStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);

  // Ollama
  const [ollamaUrl, setOllamaUrl] = useState(OLLAMA_DEFAULT_URL);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  // Curated 3-model picker: installed ids, per-model pull progress, selection.
  const [ollamaInstalled, setOllamaInstalled] = useState([]);
  const [ollamaPulls, setOllamaPulls] = useState({});
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const ollamaUrlRef = useRef(ollamaUrl);
  useEffect(() => { ollamaUrlRef.current = ollamaUrl; }, [ollamaUrl]);

  // Local model downloads
  const [modelStates, setModelStates] = useState([]);
  const downloadStartedRef = useRef(false);
  const [bgDownload, setBgDownload] = useState(false);

  // Chords actually registered by the main process (announced over IPC and
  // replayed after the renderer's ready handshake) — the welcome screen shows
  // the real shortcut, including any fallback the OS forced us onto.
  const [shortcutInfo, setShortcutInfo] = useState(null);
  useEffect(() => {
    if (!window.electronAPI?.ambient?.onShortcut) return;
    return window.electronAPI.ambient.onShortcut((info) => setShortcutInfo(info || null));
  }, []);
  const shortcutChords = shortcutInfo?.keys || [];

  // Live truth for the welcome hero: the shortcut is real, so pressing it
  // starts a real session (the recorder stays mounted behind onboarding) and
  // the reported status sinks the keycaps and runs the timer.
  const recording = !!recStatus?.isRecording;
  const recStartedAtMs = recStatus?.startedAtMs || Date.now();
  const primaryChord = shortcutChords.find((c) => !/CommandOrControl/.test(c)) || shortcutChords[0] || "";
  const altChord = shortcutChords.find((c) => c !== primaryChord);

  const hasDownloader = !!window.electronAPI?.downloadModel;
  const isDownloadStep = mode !== "cloud" && hasDownloader;
  const stepDefs = isDownloadStep
    ? ["welcome", "mode", "ai", "download", "how", "done"]
    : ["welcome", "mode", "ai", "how", "done"];
  const stepId = stepDefs[step] || "welcome";

  const refreshModels = async () => {
    let states = [];
    if (window.electronAPI?.modelsStatus) {
      try { states = await window.electronAPI.modelsStatus(); } catch {}
    }
    // Merge Parakeet's status into the same shape so the shared download
    // progress UI works for it too.
    if (window.electronAPI?.parakeetAPI?.status) {
      try {
        const pk = await window.electronAPI.parakeetAPI.status();
        states = [
          {
            id: "parakeet",
            sizeLabel: pk?.sizeLabel || "~2.5 GB",
            downloaded: !!pk?.weights?.downloaded,
            downloading: !!pk?.weights?.downloading,
            progress: pk?.weights?.progress || 0,
            engineReady: pk?.engine?.state === "ready",
          },
          ...states,
        ];
      } catch {}
    }
    setModelStates(states);
  };

  useEffect(() => { refreshModels(); }, []);

  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return;
    const off = window.electronAPI.onDownloadProgress(() => refreshModels());
    return off;
  }, []);
  useEffect(() => {
    if (!window.electronAPI?.parakeetAPI?.onStatus) return;
    const off = window.electronAPI.parakeetAPI.onStatus(() => refreshModels());
    return off;
  }, []);

  // Ollama tags via the main process (works from any renderer origin).
  const refreshOllama = useCallback(async (urlOverride) => {
    const url = urlOverride ?? ollamaUrlRef.current;
    const api = window.electronAPI?.ollamaAPI;
    let res;
    if (api?.tags) {
      res = await api.tags(url);
    } else {
      res = await checkOllama(url); // graceful fallback (no preload / web build)
    }
    setOllamaStatus(res);
    setOllamaInstalled(res?.ok ? (res.models || []).map((m) => m.id) : []);
    return res;
  }, []);

  // Probing Ollama as soon as the AI step shows the local provider — and
  // whenever the user switches to it — so Ready/Pull states appear instantly.
  useEffect(() => {
    if (stepId === "ai" && aiProvider === "localOnly") {
      setCheckingOllama(true);
      refreshOllama().finally(() => setCheckingOllama(false));
    }
  }, [stepId, aiProvider, refreshOllama]);

  // Live pull progress for the curated Ollama models.
  useEffect(() => {
    const api = window.electronAPI?.ollamaAPI;
    if (!api?.onPullProgress) return;
    const off = api.onPullProgress((d) => {
      if (!d?.model) return;
      setOllamaPulls((prev) => ({
        ...prev,
        [d.model]: {
          pulling: !d.done && !d.error,
          percent: d.done ? 1 : d.percent || 0,
          error: d.error || null,
          ready: !!d.done,
        },
      }));
      if (d.done) refreshOllama();
    });
    return off;
  }, [refreshOllama]);

  // Auto-select the best curated model that is actually installed.
  useEffect(() => {
    if (aiProvider !== "localOnly" || !ollamaStatus?.ok || !ollamaInstalled.length) return;
    setSelectedOllamaModel((cur) => {
      if (cur && ollamaInstalled.some((x) => x === cur || x.startsWith(cur))) return cur;
      const best = OLLAMA_TOP_MODELS.find((m) =>
        ollamaInstalled.some((x) => x === m.id || x.startsWith(m.id))
      );
      return best?.id || ollamaInstalled[0];
    });
  }, [ollamaStatus, ollamaInstalled, aiProvider]);

  const pullOllama = (id) => {
    const api = window.electronAPI?.ollamaAPI;
    if (!api?.pull) return;
    // Select the model being pulled so it is active the moment it lands.
    setSelectedOllamaModel(id);
    setOllamaPulls((prev) => ({
      ...prev,
      [id]: { pulling: true, percent: 0, error: null, ready: false },
    }));
    api
      .pull(ollamaUrlRef.current, id)
      .then((res) => {
        if (res && res.ok === false) {
          setOllamaPulls((prev) => ({
            ...prev,
            [id]: { pulling: false, percent: 0, error: res.error || "Pull failed", ready: false },
          }));
        }
        return refreshOllama();
      })
      .catch(() => refreshOllama());
  };

  // Turn ON background download: as soon as the user picks a mode that uses
  // the local model, the recommended model starts downloading in the
  // background while they finish the rest of setup.
  useEffect(() => {
    if (!hasDownloader || mode === "cloud" || downloadStartedRef.current) return;
    downloadStartedRef.current = true;
    setBgDownload(true);
    if (localModel === "parakeet") {
      startParakeetProvisioning();
      return;
    }
    refreshModels().then(() => {
      window.electronAPI.modelsStatus().then((states) => {
        const target = states.find((s) => s.id === localModel);
        if (target && !target.downloaded) {
          window.electronAPI.downloadModel(localModel).then(refreshModels).catch(refreshModels);
        }
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Parakeet needs its Python engine AND its weights — kick both off; they
  // run fully in the background with progress surfaced in the download step.
  const startParakeetProvisioning = () => {
    const api = window.electronAPI?.parakeetAPI;
    if (!api) return;
    api.installEngine?.().then(refreshModels).catch((e) => console.warn("[ovio] parakeet engine:", e?.message));
    api.downloadWeights?.().then(refreshModels).catch((e) => console.warn("[ovio] parakeet weights:", e?.message));
  };

  const setMode = (m) => {
    setModeState(m);
    // Transcription mode is independent of the AI-notes provider: cloud STT
    // with local Ollama notes (and vice versa) are both valid combos.
  };

  const selectModel = (id) => {
    setLocalModel(id);
    if (id === "parakeet") {
      startParakeetProvisioning();
      return;
    }
    const st = modelStates.find((s) => s.id === id);
    if (st && !st.downloaded && !st.downloading && window.electronAPI?.downloadModel) {
      window.electronAPI.downloadModel(id).then(refreshModels).catch(refreshModels);
    }
  };

  const handleVerifyGroq = async () => {
    if (!groqKey.trim()) return;
    setVerifying(true);
    setGroqStatus(null);
    setGroqStatus(await verifyGroqKey(groqKey.trim()));
    setVerifying(false);
  };

  const handleVerifyOr = async () => {
    if (!openrouterKey.trim()) return;
    setVerifying(true);
    setOrStatus(null);
    setOrStatus(await verifyOpenRouterKey(openrouterKey.trim()));
    setVerifying(false);
  };

  const handleCheckOllama = async () => {
    setCheckingOllama(true);
    await refreshOllama();
    setCheckingOllama(false);
  };

  const activeModel = modelStates.find((s) => s.id === localModel);

  const handleComplete = async () => {
    const ollamaModelFinal =
      aiProvider === "localOnly"
        ? selectedOllamaModel &&
          ollamaInstalled.some((x) => x === selectedOllamaModel || x.startsWith(selectedOllamaModel))
          ? selectedOllamaModel
          : ollamaStatus?.ok && ollamaStatus.models?.length
            ? ollamaStatus.models[0].id
            : ""
        : "";
    const patch = {
      mode,
      localSttModel: mode === "cloud" ? "large" : localModel,
      sttModel: "whisper-large-v3-turbo",
      aiProvider,
      ollamaUrl,
      ollamaModel: ollamaModelFinal,
      onboardingComplete: true,
      onboardingSkipped: false,
    };
    // Only overwrite keys when the user actually entered one — re-running
    // setup must never wipe previously saved keys.
    if (groqKey.trim()) patch.groqKeys = [{ id: genId(), name: "Primary", active: true, key: groqKey.trim() }];
    if (openrouterKey.trim()) patch.openrouterKeys = [{ id: genId(), name: "Primary", active: true, key: openrouterKey.trim() }];
    // Persist first (the app's onboarding gate reads the *saved* value), but
    // bound the wait so a slow/stalled IPC can never leave "Get Started"
    // feeling dead — we enter the app regardless after 4s.
    const flush = Promise.resolve(window.settingsAPI?.update(patch)).catch((err) => {
      console.warn("Onboarding settings save failed:", err?.message || err);
    });
    await Promise.race([flush, new Promise((r) => setTimeout(r, 4000))]);
    onComplete();
  };

  const cardStyle = (selected) => ({
    flex: 1,
    position: "relative",
    border: `1.5px solid ${selected ? COLORS.blue : COLORS.border}`,
    background: selected ? COLORS.selected : COLORS.surface,
    boxShadow: "none",
    borderRadius: 16,
    padding: "14px",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: FONT,
  });

  const sectionTitle = (text, sub) => (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{text}</div>
      {sub && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  // What is actively downloading right now (STT model or Ollama pull)?
  const sttDownloading = modelStates.find((s) => s.downloading);
  const ollamaPullingEntry = Object.entries(ollamaPulls).find(([, v]) => v.pulling);
  const pill = sttDownloading
    ? { label: `Downloading ${MODEL_LABELS[sttDownloading.id] || sttDownloading.id}`, percent: sttDownloading.progress || 0 }
    : ollamaPullingEntry
      ? { label: `Pulling Ollama ${ollamaPullingEntry[0]}`, percent: ollamaPullingEntry[1].percent }
      : null;
  // Collapsed download view: while a pull is active, ONLY that model is shown
  // (enlarged, with a big progress bar). The full list returns when it finishes.
  const activePullId = ollamaPullingEntry?.[0];
  // On the download step the pill "merges" into the full progress card, so
  // the pill steps aside while the card carries the progress.
  const pillHidden = stepId === "download";

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      background: GRADIENTS.pageGlow, fontFamily: FONT, position: "relative", overflow: "hidden",
    }}>
      <style>{ONBOARDING_CSS}</style>

      {/* Progress bar — thin line at the very top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          height: "100%",
          width: `${((step + 1) / stepDefs.length) * 100}%`,
          background: COLORS.blueBright,
          
          transition: "width 500ms cubic-bezier(.16,1,.3,1)",
        }} />
      </div>

      {/* Step dots — bouncy morphing pills */}
      <div style={{ position: "absolute", top: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
        {stepDefs.map((s, i) => (
          <div key={s} style={{
            width: i === step ? 20 : 6, height: 6, borderRadius: 3,
            background: i <= step ? COLORS.blueBright : "rgba(255,255,255,0.14)",
            boxShadow: "none",
            transform: i === step ? "scaleY(1.15)" : "scaleY(1)",
            transition: "all 420ms cubic-bezier(.34,1.56,.64,1)",
          }} />
        ))}
      </div>

      {/* Live download pill (left edge) */}
      <DownloadPill label={pill?.label} percent={pill?.percent} hidden={pillHidden} />

      {/* Step content — Typeform-style: open centered column, no card box */}
      <div className="ovio-steps" style={{
        width: 560, maxWidth: "90%", maxHeight: "86vh", overflowY: "auto",
        padding: "8px 0", display: "flex", flexDirection: "column", gap: 18,
        animation: "ovioStepIn 450ms cubic-bezier(.22,1,.36,1) both",
      }} key={step}>
        {stepId === "welcome" && (
          <>
            <div style={{ textAlign: "center", paddingTop: 10, ...fade(0) }}>
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: "0.32em",
                color: COLORS.textTertiary, marginBottom: 14,
              }}>
                OVIO
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1.1, lineHeight: 1.12, color: COLORS.text }}>
                Talk anywhere.
              </div>
              <div style={{ fontSize: 13.5, color: COLORS.textSecondary, marginTop: 8, lineHeight: 1.6, maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
                Start a recording from anywhere. Ovio listens, transcribes, and
                writes the notes — you never touch a window.
              </div>
            </div>

            {/* Keep the hero calm: no card, no keys — just the promise and
                the live state when a recording happens to be running. */}
            {recording && (
              <div
                style={{
                  ...fade(1),
                  border: "1px solid rgba(77,141,255,0.55)",
                  borderRadius: 20,
                  background: "linear-gradient(180deg, rgba(47,107,255,0.14) 0%, rgba(17,18,22,0.65) 100%)",
                  padding: "22px 20px 20px",
                  textAlign: "center",
                }}
              >
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.22em",
                  color: COLORS.blueBright, marginBottom: 12,
                }}>LISTENING</div>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  fontSize: 13, color: COLORS.textSecondary,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 999, background: COLORS.red,
                    animation: "ovioRecPulse 1.4s ease-in-out infinite",
                  }} />
                  <span style={{ fontWeight: 600, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>
                    <LiveTimer startedAtMs={recStartedAtMs} />
                  </span>
                  <WaveBars count={10} />
                  <span style={{ color: COLORS.textTertiary }}>— hit ✓ on the bar to save</span>
                </div>
              </div>
            )}

            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, textAlign: "center", ...fade(2) }}>
              Takes about a minute. Everything is changeable later in Settings.
            </div>
          </>
        )}

        {stepId === "mode" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, ...fade(0) }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: `${COLORS.blue}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Mic size={18} color={COLORS.blue} />
              </div>
              {sectionTitle("How should transcription run?", "You can change this anytime in Settings.")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { id: "local", title: "Local", desc: "On-device AI. Private, works offline." },
                { id: "cloud", title: "Cloud", desc: "Gemini Whisper via Groq-compatible cloud. Fastest — needs a key." },
              ].map((m, i) => (
                <button key={m.id} onClick={() => setMode(m.id)} className="ovio-card"
                  style={{ ...cardStyle(mode === m.id), ...fade(i + 1) }}>
                  {mode === m.id && (
                    <Check size={14} color={COLORS.blue} style={{ position: "absolute", top: 10, right: 10, animation: "ovioPop 350ms ease both" }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{m.title}</div>
                    {m.id === "local" && (
                      <span style={{ fontSize: 8.5, fontWeight: 700, color: COLORS.green, background: `${COLORS.green}14`, borderRadius: 4, padding: "1px 5px" }}>RECOMMENDED</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 4 }}>{m.desc}</div>
                </button>
              ))}
            </div>

            {mode !== "cloud" && hasDownloader && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, ...fade(4) }}>
                  Pick your on-device model
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {MODEL_CARDS.map((m, i) => {
                    const st = modelStates.find((s) => s.id === m.id);
                    return (
                      <button key={m.id} onClick={() => selectModel(m.id)} className="ovio-card"
                        style={{ ...cardStyle(localModel === m.id), ...fade(i + 5) }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{m.title}</div>
                          {m.recommended && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: COLORS.blue,
                              background: `${COLORS.blue}14`, borderRadius: 4, padding: "1px 5px",
                            }}>BEST</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10.5, color: COLORS.textTertiary, margin: "3px 0" }}>{m.desc} · {m.size}</div>
                        <div style={{
                          fontSize: 10.5, fontWeight: 600,
                          color: st?.downloading ? COLORS.blue : st?.downloaded ? COLORS.green : COLORS.textTertiary,
                        }}>
                          {st?.downloading ? `Downloading… ${Math.round((st.progress || 0) * 100)}%`
                            : st?.downloaded ? "✓ Ready" : "Will download now"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {bgDownload && !activeModel?.downloaded && (
                  <div style={{
                    ...fade(7),
                    display: "flex", alignItems: "center", gap: 8, fontSize: 11.5,
                    color: COLORS.blue, background: `${COLORS.blue}0d`,
                    borderRadius: 8, padding: "8px 12px",
                  }}>
                    <Download size={13} />
                    Downloading <strong style={{ fontWeight: 600 }}>{MODEL_LABELS[localModel]}</strong> in the background — keep going, we'll notify you when it's ready.
                  </div>
                )}
              </>
            )}
          </>
        )}

        {stepId === "ai" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, ...fade(0) }}>
              {sectionTitle("Who writes your AI notes?", "Notes are generated automatically from every transcript.")}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAiProvider("cloud")} className="ovio-card"
                style={{ ...cardStyle(aiProvider === "cloud"), ...fade(1) }}>
                {aiProvider === "cloud" && (
                  <Check size={14} color={COLORS.purple} style={{ position: "absolute", top: 10, right: 10, animation: "ovioPop 350ms ease both" }} />
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>Cloud AI</div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 3 }}>Gemini + OpenRouter. Fast, generous free tier.</div>
              </button>
              <button onClick={() => setAiProvider("localOnly")} className="ovio-card"
                style={{ ...cardStyle(aiProvider === "localOnly"), ...fade(2) }}>
                {aiProvider === "localOnly" && (
                  <Check size={14} color={COLORS.green} style={{ position: "absolute", top: 10, right: 10, animation: "ovioPop 350ms ease both" }} />
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>Local (Ollama)</div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 3 }}>A model on this Mac. No keys, fully private.</div>
              </button>
            </div>

            {aiProvider === "cloud" ? (
              <>
                <div style={{ display: "flex", gap: 8, ...fade(3) }}>
                  <input value={groqKey} onChange={(e) => { setGroqKey(e.target.value); setGroqStatus(null); }}
                    placeholder="Gemini key — AIza…  (aistudio.google.com/apikey)" style={inputStyle} />
                  <button onClick={handleVerifyGroq} disabled={verifying || !groqKey.trim()}
                    style={{
                      border: "none", background: verifying ? COLORS.border : COLORS.blue, color: "#fff",
                      fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "0 14px",
                      cursor: verifying ? "default" : "pointer", fontFamily: FONT,
                    }}>
                    {verifying ? "…" : "Verify"}
                  </button>
                </div>
                {groqStatus && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: groqStatus.ok ? COLORS.green : COLORS.red }}>
                    {groqStatus.ok ? <Check size={14} /> : <X size={14} />}
                    {groqStatus.ok ? "Groq connected" : groqStatus.error}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, ...fade(4) }}>
                  <input value={openrouterKey} onChange={(e) => { setOpenrouterKey(e.target.value); setOrStatus(null); }}
                    placeholder="OpenRouter key (optional backup) — sk-or-v1-..." style={inputStyle} />
                  <button onClick={handleVerifyOr} disabled={verifying || !openrouterKey.trim()}
                    style={{
                      border: "none", background: verifying ? COLORS.border : COLORS.purple, color: "#fff",
                      fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "0 14px",
                      cursor: verifying ? "default" : "pointer", fontFamily: FONT,
                    }}>
                    {verifying ? "…" : "Verify"}
                  </button>
                </div>
                {orStatus && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: orStatus.ok ? COLORS.green : COLORS.red }}>
                    {orStatus.ok ? <Check size={14} /> : <X size={14} />}
                    {orStatus.ok ? "OpenRouter connected" : orStatus.error}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: COLORS.textTertiary, ...fade(5) }}>
                  Keys are stored encrypted on this device only. You can also skip and add them later.
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, ...fade(3) }}>
                  <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://localhost:11434" style={inputStyle} />
                  <button onClick={handleCheckOllama} disabled={checkingOllama}
                    style={{
                      border: "none", background: checkingOllama ? COLORS.border : COLORS.green, color: "#fff",
                      fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "0 14px",
                      cursor: checkingOllama ? "default" : "pointer", fontFamily: FONT,
                    }}>
                    {checkingOllama ? "…" : "Check"}
                  </button>
                </div>
                {ollamaStatus && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: ollamaStatus.ok ? COLORS.green : COLORS.red }}>
                    {ollamaStatus.ok ? <Check size={14} /> : <X size={14} />}
                    {ollamaStatus.ok
                      ? `Connected — ${ollamaStatus.models.length} model${ollamaStatus.models.length === 1 ? "" : "s"} found`
                      : ollamaStatus.error}
                  </div>
                )}

                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, ...fade(4) }}>
                  Pick a model for notes
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {OLLAMA_TOP_MODELS.filter((m) => !activePullId || activePullId === m.id).map((m, i) => {
                    const isInstalled = ollamaInstalled.some((x) => x === m.id || x.startsWith(m.id));
                    const pull = ollamaPulls[m.id];
                    const isPulling = !!pull?.pulling;
                    const pct = Math.round((pull?.percent || 0) * 100);
                    const selected = selectedOllamaModel === m.id;
                    // Collapsed download view — ONLY the model being pulled
                    // shows, enlarged, with a big progress bar (percent + size).
                    if (isPulling) {
                      return (
                        <div key={m.id} className="ovio-card"
                          style={{
                            ...fade(i + 5),
                            border: `2px solid ${COLORS.blue}`,
                            background: COLORS.surface,
                            borderRadius: 12, padding: "18px 16px", flex: "none",
                          }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>{m.title}</span>
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: COLORS.blue, background: `${COLORS.blue}14`, borderRadius: 4, padding: "1px 6px" }}>DOWNLOADING</span>
                              </div>
                              <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 2 }}>
                                Fetching {m.size} from Ollama…
                              </div>
                            </div>
                            <span style={{ fontSize: 16, fontWeight: 800, color: COLORS.blue, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                          </div>
                          <div style={{ marginTop: 12, height: 8, borderRadius: 4, background: COLORS.border, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${pct}%`,
                              background: COLORS.accent, borderRadius: 4, transition: "width 300ms ease",
                            }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10.5, color: COLORS.textTertiary }}>
                            <span>{m.size} total</span>
                            <span style={{ fontWeight: 700, color: COLORS.textSecondary }}>{pct}% downloaded</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={m.id}
                        onClick={() => isInstalled && setSelectedOllamaModel(m.id)}
                        className="ovio-card"
                        style={{
                          ...fade(i + 5),
                          display: "flex", alignItems: "center", gap: 12,
                          border: `2px solid ${selected ? COLORS.green : COLORS.border}`,
                          background: selected ? `${COLORS.green}0d` : COLORS.surface,
                          borderRadius: 12, padding: "12px 14px",
                          cursor: isInstalled ? "pointer" : "default",
                          flex: "none",
                        }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text }}>{m.title}</span>
                            {m.recommended && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: COLORS.green, background: `${COLORS.green}14`, borderRadius: 4, padding: "1px 5px" }}>BEST</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 2 }}>{m.desc} · {m.size}</div>
                        </div>
                        {pull?.error ? (
                          <span style={{ fontSize: 10, color: COLORS.red, maxWidth: 130, textAlign: "right", lineHeight: 1.4 }}>{pull.error}</span>
                        ) : isInstalled ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: COLORS.green }}>
                            {selected ? (<>Selected <Check size={13} /></>) : "Ready"}
                          </span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); pullOllama(m.id); }}
                            disabled={!ollamaStatus?.ok || checkingOllama}
                            style={{
                              display: "flex", alignItems: "center", gap: 4, border: "none",
                              background: ollamaStatus?.ok ? COLORS.green : COLORS.border, color: "#fff",
                              fontSize: 11, fontWeight: 700, borderRadius: 7, padding: "6px 12px",
                              cursor: ollamaStatus?.ok ? "pointer" : "default", fontFamily: FONT,
                              flexShrink: 0,
                            }}>
                            <Download size={12} /> Pull
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textTertiary, ...fade(8) }}>
                  Requires <span style={{ fontFamily: "monospace" }}>ollama serve</span> running locally — missing models pull with one click.
                </div>
              </>
            )}
          </>
        )}

        {stepId === "download" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, ...fade(0) }}>
              {sectionTitle(
                activeModel?.downloaded ? "Your model is ready" : `Getting ${MODEL_LABELS[localModel]} ready`,
                "Runs entirely on this Mac — nothing leaves your device."
              )}
            </div>
            <div style={{
              ...fade(1),
              border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18,
              background: COLORS.surface,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text }}>
                  {MODEL_LABELS[localModel]} <span style={{ color: COLORS.textTertiary, fontWeight: 500 }}>· {activeModel?.sizeLabel || ""}</span>
                </div>
                <div style={{
                  fontSize: 11.5, fontWeight: 700,
                  color: activeModel?.downloaded ? COLORS.green : COLORS.blue,
                }}>
                  {activeModel?.downloaded ? "✓ Complete" : `${Math.round((activeModel?.progress || 0) * 100)}%`}
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: COLORS.border, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.round((activeModel?.progress || (activeModel?.downloaded ? 1 : 0)) * 100)}%`,
                  background: activeModel?.downloaded ? COLORS.green : COLORS.accent,
                  borderRadius: 4, transition: "width 400ms ease",
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 10, lineHeight: 1.5 }}>
                {activeModel?.downloaded
                  ? "Transcription is ready to go fully offline."
                  : activeModel?.downloading
                    ? "Downloading in the background — you can continue setting up right now. We'll pop a notification when it's done."
                    : "Download will start automatically."}
                {localModel === "parakeet" && !activeModel?.engineReady && (
                  <span> Also installing the local AI engine (one-time, ~5–15 min) — everything runs on this Mac.</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {MODEL_CARDS.map((m, i) => {
                const st = modelStates.find((s) => s.id === m.id);
                return (
                  <button key={m.id} onClick={() => selectModel(m.id)} className="ovio-card"
                    style={{ ...cardStyle(localModel === m.id), ...fade(i + 2) }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{m.title}</div>
                    <div style={{ fontSize: 10.5, color: st?.downloading ? COLORS.blue : st?.downloaded ? COLORS.green : COLORS.textTertiary, marginTop: 3 }}>
                      {st?.downloading ? `${Math.round((st.progress || 0) * 100)}%`
                        : st?.downloaded ? "✓ Ready" : m.size}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {stepId === "how" && (
          <div style={{ ...fade(0, 0, true) }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.9, color: COLORS.text }}>
                Three moves. That’s <span style={{ color: COLORS.blueBright }}>it.</span>
              </div>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 6 }}>
                The whole app, in thirty seconds.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                {
                  n: "1",
                  title: "Summon it — anywhere",
                  body: shortcutChords.length > 0
                    ? "Press the shortcut inside any app. Ovio starts listening instantly — it never needs focus."
                    : "Press your global shortcut inside any app. Ovio starts listening instantly.",
                  art: shortcutChords.length > 0
                    ? <div style={{ display: "flex", gap: 6, alignItems: "center" }}>{shortcutChords.slice(0, 2).map((c) => <ChordKeys key={c} chord={c} />)}</div>
                    : null,
                },
                {
                  n: "2",
                  title: "Talk. Then close the popup.",
                  body: "A small bar pops up near your menu bar. Speak, stop — the recording files itself into your Inbox and writes its own notes.",
                  art: <WaveBars count={9} />,
                },
                {
                  n: "3",
                  title: "File it where it lives",
                  body: "Open the Dashboard, hit Move on any recording, and slide it into the right project. Search, click, done.",
                  art: null,
                },
              ].map((row, i) => (
                <div key={i} {...fade(i + 1, 0, true)} className="ovio-card" style={{
                  display: "flex", alignItems: "center", gap: 14,
                  border: `1px solid ${COLORS.border}`, borderRadius: 16,
                  background: COLORS.surface, padding: "14px 16px",
                  position: "relative", overflow: "hidden",
                }}>
                  {/* giant ghost numeral — the step number as texture */}
                  <span aria-hidden style={{
                    position: "absolute", right: 6, top: -14, fontSize: 74, fontWeight: 800,
                    letterSpacing: -4, color: COLORS.text, opacity: 0.045, pointerEvents: "none",
                    fontFamily: FONT, lineHeight: 1,
                  }}>{row.n}</span>                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.text }}>
                      <span style={{
                        color: COLORS.blueBright, marginRight: 7,
                        fontVariantNumeric: "tabular-nums",
                      }}>{row.n}</span>{row.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 3, lineHeight: 1.55, maxWidth: 380 }}>
                      {row.body}
                    </div>
                  </div>
                  {row.art && <div style={{ flexShrink: 0, opacity: 0.85, padding: "0 4px" }}>{row.art}</div>}
                </div>
              ))}
            </div>
            <div style={{
              ...fade(4), textAlign: "center",
              marginTop: 14, fontSize: 11.5, color: COLORS.textTertiary,
            }}>
              Everything else — summaries, filing, analytics — happens on its own.
            </div>
          </div>
        )}

        {stepId === "done" && (
          <div style={{ textAlign: "center", padding: "16px 0", ...fade(0) }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>You're all set.</div>
            <div style={{ fontSize: 12.5, color: COLORS.textSecondary, marginBottom: 18 }}>
              Create a project, hit record, and Ovio handles the rest.
            </div>
            <div style={{
              display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
              border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px",
              background: COLORS.surface,
            }}>
              {[
                {
                  label: shortcutInfo?.shortLabel
                    ? `Record anywhere with ${shortcutInfo.shortLabel}`
                    : "Record anywhere with the global shortcut",
                  state: "try it from any app",
                },
                {
                  label: mode === "cloud" ? "Cloud transcription (Groq Whisper — unchanged)"
                    : `Local transcription · ${MODEL_LABELS[localModel]}`,
                  state: mode !== "cloud" && !activeModel?.downloaded ? "downloading in background" : "",
                },
                {
                  label: aiProvider === "localOnly" ? "AI notes via Ollama (local)" : "AI notes via Gemini / OpenRouter",
                  state: aiProvider === "cloud" && !groqKey.trim() ? "add a key in Settings anytime" : "",
                },
              ].map((r, i) => (
                <div key={i} style={{ ...fade(i + 1), display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: COLORS.text }}>
                  <span style={{ flex: 1 }}>{r.label}</span>
                  {r.state && (
                    <span style={{ fontSize: 10.5, color: COLORS.blue, fontWeight: 500 }}>({r.state})</span>
                  )}
                  {!r.state && <Check size={13} color={COLORS.green} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation — white pill CTA + springy Back, matching the app */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button onClick={onSkip} style={{
            border: "none", background: "transparent", color: COLORS.textTertiary,
            fontSize: 12, cursor: "pointer", fontFamily: FONT, padding: "6px 8px",
            transition: "color 160ms ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textTertiary)}>
            Skip for now
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{
                display: "flex", alignItems: "center", gap: 4, border: `1px solid ${COLORS.borderStrong}`,
                background: COLORS.surface, color: COLORS.text, fontSize: 12.5, fontWeight: 600,
                borderRadius: 999, padding: "9px 16px", cursor: "pointer", fontFamily: FONT,
                transition: "transform 220ms cubic-bezier(.34,1.56,.64,1), border-color 180ms ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1.5px) scale(1.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}>
                <ArrowLeft size={13} /> Back
              </button>
            )}
            {step < stepDefs.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} style={{
                ...PILL.primary, fontSize: 12.5, padding: "9px 18px", fontFamily: FONT,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1.5px) scale(1.04)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}>
                {stepId === "download" && !activeModel?.downloaded ? "Continue in background" : "Next"}
                <ArrowRight size={13} />
              </button>
            ) : (
              <button onClick={handleComplete} style={{
                ...PILL.primary, fontSize: 12.5, padding: "9px 18px", fontFamily: FONT,
                
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1.5px) scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0) scale(1)")}>
                Get Started <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
