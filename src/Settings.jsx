import { useState, useEffect } from "react";
import {
  X, Cloud, Cpu, KeyRound, Plus, Trash2, Check, X as XIcon,
  Cpu as CpuIcon, Download, Upload, Server,
} from "lucide-react";
import { verifyGroqKey, verifyOpenRouterKey } from "./services/verifyKeys";
import { checkOllama } from "./services/ollama";
import { FONT, COLORS } from "./theme";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function KeyRow({ entry, provider, onUpdate, onRemove, onToggle }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const verify = async () => {
    setVerifying(true);
    setStatus(null);
    const res = provider === "groq" ? await verifyGroqKey(value) : await verifyOpenRouterKey(value);
    setStatus(res);
    setVerifying(false);
    if (res.ok) {
      onUpdate({ ...entry, key: value, name: entry.name || "Key" });
      setEditing(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <button onClick={() => onToggle(entry.id)} title="Toggle active"
        style={{
          width: 30, height: 18, borderRadius: 9, border: "none",
          background: entry.active ? COLORS.green : COLORS.borderStrong,
          cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 150ms ease",
        }}>
        <div style={{
          position: "absolute", top: 2, width: 14, height: 14, borderRadius: 999, background: "#fff",
          left: entry.active ? 14 : 2, transition: "left 150ms ease",
        }} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input autoFocus value={value} onChange={(e) => { setValue(e.target.value); setStatus(null); }}
              placeholder={provider === "groq" ? "gsk_..." : "sk-or-v1-..."}
              style={{ flex: 1, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface, borderRadius: 6, padding: "6px 8px" }} />
            <button onClick={verify} disabled={verifying || !value.trim()}
              style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}>
              {verifying ? "…" : "Save"}
            </button>
            {status && (
              <span style={{ fontSize: 11, color: status.ok ? COLORS.green : COLORS.red }}>{status.ok ? "✓" : "✗"}</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 500, color: entry.active ? COLORS.text : COLORS.textTertiary }}>{entry.name || "Key"}</span>
            <span style={{ fontSize: 11, color: COLORS.textTertiary, fontFamily: "monospace" }}>{entry.masked || (entry.hasKey ? "••••" : "no key")}</span>
          </div>
        )}
      </div>
      <button onClick={() => setEditing((e) => !e)} style={{ border: "none", background: "transparent", color: COLORS.textSecondary, cursor: "pointer", padding: 4 }}>
        <Server size={13} />
      </button>
      <button onClick={() => onRemove(entry.id)} style={{ border: "none", background: "transparent", color: COLORS.textTertiary, cursor: "pointer", padding: 4 }}>
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export default function Settings({ onClose, mode, setMode, sttModel, setSttModel, localSttModel, setLocalSttModel, agentSkills, setAgentSkills, aiProvider, setAiProvider, ollamaUrl, setOllamaUrl, ollamaModel, setOllamaModel, setFullyLocal, onExport, onImport, onClearAll, onKeysChanged }) {
  const [groqKeys, setGroqKeys] = useState([]);
  const [openrouterKeys, setOpenrouterKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [showAddGroq, setShowAddGroq] = useState(false);
  const [showAddOr, setShowAddOr] = useState(false);
  const [newGroq, setNewGroq] = useState("");
  const [newOr, setNewOr] = useState("");
  const [saved, setSaved] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const fileInputRef = { current: null };

  const refreshKeys = async () => {
    if (window.settingsAPI) {
      const plain = await window.settingsAPI.getPlain();
      setGroqKeys(plain.groqKeys || []);
      setOpenrouterKeys(plain.openrouterKeys || []);
    }
    setLoadingKeys(false);
  };

  useEffect(() => {
    refreshKeys();
  }, []);

  // Auto-probe Ollama when a local provider option is selected.
  useEffect(() => {
    if (aiProvider && aiProvider !== "cloud") {
      checkOllamaConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiProvider]);

  const checkOllamaConnection = async () => {
    setCheckingOllama(true);
    const res = await checkOllama(ollamaUrl);
    setOllamaStatus(res);
    if (res.ok && !ollamaModel && res.models.length > 0) {
      setOllamaModel(res.models[0].id);
    }
    setCheckingOllama(false);
  };

  // Local Whisper model catalog (downloaded on demand, runs on-device)
  const [modelStates, setModelStates] = useState([]);
  const refreshModelStatus = async () => {
    if (window.electronAPI?.modelsStatus) {
      try { setModelStates(await window.electronAPI.modelsStatus()); } catch {}
    }
  };
  useEffect(() => { refreshModelStatus(); }, []);
  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return;
    const off = window.electronAPI.onDownloadProgress(() => refreshModelStatus());
    return off;
  }, []);
  const startModelDownload = (id) => {
    window.electronAPI.downloadModel(id).then(refreshModelStatus).catch(refreshModelStatus);
  };

  const save = async () => {
    await window.settingsAPI.update({
      mode: mode ?? "hybrid",
      sttModel: sttModel ?? "whisper-large-v3-turbo",
      localSttModel: localSttModel ?? "turbo",
      agentSkills,
      aiProvider: aiProvider ?? "cloud",
      ollamaUrl: ollamaUrl ?? "http://localhost:11434",
      ollamaModel: ollamaModel ?? "",
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const addGroq = async () => {
    if (!newGroq.trim()) return;
    const updated = [...groqKeys, { id: genId(), name: `Key ${groqKeys.length + 1}`, active: true, key: newGroq.trim() }];
    await window.settingsAPI.update({ groqKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    setGroqKeys(updated);
    setShowAddGroq(false);
    setNewGroq("");
    onKeysChanged?.();
  };

  const addOr = async () => {
    if (!newOr.trim()) return;
    const updated = [...openrouterKeys, { id: genId(), name: `Key ${openrouterKeys.length + 1}`, active: true, key: newOr.trim() }];
    await window.settingsAPI.update({ openrouterKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    setOpenrouterKeys(updated);
    setShowAddOr(false);
    setNewOr("");
    onKeysChanged?.();
  };

  const updateKey = async (provider, entry) => {
    if (provider === "groq") {
      const updated = groqKeys.map((k) => (k.id === entry.id ? entry : k));
      setGroqKeys(updated);
      await window.settingsAPI.update({ groqKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    } else {
      const updated = openrouterKeys.map((k) => (k.id === entry.id ? entry : k));
      setOpenrouterKeys(updated);
      await window.settingsAPI.update({ openrouterKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    }
    onKeysChanged?.();
  };

  const removeKey = async (provider, id) => {
    if (provider === "groq") {
      const updated = groqKeys.filter((k) => k.id !== id);
      setGroqKeys(updated);
      await window.settingsAPI.update({ groqKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    } else {
      const updated = openrouterKeys.filter((k) => k.id !== id);
      setOpenrouterKeys(updated);
      await window.settingsAPI.update({ openrouterKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    }
    onKeysChanged?.();
  };

  const toggleKey = async (provider, id) => {
    if (provider === "groq") {
      const updated = groqKeys.map((k) => (k.id === id ? { ...k, active: !k.active } : k));
      setGroqKeys(updated);
      await window.settingsAPI.update({ groqKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    } else {
      const updated = openrouterKeys.map((k) => (k.id === id ? { ...k, active: !k.active } : k));
      setOpenrouterKeys(updated);
      await window.settingsAPI.update({ openrouterKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    }
    onKeysChanged?.();
  };

  // Agent skill sections removed — the AI now outputs one in-depth summary.

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT,
      background: "rgba(0,0,0,0.32)",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 560, maxWidth: "90%", maxHeight: "85vh", overflowY: "auto",
        background: COLORS.surface,
        borderRadius: 18, padding: "24px",
        boxShadow: "0 24px 70px rgba(0,0,0,0.30)",
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.text, letterSpacing: -0.3 }}>Settings</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, color: COLORS.textTertiary }}>⌘,</span>
            <button onClick={onClose} style={{ border: "none", background: "transparent", color: COLORS.textSecondary, cursor: "pointer", padding: 4, borderRadius: 4 }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mode */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Transcription Mode</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { id: "local", icon: <Cpu size={16} />, title: "Local", desc: "On-device Whisper" },
              { id: "hybrid", icon: <Server size={16} />, title: "Hybrid", desc: "Local + cloud" },
              { id: "cloud", icon: <Cloud size={16} />, title: "Cloud", desc: "Groq Whisper only" },
            ].map((m) => (
              <button key={m.id} onClick={() => setMode(m.id)}
                style={{
                  flex: 1, border: `1.5px solid ${mode === m.id ? COLORS.blue : COLORS.border}`,
                  background: mode === m.id ? COLORS.selected : COLORS.surface,
                  borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: FONT,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                {m.icon} <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{m.title}</div>
                  <div style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* AI Notes Provider */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>AI Notes Provider</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { id: "cloud", icon: <Cloud size={16} />, title: "Cloud", desc: "Groq + OpenRouter" },
              { id: "ollama", icon: <Cpu size={16} />, title: "Ollama", desc: "Local model first" },
              { id: "localOnly", icon: <Cpu size={16} />, title: "Fully Local", desc: "Ollama only · offline" },
            ].map((p) => (
              <button key={p.id}
                onClick={() => {
                  if (p.id === "localOnly") {
                    // Fully local = local Whisper STT + Ollama for notes.
                    if (setFullyLocal) setFullyLocal();
                    else setAiProvider("localOnly");
                  } else {
                    setAiProvider(p.id);
                  }
                }}
                style={{
                  flex: 1, border: `1.5px solid ${aiProvider === p.id ? COLORS.blue : COLORS.border}`,
                  background: aiProvider === p.id ? COLORS.selected : COLORS.surface,
                  borderRadius: 10, padding: "12px", cursor: "pointer", fontFamily: FONT,
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                {p.icon} <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{p.title}</div>
                  <div style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{p.desc}</div>
                </div>
              </button>
            ))}
          </div>
          {aiProvider === "cloud" && (
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 6 }}>
              Cloud first — if all keys fail, a local Ollama model is used as a last-resort fallback.
            </div>
          )}
          {aiProvider === "ollama" && (
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 6 }}>
              Local-first — Ollama generates notes on your machine; cloud keys are used only if Ollama is unavailable.
            </div>
          )}
          {aiProvider === "localOnly" && (
            <div style={{ fontSize: 11, color: COLORS.green, marginTop: 6 }}>
              Fully local — on-device Whisper transcribes and Ollama writes your notes. Nothing leaves your machine.
            </div>
          )}

          {/* Ollama configuration */}
          {aiProvider !== "cloud" && (
            <div style={{ marginTop: 10, padding: 12, border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.sidebarBg }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Ollama Server</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input value={ollamaUrl || ""} onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{ flex: 1, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface, borderRadius: 6, padding: "6px 8px" }} />
                <button onClick={checkOllamaConnection} disabled={checkingOllama}
                  style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "6px 10px", cursor: checkingOllama ? "default" : "pointer", fontFamily: FONT }}>
                  {checkingOllama ? "…" : "Check"}
                </button>
              </div>
              {ollamaStatus && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, marginBottom: ollamaStatus.ok && ollamaStatus.models.length > 0 ? 8 : 0, color: ollamaStatus.ok ? COLORS.green : COLORS.red }}>
                  {ollamaStatus.ok ? <Check size={13} /> : <XIcon size={13} />}
                  {ollamaStatus.ok ? `Connected — ${ollamaStatus.models.length} model${ollamaStatus.models.length === 1 ? "" : "s"} available` : ollamaStatus.error}
                </div>
              )}
              {ollamaStatus?.ok && ollamaStatus.models.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: COLORS.textTertiary, marginBottom: 4 }}>Model</div>
                  <select value={ollamaModel || ""} onChange={(e) => setOllamaModel(e.target.value)}
                    style={{ width: "100%", border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface, borderRadius: 6, padding: "6px 8px" }}>
                    {!ollamaModel && <option value="">Auto (first installed model)</option>}
                    {ollamaStatus.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 8, lineHeight: 1.5 }}>
                Requires Ollama running locally (<span style={{ fontFamily: "monospace" }}>ollama serve</span>). Install a model with <span style={{ fontFamily: "monospace" }}>ollama pull llama3.2</span>.
              </div>
            </div>
          )}
        </div>

        {/* Local STT model */}
        {mode !== "cloud" && window.electronAPI && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Local STT Model</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { id: "small", title: "Small", desc: "Lightest · basic accuracy", size: "~466 MB" },
                { id: "turbo", title: "Turbo", desc: "Fast · great balance", size: "~1.6 GB" },
                { id: "large", title: "Large v3", desc: "Most accurate local model", size: "~3.1 GB" },
              ].map((m) => {
                const st = modelStates.find((s) => s.id === m.id);
                const downloaded = st?.downloaded;
                const downloading = st?.downloading;
                const progress = Math.round((st?.progress || 0) * 100);
                return (
                  <button key={m.id} onClick={() => setLocalSttModel(m.id)}
                    style={{
                      flex: 1, border: `1.5px solid ${localSttModel === m.id ? COLORS.blue : COLORS.border}`,
                      background: localSttModel === m.id ? COLORS.selected : COLORS.surface,
                      borderRadius: 8, padding: "10px", cursor: "pointer", fontFamily: FONT,
                      display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
                    }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{m.title}</div>
                    <div style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{m.desc}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: downloading ? COLORS.blue : downloaded ? COLORS.green : COLORS.textTertiary }}>
                      {downloading ? `Downloading… ${progress}%` : downloaded ? "✓ Downloaded" : `Not downloaded · ${m.size}`}
                    </div>
                    {downloading && (
                      <div style={{ width: "100%", height: 3, borderRadius: 2, background: COLORS.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: COLORS.blue, transition: "width 300ms ease" }} />
                      </div>
                    )}
                    {!downloaded && !downloading && (
                      <span
                        onClick={(e) => { e.stopPropagation(); startModelDownload(m.id); }}
                        style={{ fontSize: 11, fontWeight: 600, color: COLORS.blue, cursor: "pointer" }}
                      >
                        Download {m.size}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 6, lineHeight: 1.5 }}>
              Runs entirely on your device with GPU acceleration (whisper.cpp). <strong style={{ fontWeight: 600 }}>Large v3</strong> is the most accurate — download it once and pick it for best results.
              {localSttModel && !modelStates.find((s) => s.id === localSttModel)?.downloaded && !modelStates.find((s) => s.id === localSttModel)?.downloading && (
                <span style={{ color: COLORS.red }}> Your selected model isn't downloaded yet.</span>
              )}
            </div>
          </div>
        )}

        {/* Cloud STT model */}
        {mode !== "local" && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Cloud STT Model</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { id: "whisper-large-v3-turbo", title: "Turbo", desc: "Fast · $0.04/hr" },
              { id: "whisper-large-v3", title: "Large v3", desc: "Accurate · $0.111/hr" },
            ].map((m) => (
              <button key={m.id} onClick={() => setSttModel(m.id)}
                style={{
                  flex: 1, border: `1.5px solid ${sttModel === m.id ? COLORS.blue : COLORS.border}`,
                  background: sttModel === m.id ? COLORS.selected : COLORS.surface,
                  borderRadius: 8, padding: "10px", cursor: "pointer", fontFamily: FONT,
                }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>{m.title}</div>
                <div style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Groq keys */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>Groq API Keys</div>
            <button onClick={() => setShowAddGroq((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: COLORS.blue, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              <Plus size={13} /> Add
            </button>
          </div>
          {showAddGroq && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input autoFocus value={newGroq} onChange={(e) => setNewGroq(e.target.value)}
                placeholder="gsk_..."
                style={{ flex: 1, border: `1px solid ${COLORS.blue}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface, borderRadius: 6, padding: "6px 8px" }} />
              <button onClick={addGroq} style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}>Add</button>
            </div>
          )}
          {groqKeys.map((k) => (
            <KeyRow key={k.id} entry={k} provider="groq" onUpdate={(e) => updateKey("groq", e)} onRemove={(id) => removeKey("groq", id)} onToggle={(id) => toggleKey("groq", id)} />
          ))}
          {!loadingKeys && groqKeys.length === 0 && (
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, padding: "8px 0" }}>No Groq keys yet. Add one to enable cloud transcription.</div>
          )}
        </div>

        {/* OpenRouter keys */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>OpenRouter API Keys</div>
            <button onClick={() => setShowAddOr((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: COLORS.purple, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              <Plus size={13} /> Add
            </button>
          </div>
          {showAddOr && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <input autoFocus value={newOr} onChange={(e) => setNewOr(e.target.value)}
                placeholder="sk-or-v1-..."
                style={{ flex: 1, border: `1px solid ${COLORS.purple}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface, borderRadius: 6, padding: "6px 8px" }} />
              <button onClick={addOr} style={{ border: "none", background: COLORS.purple, color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}>Add</button>
            </div>
          )}
          {openrouterKeys.map((k) => (
            <KeyRow key={k.id} entry={k} provider="openrouter" onUpdate={(e) => updateKey("openrouter", e)} onRemove={(id) => removeKey("openrouter", id)} onToggle={(id) => toggleKey("openrouter", id)} />
          ))}
          {!loadingKeys && openrouterKeys.length === 0 && (
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, padding: "8px 0" }}>No OpenRouter keys yet. Optional fallback provider.</div>
          )}
        </div>

        {/* Agent skills removed — the AI now outputs one in-depth summary. */}

        {/* Data */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 8 }}>Data Management</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${COLORS.borderStrong}`, background: COLORS.surface, color: COLORS.text, fontSize: 12, fontWeight: 500, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: FONT }}>
              <Download size={13} /> Export
            </button>
            <button onClick={onImport} style={{ display: "flex", alignItems: "center", gap: 5, border: `1px solid ${COLORS.borderStrong}`, background: COLORS.surface, color: COLORS.text, fontSize: 12, fontWeight: 500, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: FONT }}>
              <Upload size={13} /> Import
            </button>
            <button onClick={onClearAll} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "#FFF2F2", color: COLORS.red, fontSize: 12, fontWeight: 500, borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontFamily: FONT }}>
              <Trash2 size={13} /> Clear all
            </button>
          </div>
        </div>

        {/* Privacy note */}
        <div style={{ fontSize: 11, color: COLORS.textTertiary, lineHeight: 1.6, padding: "10px 12px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.sidebarBg, borderRadius: 8, marginTop: 4 }}>
          Your API keys are stored encrypted on this device only (via your OS secure storage) and are never sent anywhere except to their respective providers.
        </div>

        {/* Save */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
          {saved && <span style={{ fontSize: 12, color: COLORS.green, display: "flex", alignItems: "center", gap: 4 }}><Check size={13} /> Saved</span>}
          <button onClick={save} style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 12.5, fontWeight: 600, borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontFamily: FONT, letterSpacing: -0.1 }}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
