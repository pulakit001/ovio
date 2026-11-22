import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Cpu,
  Download,
  FolderInput,
  Mic,
  Sparkles,
} from "lucide-react";
import { COLORS, CTA, FONT } from "../ui/theme";

// Three steps, in the order a new person actually needs them:
//   1. What should Ovio call you?
//   2. Download the speech model so transcription works offline.
//   3. A short guided tour of the app.
// Cloud keys, Ollama and the rest of the settings live in Settings — setup
// stays about getting one recording working, not configuring everything.

const MODEL_CARDS = [
  {
    id: "parakeet",
    title: "Parakeet v3",
    desc: "Streams live as you speak",
    size: "~2.5 GB",
    recommended: true,
  },
  {
    id: "large",
    title: "Whisper Large v3",
    desc: "Highest accuracy, transcribes in chunks",
    size: "~3.1 GB",
  },
];

const MODEL_LABELS = {
  parakeet: "Parakeet v3",
  large: "Whisper Large v3",
};

const ONBOARDING_CSS = `
@keyframes ovioStepIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ovioFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ovioSpin { to { transform: rotate(360deg); } }
@keyframes ovioPop { 0% { transform: scale(.4); opacity: 0; } 65% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes ovioHandWave { 0%, 60%, 100% { transform: rotate(0deg); } 10% { transform: rotate(16deg); } 20% { transform: rotate(-8deg); } 30% { transform: rotate(14deg); } 40% { transform: rotate(-4deg); } 50% { transform: rotate(10deg); } }
.ovio-hand { display: inline-block; transform-origin: 70% 75%; animation: ovioHandWave 2.4s ease-in-out 400ms infinite; }
.ovio-name-input {
  width: 100%; box-sizing: border-box; text-align: center; border: none; outline: none;
  background: transparent; font-family: inherit; font-size: 30px; font-weight: 500;
  letter-spacing: -0.03em; padding: 10px 4px 12px;
  border-bottom: 2px solid var(--ovio-border-strong);
  transition: border-color 200ms ease;
}
.ovio-name-input:focus { border-bottom-color: var(--ovio-text); }
.ovio-name-input::placeholder { color: var(--ovio-text); opacity: 0.25; }
.ovio-onb-card { transition: border-color 180ms ease, background 180ms ease; }
.ovio-onb-card:hover { border-color: var(--ovio-border-strong); }
@media (prefers-reduced-motion: reduce) {
  .ovio-hand { animation: none; }
  .ovio-onb * { animation: none !important; }
}
`;

function useFirstName() {
  const [name, setName] = useState("");
  const touched = useRef(false);
  useEffect(() => {
    window.electronAPI?.userName?.()
      .then((full) => {
        const first = String(full || "").trim().split(/\s+/)[0] || "";
        if (first && !touched.current) setName(first.charAt(0).toUpperCase() + first.slice(1));
      })
      .catch(() => {});
  }, []);
  return [name, setName, touched];
}

export default function Onboarding({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [name, setName, nameTouched] = useFirstName();
  const firstName = name.trim();

  const [localModel, setLocalModel] = useState(
    window.electronAPI?.parakeetAPI ? "parakeet" : "large"
  );
  const [modelStates, setModelStates] = useState([]);
  const [shortcut, setShortcut] = useState(null);
  const startedFor = useRef(new Set());

  const hasDownloader = !!window.electronAPI?.downloadModel;
  const modelCards = window.electronAPI?.parakeetAPI
    ? MODEL_CARDS
    : MODEL_CARDS.filter((model) => model.id !== "parakeet");
  const stepDefs = hasDownloader ? ["name", "model", "done"] : ["name", "done"];
  const stepId = stepDefs[step] || "name";

  const refreshModels = useCallback(async () => {
    let states = [];
    if (window.electronAPI?.modelsStatus) {
      try { states = await window.electronAPI.modelsStatus(); } catch {}
    }
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
            engineInstalling: pk?.engine?.state === "installing",
          },
          ...states,
        ];
      } catch {}
    }
    setModelStates(states);
  }, []);

  useEffect(() => { refreshModels(); }, [refreshModels]);

  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return undefined;
    const off = window.electronAPI.onDownloadProgress(() => refreshModels());
    return off;
  }, [refreshModels]);

  useEffect(() => {
    const api = window.electronAPI?.parakeetAPI;
    if (!api?.onStatus) return undefined;
    return api.onStatus(() => refreshModels());
  }, [refreshModels]);

  // The registered global shortcut, so the final step can name the real chord.
  useEffect(() => {
    if (!window.electronAPI?.ambient?.onShortcut) return undefined;
    return window.electronAPI.ambient.onShortcut((info) => setShortcut(info || null));
  }, []);

  const activeModel = modelStates.find((state) => state.id === localModel);

  const startParakeet = useCallback(() => {
    const api = window.electronAPI?.parakeetAPI;
    if (!api) return;
    api.installEngine?.().then(refreshModels).catch(() => {});
    api.downloadWeights?.().then(refreshModels).catch(() => {});
  }, [refreshModels]);

  const startDownload = useCallback((id) => {
    if (!hasDownloader) return;
    if (startedFor.current.has(id)) return;
    startedFor.current.add(id);
    if (id === "parakeet") {
      startParakeet();
      return;
    }
    window.electronAPI.modelsStatus?.()
      .then((states) => {
        const target = (states || []).find((state) => state.id === id);
        if (target && !target.downloaded && !target.downloading) {
          return window.electronAPI.downloadModel(id);
        }
        return null;
      })
      .then(refreshModels)
      .catch(refreshModels);
  }, [hasDownloader, refreshModels, startParakeet]);

  // Begin downloading as soon as the model step appears, and whenever the
  // person picks a different model — "let's download the model so it works".
  useEffect(() => {
    if (stepId !== "model") return;
    startDownload(localModel);
  }, [stepId, localModel, startDownload]);

  const selectModel = (id) => {
    setLocalModel(id);
    startDownload(id);
  };

  const canContinue = stepId !== "name" || firstName.length > 0;

  const next = () => {
    if (!canContinue) return;
    setStep((current) => Math.min(current + 1, stepDefs.length - 1));
  };
  const back = () => setStep((current) => Math.max(current - 1, 0));

  const handleComplete = async () => {
    const patch = {
      mode: "local",
      localSttModel: localModel,
      sttModel: "whisper-large-v3-turbo",
      onboardingComplete: true,
      onboardingSkipped: false,
      userName: firstName,
      tourComplete: false,
    };
    const flush = Promise.resolve(window.settingsAPI?.update(patch)).catch((err) => {
      console.warn("Onboarding settings save failed:", err?.message || err);
    });
    // Never let a stalled IPC leave "Start the tour" feeling dead.
    await Promise.race([flush, new Promise((resolve) => setTimeout(resolve, 4000))]);
    onComplete();
  };

  const handleSkip = async () => {
    if (firstName) await window.settingsAPI?.update?.({ userName: firstName });
    onSkip();
  };

  const downloading = !!activeModel?.downloading;
  const downloaded = !!activeModel?.downloaded;
  const percent = Math.round((activeModel?.progress || (downloaded ? 1 : 0)) * 100);

  const cardStyle = (selected) => ({
    flex: 1,
    minWidth: 0,
    position: "relative",
    border: `1.5px solid ${selected ? COLORS.borderStrong : COLORS.border}`,
    background: selected ? COLORS.selected : COLORS.surface,
    borderRadius: 16,
    padding: 14,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: FONT,
    transition: "border-color 180ms ease, background 180ms ease",
  });

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      background: COLORS.windowBg, fontFamily: FONT, position: "relative", overflow: "hidden",
    }}>
      <style>{ONBOARDING_CSS}</style>

      {/* Progress — a thin line at the very top and quiet step dots. */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: COLORS.border }}>
        <div style={{
          height: "100%",
          width: `${((step + 1) / stepDefs.length) * 100}%`,
          background: COLORS.accent,
          transition: "width 500ms cubic-bezier(.16,1,.3,1)",
        }} />
      </div>
      <div style={{ position: "absolute", top: 20, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
        {stepDefs.map((id, index) => (
          <div key={id} style={{
            width: index === step ? 20 : 6, height: 6, borderRadius: 3,
            background: index <= step ? COLORS.text : COLORS.borderStrong,
            opacity: index <= step ? 1 : 0.5,
            transition: "all 380ms cubic-bezier(.34,1.56,.64,1)",
          }} />
        ))}
      </div>

      {/* Step content — one open centered column, no card box around it. */}
      <div className="ovio-onb" key={stepId} style={{
        width: 600, maxWidth: "90%", maxHeight: "84vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 20, alignItems: "center",
        animation: "ovioStepIn 420ms cubic-bezier(.22,1,.36,1) both",
        padding: "10px 0",
      }}>

        {stepId === "name" && (
          <>
            <div style={{ textAlign: "center", paddingTop: 10, animation: "ovioFadeUp 480ms cubic-bezier(.22,1,.36,1) both" }}>
              <div style={{ fontSize: 50, lineHeight: 1, marginBottom: 18 }}>
                <span className="ovio-hand" role="img" aria-label="waving hand">👋</span>
              </div>
              <div style={{
                fontSize: 44, fontWeight: 500, letterSpacing: "-0.045em",
                lineHeight: 1.06, color: COLORS.text,
              }}>
                Hi, I’m Ovio.
              </div>
              <div style={{
                fontSize: 15, color: COLORS.textSecondary, marginTop: 12,
                lineHeight: 1.6, maxWidth: 430, marginLeft: "auto", marginRight: "auto",
              }}>
                I record, transcribe and take notes for you — privately, on this Mac.
                First, what should I call you?
              </div>
            </div>

            <form
              onSubmit={(event) => { event.preventDefault(); next(); }}
              style={{ width: "100%", maxWidth: 370, animation: "ovioFadeUp 480ms 80ms cubic-bezier(.22,1,.36,1) both" }}
            >
              <input
                className="ovio-name-input"
                autoFocus
                value={name}
                maxLength={40}
                onChange={(event) => { nameTouched.current = true; setName(event.target.value); }}
                placeholder="Your first name"
                aria-label="Your first name"
                style={{ color: COLORS.text }}
              />
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, textAlign: "center", marginTop: 10 }}>
                {firstName
                  ? `Nice to meet you, ${firstName}. Press Enter to continue.`
                  : "Only used to greet you. It never leaves this device."}
              </div>
            </form>
          </>
        )}

        {stepId === "model" && (
          <>
            <div style={{ textAlign: "center", animation: "ovioFadeUp 480ms cubic-bezier(.22,1,.36,1) both" }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, margin: "0 auto 16px",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: COLORS.surface, border: `1px solid ${COLORS.border}`,
              }}>
                {downloaded ? <Check size={22} color={COLORS.text} /> : <Download size={22} color={COLORS.textSecondary} />}
              </div>
              <div style={{
                fontSize: 36, fontWeight: 500, letterSpacing: "-0.04em",
                lineHeight: 1.1, color: COLORS.text,
              }}>
                {downloaded ? "Your model is ready." : "Let’s download your speech model."}
              </div>
              <div style={{
                fontSize: 14, color: COLORS.textSecondary, marginTop: 10,
                lineHeight: 1.6, maxWidth: 460, marginLeft: "auto", marginRight: "auto",
              }}>
                {downloaded
                  ? "Ovio can now transcribe fully offline. Nothing you say leaves this Mac."
                  : "Ovio turns speech into text on this Mac, so it needs this model once. It downloads in the background — keep going."}
              </div>
            </div>

            <div style={{ width: "100%", display: "flex", gap: 10, animation: "ovioFadeUp 480ms 80ms cubic-bezier(.22,1,.36,1) both" }}>
              {modelCards.map((model) => {
                const state = modelStates.find((entry) => entry.id === model.id);
                const selected = localModel === model.id;
                const ready = !!state?.downloaded;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => selectModel(model.id)}
                    className="ovio-onb-card"
                    style={cardStyle(selected)}
                  >
                    {selected && <Check size={14} color={COLORS.text} style={{ position: "absolute", top: 11, right: 11 }} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{model.title}</span>
                      {model.recommended && (
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em",
                          color: COLORS.textSecondary, background: COLORS.accentSoft,
                          borderRadius: 999, padding: "2px 7px",
                        }}>RECOMMENDED</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 4 }}>
                      {model.desc} · {model.size}
                    </div>
                    <div style={{
                      fontSize: 10.5, fontWeight: 600, marginTop: 6,
                      color: ready ? COLORS.text : state?.downloading ? COLORS.accent : COLORS.textTertiary,
                    }}>
                      {ready ? "Ready" : state?.downloading ? `Downloading… ${Math.round((state.progress || 0) * 100)}%` : "Will download now"}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{
              width: "100%", border: `1px solid ${COLORS.border}`, borderRadius: 16,
              background: COLORS.surface, padding: 18,
              animation: "ovioFadeUp 480ms 140ms cubic-bezier(.22,1,.36,1) both",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
                  {MODEL_LABELS[localModel]}
                  <span style={{ color: COLORS.textTertiary, fontWeight: 500 }}>
                    {" "}· {activeModel?.sizeLabel || (localModel === "parakeet" ? "~2.5 GB" : "~3.1 GB")}
                  </span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: downloaded ? COLORS.text : COLORS.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                  {downloaded ? "✓ Complete" : downloading ? `${percent}%` : "Waiting"}
                </div>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: COLORS.border, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${downloaded ? 100 : percent}%`,
                  background: COLORS.accent, borderRadius: 4,
                  transition: "width 400ms ease",
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 10, lineHeight: 1.5 }}>
                {downloaded
                  ? "Ready — local transcription is on."
                  : downloading
                    ? "Downloading in the background. You can continue setting up; we’ll let you know when it’s done."
                    : "Starting the download…"}
                {localModel === "parakeet" && !activeModel?.engineReady && (
                  <span> The local AI engine also installs once (~5–15 min), entirely on this Mac.</span>
                )}
              </div>
            </div>
          </>
        )}

        {stepId === "done" && (
          <div style={{ textAlign: "center", width: "100%", paddingTop: 8 }}>
            <div style={{
              width: 58, height: 58, borderRadius: 999, margin: "0 auto 18px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: COLORS.accentSoft, border: `1px solid ${COLORS.border}`,
              animation: "ovioPop 460ms cubic-bezier(.3,1.4,.4,1) both",
            }}>
              <Sparkles size={24} color={COLORS.text} />
            </div>
            <div style={{
              fontSize: 34, fontWeight: 500, letterSpacing: "-0.04em",
              color: COLORS.text, marginBottom: 9, lineHeight: 1.15,
            }}>
              You’re all set{firstName ? `, ${firstName}` : ""}.
            </div>
            <div style={{
              fontSize: 14, color: COLORS.textSecondary, marginBottom: 22,
              lineHeight: 1.6, maxWidth: 430, marginLeft: "auto", marginRight: "auto",
            }}>
              Next, a 30-second tour so you know where everything lives.
            </div>

            <div style={{
              display: "flex", flexDirection: "column", gap: 8, textAlign: "left",
              border: `1px solid ${COLORS.border}`, borderRadius: 16,
              padding: "14px 16px", background: COLORS.surface,
            }}>
              {[
                {
                  icon: <Cpu size={14} color={COLORS.textSecondary} />,
                  label: downloaded
                    ? `Local transcription · ${MODEL_LABELS[localModel]}`
                    : `Local transcription · ${MODEL_LABELS[localModel]}`,
                  state: downloaded ? "Ready" : "Downloading in background",
                },
                {
                  icon: <Sparkles size={14} color={COLORS.textSecondary} />,
                  label: "AI notes & library answers",
                  state: "Add a key in Settings",
                },
                {
                  icon: <Mic size={14} color={COLORS.textSecondary} />,
                  label: shortcut?.shortLabel
                    ? `Record anywhere with ${shortcut.shortLabel}`
                    : "Record from anywhere with a global shortcut",
                  state: "From any app",
                },
                {
                  icon: <FolderInput size={14} color={COLORS.textSecondary} />,
                  label: "Your recordings live in projects",
                  state: "In the Recorder",
                },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: COLORS.text }}>
                  <span style={{ display: "flex", flexShrink: 0 }}>{row.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>{row.label}</span>
                  <span style={{ fontSize: 10.5, color: COLORS.textTertiary, fontWeight: 500, whiteSpace: "nowrap" }}>
                    {row.state}
                  </span>
                </div>
              ))}
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              fontSize: 11.5, color: COLORS.textTertiary, marginTop: 16,
            }}>
              <Cloud size={12} /> Cloud keys and other preferences stay in Settings.
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: 4 }}>
          <button
            onClick={handleSkip}
            style={{
              border: "none", background: "transparent", color: COLORS.textTertiary,
              fontSize: 12, cursor: "pointer", fontFamily: FONT, padding: "6px 8px",
              transition: "color 160ms ease",
            }}
            onMouseEnter={(event) => { event.currentTarget.style.color = COLORS.textSecondary; }}
            onMouseLeave={(event) => { event.currentTarget.style.color = COLORS.textTertiary; }}
          >
            Skip for now
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button
                onClick={back}
                style={{
                  display: "flex", alignItems: "center", gap: 4, border: `1px solid ${COLORS.border}`,
                  background: "transparent", color: COLORS.textSecondary, fontSize: 12.5, fontWeight: 600,
                  borderRadius: 999, padding: "9px 16px", cursor: "pointer", fontFamily: FONT,
                  transition: "border-color 180ms ease, color 180ms ease",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.borderColor = COLORS.borderStrong;
                  event.currentTarget.style.color = COLORS.text;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.borderColor = COLORS.border;
                  event.currentTarget.style.color = COLORS.textSecondary;
                }}
              >
                <ArrowLeft size={13} /> Back
              </button>
            )}

            {stepId !== "done" ? (
              <button
                onClick={next}
                disabled={!canContinue}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  border: "none", borderRadius: 999, padding: "9px 18px",
                  background: CTA.bg, color: CTA.fg, fontFamily: FONT,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: canContinue ? "pointer" : "default",
                  opacity: canContinue ? 1 : 0.4,
                }}
              >
                {stepId === "model" && !downloaded ? "Continue in background" : "Next"}
                <ArrowRight size={13} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                  border: "none", borderRadius: 999, padding: "10px 20px",
                  background: CTA.bg, color: CTA.fg, fontFamily: FONT,
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                Start the tour <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
