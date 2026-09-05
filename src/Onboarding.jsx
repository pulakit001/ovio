import { useState, useEffect, useRef } from "react";
import {
  Mic, Cloud, Cpu, KeyRound, Rocket, ArrowRight, ArrowLeft, Check, X,
  Sparkles, Brain, ShieldCheck, Zap, MessageSquareText, Download,
} from "lucide-react";
import { verifyGroqKey, verifyOpenRouterKey } from "./services/verifyKeys";
import { checkOllama, OLLAMA_DEFAULT_URL } from "./services/ollama";
import { FONT, COLORS } from "./theme";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const MODEL_LABELS = {
  small: "Whisper Small",
  turbo: "Whisper Turbo",
  large: "Whisper Large v3",
};

const MODEL_CARDS = [
  { id: "large", title: "Large v3", desc: "Most accurate", size: "~3.1 GB", recommended: true },
  { id: "turbo", title: "Turbo", desc: "Fast + accurate", size: "~1.6 GB" },
  { id: "small", title: "Small", desc: "Lightest", size: "~466 MB" },
];

const FEATURES = [
  { icon: <Mic size={15} />, title: "Live transcription", desc: "On-device Whisper or Groq cloud — your choice" },
  { icon: <Brain size={15} />, title: "AI notes, automatically", desc: "Deep, structured notes written as you talk" },
  { icon: <ShieldCheck size={15} />, title: "Private by design", desc: "Fully-local mode keeps everything on this Mac" },
];

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

export default function Onboarding({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [mode, setModeState] = useState("hybrid");
  const [localModel, setLocalModel] = useState("large");
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

  // Local model downloads
  const [modelStates, setModelStates] = useState([]);
  const downloadStartedRef = useRef(false);
  const [bgDownload, setBgDownload] = useState(false);

  const hasDownloader = !!window.electronAPI?.downloadModel;
  const isDownloadStep = mode !== "cloud" && hasDownloader;
  const stepDefs = isDownloadStep
    ? ["welcome", "mode", "ai", "download", "done"]
    : ["welcome", "mode", "ai", "done"];
  const stepId = stepDefs[step] || "welcome";

  const refreshModels = async () => {
    if (window.electronAPI?.modelsStatus) {
      try { setModelStates(await window.electronAPI.modelsStatus()); } catch {}
    }
  };

  useEffect(() => { refreshModels(); }, []);

  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return;
    const off = window.electronAPI.onDownloadProgress(() => refreshModels());
    return off;
  }, []);

  // Turn ON background download: as soon as the user picks a mode that uses
  // the local model, the recommended model starts downloading in the
  // background while they finish the rest of setup.
  useEffect(() => {
    if (!hasDownloader || mode === "cloud" || downloadStartedRef.current) return;
    downloadStartedRef.current = true;
    setBgDownload(true);
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

  const setMode = (m) => {
    setModeState(m);
    if (m === "cloud" && aiProvider === "ollama") setAiProvider("cloud");
  };

  const selectModel = (id) => {
    setLocalModel(id);
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
    setOllamaStatus(await checkOllama(ollamaUrl));
    setCheckingOllama(false);
  };

  const activeModel = modelStates.find((s) => s.id === localModel);

  const handleComplete = async () => {
    try {
      const patch = {
        mode,
        localSttModel: mode === "cloud" ? "turbo" : localModel,
        sttModel: "whisper-large-v3-turbo",
        aiProvider,
        ollamaUrl,
        ollamaModel:
          aiProvider === "ollama" && ollamaStatus?.ok && ollamaStatus.models.length > 0
            ? ollamaStatus.models[0].id
            : "",
        onboardingComplete: true,
        onboardingSkipped: false,
      };
      // Only overwrite keys when the user actually entered one — re-running
      // setup must never wipe previously saved keys.
      if (groqKey.trim()) patch.groqKeys = [{ id: genId(), name: "Primary", active: true, key: groqKey.trim() }];
      if (openrouterKey.trim()) patch.openrouterKeys = [{ id: genId(), name: "Primary", active: true, key: openrouterKey.trim() }];
      await window.settingsAPI.update(patch);
    } catch {}
    onComplete();
  };

  const cardStyle = (selected) => ({
    flex: 1,
    border: `2px solid ${selected ? COLORS.blue : COLORS.border}`,
    background: selected ? COLORS.selected : COLORS.surface,
    borderRadius: 12,
    padding: "14px",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: FONT,
    transition: "border-color 150ms ease, background 150ms ease",
  });

  const sectionTitle = (text, sub) => (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>{text}</div>
      {sub && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      background: COLORS.windowBg, fontFamily: FONT, position: "relative",
    }}>
      {/* Progress bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: COLORS.border }}>
        <div style={{
          height: "100%", background: COLORS.blue,
          width: `${((step + 1) / stepDefs.length) * 100}%`,
          transition: "width 300ms ease",
        }} />
      </div>

      {/* Step dots */}
      <div style={{ position: "absolute", top: 18, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 6 }}>
        {stepDefs.map((s, i) => (
          <div key={s} style={{
            width: i === step ? 18 : 6, height: 6, borderRadius: 3,
            background: i <= step ? COLORS.blue : COLORS.border,
            transition: "all 250ms ease",
          }} />
        ))}
      </div>

      <div style={{
        width: 540, maxWidth: "90%", background: COLORS.surface,
        border: `1px solid ${COLORS.border}`, borderRadius: 18,
        boxShadow: "0 16px 48px rgba(0,0,0,0.10)",
        padding: "32px", display: "flex", flexDirection: "column", gap: 18,
      }}>
        {stepId === "welcome" && (
          <>
            <div style={{ textAlign: "center", paddingTop: 6 }}>
              <div style={{
                width: 60, height: 60, borderRadius: 16, margin: "0 auto 16px",
                background: `linear-gradient(135deg, ${COLORS.blue}, ${COLORS.purple})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 8px 24px rgba(180,85,45,0.28)",
              }}>
                <Mic size={28} color="#fff" />
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: COLORS.text, letterSpacing: -0.5 }}>
                Welcome to Ovio
              </div>
              <div style={{ fontSize: 13.5, color: COLORS.textSecondary, marginTop: 6, lineHeight: 1.6 }}>
                Record, transcribe, and turn every conversation into<br />deep, structured AI notes.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {FEATURES.map((f) => (
                <div key={f.title} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "12px 14px",
                  background: COLORS.surface,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, background: `${COLORS.blue}14`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>{f.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{f.title}</div>
                    <div style={{ fontSize: 11.5, color: COLORS.textTertiary }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, textAlign: "center" }}>
              Setup takes under a minute — you can skip anything and change it later.
            </div>
          </>
        )}

        {stepId === "mode" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${COLORS.blue}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Mic size={17} color={COLORS.blue} />
              </div>
              {sectionTitle("How should transcription run?", "You can change this anytime in Settings.")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { id: "local", icon: <Cpu size={18} />, title: "Local", desc: "On-device Whisper. Private, works offline." },
                { id: "hybrid", icon: <Zap size={18} />, title: "Hybrid", desc: "Local first, cloud backup. Recommended." },
                { id: "cloud", icon: <Cloud size={18} />, title: "Cloud", desc: "Groq Whisper. Fastest — needs a key." },
              ].map((m) => (
                <button key={m.id} onClick={() => setMode(m.id)} style={cardStyle(mode === m.id)}>
                  <div style={{ color: mode === m.id ? COLORS.blue : COLORS.textSecondary, marginBottom: 8 }}>{m.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5 }}>{m.desc}</div>
                </button>
              ))}
            </div>

            {mode !== "cloud" && hasDownloader && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                  Pick your on-device model
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {MODEL_CARDS.map((m) => {
                    const st = modelStates.find((s) => s.id === m.id);
                    return (
                      <button key={m.id} onClick={() => selectModel(m.id)} style={cardStyle(localModel === m.id)}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${COLORS.purple}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={17} color={COLORS.purple} />
              </div>
              {sectionTitle("Who writes your AI notes?", "Notes are generated automatically from every transcript.")}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setAiProvider("cloud")} style={cardStyle(aiProvider === "cloud")}>
                <div style={{ color: aiProvider === "cloud" ? COLORS.purple : COLORS.textSecondary, marginBottom: 6 }}><Cloud size={18} /></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Cloud AI</div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 3 }}>Groq + OpenRouter. Fast, free tiers available.</div>
              </button>
              <button onClick={() => setAiProvider("ollama")} style={cardStyle(aiProvider === "ollama")}>
                <div style={{ color: aiProvider === "ollama" ? COLORS.green : COLORS.textSecondary, marginBottom: 6 }}><Cpu size={18} /></div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Ollama (local)</div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.5, marginTop: 3 }}>A model on this Mac. No keys, fully private.</div>
              </button>
            </div>

            {aiProvider === "cloud" ? (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={groqKey} onChange={(e) => { setGroqKey(e.target.value); setGroqStatus(null); }}
                    placeholder="Groq key — gsk_...  (console.groq.com/keys)" style={inputStyle} />
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
                <div style={{ display: "flex", gap: 8 }}>
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
                <div style={{ fontSize: 11.5, color: COLORS.textTertiary }}>
                  Keys are stored encrypted on this device only. You can also skip and add them later.
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8 }}>
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
                    {ollamaStatus.ok ? `Connected — ${ollamaStatus.models.length} model${ollamaStatus.models.length === 1 ? "" : "s"} found` : ollamaStatus.error}
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: COLORS.textTertiary }}>
                  Requires <span style={{ fontFamily: "monospace" }}>ollama serve</span> running locally
                  and a model (<span style={{ fontFamily: "monospace" }}>ollama pull llama3.2</span>).
                </div>
              </>
            )}
          </>
        )}

        {stepId === "download" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${COLORS.blue}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Download size={17} color={COLORS.blue} />
              </div>
              {sectionTitle(
                activeModel?.downloaded ? "Your model is ready" : `Getting ${MODEL_LABELS[localModel]} ready`,
                "Runs entirely on this Mac — nothing leaves your device."
              )}
            </div>
            <div style={{
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
                  background: activeModel?.downloaded ? COLORS.green : COLORS.blue,
                  borderRadius: 4, transition: "width 400ms ease",
                }} />
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 10, lineHeight: 1.5 }}>
                {activeModel?.downloaded
                  ? "Transcription is ready to go fully offline."
                  : activeModel?.downloading
                    ? "Downloading in the background — you can continue setting up right now. We'll pop a notification when it's done."
                    : "Download will start automatically."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {MODEL_CARDS.map((m) => {
                const st = modelStates.find((s) => s.id === m.id);
                return (
                  <button key={m.id} onClick={() => selectModel(m.id)} style={cardStyle(localModel === m.id)}>
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

        {stepId === "done" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: 15, margin: "0 auto 16px",
              background: `${COLORS.green}14`, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Rocket size={26} color={COLORS.green} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>You're all set!</div>
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
                  icon: <Mic size={14} color={COLORS.blue} />,
                  label: mode === "cloud" ? "Cloud transcription (Groq Whisper)"
                    : `${mode === "local" ? "Local" : "Hybrid"} transcription · ${MODEL_LABELS[localModel]}`,
                  state: mode !== "cloud" && !activeModel?.downloaded ? "downloading in background" : "",
                },
                {
                  icon: aiProvider === "ollama" ? <Cpu size={14} color={COLORS.green} /> : <MessageSquareText size={14} color={COLORS.purple} />,
                  label: aiProvider === "ollama" ? "AI notes via Ollama (local)" : "AI notes via Groq / OpenRouter",
                  state: aiProvider === "cloud" && !groqKey.trim() ? "add a key in Settings anytime" : "",
                },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: COLORS.text }}>
                  {r.icon}
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

        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <button onClick={onSkip} style={{
            border: "none", background: "transparent", color: COLORS.textTertiary,
            fontSize: 12, cursor: "pointer", fontFamily: FONT, padding: "6px 8px",
          }}>
            Skip for now
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{
                display: "flex", alignItems: "center", gap: 4, border: `1px solid ${COLORS.borderStrong}`,
                background: COLORS.surface, color: COLORS.text, fontSize: 12.5, fontWeight: 600,
                borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontFamily: FONT,
              }}>
                <ArrowLeft size={13} /> Back
              </button>
            )}
            {step < stepDefs.length - 1 ? (
              <button onClick={() => setStep((s) => s + 1)} style={{
                display: "flex", alignItems: "center", gap: 4, border: "none",
                background: COLORS.blue, color: "#fff", fontSize: 12.5, fontWeight: 600,
                borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT,
              }}>
                {stepId === "download" && !activeModel?.downloaded ? "Continue in background" : "Next"}
                <ArrowRight size={13} />
              </button>
            ) : (
              <button onClick={handleComplete} style={{
                display: "flex", alignItems: "center", gap: 4, border: "none",
                background: COLORS.blue, color: "#fff", fontSize: 12.5, fontWeight: 600,
                borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontFamily: FONT,
              }}>
                Get Started <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
