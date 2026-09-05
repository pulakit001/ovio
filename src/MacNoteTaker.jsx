import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  Download,
  Sparkles,
  Send,
  X,
  PenLine,
  FileText,
  MessageSquareText,
  Folder,
  FolderPlus,
  ChevronRight,
  Plus,
  ArrowLeft,
  Disc,
  Square,
  Brain,
  RotateCw,
  Copy,
  Check,
} from "lucide-react";
import useTranscription from "./hooks/useTranscription";
import useAutoNotes from "./hooks/useAutoNotes";
import { askQuestion } from "./services/groq";
import { useSettings } from "./context/SettingsContext";

const COLORS = {
  windowBg: "#F6F3EC",
  surface: "#FDFCF8",
  sidebarBg: "#F1EDE6",
  border: "#E7E0D2",
  borderStrong: "#D6CCB8",
  text: "#221E17",
  textSecondary: "#6B6355",
  textTertiary: "#A89E8E",
  red: "#D95B4A",
  green: "#5D8458",
  blue: "#B4552D",
  selected: "#F2E5D8",
  accent: "#B4552D",
  accentSoft: "#F3E5D9",
  noteHighlight: "#F6EDE0",
  noteBorder: "#E4D0B4",
};

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDate(ts) {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function timeSince(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
}

function IconButton({ onClick, children, title, small }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: small ? 22 : 30,
        height: small ? 22 : 30,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: COLORS.textSecondary,
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#ECE5D9")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

function InlineCreateRow({ placeholder, indent, onConfirm, onCancel }) {
  const ref = useRef(null);
  const [value, setValue] = useState("");
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: `4px 10px 4px ${indent}px` }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { const v = value.trim(); if (v) onConfirm(v); else onCancel(); }
          if (e.key === "Escape") onCancel();
        }}
        onBlur={() => { const v = value.trim(); if (v) onConfirm(v); else onCancel(); }}
        placeholder={placeholder}
        style={{
          flex: 1,
          border: `1px solid ${COLORS.blue}`,
          outline: "none",
          fontSize: 12.5,
          fontFamily: FONT,
          color: COLORS.text,
          background: COLORS.surface,
          borderRadius: 6,
          padding: "4px 7px",
        }}
      />
    </div>
  );
}

function GeneratingBar() {
  return (
    <div style={{ position: "relative", height: 2, background: COLORS.border, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: "40%",
          background: COLORS.blue,
          borderRadius: 2,
          animation: "slide 1.5s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ai-notes-content { animation: fadeIn 0.4s ease; }
        .ai-notes-section { animation: fadeIn 0.3s ease; }
      `}</style>
    </div>
  );
}

function AiNotesToolbar({ aiNotes, onRegenerate, isGenerating, providerLabel }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(aiNotes);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = aiNotes;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePDF = () => {
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;
    const html = aiNotes
      .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;margin:20px 0 8px;color:#1D1D1F;border-bottom:1px solid #E1E1E4;padding-bottom:4px;">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:16px 0 6px;color:#1D1D1F;">$1</h3>')
      .replace(/^- \[ \] (.+)$/gm, '<div style="padding:3px 0;font-size:13px;line-height:1.6;">&#9744; $1</div>')
      .replace(/^- \[x\] (.+)$/gm, '<div style="padding:3px 0;font-size:13px;line-height:1.6;">&#9745; $1</div>')
      .replace(/^- (.+)$/gm, '<div style="padding:2px 0 2px 16px;font-size:13px;line-height:1.6;">&bull; $1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:#EFE8DC;padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
    w.document.write(`<!DOCTYPE html><html><head><title>AI Notes</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#1D1D1F;line-height:1.6;}</style></head><body>${html}</body></html>`);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  };

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {providerLabel && (
        <span title="AI provider that generated these notes" style={{
          fontSize: 10, fontWeight: 600, color: COLORS.textTertiary,
          border: `1px solid ${COLORS.border}`, borderRadius: 6,
          padding: "2px 7px", background: COLORS.surface,
        }}>
          {providerLabel}
        </span>
      )}
      <button
        onClick={handleCopy}
        title="Copy to clipboard"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          border: "none", background: "#EFE8DC", color: COLORS.textSecondary,
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          padding: "5px 10px", cursor: "pointer", fontFamily: FONT,
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#E2DAC9")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#EFE8DC")}
      >
        {copied ? <Check size={11} color={COLORS.green} /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        onClick={handlePDF}
        title="Download as PDF"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          border: "none", background: "#EFE8DC", color: COLORS.textSecondary,
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          padding: "5px 10px", cursor: "pointer", fontFamily: FONT,
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#E2DAC9")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#EFE8DC")}
      >
        <Download size={11} />
        PDF
      </button>
      <button
        onClick={onRegenerate}
        disabled={isGenerating}
        title="Regenerate notes"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          border: "none", background: isGenerating ? "#E2DAC9" : "#EFE8DC",
          color: COLORS.textSecondary, fontSize: 11, fontWeight: 500,
          borderRadius: 6, padding: "5px 10px", cursor: isGenerating ? "default" : "pointer",
          fontFamily: FONT, transition: "background 120ms ease",
        }}
      >
        <RotateCw size={11} style={{ animation: isGenerating ? "spin 1s linear infinite" : "none" }} />
        {isGenerating ? "Generating…" : "Reload"}
      </button>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Inline markdown rendering: **bold**, *italic*, `code`
function renderInlineMd(text) {
  const src = text || "";
  const parts = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let k = 0;
  let m;
  while ((m = regex.exec(src)) !== null) {
    if (m.index > last) parts.push(src.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      parts.push(
        <code key={`c${k++}`} style={{
          background: "#EFE8DC", padding: "1px 5px", borderRadius: 4, fontSize: 12.5,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: COLORS.text,
        }}>
          {tok.slice(1, -1)}
        </code>
      );
    } else if (tok.startsWith("**")) {
      parts.push(<strong key={`b${k++}`} style={{ fontWeight: 700, color: COLORS.text }}>{tok.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={`i${k++}`}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < src.length) parts.push(src.slice(last));
  return parts;
}

// Parse a markdown pipe-table block (array of raw lines) into { header, rows }
function parseMdTable(tableLines) {
  const rows = tableLines
    .filter((l) => !/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l)) // drop the |---|---| separator row
    .map((l) => {
      const trimmed = l.trim().replace(/^\|/, "").replace(/\|$/, "");
      return trimmed.split("|").map((c) => c.trim());
    });
  if (rows.length === 0) return null;
  const [header, ...body] = rows;
  const colCount = header.length;
  const norm = (r) => {
    const c = r.slice(0, colCount);
    while (c.length < colCount) c.push("");
    return c;
  };
  return { header: norm(header), rows: body.map(norm) };
}

function renderAiNotesFormatted(aiNotes) {
  if (!aiNotes) return null;
  const lines = aiNotes.split("\n");
  const elements = [];
  let listItems = [];
  let tableLines = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <div key={`list-${elements.length}`} style={{ display: "flex", flexDirection: "column", gap: 3, margin: "4px 0 8px" }}>
          {listItems.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13.5, lineHeight: 1.55, color: COLORS.text }}>
              <span style={{ color: COLORS.textTertiary, marginTop: 1, flexShrink: 0 }}>•</span>
              <span>{renderInlineMd(item)}</span>
            </div>
          ))}
        </div>
      );
      listItems = [];
    }
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const t = parseMdTable(tableLines);
    tableLines = [];
    if (!t || t.header.length === 0) return;
    elements.push(
      <div key={`table-${elements.length}`} style={{ overflowX: "auto", margin: "6px 0 12px" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5, fontFamily: FONT }}>
          <thead>
            <tr>
              {t.header.map((c, j) => (
                <th key={j} style={{
                  textAlign: "left", padding: "7px 10px", background: COLORS.sidebarBg,
                  borderBottom: `2px solid ${COLORS.borderStrong}`, fontSize: 12,
                  fontWeight: 700, color: COLORS.text,
                }}>
                  {renderInlineMd(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j} style={{
                    padding: "7px 10px", borderBottom: `1px solid ${COLORS.border}`,
                    background: ri % 2 === 1 ? "#FAF7F0" : "transparent",
                    lineHeight: 1.5, color: COLORS.text, verticalAlign: "top",
                  }}>
                    {renderInlineMd(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Markdown tables: consecutive lines starting with a pipe
    if (trimmed.startsWith("|")) {
      flushList();
      tableLines.push(line);
      continue;
    }
    flushTable();

    // Session title (# heading)
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <div key={i} className="ai-notes-section" style={{
          fontSize: 19, fontWeight: 800, color: COLORS.text, letterSpacing: -0.3,
          marginTop: 2, marginBottom: 12,
        }}>
          {renderInlineMd(line.slice(2))}
        </div>
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <div key={i} className="ai-notes-section" style={{
          fontSize: 15, fontWeight: 700, color: COLORS.text,
          marginTop: i === 0 ? 0 : 20, marginBottom: 8,
          paddingBottom: 6, borderBottom: `1px solid ${COLORS.border}`,
        }}>
          {renderInlineMd(line.slice(3))}
        </div>
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <div key={i} style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text, marginTop: 14, marginBottom: 4 }}>
          {renderInlineMd(line.slice(4))}
        </div>
      );
      continue;
    }

    const checkboxMatch = line.match(/^- \[([ x])\] (.+)$/);
    if (checkboxMatch) {
      flushList();
      const checked = checkboxMatch[1] === "x";
      elements.push(
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 13.5, lineHeight: 1.5 }}>
          <span style={{
            width: 15, height: 15, borderRadius: 3, border: `1.5px solid ${checked ? COLORS.green : COLORS.borderStrong}`,
            background: checked ? COLORS.green : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {checked && <Check size={10} color="#fff" />}
          </span>
          <span style={{ color: COLORS.text }}>{renderInlineMd(checkboxMatch[2])}</span>
        </div>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
      continue;
    }

    flushList();
    if (trimmed === "") {
      continue;
    }

    elements.push(
      <div key={i} style={{ fontSize: 13.5, lineHeight: 1.6, color: COLORS.text, marginBottom: 2 }}>
        {renderInlineMd(line)}
      </div>
    );
  }
  flushList();
  flushTable();
  return elements;
}

export default function MacNoteTaker({
  projects,
  setProjects,
  recordingsBySub,
  setRecordingsBySub,
  navProjectId,
  navSubprojectId,
  navRecordingId,
  clearNavRecording,
  onNavigateToDashboard,
  onRecordingStatus,
}) {
  const { settings, getActiveGroqKeys, getActiveOpenRouterKeys, hasAnyKey } = useSettings();
  const [expanded, setExpanded] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedSubprojectId, setSelectedSubprojectId] = useState(null);
  const [activeRecordingId, setActiveRecordingId] = useState(null);

  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingSubFor, setCreatingSubFor] = useState(null);

  const [label, setLabel] = useState("Untitled Recording");
  const [elapsed, setElapsed] = useState(0);
  const [notes, setNotes] = useState([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [tab, setTab] = useState("transcript");
  const [bars, setBars] = useState(Array.from({ length: 40 }, () => 4));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const elapsedRef = useRef(0);
  const transcriptContainerRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const aiEndRef = useRef(null);
  const noteInputRef = useRef(null);
  const labelInputRef = useRef(null);
  const notesUpdatedRef = useRef(null);

  const {
    transcript,
    setTranscript,
    interim,
    isTranscribing,
    error: speechError,
    start: startTranscription,
    stop: stopTranscription,
    clearInterim,
  } = useTranscription();

  const {
    aiNotes,
    isGenerating: notesGenerating,
    lastUpdated: notesLastUpdated,
    notesProvider,
    error: notesError,
    regenerate: regenerateNotes,
  } = useAutoNotes(transcript, isTranscribing);

  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (navSubprojectId) {
      setSelectedProjectId(navProjectId);
      setSelectedSubprojectId(navSubprojectId);
    }
  }, [navProjectId, navSubprojectId]);

  useEffect(() => {
    if (navRecordingId && selectedSubprojectId) {
      const recs = recordingsBySub[selectedSubprojectId] || [];
      const rec = recs.find((r) => r.id === navRecordingId);
      if (rec) openRecording(rec);
      clearNavRecording?.();
    }
  }, [navRecordingId, selectedSubprojectId, recordingsBySub]);

  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // Report recording status up to the shell so it can show the
  // background recording pill when the user navigates away.
  useEffect(() => {
    onRecordingStatus?.({
      isRecording,
      label,
      startedAtMs: Date.now() - elapsedRef.current * 1000,
    });
  }, [isRecording, label, onRecordingStatus]);

  useEffect(() => { if (editingLabel) labelInputRef.current?.select(); }, [editingLabel]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    const id = setInterval(() => {
      setBars((prev) => prev.map(() => (isRecording ? 6 + Math.random() * 34 : 4)));
    }, 260);
    return () => clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    if (autoScroll) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, interim, tab, autoScroll]);

  useEffect(() => { aiEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [aiMessages, aiLoading]);

  useEffect(() => { if (noteOpen) noteInputRef.current?.focus(); }, [noteOpen]);

  useEffect(() => {
    if (notesLastUpdated) {
      notesUpdatedRef.current = setInterval(() => setNotesUpdateTick((t) => t + 1), 10000);
    }
    return () => { if (notesUpdatedRef.current) clearInterval(notesUpdatedRef.current); };
  }, [notesLastUpdated]);

  const [, setNotesUpdateTick] = useState(0);

  const handleTranscriptScroll = useCallback(() => {
    const el = transcriptContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  useEffect(() => {
    if (!activeRecordingId || !selectedSubprojectId) return;
    setRecordingsBySub((prev) => {
      const list = prev[selectedSubprojectId] || [];
      const idx = list.findIndex((r) => r.id === activeRecordingId);
      if (idx === -1) return prev;
      const updated = {
        ...list[idx],
        label,
        duration: elapsed,
        transcript,
        notes,
        aiMessages,
        aiNotes,
      };
      const nextList = [...list];
      nextList[idx] = updated;
      return { ...prev, [selectedSubprojectId]: nextList };
    });
  }, [label, elapsed, transcript, notes, aiMessages, aiNotes, activeRecordingId, selectedSubprojectId]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      setIsRecording(false);
      stopTranscription();
    } else {
      setIsRecording(true);
      setAutoScroll(true);
      startTranscription();
    }
  }, [isRecording, startTranscription, stopTranscription]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    stopTranscription();
    setTab("ai-notes");
  }, [stopTranscription]);

  useEffect(() => {
    const fatal = speechError && (
      speechError.includes("denied") || speechError.includes("Denied") ||
      speechError.includes("failed") || speechError.includes("lost") ||
      speechError.includes("key") || speechError.includes("error")
    );
    if (fatal && isRecording) {
      setIsRecording(false);
      stopTranscription();
    }
  }, [speechError, isRecording, stopTranscription]);

  const handleAddNote = () => {
    const text = noteInput.trim();
    if (!text) { setNoteOpen(false); return; }
    setNotes((prev) => [...prev, { time: formatTime(elapsed), text, timestamp: Date.now() }]);
    setNoteInput("");
    setNoteOpen(false);
    setTab("transcript");
  };

  const handleDownload = () => {
    const transcriptBody = transcript.length === 0 ? "(none)" : transcript.map((l) => `[${l.time}] ${l.text}`).join("\n");
    const notesBody = notes.length === 0 ? "(none)" : notes.map((n) => `[${n.time}] ${n.text}`).join("\n");
    const aiNotesBody = aiNotes || "(none)";
    const body = `${label}\n\nTRANSCRIPT\n\n${transcriptBody}\n\nNOTES\n\n${notesBody}\n\nAI NOTES\n\n${aiNotesBody}`;
    const blob = new Blob([body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.replace(/[^\w\- ]/g, "").trim() || "recording"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAskAI = useCallback(async () => {
    const question = aiInput.trim();
    if (!question || aiLoading) return;
    setAiInput("");
    setAiOpen(true);
    const nextMessages = [...aiMessages, { role: "user", content: question }];
    setAiMessages(nextMessages);
    setAiLoading(true);
    try {
      // Always read the freshest API keys straight from the main process —
      // the React-context copy can be stale if keys were added or changed
      // during this session, which made the chat silently fail while the
      // auto-summary (which re-reads keys every run) kept working.
      let keys = {
        groqKeys: getActiveGroqKeys(),
        openrouterKeys: getActiveOpenRouterKeys(),
        aiProvider: settings?.aiProvider || "cloud",
        ollama: { url: settings?.ollamaUrl, model: settings?.ollamaModel },
      };
      try {
        const plain = await window.settingsAPI?.getPlain?.();
        if (plain) {
          keys = {
            groqKeys: plain.groqKeys?.length ? plain.groqKeys : keys.groqKeys,
            openrouterKeys: plain.openrouterKeys?.length ? plain.openrouterKeys : keys.openrouterKeys,
            aiProvider: plain.aiProvider || keys.aiProvider,
            ollama: { url: plain.ollamaUrl || keys.ollama.url, model: plain.ollamaModel || keys.ollama.model },
          };
        }
      } catch {}
      // Send the recent conversation so follow-up questions keep their context.
      const history = aiMessages.slice(-8);
      const text = await askQuestion(keys, transcript, aiNotes, question, history);
      setAiMessages((prev) => [...prev, { role: "assistant", content: text || "(The assistant returned an empty response.)" }]);
    } catch (err) {
      console.error("[ovio] AI chat failed:", err);
      const msg = (err && err.message) || "Something went wrong reaching the assistant.";
      setAiMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setAiLoading(false);
    }
  }, [aiInput, aiLoading, aiMessages, transcript, aiNotes, settings, getActiveGroqKeys, getActiveOpenRouterKeys]);

  const addProject = (name) => {
    const id = genId();
    setProjects((prev) => [...prev, { id, name, subprojects: [] }]);
    setExpanded((prev) => ({ ...prev, [id]: true }));
    setCreatingProject(false);
  };

  const addSubprojectLocal = (projectId, name) => {
    const id = genId();
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, subprojects: [...p.subprojects, { id, name }] } : p
      )
    );
    setExpanded((prev) => ({ ...prev, [projectId]: true }));
    setCreatingSubFor(null);
    selectSubproject(projectId, id);
  };

  const selectSubproject = (projectId, subprojectId) => {
    setActiveRecordingId(null);
    setIsRecording(false);
    stopTranscription();
    setSelectedProjectId(projectId);
    setSelectedSubprojectId(subprojectId);
  };

  const openRecording = (rec) => {
    // Never leak a running session into a different recording.
    if (isRecording) stopRecording();
    setLabel(rec.label);
    setElapsed(rec.duration || 0);
    setTranscript(rec.transcript || []);
    setNotes(rec.notes || []);
    setAiMessages(rec.aiMessages || []);
    clearInterim();
    setTab("transcript");
    setAiOpen(false);
    setIsRecording(false);
    setActiveRecordingId(rec.id);
    setAutoScroll(true);
  };

  const createRecording = () => {
    if (!selectedSubprojectId) return;
    const id = genId();
    const rec = {
      id, label: "Untitled Recording", createdAt: Date.now(),
      duration: 0, transcript: [], notes: [], aiMessages: [], aiNotes: "",
    };
    setRecordingsBySub((prev) => ({
      ...prev,
      [selectedSubprojectId]: [...(prev[selectedSubprojectId] || []), rec],
    }));
    openRecording(rec);
  };

  const backToList = () => {
    setIsRecording(false);
    stopTranscription();
    setActiveRecordingId(null);
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const currentSubproject = currentProject?.subprojects.find((s) => s.id === selectedSubprojectId);
  const currentRecordings = (recordingsBySub[selectedSubprojectId] || [])
    .slice().sort((a, b) => b.createdAt - a.createdAt);

  // Ollama-based providers need no API keys at all.
  const usesLocalAi = settings?.aiProvider === "ollama" || settings?.aiProvider === "localOnly";
  const noApiKey = !hasAnyKey() && !usesLocalAi;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{
        height: 52, minHeight: 52, display: "flex", alignItems: "center",
        padding: "0 16px", paddingLeft: 80,
        borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface,
        gap: 10,
      }}>
        {activeRecordingId ? (
          <>
            <div style={{ WebkitAppRegion: "no-drag" }}><IconButton onClick={backToList} title="Back to recordings"><ArrowLeft size={16} /></IconButton></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.textSecondary, minWidth: 0 }}>
              <span style={{ whiteSpace: "nowrap", WebkitAppRegion: "no-drag" }}>{currentProject?.name}</span>
              <ChevronRight size={12} />
              <span style={{ whiteSpace: "nowrap", WebkitAppRegion: "no-drag" }}>{currentSubproject?.name}</span>
              <ChevronRight size={12} />
              {editingLabel ? (
                <input
                  ref={labelInputRef} value={label} onChange={(e) => setLabel(e.target.value)}
                  onBlur={() => setEditingLabel(false)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingLabel(false); }}
                  style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, border: "none", outline: "none", background: "transparent", fontFamily: FONT, padding: 0, minWidth: 120, WebkitAppRegion: "no-drag" }}
                />
              ) : (
                <span onClick={() => setEditingLabel(true)} title="Click to rename"
                  style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, cursor: "text", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", WebkitAppRegion: "no-drag" }}>
                  {label}
                </span>
              )}
            </div>
            <div style={{ flex: 1, WebkitAppRegion: "drag", alignSelf: "stretch", cursor: "default" }} />
            <span style={{ width: 8, height: 8, borderRadius: 999, background: isRecording ? COLORS.red : COLORS.textTertiary }} />
            <span style={{ fontSize: 13, color: COLORS.textSecondary, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsed)}</span>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>
              {currentProject && currentSubproject ? `${currentProject.name} / ${currentSubproject.name}` : "Ovio"}
            </div>
            <div style={{ flex: 1, WebkitAppRegion: "drag", alignSelf: "stretch", cursor: "default" }} />
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Sidebar — Finder-style source list */}
        <div style={{ width: 240, minWidth: 240, display: "flex", flexDirection: "column", borderRight: `1px solid ${COLORS.border}`, background: COLORS.sidebarBg }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 6px" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textTertiary, letterSpacing: 0.2 }}>Projects</span>
              <IconButton onClick={() => setCreatingProject(true)} title="New project" small><FolderPlus size={13} /></IconButton>
            </div>

            {projects.length === 0 && !creatingProject ? (
              <div style={{ fontSize: 12, color: COLORS.textTertiary, padding: "8px 6px", lineHeight: 1.6 }}>
                No projects yet.<br />Create one to organize your recordings.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {projects.map((p) => (
                  <div key={p.id}>
                    {/* Project (folder) row */}
                    <div
                      onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      title={p.name}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 8px", cursor: "pointer", borderRadius: 6,
                        height: 26,
                      }}
                      onMouseEnter={(e) => { if (!expanded[p.id]) e.currentTarget.style.background = "#E8E2D6"; }}
                      onMouseLeave={(e) => { if (!expanded[p.id]) e.currentTarget.style.background = "transparent"; }}
                    >
                      <ChevronRight size={13} color={COLORS.textTertiary} style={{ transition: "transform 150ms ease", transform: expanded[p.id] ? "rotate(90deg)" : "rotate(0deg)" }} />
                      <Folder size={15} color={COLORS.blue} strokeWidth={1.8} style={{ fill: "none" }} />
                      <span style={{ fontSize: 13, color: COLORS.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{p.name}</span>
                      <IconButton onClick={(e) => { e.stopPropagation(); setExpanded((prev) => ({ ...prev, [p.id]: true })); setCreatingSubFor(p.id); }} title="New subproject" small><Plus size={12} /></IconButton>
                    </div>

                    {/* Subprojects */}
                    {expanded[p.id] && (
                      <div style={{ marginTop: 1 }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          {p.subprojects.map((s) => (
                            <div
                              key={s.id}
                              onClick={() => selectSubproject(p.id, s.id)}
                              title={s.name}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "5px 8px", marginLeft: 16, borderRadius: 6,
                                cursor: "pointer", height: 24,
                                background: selectedSubprojectId === s.id ? COLORS.blue : "transparent",
                              }}
                              onMouseEnter={(e) => { if (selectedSubprojectId !== s.id) e.currentTarget.style.background = "#E4DED2"; }}
                              onMouseLeave={(e) => { if (selectedSubprojectId !== s.id) e.currentTarget.style.background = "transparent"; }}
                            >
                              <Disc size={13} color={selectedSubprojectId === s.id ? "#FFFFFF" : COLORS.textTertiary} strokeWidth={1.8} />
                              <span style={{
                                fontSize: 12.5,
                                color: selectedSubprojectId === s.id ? "#FFFFFF" : COLORS.text,
                                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{s.name}</span>
                            </div>
                          ))}
                        </div>
                        {creatingSubFor === p.id && (
                          <InlineCreateRow placeholder="Subproject name" indent={24} onConfirm={(name) => addSubprojectLocal(p.id, name)} onCancel={() => setCreatingSubFor(null)} />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {creatingProject && (
              <InlineCreateRow placeholder="Project name" indent={8} onConfirm={addProject} onCancel={() => setCreatingProject(false)} />
            )}
          </div>
        </div>

        {/* Main area */}
        {!selectedSubprojectId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.windowBg }}>
            <div style={{ textAlign: "center", color: COLORS.textTertiary, fontSize: 13.5, lineHeight: 1.7, maxWidth: 320 }}>
              {noApiKey ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${COLORS.blue}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Brain size={22} color={COLORS.blue} />
                  </div>
                  <div style={{ fontWeight: 600, color: COLORS.text, fontSize: 15 }}>Add an API key to get started</div>
                  <div style={{ color: COLORS.textSecondary, lineHeight: 1.6 }}>Unlock AI notes and cloud transcription.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontWeight: 500, color: COLORS.textSecondary }}>Select a subproject from the sidebar</div>
                  <div style={{ fontSize: 12.5 }}>or create one to start recording.</div>
                </div>
              )}
            </div>
          </div>
        ) : !activeRecordingId ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: COLORS.windowBg }}>
            <div style={{ height: 48, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface }}>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{currentRecordings.length} recording{currentRecordings.length === 1 ? "" : "s"}</span>
              <button onClick={createRecording} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: COLORS.text, color: "#fff", fontSize: 12.5, fontWeight: 500, borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>
                <Mic size={13} /> New Recording
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {currentRecordings.length === 0 ? (
                <div style={{ fontSize: 13, color: COLORS.textTertiary, marginTop: 12, lineHeight: 1.6 }}>No recordings yet. Click "New Recording" to start.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {currentRecordings.map((rec) => (
                    <div key={rec.id} onClick={() => openRecording(rec)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.borderStrong)}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}>
                      <div style={{ width: 34, height: 34, borderRadius: 999, background: "#EFE9DC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Disc size={15} color={COLORS.textSecondary} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.label}</div>
                        <div style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 1 }}>{formatDate(rec.createdAt)}</div>
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums" }}>{formatTime(rec.duration || 0)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Recording area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, background: COLORS.windowBg, position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, height: 64 }}>
                {bars.map((h, i) => (
                  <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: isRecording ? COLORS.text : COLORS.borderStrong, transition: "height 220ms ease" }} />
                ))}
              </div>

              <div style={{ fontSize: 64, fontWeight: 200, letterSpacing: 1, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{formatTime(elapsed)}</div>

              <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setNoteOpen((o) => !o)} title="Add a note"
                    style={{ width: 52, height: 52, borderRadius: 999, border: `1px solid ${COLORS.borderStrong}`, background: noteOpen ? COLORS.text : COLORS.surface, color: noteOpen ? "#FFFFFF" : COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 150ms ease, color 150ms ease" }}>
                    <PenLine size={18} />
                  </button>
                  <span style={{ fontSize: 11.5, color: COLORS.textSecondary }}>Add note</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <button onClick={toggleRecording}
                    style={{ width: 76, height: 76, borderRadius: 999, border: `1px solid ${COLORS.borderStrong}`, background: COLORS.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isRecording ? `0 0 0 6px rgba(255,59,48,0.12)` : "0 1px 2px rgba(0,0,0,0.06)", transition: "box-shadow 200ms ease" }}>
                    {isRecording ? <Square size={22} fill={COLORS.red} color={COLORS.red} /> : <div style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.red }} />}
                  </button>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                    {isRecording ? "Tap to pause" : transcript.length > 0 || elapsed > 0 ? "Tap to resume" : "Tap to record"}
                  </span>
                </div>

                <div style={{ width: 52 }} />
              </div>

              {noteOpen && (
                <div style={{ position: "absolute", bottom: 128, width: 420, maxWidth: "80%", background: COLORS.surface, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <input ref={noteInputRef} value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); if (e.key === "Escape") { setNoteInput(""); setNoteOpen(false); } }}
                    placeholder={`Note at ${formatTime(elapsed)}…`}
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: FONT, color: COLORS.text, background: "transparent", padding: "6px 4px" }} />
                  <button onClick={handleAddNote} style={{ border: "none", background: COLORS.blue, color: "#FFFFFF", fontSize: 12.5, fontWeight: 500, borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>Save</button>
                </div>
              )}

              {speechError && (
                <div style={{ position: "absolute", bottom: 24, fontSize: 12, color: COLORS.red, maxWidth: 420, textAlign: "center" }}>{speechError}</div>
              )}
            </div>

            {/* Right sidebar */}
            <div style={{ width: 400, minWidth: 400, display: "flex", flexDirection: "column", borderLeft: `1px solid ${COLORS.border}`, background: COLORS.sidebarBg }}>
              {/* Tabs */}
              <div style={{ height: 48, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px 0 12px", borderBottom: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", gap: 2 }}>
                  {[
                    { id: "transcript", icon: <MessageSquareText size={13} />, label: "Transcript" },
                    { id: "ai-notes", icon: <Brain size={13} />, label: "AI Notes" },
                  ].map((t) => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                      style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: tab === t.id ? COLORS.accentSoft : "transparent", color: tab === t.id ? COLORS.accent : COLORS.textSecondary, fontSize: 12, fontWeight: 600, borderRadius: 7, padding: "6px 9px", cursor: "pointer" }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
                <IconButton onClick={handleDownload} title="Download"><Download size={15} /></IconButton>
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}
                ref={tab === "transcript" ? transcriptContainerRef : undefined}
                onScroll={tab === "transcript" ? handleTranscriptScroll : undefined}>

                {tab === "transcript" && (
                  transcript.length === 0 && notes.length === 0 && !interim ? (
                    <div style={{ fontSize: 13, color: COLORS.textTertiary, marginTop: 12, lineHeight: 1.6 }}>
                      {isRecording ? "Listening…" : "Start recording to see a live transcript here."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {/* User notes — their own section pinned at the top */}
                      {notes.length > 0 && (
                        <div style={{
                          marginBottom: 14, padding: "10px 12px",
                          background: COLORS.noteHighlight, border: `1px solid ${COLORS.noteBorder}`,
                          borderRadius: 10, maxHeight: 220, overflowY: "auto", flexShrink: 0,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#F57F17", marginBottom: 8, position: "sticky", top: -10, marginTop: -10, paddingTop: 10, background: COLORS.noteHighlight }}>
                            <PenLine size={11} /> NOTES
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {notes.map((n, i) => (
                              <div key={`note-${i}`} style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.5, fontStyle: "italic" }}>
                                <span style={{ fontSize: 10.5, color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums", fontStyle: "normal", marginRight: 8 }}>{n.time}</span>
                                {n.text}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Transcript */}
                      {transcript.length > 0 || interim ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                          {transcript.map((t, i) => (
                            <div key={`t-${i}`} style={{ padding: "6px 0" }}>
                              <div style={{ fontSize: 11, color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums", marginBottom: 2 }}>{t.time}</div>
                              <div style={{ fontSize: 13.5, color: COLORS.text, lineHeight: 1.55 }}>{t.text}</div>
                            </div>
                          ))}
                          {interim && (
                            <div style={{ padding: "6px 0" }}>
                              <div style={{ fontSize: 11, color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums", marginBottom: 2 }}>
                                {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </div>
                              <div style={{ fontSize: 13.5, color: COLORS.textTertiary, lineHeight: 1.55, fontStyle: "italic" }}>{interim}</div>
                            </div>
                          )}
                          <div ref={transcriptEndRef} />
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, color: COLORS.textTertiary, marginTop: 12, lineHeight: 1.6 }}>
                          {isRecording ? "Listening…" : "Start recording to see a live transcript here."}
                        </div>
                      )}
                    </div>
                  )
                )}

                {tab === "ai-notes" && (
                  <div>
                    {noApiKey ? (
                      <div style={{ textAlign: "center", padding: "32px 0", color: COLORS.textTertiary, fontSize: 13, lineHeight: 1.6 }}>
                        <Brain size={28} style={{ marginBottom: 12, opacity: 0.7 }} />
                        <div>Add an API key in Settings — or switch to Ollama — to generate AI notes.</div>
                      </div>
                    ) : (
                      <>
                        {notesGenerating && <GeneratingBar />}

                        {notesLastUpdated && (
                          <div className="ai-notes-content" style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 11, color: COLORS.textTertiary }}>Updated {timeSince(notesLastUpdated)}</span>
                              <AiNotesToolbar aiNotes={aiNotes} onRegenerate={regenerateNotes} isGenerating={notesGenerating} providerLabel={notesProvider} />
                            </div>
                          </div>
                        )}

                        {notesGenerating && !aiNotes && (
                          <div style={{ padding: "32px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>
                            Generating in-depth summary from your transcript…
                          </div>
                        )}

                        {notesError && (
                          <div style={{ padding: "12px", background: "#FFF2F2", borderRadius: 8, color: COLORS.red, fontSize: 12, marginBottom: 12 }}>{notesError}</div>
                        )}

                        {aiNotes && (
                          <div className="ai-notes-content" style={{ paddingTop: notesLastUpdated ? 0 : 4 }}>
                            {renderAiNotesFormatted(aiNotes)}
                          </div>
                        )}

                        {!aiNotes && !notesGenerating && !notesError && transcript.length === 0 && (
                          <div style={{ padding: "32px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13, lineHeight: 1.6 }}>
                            Start recording — AI notes will be generated automatically from your transcript.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* AI Chat */}
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: "auto" }}>
                {aiOpen && (
                  <div style={{ maxHeight: 240, overflowY: "auto", padding: "12px 16px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {aiMessages.length === 0 && !aiLoading && (
                      <div style={{ fontSize: 12, color: COLORS.textTertiary, textAlign: "center", padding: "10px 0" }}>Ask anything about your recording</div>
                    )}
                    {aiMessages.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
                          fontSize: 12.5, lineHeight: 1.5,
                          background: m.role === "user" ? COLORS.text : "#EFE8DC",
                          color: m.role === "user" ? "#FFFFFF" : COLORS.text,
                          whiteSpace: "pre-wrap",
                        }}>{m.content}</div>
                      </div>
                    ))}
                    {aiLoading && <div style={{ fontSize: 12, color: COLORS.textTertiary, padding: "6px 0" }}>Thinking…</div>}
                    <div ref={aiEndRef} />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                  <button onClick={() => setAiOpen((o) => !o)} title={aiOpen ? "Hide chat" : "Show chat"}
                    style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: COLORS.surface, color: aiOpen ? COLORS.textTertiary : COLORS.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {aiOpen ? <X size={13} /> : <Sparkles size={13} />}
                  </button>
                  <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && aiInput.trim()) handleAskAI(); }}
                    placeholder="Ask a question about this recording…"
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 12.5, fontFamily: FONT, color: COLORS.text, background: "transparent", padding: "4px 0" }} />
                  <button onClick={handleAskAI} disabled={!aiInput.trim() || aiLoading}
                    style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: aiInput.trim() ? COLORS.blue : COLORS.border, color: "#FFFFFF", cursor: aiInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Send size={12} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
