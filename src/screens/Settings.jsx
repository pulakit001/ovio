import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X, Plus, Trash2, Check,
  Download, Upload, Server, ScrollText, Wand2, Sun, Moon, Info,
} from "lucide-react";
import { verifyGroqKey, verifyOpenRouterKey } from "../services/verifyKeys";
import { checkOllama, OLLAMA_TOP_MODELS } from "../services/ollama";
import { FONT, COLORS } from "../ui/theme";
import { useSettings } from "../context/SettingsContext";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

// Electron reports "darwin" on macOS — not "mac" (the old check never
// matched, so macOS users saw Windows-style Ctrl labels).
const IS_MAC = (window.electronAPI?.platform || navigator.platform || "").toLowerCase().includes("mac") || (window.electronAPI?.platform || "") === "darwin";

// "CommandOrControl+Shift+Space" → "⌘⇧Space" (mac) / "Ctrl+Shift+Space" (win)
function humanizeOne(chord) {
  return String(chord || "")
    .replace("CommandOrControl", IS_MAC ? "⌘" : "Ctrl")
    .replace("Alt", IS_MAC ? "⌥" : "Alt")
    .replace("Shift", IS_MAC ? "⇧" : "Shift");
}

// iOS-style toggle switch used by the ambient shortcut section — blue when
// on, with a glow (the dark theme's single-accent language).
function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} title={checked ? "Disable" : "Enable"}
      style={{
        width: 40, height: 22, borderRadius: 11, border: "none", position: "relative",
        background: checked ? COLORS.blue : "rgba(255,255,255,0.14)", cursor: "pointer", flexShrink: 0,
        boxShadow: "none",
        transition: "background 200ms ease, box-shadow 200ms ease",
      }}>
      <div style={{
        position: "absolute", top: 2, width: 18, height: 18, borderRadius: 999, background: "#fff",
        left: checked ? 20 : 2, transition: "left 200ms cubic-bezier(.16,1,.3,1)", boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
      }} />
    </button>
  );
}

// Keyframes + the grouped-list language for the settings page.
const SETTINGS_CSS = `
@keyframes ovioSettingsIn {
  from { opacity: 0; transform: translateY(14px); filter: blur(4px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes ovioSettingsOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(14px); }
}
@keyframes ovioOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ovioOverlayOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
`;

// ----- Grouped-list primitives (macOS System Settings language) ----------
// A section = one quiet small-caps label + ONE flat surface containing rows
// separated by hairlines. No card-per-control, no borders around borders.
function Group({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      {label && (
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: COLORS.textTertiary, margin: "0 0 7px 2px",
        }}>{label}</div>
      )}
      <div style={{
        border: `1px solid ${COLORS.border}`, borderRadius: 12,
        background: COLORS.surface, overflow: "hidden",
      }}>
        {children}
      </div>
    </div>
  );
}

// One row: title (+optional sub) left, control right. `stack` renders the
// control UNDER the title (wide controls: textareas, chip rows, model lists).
function Row({ title, sub, children, onClick, last, stack }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: stack ? "flex-start" : "center", gap: 12,
        padding: "10px 14px", cursor: onClick ? "pointer" : "default",
        borderBottom: last ? "none" : `1px solid ${COLORS.border}`,
        transition: "background 140ms ease",
        background: "transparent",
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.background = COLORS.surface2; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ flex: stack ? 1 : "0 0 auto", minWidth: 0, width: stack ? "100%" : undefined }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 2, lineHeight: 1.55 }}>{sub}</div>}
        {stack && children}
      </div>
      {!stack && children}
    </div>
  );
}

// Flat segmented control — one surface, the selected segment lifts. The
// workhorse for every binary/ternary choice on the page.
function Seg({ options, value, onChange, small }) {
  return (
    <div style={{
      display: "inline-flex", background: COLORS.surface2,
      borderRadius: 8, padding: 2, flexShrink: 0,
    }}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              border: "none", borderRadius: 6, padding: small ? "3px 10px" : "4px 13px",
              cursor: "pointer", fontFamily: FONT,
              fontSize: small ? 11.5 : 12, fontWeight: on ? 600 : 500,
              background: on ? COLORS.surface : "transparent",
              color: on ? COLORS.text : COLORS.textSecondary,
              boxShadow: on ? "0 1px 3px rgba(0,0,0,0.18)" : "none",
              transition: "background 150ms ease, color 150ms ease",
            }}>
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Quiet text-link used for inline actions inside rows (Install engine,
// Download model…).
function TextAction({ onClick, children, danger }) {
  return (
    <span
      onClick={onClick}
      style={{
        fontSize: 11.5, fontWeight: 600, cursor: "pointer",
        color: danger ? COLORS.red : COLORS.blue,
      }}
    >
      {children}
    </span>
  );
}

// Attach display/status fields (mask + hasKey) so KeyRow can show whether a
// key actually holds a value instead of always rendering "no key". Respects
// the locked/masked state computed by the main process (a stored key whose
// value could not be decrypted shows as "re-enter key", never as "no key").
function withKeyStatus(k) {
  const key = k.key || "";
  return {
    ...k,
    hasKey: !!key || !!k.locked,
    masked: k.masked || (key ? `${key.slice(0, 4)}...${key.slice(-4)}` : ""),
    locked: !!k.locked,
  };
}

function KeyRow({ entry, provider, onUpdate, onRemove, onToggle, last }) {
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: last ? "none" : `1px solid ${COLORS.border}` }}>
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
              placeholder={provider === "groq" ? "AIza…" : "sk-or-v1-..."}
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

// Chord presets offered for the global shortcut. Electron accelerators —
// editable via the chord recorder below.
const CHORD_PRESETS = [
  { id: "CommandOrControl+Shift+Space", label: "⌘/Ctrl + ⇧ + Space" },
  { id: "Alt+Shift+Space", label: "⌥/Alt + ⇧ + Space" },
  { id: "CommandOrControl+Alt+Shift+Space", label: "⌘ + ⌥ + ⇧ + Space" },
  { id: "Alt+Shift+R", label: "⌥/Alt + ⇧ + R" },
  { id: "CommandOrControl+Shift+7", label: "⌘/Ctrl + ⇧ + 7" },
];

// The four note sections embedded into every AI note (toggled in
// Settings → AI Behavior). Each maps to a required "##" section in the prompt.
const NOTE_SECTIONS = [
  { id: "overview", label: "Overview", desc: "Big picture in a few sentences" },
  { id: "keyPoints", label: "Key Points", desc: "Crisp takeaways, bulleted" },
  { id: "detailedSummary", label: "Detailed Summary", desc: "Full theme-by-theme notes" },
  { id: "followUps", label: "Follow-ups", desc: "Actions, owners, open threads" },
];

export default function Settings({ onNavigate, mode, setMode, sttModel, setSttModel, localSttModel, setLocalSttModel, aiProvider, setAiProvider, ollamaUrl, setOllamaUrl, ollamaModel, setOllamaModel, setFullyLocal, onExport, onImport, onClearAll, onKeysChanged, ambientShortcutLabel }) {
  const { settings: ctxSettings, update: updateSettings } = useSettings();
  const [groqKeys, setGroqKeys] = useState([]);
  const [openrouterKeys, setOpenrouterKeys] = useState([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [showAddGroq, setShowAddGroq] = useState(false);
  const [showAddOr, setShowAddOr] = useState(false);
  const [newGroq, setNewGroq] = useState("");
  const [newOr, setNewOr] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  // Curated 3-model Ollama picker (same as onboarding): installed ids and
  // per-model pull progress for the live collapsed download view.
  const [ollamaPulls, setOllamaPulls] = useState({});
  const [ollamaInstalled, setOllamaInstalled] = useState([]);
  const ollamaUrlRef = useRef(ollamaUrl);
  useEffect(() => { ollamaUrlRef.current = ollamaUrl; }, [ollamaUrl]);
  const fileInputRef = { current: null };

  // ---- New settings-tab state (all persisted through the settings backend) ----
  // Ambient shortcut: config from the main process + local UI state.
  const [ambientCfg, setAmbientCfg] = useState({ enabled: true, chords: [] });
  const [ambientInfo, setAmbientInfo] = useState(null); // live registration info
  const [recordingChord, setRecordingChord] = useState(false);
  const [chordMsg, setChordMsg] = useState("");
  // UI animations level: "full" | "reduced" | "off"
  const [animLevel, setAnimLevel] = useState(ctxSettings?.animations || "full");
  // AI behavior (custom instructions / note sections / depth).
  const [behavior, setBehavior] = useState(ctxSettings?.aiBehavior || {});
  const [behaviorSaved, setBehaviorSaved] = useState(false);
  // Legal (Terms & Conditions) modal.
  const [legalOpen, setLegalOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [appInfo, setAppInfo] = useState(null);
  useEffect(() => {
    window.electronAPI?.appInfo?.().then(setAppInfo).catch(() => {});
  }, []);

  // ---- Ambient shortcut: load config + live registration info ----
  useEffect(() => {
    const api = window.electronAPI?.ambientAPI;
    if (!api?.getInfo) return;
    api.getInfo().then((info) => {
      setAmbientInfo(info);
      setAmbientCfg({ enabled: info.enabled !== false, chords: info.chords || [] });
    }).catch(() => {});
  }, []);

  const applyAmbient = async (cfg) => {
    setAmbientCfg(cfg);
    try {
      const res = await window.electronAPI?.ambientAPI?.configure(cfg);
      if (res) {
        setAmbientInfo((prev) => ({ ...prev, ...res, enabled: cfg.enabled }));
        setChordMsg(res.ok ? "" : "⚠ Chord claimed by another app — try a different one.");
      }
      onKeysChanged?.();
    } catch {
      setChordMsg("Failed to apply shortcut settings");
    }
  };

  // Live keyboard capture: press any combination to set the chord.
  // Built from e.code (physical key), NOT e.key — with Option held, e.key
  // becomes a dead-key glyph (⌥+R → "®"), which produced garbage accelerators
  // and made Custom appear broken. e.code stays stable across modifiers.
  const captureChord = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecordingChord(false);
      setChordMsg("");
      return;
    }
    if (e.type === "keyup" || e.repeat) return;
    // Map the physical key code to an accelerator token.
    let token = null;
    if (e.code.startsWith("Key")) token = e.code.slice(3);            // KeyR → R
    else if (e.code.startsWith("Digit")) token = e.code.slice(5);     // Digit7 → 7
    else if (e.code === "Space") token = "Space";
    else if (/^(F[1-9]|F1[0-9])$/.test(e.code)) token = e.code;
    else if (/^Numpad\d$/.test(e.code)) token = `num${e.code.slice(6)}`;
    else if (",.;/'[]\\-=`".includes(e.key)) token = e.key;           // punctuation keys
    else return; // modifier alone or unsupported key — wait for the real key
    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push("CommandOrControl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    parts.push(token);
    if (parts.filter((p) => p !== "Shift").length < 2) {
      setChordMsg("Add at least one modifier (⌘/Ctrl or ⌥) plus a key.");
      return;
    }
    const chord = parts.join("+");
    setRecordingChord(false);
    setChordMsg("");
    applyAmbient({ enabled: true, chords: [chord] });
  }, []);

  useEffect(() => {
    if (!recordingChord) return;
    window.addEventListener("keydown", captureChord, true);
    window.addEventListener("keyup", captureChord, true);
    return () => {
      window.removeEventListener("keydown", captureChord, true);
      window.removeEventListener("keyup", captureChord, true);
    };
  }, [recordingChord, captureChord]);

  const saveBehavior = async (next) => {
    setBehavior(next);
    try {
      await updateSettings({ aiBehavior: next });
      setBehaviorSaved(true);
      setTimeout(() => setBehaviorSaved(false), 1500);
      onKeysChanged?.();
    } catch {
      /* surfaced by the save button state */
    }
  };

  const saveAnimations = async (level) => {
    setAnimLevel(level);
    try {
      await updateSettings({ animations: level });
      onKeysChanged?.();
    } catch {}
  };

  // Theme mode: persisted instantly; App's applyTheme effect re-skins the
  // whole app on the next render (live COLORS object).
  const [themeMode, setThemeMode] = useState(ctxSettings?.theme || "dark");
  useEffect(() => { setThemeMode(ctxSettings?.theme || "dark"); }, [ctxSettings?.theme]);
  const saveTheme = async (mode) => {
    setThemeMode(mode);
    try {
      await updateSettings({ theme: mode });
      onKeysChanged?.();
    } catch {}
  };

  const refreshKeys = async () => {
    if (window.settingsAPI) {
      const plain = await window.settingsAPI.getPlain();
      setGroqKeys((plain.groqKeys || []).map(withKeyStatus));
      setOpenrouterKeys((plain.openrouterKeys || []).map(withKeyStatus));
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

  // Ollama tags via the main process (works from any renderer origin — a
  // plain renderer fetch can be blocked by CORS in Electron).
  const refreshOllama = async (urlOverride) => {
    const url = urlOverride ?? ollamaUrlRef.current;
    const api = window.electronAPI?.ollamaAPI;
    const res = api?.tags ? await api.tags(url) : await checkOllama(url);
    setOllamaStatus(res);
    setOllamaInstalled(res?.ok ? (res.models || []).map((m) => m.id) : []);
    return res;
  };

  const checkOllamaConnection = async () => {
    setCheckingOllama(true);
    const res = await refreshOllama();
    if (res.ok && !ollamaModel && res.models.length > 0) {
      // Prefer the best curated model that is actually installed.
      const best = OLLAMA_TOP_MODELS.find((m) =>
        (res.models || []).some((x) => x.id === m.id || x.id.startsWith(m.id))
      );
      setOllamaModel(best?.id || res.models[0].id);
    }
    setCheckingOllama(false);
  };

  // Live pull progress for the curated Ollama models (same wiring as onboarding).
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
      if (d.done) {
        setOllamaModel(d.model);
        refreshOllama();
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pullOllama = (id) => {
    const api = window.electronAPI?.ollamaAPI;
    if (!api?.pull) return;
    // Select the model being pulled so it is active the moment it lands.
    setOllamaModel(id);
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

  // Local Whisper model catalog (downloaded on demand, runs on-device)
  const [modelStates, setModelStates] = useState([]);
  const [parakeetStatus, setParakeetStatus] = useState(null);
  const refreshModelStatus = async () => {
    if (window.electronAPI?.modelsStatus) {
      try { setModelStates(await window.electronAPI.modelsStatus()); } catch {}
    }
    if (window.electronAPI?.parakeetAPI?.status) {
      try { setParakeetStatus(await window.electronAPI.parakeetAPI.status()); } catch {}
    }
  };
  useEffect(() => { refreshModelStatus(); }, []);
  useEffect(() => {
    if (!window.electronAPI?.onDownloadProgress) return;
    const off = window.electronAPI.onDownloadProgress(() => refreshModelStatus());
    return off;
  }, []);
  useEffect(() => {
    if (!window.electronAPI?.parakeetAPI?.onStatus) return;
    const off = window.electronAPI.parakeetAPI.onStatus((st) => setParakeetStatus(st));
    return off;
  }, []);
  const startModelDownload = (id) => {
    window.electronAPI.downloadModel(id).then(refreshModelStatus).catch(refreshModelStatus);
  };
  const startParakeetInstall = () => {
    window.electronAPI?.parakeetAPI?.installEngine?.().then(refreshModelStatus).catch(refreshModelStatus);
  };
  const startParakeetDownload = () => {
    window.electronAPI?.parakeetAPI?.downloadWeights?.().then(refreshModelStatus).catch(refreshModelStatus);
  };

  // Settings is a tab now: every change persists immediately (each control
  // also saves on its own). `save` remains the explicit flush + feedback.
  const save = async () => {
    try {
      const res = await window.settingsAPI.update({
        mode: mode ?? "local",
        sttModel: sttModel ?? "whisper-large-v3-turbo",
        localSttModel: localSttModel ?? "large",
        aiProvider: aiProvider ?? "cloud",
        ollamaUrl: ollamaUrl ?? "http://localhost:11434",
        ollamaModel: ollamaModel ?? "",
      });
      if (!res || res.ok === false) throw new Error(res?.error || "Failed to save settings");
      setSaveError("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      // Re-sync the running app (context settings) with what was just saved so
      // the new mode / provider takes effect immediately.
      onKeysChanged?.();
    } catch (err) {
      setSaved(false);
      setSaveError(err.message || "Failed to save settings");
      console.warn("Settings save failed:", err?.message || err);
    }
  };

  // Auto-save on unmount so leaving the tab never loses a pending change.
  useEffect(() => () => { save(); }, []);

  // As a tab, Settings auto-saves — Escape returns to the Dashboard.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onNavigate?.("dashboard"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Adding a cloud key while "Fully Local" is selected means the user expects
  // their key to actually be used — switch to cloud (Ollama stays available as
  // the no-key fallback). Previously the provider silently stayed localOnly,
  // so notes and chat ignored the brand-new key and "kept failing".
  const switchToCloudIfLocal = () => {
    if ((aiProvider || "cloud") === "localOnly") setAiProvider?.("cloud");
  };

  const addGroq = async () => {
    if (!newGroq.trim()) return;
    const entry = withKeyStatus({ id: genId(), name: `Key ${groqKeys.length + 1}`, active: true, key: newGroq.trim() });
    const updated = [...groqKeys, entry];
    await window.settingsAPI.update({ groqKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    setGroqKeys(updated);
    setShowAddGroq(false);
    setNewGroq("");
    switchToCloudIfLocal();
    onKeysChanged?.();
  };

  const addOr = async () => {
    if (!newOr.trim()) return;
    const entry = withKeyStatus({ id: genId(), name: `Key ${openrouterKeys.length + 1}`, active: true, key: newOr.trim() });
    const updated = [...openrouterKeys, entry];
    await window.settingsAPI.update({ openrouterKeys: updated.map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })) });
    setOpenrouterKeys(updated);
    setShowAddOr(false);
    setNewOr("");
    switchToCloudIfLocal();
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
      flex: 1, overflowY: "auto", background: COLORS.windowBg, fontFamily: FONT,
    }}>
      <style>{SETTINGS_CSS}</style>

      {/* Single centered column of grouped rows */}
      <div style={{
        width: 620, maxWidth: "92%", margin: "0 auto",
        padding: "40px 0 72px",
        animation: "ovioSettingsIn 520ms cubic-bezier(.16,1,.3,1) both",
      }} key="settings-page">
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: COLORS.text, letterSpacing: -0.8 }}>
            Settings
          </div>
        </div>

        {/* ===== 1 · Transcription ===== */}
        <Group label="Transcription">
          <Row
            title="Mode"
            sub={mode === "cloud" ? "Cloud — Groq Whisper (STT)" : "Local — on-device, private"}
            last={!window.electronAPI || mode === "cloud"}
          >
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: "local", label: "Local" },
                { value: "cloud", label: "Cloud" },
              ]}
            />
          </Row>
          {mode === "cloud" && (
            <Row title="Cloud model" last>
              <Seg
                value={sttModel}
                onChange={setSttModel}
                options={[
                  { value: "whisper-large-v3-turbo", label: "Turbo" },
                  { value: "whisper-large-v3", label: "Large v3" },
                ]}
              />
            </Row>
          )}
          {mode !== "cloud" && window.electronAPI && (
            <Row title="Local model" last stack>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", marginTop: 6 }}>
                {(() => {
                  const pk = parakeetStatus;
                  const engineReady = pk?.engine?.state === "ready";
                  const engineInstalling = pk?.engine?.state === "installing";
                  const engineError = pk?.engine?.state === "error";
                  const downloaded = pk?.weights?.downloaded;
                  const downloading = pk?.weights?.downloading;
                  const progress = Math.round((pk?.weights?.progress || 0) * 100);
                  const pkSelected = localSttModel === "parakeet";
                  const largeSt = modelStates.find((s) => s.id === "large");
                  const lgSelected = localSttModel === "large";
                  const modelRow = (sel, title, desc, statusColor, statusText, onClick, extra) => (
                    <div
                      onClick={onClick}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        border: `1px solid ${sel ? COLORS.blue : COLORS.border}`,
                        background: sel ? COLORS.selected : COLORS.surface,
                        borderRadius: 8, padding: "9px 12px", cursor: "pointer",
                        transition: "border-color 150ms ease",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>
                          {title}
                          {extra}
                        </div>
                        <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 1 }}>{desc}</div>
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 500, color: statusColor, textAlign: "right" }}>
                        {statusText}
                      </div>
                    </div>
                  );
                  return (
                    <>
                      {modelRow(
                        pkSelected,
                        "Parakeet-TDT v3",
                        "Most accurate · streams live · ~2.5 GB",
                        downloading || engineInstalling ? COLORS.blue : downloaded && engineReady ? COLORS.green : engineError ? COLORS.red : COLORS.textTertiary,
                        engineError ? "Engine error"
                          : engineInstalling ? "Installing engine…"
                          : !engineReady ? "Engine not installed"
                          : downloading ? `Downloading… ${progress}%`
                          : downloaded ? (pk?.server?.running ? "Ready · streaming" : "Ready")
                          : `Not downloaded · ${pk?.sizeLabel || "~2.5 GB"}`,
                        () => setLocalSttModel("parakeet"),
                        <span style={{ fontSize: 9, fontWeight: 700, color: COLORS.blue, border: `1px solid ${COLORS.blue}`, borderRadius: 4, padding: "1px 4px", marginLeft: 6 }}>RECOMMENDED</span>,
                      )}
                      {(pkSelected && !engineReady && !engineInstalling) && (
                        <div style={{ fontSize: 11, color: COLORS.textSecondary, padding: "0 2px" }}>
                          <TextAction onClick={startParakeetInstall}>Install engine</TextAction>
                          <span style={{ color: COLORS.textTertiary }}> · one-time, ~5–15 min</span>
                        </div>
                      )}
                      {(pkSelected && engineReady && !downloaded && !downloading) && (
                        <div style={{ fontSize: 11, color: COLORS.textSecondary, padding: "0 2px" }}>
                          <TextAction onClick={startParakeetDownload}>Download {pk?.sizeLabel || "~2.5 GB"}</TextAction>
                        </div>
                      )}
                      {downloading && (
                        <div style={{ height: 3, borderRadius: 2, background: COLORS.border, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${progress}%`, background: COLORS.blue, transition: "width 300ms ease" }} />
                        </div>
                      )}
                      {modelRow(
                        lgSelected,
                        "Whisper Large v3",
                        "Most accurate Whisper · ~3.1 GB",
                        largeSt?.downloading ? COLORS.blue : largeSt?.downloaded ? COLORS.green : COLORS.textTertiary,
                        largeSt?.downloading ? `Downloading… ${Math.round((largeSt?.progress || 0) * 100)}%`
                          : largeSt?.downloaded ? "Ready"
                          : "Not downloaded",
                        () => setLocalSttModel("large"),
                        null,
                      )}
                      {(lgSelected && !largeSt?.downloaded && !largeSt?.downloading) && (
                        <div style={{ fontSize: 11, color: COLORS.textSecondary, padding: "0 2px" }}>
                          <TextAction onClick={() => startModelDownload("large")}>Download ~3.1 GB</TextAction>
                        </div>
                      )}
                      {largeSt?.downloading && (
                        <div style={{ height: 3, borderRadius: 2, background: COLORS.border, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round((largeSt?.progress || 0) * 100)}%`, background: COLORS.blue, transition: "width 300ms ease" }} />
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </Row>
          )}
        </Group>

        {/* ===== 2 · AI notes ===== */}
        <Group label="AI Notes">
          <Row
            title="Provider"
            sub={aiProvider === "cloud" ? "Cloud — Gemini + OpenRouter" : "Local — nothing leaves this Mac"}
          >
            <Seg
              value={aiProvider}
              onChange={setAiProvider}
              options={[
                { value: "cloud", label: "Cloud" },
                { value: "localOnly", label: "Local" },
              ]}
            />
          </Row>
          {aiProvider === "localOnly" && (
            <Row title="Ollama server" sub={ollamaStatus?.ok ? `Connected · ${ollamaStatus.models.length} model${ollamaStatus.models.length === 1 ? "" : "s"}` : ollamaStatus ? (ollamaStatus.error || "Not reachable") : "http://localhost:11434"} stack last>
              <div style={{ display: "flex", gap: 6, marginTop: 8, width: "100%" }}>
                <input value={ollamaUrl || ""} onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  style={{ flex: 1, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface2, borderRadius: 7, padding: "6px 9px" }} />
                <button onClick={checkOllamaConnection} disabled={checkingOllama}
                  style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 11.5, fontWeight: 600, borderRadius: 7, padding: "6px 12px", cursor: checkingOllama ? "default" : "pointer", fontFamily: FONT }}>
                  {checkingOllama ? "…" : "Check"}
                </button>
              </div>
            </Row>
          )}
          {aiProvider === "localOnly" && ollamaStatus?.ok && (() => {
            const activePullId = Object.entries(ollamaPulls).find(([, v]) => v.pulling)?.[0];
            const visible = OLLAMA_TOP_MODELS.filter((m) => !activePullId || activePullId === m.id);
            const otherInstalled = (ollamaStatus.models || [])
              .filter((m) => !OLLAMA_TOP_MODELS.some((t) => m.id === t.id || m.id.startsWith(t.id)));
            const cur = ollamaModel || "";
            return (
              <>
                {visible.map((m, i) => {
                  const isInstalled = ollamaInstalled.some((x) => x === m.id || x.startsWith(m.id));
                  const pull = ollamaPulls[m.id];
                  const isPulling = !!pull?.pulling;
                  const pct = Math.round((pull?.percent || 0) * 100);
                  const selected = cur === m.id || cur.startsWith(m.id);
                  if (isPulling) {
                    return (
                      <Row key={m.id} title={m.title} sub={`Fetching ${m.size}… ${pct}%`} last={i === visible.length - 1 && otherInstalled.length === 0} stack>
                        <div style={{ width: "100%", height: 4, borderRadius: 2, background: COLORS.border, overflow: "hidden", marginTop: 6 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: COLORS.accent, borderRadius: 2, transition: "width 300ms ease" }} />
                        </div>
                      </Row>
                    );
                  }
                  return (
                    <Row
                      key={m.id}
                      onClick={isInstalled ? () => setOllamaModel(m.id) : undefined}
                      title={m.title}
                      sub={`${m.desc} · ${m.size}`}
                      last={i === visible.length - 1 && otherInstalled.length === 0}
                    >
                      {isInstalled ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: selected ? COLORS.green : COLORS.textTertiary }}>
                          {selected ? "Active" : "Ready"}
                        </span>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); pullOllama(m.id); }}
                          disabled={checkingOllama}
                          style={{
                            border: `1px solid ${COLORS.borderStrong}`, background: COLORS.surface,
                            color: ollamaStatus.ok ? COLORS.text : COLORS.textTertiary,
                            fontSize: 11, fontWeight: 600, borderRadius: 7, padding: "4px 11px",
                            cursor: checkingOllama ? "wait" : "pointer", fontFamily: FONT,
                          }}>
                          Pull
                        </button>
                      )}
                    </Row>
                  );
                })}
                {otherInstalled.length > 0 && (
                  <Row title="Other installed models" last stack>
                    <select value={OLLAMA_TOP_MODELS.some((t) => cur === t.id || cur.startsWith(t.id)) ? "" : cur}
                      onChange={(e) => e.target.value && setOllamaModel(e.target.value)}
                      style={{ width: "100%", marginTop: 6, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface2, borderRadius: 7, padding: "6px 8px" }}>
                      <option value="">{cur ? cur : "Auto (recommended model)"}</option>
                      {otherInstalled.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </Row>
                )}
              </>
            );
          })()}
        </Group>

        {/* ===== 3 · API keys ===== */}
        <Group label="API Keys">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px 6px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>Gemini</div>
            <button onClick={() => setShowAddGroq((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: COLORS.blue, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              <Plus size={13} /> Add
            </button>
          </div>
          {showAddGroq && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, padding: "0 14px 8px" }}>
              <input autoFocus value={newGroq} onChange={(e) => setNewGroq(e.target.value)}
                placeholder="AIza…"
                style={{ flex: 1, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface2, borderRadius: 6, padding: "6px 8px" }} />
              <button onClick={addGroq} style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}>Add</button>
            </div>
          )}
          {groqKeys.map((k, i) => (
            <KeyRow key={k.id} entry={k} provider="groq" onUpdate={(e) => updateKey("groq", e)} onRemove={(id) => removeKey("groq", id)} onToggle={(id) => toggleKey("groq", id)} last={i === groqKeys.length - 1 && openrouterKeys.length === 0 && !showAddOr} />
          ))}
          {!loadingKeys && groqKeys.length === 0 && (
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, padding: "0 14px 10px" }}>No keys yet — needed for cloud transcription.</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px 6px", borderTop: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>OpenRouter</div>
            <button onClick={() => setShowAddOr((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: COLORS.blue, fontSize: 12, cursor: "pointer", fontFamily: FONT }}>
              <Plus size={13} /> Add
            </button>
          </div>
          {showAddOr && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8, padding: "0 14px 8px" }}>
              <input autoFocus value={newOr} onChange={(e) => setNewOr(e.target.value)}
                placeholder="sk-or-v1-..."
                style={{ flex: 1, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text, background: COLORS.surface2, borderRadius: 6, padding: "6px 8px" }} />
              <button onClick={addOr} style={{ border: "none", background: COLORS.blue, color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}>Add</button>
            </div>
          )}
          {openrouterKeys.map((k, i) => (
            <KeyRow key={k.id} entry={k} provider="openrouter" onUpdate={(e) => updateKey("openrouter", e)} onRemove={(id) => removeKey("openrouter", id)} onToggle={(id) => toggleKey("openrouter", id)} last={i === openrouterKeys.length - 1} />
          ))}
          {!loadingKeys && openrouterKeys.length === 0 && (
            <div style={{ fontSize: 11.5, color: COLORS.textTertiary, padding: "0 14px 10px" }}>Optional fallback provider.</div>
          )}
        </Group>

        {/* Legal popup — one modal for Terms, Conditions & everything, with
            the Snippetz Labs attribution on top. Click outside or the X to
            close; click the button again to re-open.
            Portaled to document.body: inside this Settings container the
            entrance animation leaves a transform behind, which would re-anchor
            `position: fixed` to the container instead of the viewport and
            squeeze the popup into half the window. */}
        {legalOpen && createPortal(
          <div onClick={() => setLegalOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(34,30,23,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                width: 560, maxWidth: "94%", maxHeight: "82vh", overflowY: "auto",
                background: COLORS.surface, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
                padding: "22px 24px", fontFamily: FONT,
              }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: COLORS.text, letterSpacing: -0.2 }}>
                  Built by the team at Snippetz Labs
                </div>
                <button onClick={() => setLegalOpen(false)}
                  style={{ border: "none", background: "transparent", color: COLORS.textTertiary, cursor: "pointer", padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textTertiary, marginBottom: 14 }}>Ovio — Terms of Service & Conditions</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.75 }}>
                <p><strong style={{ color: COLORS.text }}>1. Acceptance.</strong> By using Ovio you agree to these terms. If you don't agree, don't use the app.</p>
                <p><strong style={{ color: COLORS.text }}>2. What Ovio does.</strong> Ovio records audio you choose to record, transcribes it (locally or via your configured cloud provider), and generates AI notes. You are responsible for what you record and for complying with the laws and consent rules that apply to recording conversations in your jurisdiction.</p>
                <p><strong style={{ color: COLORS.text }}>3. Your data.</strong> Recordings, transcripts and notes live on your Mac. API keys are encrypted locally. Cloud transcription/notes are processed by the providers you configure (Gemini, OpenRouter, or your own Ollama) under their terms; in fully-local mode nothing leaves your machine.</p>
                <p><strong style={{ color: COLORS.text }}>4. AI output.</strong> AI-generated notes and answers can contain mistakes. Verify important information; Ovio is a note-taking aid, not an authoritative record.</p>
                <p><strong style={{ color: COLORS.text }}>5. Acceptable use.</strong> Don't use Ovio to violate laws or others' rights, including recording people without legally required consent.</p>
                <p><strong style={{ color: COLORS.text }}>6. No warranty.</strong> Ovio is provided "as is" without warranties of any kind. Snippetz Labs is not liable for damages arising from use of the app, to the maximum extent permitted by law.</p>
                <p><strong style={{ color: COLORS.text }}>7. Changes.</strong> Terms may update with app releases; the current version ships with the app you're running.</p>
                <p style={{ marginTop: 10, color: COLORS.textTertiary, fontSize: 11 }}>© {new Date().getFullYear()} Snippetz Labs. All rights reserved.</p>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* About popup — the app's face card: mark, version, one-line story,
            and honest credits. Portaled like the legal modal. */}
        {aboutOpen && createPortal(
          <div onClick={() => setAboutOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(34,30,23,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{
                width: 460, maxWidth: "94%", overflowY: "auto",
                background: COLORS.surface, borderRadius: 16, boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
                padding: "26px 28px 22px", fontFamily: FONT, textAlign: "center",
              }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -10, marginRight: -12 }}>
                <button onClick={() => setAboutOpen(false)}
                  style={{ border: "none", background: "transparent", color: COLORS.textTertiary, cursor: "pointer", padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
              <img src="./logo.png" alt="Ovio" width={84} height={84}
                style={{ borderRadius: 20, display: "block", margin: "2px auto 14px" }} />
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3, color: COLORS.text }}>Ovio</div>
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 3 }}>
                Version {appInfo?.version || "1.3.0"}{appInfo?.electron ? ` · Electron ${appInfo.electron}` : ""}
              </div>
              <div style={{ fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.65, margin: "14px auto 0", maxWidth: 340 }}>
                Talk anywhere. Ovio records from any app with a system-wide
                shortcut, transcribes live, and writes the notes — on your
                machine, in fully-local mode, or with the cloud providers you choose.
              </div>
              <div style={{ height: 1, background: COLORS.border, margin: "18px 0 14px" }} />
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, lineHeight: 1.8 }}>
                Local STT by <span style={{ color: COLORS.textSecondary }}>NVIDIA Parakeet-TDT</span> &amp; <span style={{ color: COLORS.textSecondary }}>whisper.cpp</span><br />
                Notes &amp; chat by <span style={{ color: COLORS.textSecondary }}>Gemini · OpenRouter · Ollama</span><br />
                MIT licensed — source at github.com/pulakit001/ovio
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginTop: 14, letterSpacing: 0.2 }}>
                Built by the team at Snippetz Labs
              </div>
              <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 6 }}>© {new Date().getFullYear()} Snippetz Labs. All rights reserved.</div>
            </div>
          </div>,
          document.body
        )}

        {/* ===== 4 · Data ===== */}
        <Group label="Data">
          <Row title="Export everything" sub="Projects, recordings and notes as a JSON backup" onClick={onExport}>
            <Download size={14} color={COLORS.textSecondary} />
          </Row>
          <Row title="Import a backup" sub="Restore from an Ovio JSON export" onClick={onImport}>
            <Upload size={14} color={COLORS.textSecondary} />
          </Row>
          <Row
            title="Delete all data"
            sub="Every project, recording, note and transcript — permanent"
            onClick={onClearAll}
            last
          >
            <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.red }}>Clear…</span>
          </Row>
        </Group>

        {/* ===== 5 · Record from anywhere ===== */}
        <Group label="Record from Anywhere">
          <Row
            title="Global shortcut"
            sub={ambientInfo?.registered?.length
              ? `Active: ${ambientInfo.registered.map(humanizeOne).join(" or ")} — works in any app, even unfocused`
              : "Off — no shortcut is registered"}
          >
            <Toggle checked={ambientCfg.enabled} onChange={(v) => applyAmbient({ ...ambientCfg, enabled: v })} />
          </Row>
          <Row title="Choose your shortcut" stack last>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, width: "100%" }}>
              {CHORD_PRESETS.map((p) => {
                const on = ambientCfg.chords?.[0] === p.id;
                return (
                  <button key={p.id} onClick={() => applyAmbient({ enabled: true, chords: [p.id] })}
                    style={{
                      border: `1px solid ${on ? COLORS.blue : COLORS.border}`,
                      background: on ? COLORS.selected : COLORS.surface2,
                      borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: on ? 600 : 500,
                      color: on ? COLORS.text : COLORS.textSecondary, cursor: "pointer", fontFamily: FONT,
                      transition: "border-color 150ms ease, background 150ms ease",
                    }}>
                    {p.label}
                  </button>
                );
              })}
              <button onClick={() => { setRecordingChord(true); setChordMsg(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  border: `1px dashed ${recordingChord ? COLORS.blue : COLORS.borderStrong}`,
                  background: recordingChord ? COLORS.selected : COLORS.surface2,
                  borderRadius: 7, padding: "5px 10px", fontSize: 11.5, fontWeight: 500,
                  color: recordingChord ? COLORS.blue : COLORS.textSecondary, cursor: "pointer", fontFamily: FONT,
                }}>
                {recordingChord ? "Press keys now… (Esc)" : (<> <Wand2 size={11} /> Custom…</>)}
              </button>
            </div>
            {chordMsg && <div style={{ fontSize: 11, color: COLORS.red, marginTop: 6 }}>{chordMsg}</div>}
            <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 8, lineHeight: 1.5 }}>
              If a Space chord conflicts with Spotlight, pick a letter chord (⌥⇧R).
              The fallback {IS_MAC ? "⌘⇧U" : "Ctrl+Shift+U"} always works no matter what.
            </div>
          </Row>
        </Group>

        {/* ===== 6 · Appearance ===== */}
        <Group label="Appearance">
          <Row title="Theme">
            <Seg
              value={themeMode}
              onChange={saveTheme}
              options={[
                { value: "dark", label: "Dark", icon: <Moon size={12} /> },
                { value: "light", label: "Light", icon: <Sun size={12} /> },
              ]}
            />
          </Row>
          <Row title="Animation" last>
            <Seg
              value={animLevel}
              onChange={saveAnimations}
              options={[
                { value: "full", label: "Full" },
                { value: "reduced", label: "Reduced" },
                { value: "off", label: "Off" },
              ]}
            />
          </Row>
        </Group>

        {/* ===== 7 · AI behavior ===== */}
        <Group label="AI Behavior">
          <Row
            title="Custom instructions"
            sub="Embedded into every prompt — how the AI writes your notes and answers"
            stack
          >
            <textarea
              value={behavior.customInstructions || ""}
              onChange={(e) => setBehavior({ ...behavior, customInstructions: e.target.value })}
              onBlur={() => saveBehavior(behavior)}
              placeholder="e.g. I'm a product manager — always highlight decisions, owners and deadlines."
              style={{
                width: "100%", minHeight: 60, resize: "vertical", border: `1px solid ${COLORS.borderStrong}`,
                outline: "none", fontSize: 12, fontFamily: FONT, color: COLORS.text,
                background: COLORS.surface2, borderRadius: 7, padding: "8px 10px", lineHeight: 1.5,
                marginTop: 8,
              }}
            />
          </Row>
          <Row
            title="Note sections"
            sub="Always included in every AI note"
            stack
          >
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8, width: "100%" }}>
              {NOTE_SECTIONS.map((s, i) => {
                const on = behavior.skills?.[s.id] !== false;
                return (
                  <div
                    key={s.id}
                    onClick={() => saveBehavior({ ...behavior, skills: { ...behavior.skills, [s.id]: !on } })}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "7px 2px",
                      cursor: "pointer",
                      borderBottom: i < NOTE_SECTIONS.length - 1 ? `1px solid ${COLORS.border}` : "none",
                    }}
                  >
                    <div style={{
                      width: 26, height: 16, borderRadius: 8, position: "relative", flexShrink: 0,
                      background: on ? COLORS.blue : COLORS.borderStrong, transition: "background 150ms ease",
                    }}>
                      <div style={{ position: "absolute", top: 2, width: 12, height: 12, borderRadius: 999, background: "#fff", left: on ? 12 : 2, transition: "left 150ms ease" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.text }}>{s.label}</span>
                      <span style={{ fontSize: 10.5, color: COLORS.textTertiary, marginLeft: 8 }}>{s.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Row>
          <Row title="Notes depth" last>
            <Seg
              small
              value={behavior.depth || "detailed"}
              onChange={(d) => saveBehavior({ ...behavior, depth: d })}
              options={[
                { value: "detailed", label: "Detailed" },
                { value: "concise", label: "Concise" },
              ]}
            />
          </Row>
          {behaviorSaved && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 14px 10px", fontSize: 11, color: COLORS.green }}>
              <Check size={12} /> saved
            </div>
          )}
        </Group>

        {/* ===== 8 · About & Legal ===== */}
        <Group label="About & Legal">
          <Row
            title="About Ovio"
            sub={`Version ${appInfo?.version || "…"} · Built by the team at Snippetz Labs`}
            onClick={() => setAboutOpen(true)}
          >
            <Info size={14} color={COLORS.textSecondary} />
          </Row>
          <Row
            title="Terms of Service & Conditions"
            sub="Your rights, your data, acceptable use"
            onClick={() => setLegalOpen(true)}
            last
          >
            <ScrollText size={14} color={COLORS.textSecondary} />
          </Row>
        </Group>

        {/* Footnote */}
        <div style={{ fontSize: 11, color: COLORS.textTertiary, lineHeight: 1.6, padding: "0 2px" }}>
          API keys are stored encrypted on this device only and are never sent
          anywhere except to their respective providers.
        </div>
      </div>
    </div>
  );
}
