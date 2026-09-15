import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  Inbox,
  ChevronRight,
  Plus,
  ArrowLeft,
  Disc,
  Square,
  Brain,
  RotateCw,
  Copy,
  Check,
  Pencil,
  Trash2,
  Layers,
  FolderInput,
  MoveRight,
  Paperclip,
  File as FileIco,
} from "lucide-react";
import useTranscription from "../hooks/useTranscription";
import useAutoNotes from "../hooks/useAutoNotes";
import { askQuestion } from "../services/ai";
import { useSettings } from "../context/SettingsContext";
import { ANIM_CSS, rowIn, stepIn } from "../ui/anim";
import { COLORS } from "../ui/theme"; // live theme object — follows dark/light swaps
import TransferModal from "../components/TransferModal";

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
      onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </button>
  );
}

// Inline rename input used for projects, subprojects and recordings.
function InlineRenameRow({ initial, indent, onConfirm, onCancel }) {
  const ref = useRef(null);
  const doneRef = useRef(false);
  const [value, setValue] = useState(initial);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (fn) => {
    if (doneRef.current) return;
    doneRef.current = true;
    fn();
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: `3px 10px 3px ${indent}px` }}>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(() => onConfirm(value.trim()));
          if (e.key === "Escape") finish(onCancel);
        }}
        onBlur={() => finish(() => { const v = value.trim(); if (v) onConfirm(v); else onCancel(); })}
        style={{ flex: 1, border: `1px solid ${COLORS.borderStrong}`, outline: "none", fontSize: 12.5, fontFamily: FONT, color: COLORS.text, background: COLORS.surface, borderRadius: 6, padding: "4px 8px" }}
      />
    </div>
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

// Stage metadata for the generation panel: label + which lucide icon pulses.
const GENERATION_STAGES = {
  reading: { label: "Reading transcript", icon: FileText },
  analyzing: { label: "Agents analyzing transcript", icon: Brain },
  combining: { label: "Combining agent findings", icon: Sparkles },
  writing: { label: "Writing detailed notes", icon: PenLine },
  done: { label: "Finishing up", icon: Check },
};

function GeneratingPanel({ progress }) {
  const stage = progress?.stage || "reading";
  const meta = GENERATION_STAGES[stage] || GENERATION_STAGES.reading;
  const StageIcon = meta.icon;
  const total = progress?.totalParts || 0;
  const part = progress?.part || 0;
  // Real percent when known; CSS transition makes every step glide smoothly.
  const percent = typeof progress?.percent === "number"
    ? Math.min(100, Math.max(2, progress.percent))
    : null;

  const detail =
    stage === "analyzing" && total > 1
      ? `Agent ${Math.max(1, part)} of ${total} · part ${Math.max(1, part)}/${total}`
      : stage === "combining" && total > 1
        ? `Merging ${total > REDUCE_HINT ? "in rounds" : `${total} agent summaries`}`
        : stage === "reading"
          ? "Splitting transcript for the agents"
          : meta.label;

  return (
    <div style={{ marginBottom: 14 }}>
      <style>{`
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes genPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.92); }
        }
        @keyframes genDots {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 1; }
        }
        @keyframes genShimmer {
          0% { opacity: 0.35; }
          50% { opacity: 0.7; }
          100% { opacity: 0.35; }
        }
        @keyframes genBarSlide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        .gen-stage-label { animation: fadeIn 0.35s ease; }
        .ai-notes-content { animation: fadeIn 0.4s ease; }
        .ai-notes-section { animation: fadeIn 0.3s ease; }
      `}</style>

      {/* Thin top progress rail — real percent with smooth transition, or
          an indeterminate slide while percent is unknown. */}
      <div style={{ position: "relative", height: 3, background: COLORS.border, borderRadius: 2, overflow: "hidden" }}>
        {percent != null ? (
          <div
            style={{
              height: "100%",
              width: `${percent}%`,
              background: `linear-gradient(90deg, ${COLORS.accent}, #4D8DFF)`,
              borderRadius: 2,
              transition: "width 700ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute", top: 0, left: 0, height: "100%", width: "30%",
              background: COLORS.accent, borderRadius: 2,
              animation: "genBarSlide 1.4s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {/* Stage card */}
      <div
        style={{
          marginTop: 10, padding: "12px 14px",
          background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, textAlign: "left",
        }}
      >
        <div className="gen-stage-label" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 28, height: 28, borderRadius: 8, flexShrink: 0,
              background: COLORS.accentSoft, color: COLORS.accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "genPulse 1.8s ease-in-out infinite",
            }}
          >
            <StageIcon size={15} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{meta.label}</span>
              <span style={{ fontSize: 12, color: COLORS.textTertiary, letterSpacing: 1 }}>
                <span style={{ animation: "genDots 1.4s infinite", animationDelay: "0s" }}>.</span>
                <span style={{ animation: "genDots 1.4s infinite", animationDelay: "0.2s" }}>.</span>
                <span style={{ animation: "genDots 1.4s infinite", animationDelay: "0.4s" }}>.</span>
              </span>
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 }}>
              {detail}
              {percent != null && ` · ${Math.round(percent)}%`}
            </span>
          </span>
        </div>

        {/* Shimmering skeleton preview of the notes being written. */}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
          {[72, 88, 60].map((w, i) => (
            <div
              key={i}
              style={{
                height: 7, width: `${w}%`, borderRadius: 4,
                background: COLORS.border,
                animation: "genShimmer 1.6s ease-in-out infinite",
                animationDelay: `${i * 0.25}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Threshold above which "combining" shows the "in rounds" wording (mirrors
// REDUCE_GROUP in src/services/ai.js).
const REDUCE_HINT = 5;

function AiNotesToolbar({ aiNotes, onRegenerate, isGenerating, providerLabel, regenerateLabel = "Regenerate" }) {
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
      .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;margin:20px 0 8px;color:COLORS.sidebarBg;border-bottom:1px solid COLORS.surface2;padding-bottom:4px;">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:16px 0 6px;color:COLORS.sidebarBg;">$1</h3>')
      .replace(/^- \[ \] (.+)$/gm, '<div style="padding:3px 0;font-size:13px;line-height:1.6;">&#9744; $1</div>')
      .replace(/^- \[x\] (.+)$/gm, '<div style="padding:3px 0;font-size:13px;line-height:1.6;">&#9745; $1</div>')
      .replace(/^- (.+)$/gm, '<div style="padding:2px 0 2px 16px;font-size:13px;line-height:1.6;">&bull; $1</div>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:COLORS.surface2;padding:1px 4px;border-radius:3px;font-size:12px;">$1</code>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');
    w.document.write(`<!DOCTYPE html><html><head><title>AI Notes</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:COLORS.sidebarBg;line-height:1.6;}</style></head><body>${html}</body></html>`);
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
          border: "none", background: COLORS.surface2, color: COLORS.textSecondary,
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          padding: "5px 10px", cursor: "pointer", fontFamily: FONT,
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface3)}
        onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surface2)}
      >
        {copied ? <Check size={11} color={COLORS.green} /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button
        onClick={handlePDF}
        title="Download as PDF"
        style={{
          display: "flex", alignItems: "center", gap: 4,
          border: "none", background: COLORS.surface2, color: COLORS.textSecondary,
          fontSize: 11, fontWeight: 500, borderRadius: 6,
          padding: "5px 10px", cursor: "pointer", fontFamily: FONT,
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface3)}
        onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surface2)}
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
          border: "none", background: isGenerating ? COLORS.surface3 : COLORS.surface2,
          color: COLORS.textSecondary, fontSize: 11, fontWeight: 500,
          borderRadius: 6, padding: "5px 10px", cursor: isGenerating ? "default" : "pointer",
          fontFamily: FONT, transition: "background 120ms ease",
        }}
      >
        <RotateCw size={11} style={{ animation: isGenerating ? "spin 1s linear infinite" : "none" }} />
        {isGenerating ? "Generating…" : regenerateLabel}
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
          background: COLORS.surface2, padding: "1px 5px", borderRadius: 4, fontSize: 12.5,
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
                    background: ri % 2 === 1 ? COLORS.surface : "transparent",
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

// Full-page combined ("folder") notes view: ONE master note synthesized from
// every recording in the subproject — transcripts + existing AI notes fed to
// the multi-agent pipeline. Regenerate re-runs it with the current provider.
function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"]);

// One file in the vault strip. Images render their thumbnail from the stored
// copy; everything else gets a quiet extension tile. No tints, no glow — a
// bordered tile like Finder's list view.
function VaultTile({ file, onView, onRemove }) {
  const [thumb, setThumb] = useState(null);
  useEffect(() => {
    let alive = true;
    if (IMAGE_EXTS.has(file.ext)) {
      window.electronAPI?.vaultAPI?.read(file.relPath).then((res) => {
        if (alive && res?.ok) setThumb(`data:${res.mime};base64,${res.data}`);
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [file.relPath, file.ext]);  return (
    <div
      className="vault-tile"
      onClick={() => onView(file)}
      style={{
        width: 148, flexShrink: 0, cursor: "pointer", position: "relative",
        border: `1px solid ${COLORS.border}`, borderRadius: 10, background: COLORS.surface2,
        overflow: "hidden", transition: "border-color 150ms ease, transform 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{
        height: 96, display: "flex", alignItems: "center", justifyContent: "center",
        background: COLORS.surface3, overflow: "hidden",
      }}>
        {thumb ? (
          <img src={thumb} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            color: COLORS.textSecondary, textTransform: "uppercase",
          }}>{file.ext || "file"}</span>
        )}
      </div>
      <div style={{ padding: "7px 9px 8px", background: COLORS.surface }}>
        <div style={{ fontSize: 11.5, fontWeight: 500, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {file.name}
        </div>
        <div style={{ fontSize: 10, color: COLORS.textTertiary, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>
          {formatBytes(file.size)}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(file); }}
        title="Remove"
        style={{
          position: "absolute", top: 5, right: 5, width: 20, height: 20,
          borderRadius: 6, border: "none", cursor: "pointer",
          background: "rgba(10,10,13,0.6)", color: "rgba(255,255,255,0.85)",
          display: "none", alignItems: "center", justifyContent: "center",
        }}
        className="vault-tile-x"
      >
        <X size={11} />
      </button>
    </div>
  );
}

// The vault as a bottom drawer, pinned to the foot of the folder view.
// Hidden (a slim rail) until files exist or the user opens it; expands
// upward to reveal the file strip. One quiet hairline — no glow, no theatre.
function VaultSection({ files, busy, onAdd, onView, onRemove, open, onToggle }) {
  const hasFiles = files.length > 0;
  const expanded = open && hasFiles;
  return (
    <div
      style={{
        flexShrink: 0, marginTop: 10, position: "relative",
        border: `1px solid ${COLORS.border}`, borderRadius: 12,
        background: COLORS.surface, overflow: "hidden",
        transition: "background 200ms ease",
      }}
    >
      {/* Rail — always visible. Everything in one flex row so the label and
          the Add button are always perfectly aligned, collapsed or expanded. */}
      <div
        onClick={() => hasFiles && onToggle()}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "7px 8px 7px 12px",
          cursor: hasFiles ? "pointer" : "default",
          borderBottom: expanded ? `1px solid ${COLORS.border}` : "none",
        }}
      >
        <Paperclip size={12} color={hasFiles ? COLORS.textSecondary : COLORS.textTertiary} />
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em",
          textTransform: "uppercase", color: COLORS.textTertiary,
        }}>
          Vault{hasFiles ? ` · ${files.length}` : ""}
        </span>
        <div style={{ flex: 1 }} />
        {hasFiles && (
          <ChevronRight size={13} color={COLORS.textTertiary} style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 220ms cubic-bezier(.16,1,.3,1)",
          }} />
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onAdd(); }}
          disabled={busy}
          title="Attach images, PDFs and documents"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            border: `1px solid ${COLORS.borderStrong}`, borderRadius: 7,
            background: COLORS.surface, color: COLORS.textSecondary,
            fontSize: 11, fontWeight: 500, padding: "4px 9px",
            cursor: busy ? "wait" : "pointer", fontFamily: "inherit",
            transition: "color 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; e.currentTarget.style.borderColor = COLORS.blue; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textSecondary; e.currentTarget.style.borderColor = COLORS.borderStrong; }}
        >
          <Paperclip size={11} /> {busy ? "Adding…" : "Add"}
        </button>
      </div>

      {/* Body — expands only when there is something to show */}
      {expanded && (
        <div style={{ padding: "8px 12px 10px" }}>
          <div className="vault-strip" style={{
            display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4,
          }}>
            {files.map((f) => (
              <VaultTile key={f.id} file={f} onView={onView} onRemove={onRemove} />
            ))}
          </div>
        </div>
      )}

      <style>{`
        .vault-strip::-webkit-scrollbar { height: 6px; }
        .vault-strip::-webkit-scrollbar-thumb { background: rgba(130,142,168,0.3); border-radius: 3px; }
        .vault-tile { position: relative; }
        .vault-tile:hover .vault-tile-x { display: flex !important; }
        .vault-tile .vault-tile-x { display: none; }
      `}</style>
    </div>
  );
}

// Fullscreen file viewer. Images fit the screen on a dark stage; PDFs load
// inline; Esc or the backdrop closes. Remove lives here too, top-right.
function VaultLightbox({ payload, onClose, onRemove }) {
  const { file, url, mime } = payload;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const isPdf = mime === "application/pdf";
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 950, background: "rgba(5,5,7,0.94)",
        display: "flex", flexDirection: "column",
        animation: "ovioOverlayIn 180ms ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          height: 52, minHeight: 52, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 16px", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.name}
          <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{formatBytes(file.size)}</span>
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => onRemove(file)} title="Remove file"
            style={{
              display: "flex", alignItems: "center", gap: 5, border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 11.5,
              borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit",
            }}>
            <Trash2 size={12} /> Remove
          </button>
          <button onClick={onClose} title="Close (Esc)"
            style={{
              width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent", color: "rgba(255,255,255,0.85)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px 24px" }}>
        {url && isPdf ? (
          <iframe src={url} title={file.name} style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, background: "#fff" }} />
        ) : url && mime === "text/plain" ? (
          <iframe src={url} title={file.name} style={{ width: "100%", height: "100%", border: "none", borderRadius: 8, background: "var(--ovio-surface)" }} />
        ) : url ? (
          <img src={url} alt={file.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 4 }} />
        ) : (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Loading…</span>
        )}
      </div>
    </div>
  );
}

function FolderNotesView({
  projectName,
  subName,
  sources,
  notes,
  isGenerating,
  progress,
  error,
  lastUpdated,
  provider,
  onClose,
  onRegenerate,
}) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: COLORS.windowBg, animation: "ovioViewIn 380ms cubic-bezier(.22,1,.36,1) both" }}>
      {/* Header */}
      <div style={{
        height: 48, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Layers size={16} color={COLORS.accent} style={{ flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Combined Notes
            </span>
            <span style={{ fontSize: 12, color: COLORS.textTertiary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {projectName ? `${projectName} / ${subName}` : ""}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastUpdated && !isGenerating && (
            <span style={{ fontSize: 11, color: COLORS.textTertiary }}>Updated {timeSince(lastUpdated)}</span>
          )}
          {notes && !isGenerating && (
            <AiNotesToolbar
              aiNotes={notes}
              onRegenerate={onRegenerate}
              isGenerating={isGenerating}
              providerLabel={provider}
              regenerateLabel="Regenerate combined notes"
            />
          )}
        </div>
      </div>

      {/* Source chips: every recording that fed this note */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
        padding: "8px 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.sidebarBg, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, color: COLORS.textTertiary, marginRight: 2 }}>
          {sources.length} source{sources.length === 1 ? "" : "s"}:
        </span>
        {sources.map((s, i) => (
          <span key={i} title={s.label} style={{
            ...rowIn(i, 45),
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.textSecondary,
            background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 999, padding: "2px 8px", maxWidth: 200,
            transition: "transform 140ms ease, border-color 140ms ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = "translateY(0)"; }}
          >
            <Disc size={10} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
          </span>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
        {isGenerating && <GeneratingPanel progress={progress} />}

        {error && (
          <div style={{ padding: 12, background: "rgba(255,93,93,0.12)", borderRadius: 8, color: COLORS.red, fontSize: 12, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {notes && !isGenerating && (
          <div className="ai-notes-content">{renderAiNotesFormatted(notes)}</div>
        )}

        {isGenerating && !notes && !error && (
          <div style={{ padding: "24px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>
            Analyzing {sources.length} recording{sources.length === 1 ? "" : "s"} — this may take a while…
          </div>
        )}
      </div>

      {/* Footer: back + regenerate */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderTop: `1px solid ${COLORS.border}`, background: COLORS.surface, flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.borderStrong}`,
          background: COLORS.surface, color: COLORS.text, fontSize: 12.5, fontWeight: 500,
          borderRadius: 999, padding: "7px 14px", cursor: "pointer",
        }}>
          <ArrowLeft size={13} /> Back to recordings
        </button>
        <button onClick={onRegenerate} disabled={isGenerating} style={{
          display: "flex", alignItems: "center", gap: 6, border: "none", background: "#FFFFFF", color: "#0A0A0D",
          fontSize: 12.5, fontWeight: 500, borderRadius: 999, padding: "7px 14px",
          cursor: isGenerating ? "default" : "pointer", opacity: isGenerating ? 0.5 : 1,
        }}>
          <RotateCw size={12} /> {isGenerating ? "Generating…" : "Regenerate"}
        </button>
      </div>
    </div>
  );
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
  ambientSignal,
  onAmbientStatus,
  ambientShortcutLabel,
  vaultBySub,
  setVaultBySub,
}) {
  const { settings, getActiveGroqKeys, getActiveOpenRouterKeys, hasAnyKey } = useSettings();
  const [expanded, setExpanded] = useState({});
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedSubprojectId, setSelectedSubprojectId] = useState(null);
  const [activeRecordingId, setActiveRecordingId] = useState(null);

  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingSubFor, setCreatingSubFor] = useState(null);

  // ---- Vault: files attached to the current subfolder ----
  // Metadata (vaultBySub) is OWNED by App (shared with the ⌘K palette) and
  // passed in; binaries live in userData/files/<subId>/... (main process).
  // Only one gallery/lightbox is open at a time.
  const [vaultLightbox, setVaultLightbox] = useState(null); // { file, url, mime } | null
  const [vaultBusy, setVaultBusy] = useState(false);
  // The vault drawer at the bottom of the folder view: hidden (collapsed)
  // until files are added or the user opens it.
  const [vaultOpen, setVaultOpen] = useState(false);
  const currentVaultFiles = vaultBySub?.[selectedSubprojectId] || [];

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
  const [renamingItem, setRenamingItem] = useState(null); // { kind: "project"|"subproject"|"recording", pid, sid, id }
  const [hoveredId, setHoveredId] = useState(null);
  const [autoScroll, setAutoScroll] = useState(true);
  // Ambient recording (global-shortcut popup): everything lands in this
  // fixed "General Folder" so the user never has to pick a folder mid-work.
  const GENERAL_PROJECT_ID = "general-folder-project";
  const GENERAL_SUB_ID = "general-folder-sub";

  // Move-to-folder for recordings: picker target, row flying out, sidebar
  // flash on the destination and the confirmation toast.
  const [movePickFor, setMovePickFor] = useState(null);
  const [flyingOutId, setFlyingOutId] = useState(null);
  const [flashSid, setFlashSid] = useState(null);
  const [moveToast, setMoveToast] = useState(null);
  // Sliding indicator under the active right-sidebar tab.
  const tabBarRef = useRef(null);
  const tabRefs = useRef({});
  const [tabGlow, setTabGlow] = useState({ left: 0, width: 0 });

  const elapsedRef = useRef(0);
  const transcriptContainerRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const aiEndRef = useRef(null);
  const noteInputRef = useRef(null);
  const labelInputRef = useRef(null);
  const notesUpdatedRef = useRef(null);
  // True while we're inside a recording that was opened from the Dashboard,
  // so the top-left back button can return there instead of the list.
  const cameFromDashboardRef = useRef(false);

  const {
    transcript,
    setTranscript,
    interim,
    isTranscribing,
    activeEngine,
    error: speechError,
    start: startTranscription,
    stop: stopTranscription,
    clearInterim,
  } = useTranscription();

  const {
    aiNotes,
    isGenerating: notesGenerating,
    progress: notesProgress,
    lastUpdated: notesLastUpdated,
    notesProvider,
    error: notesError,
    regenerate: regenerateNotes,
    startFolderNotes,
    clearFolderNotes,
  } = useAutoNotes(transcript, isTranscribing);

  const [isRecording, setIsRecording] = useState(false);

  // Live label of the STT engine actually producing the transcript right now.
  const engineLabel =
    activeEngine === "parakeet"
      ? "Local · Parakeet-TDT v3 (streaming)"
      : activeEngine === "whisper-large"
        ? "Local · Whisper Large v3"
        : activeEngine === "cloud"
          ? "Cloud · Groq Whisper"
          : "";

  useEffect(() => {
    if (navSubprojectId) {
      cameFromDashboardRef.current = true;
      setSelectedProjectId(navProjectId);
      setSelectedSubprojectId(navSubprojectId);
    }
  }, [navProjectId, navSubprojectId]);

  useEffect(() => {
    if (navRecordingId && selectedSubprojectId) {
      const recs = recordingsBySub[selectedSubprojectId] || [];
      const rec = recs.find((r) => r.id === navRecordingId);
      if (rec) {
        openRecording(rec, true);
      }
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

  // Continuous feed for the floating ambient popup (recording / paused / off +
  // running label + seconds) so its tiny UI always matches the session.
  useEffect(() => {
    const panelState = isRecording ? "recording" : activeRecordingId ? "paused" : "off";
    onAmbientStatus?.({ panelState, label, elapsed });
  }, [isRecording, activeRecordingId, label, elapsed, onAmbientStatus]);

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

  // Measure the active tab button so the small indicator line can slide under it.
  useEffect(() => {
    const el = tabRefs.current[tab];
    const wrap = tabBarRef.current;
    if (el && wrap) {
      const wr = wrap.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      setTabGlow({ left: er.left - wr.left, width: er.width });
    }
  }, [tab]);

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

  // ---- Ambient recording (global-shortcut popup) ---------------------------
  // Every popup session is stored in the fixed "General Folder" so the user
  // never has to pick a folder mid-work; they can move it afterwards.
  const ensureGeneralFolder = useCallback(() => {
    // The inbox is pinned FIRST in the list, has exactly one (hidden)
    // subfolder as its storage bucket, and can never be renamed, deleted,
    // or given more subfolders. Existing installs are migrated in place:
    // any recordings in stray General subfolders are folded into the bucket.
    setProjects((prev) => {
      const existing = prev.find((p) => p.id === GENERAL_PROJECT_ID);
      if (existing) {
        if (existing.subprojects.length === 1 && existing.subprojects[0].id === GENERAL_SUB_ID && prev[0]?.id === GENERAL_PROJECT_ID) {
          return prev;
        }
        return [
          { ...existing, name: "General Folder", subprojects: [{ id: GENERAL_SUB_ID, name: "General Folder" }] },
          ...prev.filter((p) => p.id !== GENERAL_PROJECT_ID),
        ];
      }
      return [
        {
          id: GENERAL_PROJECT_ID,
          name: "General Folder",
          subprojects: [{ id: GENERAL_SUB_ID, name: "General Folder" }],
        },
        ...prev,
      ];
    });
    setRecordingsBySub((prev) =>
      prev[GENERAL_SUB_ID] ? prev : { ...prev, [GENERAL_SUB_ID]: [] }
    );
  }, [GENERAL_PROJECT_ID, GENERAL_SUB_ID]);

  // The inbox must exist from the moment the recorder mounts — not just
  // when the first ambient recording starts — so it's always visible/pinnable.
  useEffect(() => {
    ensureGeneralFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAmbientRecording = useCallback(() => {
    ensureGeneralFolder();
    if (activeRecordingId) {
      const isAmbientSession = (recordingsBySub[GENERAL_SUB_ID] || []).some((r) => r.id === activeRecordingId);
      if (isAmbientSession) {
        if (!lastAmbientDoneRef.current && isRecording) {
        // The current ambient session is LIVE (recording): keep it going —
        // the fresh popup simply reflects it. A live mic capture is never
        // clobbered by another press; the popup mirrors this session.
        return;
        }
        // Finished or paused session still open for review — fold it away and
        // start a BRAND-NEW recording. Every shortcut press = a new capture;
        // nothing silently resumes an old one.
        lastAmbientDoneRef.current = false;
        setActiveRecordingId(null);
        try { stopTranscription(); } catch {}
      } else {
        // A NORMAL (non-ambient) session is open. If it's actively recording,
        // the popup reflects the live recording; if it's just being viewed we
        // start a fresh ambient recording instead of resuming the old one.
        if (isRecording) return;
      }
    }
    cameFromDashboardRef.current = false;
    const rec = {
      id: genId(),
      label: "Ambient Recording",
      createdAt: Date.now(),
      duration: 0,
      transcript: [],
      notes: [],
      aiMessages: [],
      aiNotes: "",
      ambient: true,
    };
    setSelectedProjectId(GENERAL_PROJECT_ID);
    setSelectedSubprojectId(GENERAL_SUB_ID);
    setRecordingsBySub((prev) => ({
      ...prev,
      [GENERAL_SUB_ID]: [rec, ...(prev[GENERAL_SUB_ID] || [])],
    }));
    setLabel("Ambient Recording");
    setElapsed(0);
    setTranscript([]);
    setNotes([]);
    setAiMessages([]);
    clearInterim();
    setTab("transcript");
    setAiOpen(false);
    setActiveRecordingId(rec.id);
    setAutoScroll(true);
    setIsRecording(true);
    startTranscription();
  }, [
    activeRecordingId, isRecording, recordingsBySub, toggleRecording,
    ensureGeneralFolder, clearInterim, startTranscription,
    GENERAL_PROJECT_ID, GENERAL_SUB_ID,
  ]);

  // Set once an ambient session has been "done" (saved) but the review view is
  // still open — the next shortcut press should start a new recording.
  const lastAmbientDoneRef = useRef(false);

  const finishAmbientRecording = useCallback(() => {
    if (!activeRecordingId) return;
    const isAmbientSession = (recordingsBySub[GENERAL_SUB_ID] || []).some((r) => r.id === activeRecordingId);
    setIsRecording(false);
    try { stopTranscription(); } catch {}
    // Only ambient popup sessions get the "Ambient · …" timestamp rename; a
    // live normal session is simply stopped exactly like the in-app Stop.
    if (!isAmbientSession) return;
    lastAmbientDoneRef.current = true;
    const stamp = new Date();
    const day = stamp.toLocaleDateString([], { month: "short", day: "numeric" });
    const time = stamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setLabel(`Ambient · ${day}, ${time}`);
  }, [activeRecordingId, recordingsBySub, GENERAL_SUB_ID, stopTranscription]);

  const cancelAmbientRecording = useCallback(() => {
    const id = activeRecordingId;
    const wasInGeneral = selectedSubprojectId === GENERAL_SUB_ID;
    // Discard only ambient sessions we created via the popup — a normal
    // recording session is never thrown away by "cancel".
    const rec = wasInGeneral ? (recordingsBySub[GENERAL_SUB_ID] || []).find((r) => r.id === id) : null;
    if (rec?.ambient) {
      setRecordingsBySub((prev) => ({
        ...prev,
        [GENERAL_SUB_ID]: (prev[GENERAL_SUB_ID] || []).filter((r) => r.id !== id),
      }));
    }
    setIsRecording(false);
    setActiveRecordingId(null);
    try { stopTranscription(); } catch {}
  }, [activeRecordingId, selectedSubprojectId, recordingsBySub, GENERAL_SUB_ID, stopTranscription]);

  // React to commands coming from the floating ambient popup.
  useEffect(() => {
    const cmd = ambientSignal?.cmd;
    if (!cmd) return;
    if (cmd === "record") startAmbientRecording();
    else if (cmd === "pause") { if (isRecording) toggleRecording(); }
    else if (cmd === "resume") { if (activeRecordingId && !isRecording) toggleRecording(); }
    else if (cmd === "done") finishAmbientRecording();
    else if (cmd === "cancel") cancelAmbientRecording();
    else if (cmd?.cmd === "open") {
      // Popup clicked (wave/clock zone): reveal the session where it lives —
      // General Folder — so the app lands on exactly that recording.
      if (activeRecordingId) {
        setSelectedProjectId(GENERAL_PROJECT_ID);
        setSelectedSubprojectId(GENERAL_SUB_ID);
      }
    } else if (cmd?.cmd === "rename") {
      // Live rename from the popup's title field — update the open session's
      // label and its stored record.
      const name = String(cmd.name || "").trim();
      if (!name || !activeRecordingId) return;
      setLabel(name);
      setRecordingsBySub((prev) => ({
        ...prev,
        [GENERAL_SUB_ID]: (prev[GENERAL_SUB_ID] || []).map((r) =>
          r.id === activeRecordingId ? { ...r, label: name } : r
        ),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientSignal]);

  // ---- Vault: add / remove / view files for the current subfolder --------
  const addFiles = async () => {
    if (!selectedSubprojectId || vaultBusy) return;
    setVaultBusy(true);
    try {
      const res = await window.electronAPI?.vaultAPI?.pick(selectedSubprojectId);
      if (res?.ok && res.added?.length) {
        setVaultBySub((prev) => ({
          ...prev,
          [selectedSubprojectId]: [...(prev[selectedSubprojectId] || []), ...res.added],
        }));
        // New files land: reveal the drawer so the user sees them immediately.
        setVaultOpen(true);
      }
    } finally {
      setVaultBusy(false);
    }
  };
  const removeFile = async (file) => {
    if (!selectedSubprojectId) return;
    try { await window.electronAPI?.vaultAPI?.remove(file.relPath); } catch {}
    setVaultBySub((prev) => ({
      ...prev,
      [selectedSubprojectId]: (prev[selectedSubprojectId] || []).filter((f) => f.id !== file.id),
    }));
    setVaultLightbox((lb) => (lb?.file?.id === file.id ? null : lb));
  };
  // Open a file in the fullscreen viewer. Images/PDFs load via vault:read
  // (base64 data URL); other types open with the native default app.
  const viewFile = async (file) => {
    if (vaultLightbox?.file?.id === file.id) return;
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "pdf", "txt", "md", "csv"].includes(file.ext)) {
      setVaultLightbox({ file, url: null, mime: null });
      try {
        const res = await window.electronAPI?.vaultAPI?.read(file.relPath);
        if (res?.ok) {
          setVaultLightbox({ file, url: `data:${res.mime};base64,${res.data}`, mime: res.mime });
        } else {
          setVaultLightbox(null);
        }
      } catch {
        setVaultLightbox(null);
      }
    } else {
      window.electronAPI?.vaultAPI?.open(file.relPath);
    }
  };

  // ---- Move a recording to another folder --------------------------------
  const beginMove = (recId) => {
    if (renamingItem) setRenamingItem(null);
    setMovePickFor((cur) => (cur === recId ? null : recId));
  };

  // Transfer targets: General Folder (when moving elsewhere) + every project
  // subfolder except the recording's current one.
  const moveTargets = useMemo(() => {
    const list = [];
    if (selectedSubprojectId !== GENERAL_SUB_ID) {
      list.push({ sid: GENERAL_SUB_ID, sname: "General Folder", pname: "Inbox", name: "General Folder", isGeneral: true });
    }
    projects.forEach((p) => {
      if (p.id === GENERAL_PROJECT_ID) return;
      p.subprojects.forEach((s) => {
        if (s.id === selectedSubprojectId) return;
        list.push({ sid: s.id, sname: s.name, pname: p.name, name: s.name });
      });
    });
    return list;
  }, [projects, selectedSubprojectId, GENERAL_PROJECT_ID, GENERAL_SUB_ID]);

  const moveCurrentLabel = useMemo(() => {
    if (selectedSubprojectId === GENERAL_SUB_ID) return "General Folder";
    const proj = projects.find((p) => p.subprojects.some((s) => s.id === selectedSubprojectId));
    const sub = proj?.subprojects.find((s) => s.id === selectedSubprojectId);
    return proj && sub ? `${proj.name} / ${sub.name}` : "current folder";
  }, [projects, selectedSubprojectId, GENERAL_SUB_ID]);

  const pickMoveTarget = (recId, toSid, toName) => {
    const fromSid = selectedSubprojectId;
    setMovePickFor(null);
    if (!recId || !fromSid || toSid === fromSid) return;
    const has = (recordingsBySub[fromSid] || []).some((r) => r.id === recId);
    if (!has) return;
    // Fly the row out, then commit the move and flash the destination.
    setFlyingOutId(recId);
    setTimeout(() => {
      setRecordingsBySub((prev) => {
        const from = prev[fromSid] || [];
        const moved = from.find((r) => r.id === recId);
        if (!moved) return prev;
        return {
          ...prev,
          [fromSid]: from.filter((r) => r.id !== recId),
          [toSid]: [moved, ...(prev[toSid] || [])],
        };
      });
      setFlyingOutId(null);
      setFlashSid(toSid);
      setMoveToast(toName);
      const targetProject = projects.find((p) => p.subprojects.some((s) => s.id === toSid));
      if (targetProject) setExpanded((prev) => ({ ...prev, [targetProject.id]: true }));
    }, 300);
  };

  useEffect(() => {
    if (!flashSid) return;
    const t = setTimeout(() => setFlashSid(null), 1500);
    return () => clearTimeout(t);
  }, [flashSid]);

  useEffect(() => {
    if (!moveToast) return;
    const t = setTimeout(() => setMoveToast(null), 2800);
    return () => clearTimeout(t);
  }, [moveToast]);

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
    // The inbox has no subfolders — creation inside General is a no-op.
    if (projectId === GENERAL_PROJECT_ID) return;
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
    cameFromDashboardRef.current = false;
    setActiveRecordingId(null);
    setIsRecording(false);
    try { stopTranscription(); } catch {}
    setSelectedProjectId(projectId);
    setSelectedSubprojectId(subprojectId);
    // Leave any combined-notes view behind when switching folders.
    setFolderNotesOpen(false);
    setFolderSources([]);
    clearFolderNotes();
  };

  // ---- Rename & delete (projects, subprojects, recordings) ----
  const startRename = (item) => {
    // General Folder is identity, not a label — rename is blocked.
    if (item.kind === "project" && item.id === GENERAL_PROJECT_ID) return;
    if (item.kind === "subproject" && (item.id === GENERAL_SUB_ID || item.pid === GENERAL_PROJECT_ID)) return;
    setRenamingItem(item);
  };

  const commitRename = (name) => {
    const item = renamingItem;
    setRenamingItem(null);
    const clean = (name || "").trim();
    if (!item || !clean) return;
    if (item.kind === "project") {
      setProjects((prev) => prev.map((p) => (p.id === item.id ? { ...p, name: clean } : p)));
    } else if (item.kind === "subproject") {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== item.pid
            ? p
            : { ...p, subprojects: p.subprojects.map((s) => (s.id === item.id ? { ...s, name: clean } : s)) }
        )
      );
    } else if (item.kind === "recording") {
      setRecordingsBySub((prev) => ({
        ...prev,
        [item.sid]: (prev[item.sid] || []).map((r) => (r.id === item.id ? { ...r, label: clean } : r)),
      }));
    }
  };

  const clearSelectionIfRemoved = (sid) => {
    if (selectedSubprojectId === sid) {
      setActiveRecordingId(null);
      setIsRecording(false);
      stopTranscription();
      setSelectedSubprojectId(null);
    }
  };

  const removeProject = (pid) => {
    // General Folder is the inbox — it cannot be deleted.
    if (pid === GENERAL_PROJECT_ID) return;
    const proj = projects.find((p) => p.id === pid);
    const subIds = (proj?.subprojects || []).map((s) => s.id);
    if (!window.confirm(`Delete project "${proj?.name}" with all its subprojects and recordings?`)) return;
    setProjects((prev) => prev.filter((p) => p.id !== pid));
    setRecordingsBySub((prev) => {
      const next = { ...prev };
      subIds.forEach((id) => delete next[id]);
      return next;
    });
    subIds.forEach((id) => clearSelectionIfRemoved(id));
  };

  const removeSubproject = (pid, sid) => {
    // The inbox subfolder is the General Folder itself — not removable.
    if (pid === GENERAL_PROJECT_ID || sid === GENERAL_SUB_ID) return;
    const sub = projects.find((p) => p.id === pid)?.subprojects.find((s) => s.id === sid);
    if (!window.confirm(`Delete subproject "${sub?.name}" with all its recordings?`)) return;
    setProjects((prev) =>
      prev.map((p) => (p.id !== pid ? p : { ...p, subprojects: p.subprojects.filter((s) => s.id !== sid) }))
    );
    setRecordingsBySub((prev) => {
      const next = { ...prev };
      delete next[sid];
      return next;
    });
    clearSelectionIfRemoved(sid);
  };

  const removeRecording = (sid, rid) => {
    if (!window.confirm("Delete this recording with its transcript, notes and AI summary?")) return;
    setRecordingsBySub((prev) => ({ ...prev, [sid]: (prev[sid] || []).filter((r) => r.id !== rid) }));
    if (activeRecordingId === rid) {
      setActiveRecordingId(null);
      stopTranscription();
    }
  };

  const openRecording = (rec, fromDashboard = false) => {
    // Never leak a running session into a different recording.
    cameFromDashboardRef.current = fromDashboard;
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
    cameFromDashboardRef.current = false;
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

  const exitRecordingSession = () => {
    // Order matters: flip the UI state first so the view change can never be
    // blocked by a failure inside transcription teardown.
    setIsRecording(false);
    setActiveRecordingId(null);
    try { stopTranscription(); } catch {}
  };

  const backToList = () => {
    const fromDashboard = cameFromDashboardRef.current;
    cameFromDashboardRef.current = false;
    clearNavRecording?.();
    exitRecordingSession();
    // If we entered this recording from the Dashboard, "back" returns there.
    if (fromDashboard && onNavigateToDashboard) onNavigateToDashboard();
  };

  // Breadcrumb navigation: jump straight to a project or a subproject from
  // the recording header, stopping any active session first.
  const goToProject = (pid) => {
    cameFromDashboardRef.current = false;
    clearNavRecording?.();
    exitRecordingSession();
    setSelectedProjectId(pid);
    setSelectedSubprojectId(null);
    setExpanded((prev) => ({ ...prev, [pid]: true }));
  };

  const goToSubproject = (pid, sid) => {
    cameFromDashboardRef.current = false;
    clearNavRecording?.();
    selectSubproject(pid, sid);
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const currentSubproject = currentProject?.subprojects.find((s) => s.id === selectedSubprojectId);
  const currentRecordings = (recordingsBySub[selectedSubprojectId] || [])
    .slice().sort((a, b) => b.createdAt - a.createdAt);

  // Ollama-based providers need no API keys at all.
  const usesLocalAi = settings?.aiProvider === "ollama" || settings?.aiProvider === "localOnly";
  const noApiKey = !hasAnyKey() && !usesLocalAi;

  // ---- Combined ("folder") notes: ONE master note from every recording ----
  // Eligible = has a transcript or AI notes worth feeding to the model.
  const [folderNotesOpen, setFolderNotesOpen] = useState(false);
  const [folderSources, setFolderSources] = useState([]);
  const eligibleRecordings = currentRecordings.filter(
    (r) => (r.transcript?.length || 0) > 0 || (r.aiNotes || "").trim()
  );
  const enterFolderNotes = () => {
    if (eligibleRecordings.length === 0) return;
    cameFromDashboardRef.current = false;
    clearNavRecording?.();
    exitRecordingSession();
    const sources = eligibleRecordings.map((r) => ({
      label: r.label,
      createdAt: r.createdAt,
      transcript: r.transcript || [],
      notes: r.notes || [],
      aiNotes: r.aiNotes || "",
    }));
    setFolderSources(sources);
    setFolderNotesOpen(true);
    startFolderNotes(
      sources,
      `${currentProject?.name || "Project"} / ${currentSubproject?.name || "Folder"}`
    );
  };
  const exitFolderNotes = () => {
    setFolderNotesOpen(false);
    setFolderSources([]);
    clearFolderNotes();
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{ANIM_CSS}</style>
      {/* Top bar */}
      <div style={{
        height: 52, minHeight: 52, display: "flex", alignItems: "center",
        padding: "0 16px", paddingLeft: 80,
        borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface,
        gap: 10,
        animation: "ovioFadeDown 340ms cubic-bezier(.22,1,.36,1) both",
      }}>
        {activeRecordingId ? (
          <>
            <div style={{ WebkitAppRegion: "no-drag" }}><IconButton onClick={backToList} title="Back to recordings"><ArrowLeft size={16} /></IconButton></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: COLORS.textSecondary, minWidth: 0 }}>
              {currentProject ? (
                <button
                  onClick={(e) => { e.stopPropagation(); goToProject(currentProject.id); }}
                  title={`Go to project "${currentProject.name}"`}
                  style={{
                    whiteSpace: "nowrap", WebkitAppRegion: "no-drag", flexShrink: 0,
                    border: "none", background: "transparent", padding: 0, margin: 0,
                    font: "inherit", fontSize: 13, color: COLORS.textSecondary, cursor: "pointer",
                    transition: "color 120ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
                >
                  {currentProject.name}
                </button>
              ) : (
                <span style={{ whiteSpace: "nowrap", WebkitAppRegion: "no-drag" }}>…</span>
              )}
              <ChevronRight size={12} style={{ flexShrink: 0 }} />
              {currentSubproject ? (
                <button
                  onClick={(e) => { e.stopPropagation(); goToSubproject(currentProject.id, currentSubproject.id); }}
                  title={`Go to recordings in "${currentSubproject.name}"`}
                  style={{
                    whiteSpace: "nowrap", WebkitAppRegion: "no-drag", flexShrink: 0,
                    border: "none", background: "transparent", padding: 0, margin: 0,
                    font: "inherit", fontSize: 13, color: COLORS.textSecondary, cursor: "pointer",
                    transition: "color 120ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
                >
                  {currentSubproject.name}
                </button>
              ) : (
                <span style={{ whiteSpace: "nowrap", WebkitAppRegion: "no-drag" }}>…</span>
              )}
              <ChevronRight size={12} style={{ flexShrink: 0 }} />
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
            {/* ===== General Folder — the pinned inbox. Distinct design:
                no expand chevron, no subprojects, no rename/delete; a glowing
                inbox chip + live count. Everything recorded from the popup
                or the quick-start lands here. ===== */}
            {(() => {
              const gen = projects.find((p) => p.id === GENERAL_PROJECT_ID);
              if (!gen) return null;
              const count = (recordingsBySub[GENERAL_SUB_ID] || []).length;
              const isSel = selectedProjectId === GENERAL_PROJECT_ID;
              return (
                <div
                  onClick={() => selectSubproject(GENERAL_PROJECT_ID, GENERAL_SUB_ID)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, marginBottom: 10,
                    padding: "10px 11px", cursor: "pointer",
                    borderRadius: 12,
                    border: `1px solid ${isSel ? COLORS.blue : COLORS.border}`,
                    background: isSel ? COLORS.selected : COLORS.surface,
                    boxShadow: "none",
                    transition: "border-color 200ms ease, background 200ms ease, box-shadow 220ms ease",
                  }}
                  onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.borderColor = COLORS.borderStrong; }}
                  onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.borderColor = COLORS.border; }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                    background: COLORS.accentSoft, border: `1px solid rgba(47,107,255,0.4)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Inbox size={15} color={COLORS.blueBright} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, letterSpacing: -0.1 }}>General Folder</div>
                    <div style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{count} recording{count === 1 ? "" : "s"}</div>
                  </div>
                  {count > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                      color: COLORS.blueBright, background: COLORS.accentSoft,
                      borderRadius: 999, padding: "2px 7px", flexShrink: 0,
                    }}>{count}</span>
                  )}
                </div>
              );
            })()}

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 6px 6px" }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textTertiary, letterSpacing: 0.2 }}>Projects</span>
              <IconButton onClick={() => setCreatingProject(true)} title="New project" small><FolderPlus size={13} /></IconButton>
            </div>

            {projects.filter((p) => p.id !== GENERAL_PROJECT_ID).length === 0 && !creatingProject ? (
              <div style={{ fontSize: 12, color: COLORS.textTertiary, padding: "8px 6px", lineHeight: 1.6 }}>
                No projects yet.<br />Create one to organize your recordings.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {projects.filter((p) => p.id !== GENERAL_PROJECT_ID).map((p) => (
                  <div key={p.id}>
                    {/* Project (folder) row */}
                    {renamingItem?.kind === "project" && renamingItem.id === p.id ? (
                      <div style={{ padding: "2px 0" }}>
                        <InlineRenameRow initial={p.name} indent={8} onConfirm={commitRename} onCancel={() => setRenamingItem(null)} />
                      </div>
                    ) : (
                    <div
                      onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      title={p.name}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "5px 8px", cursor: "pointer", borderRadius: 6,
                        height: 26,
                        transition: "background 150ms ease, transform 120ms ease",
                      }}
                      onMouseEnter={(e) => { setHoveredId(p.id); if (!expanded[p.id]) { e.currentTarget.style.background = COLORS.surface3; e.currentTarget.style.transform = "translateX(2px)"; } }}
                      onMouseLeave={(e) => { setHoveredId(null); if (!expanded[p.id]) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "translateX(0)"; } }}
                    >
                      <ChevronRight size={13} color={COLORS.textTertiary} style={{ transition: "transform 150ms ease", transform: expanded[p.id] ? "rotate(90deg)" : "rotate(0deg)" }} />
                      <Folder size={15} color={COLORS.blue} strokeWidth={1.8} style={{ fill: "none" }} />
                      <span style={{ fontSize: 13, color: COLORS.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{p.name}</span>
                      {hoveredId === p.id && (
                        <IconButton onClick={(e) => { e.stopPropagation(); startRename({ kind: "project", id: p.id }); }} title="Rename project" small><Pencil size={11} /></IconButton>
                      )}
                      {hoveredId === p.id && (
                        <IconButton onClick={(e) => { e.stopPropagation(); removeProject(p.id); }} title="Delete project" small><Trash2 size={11} /></IconButton>
                      )}
                      <IconButton onClick={(e) => { e.stopPropagation(); setExpanded((prev) => ({ ...prev, [p.id]: true })); setCreatingSubFor(p.id); }} title="New subproject" small><Plus size={12} /></IconButton>
                    </div>
                    )}

                    {/* Subprojects — the drawer glides open with a height +
                        opacity transition instead of popping in */}
                    <div style={{
                      overflow: "hidden",
                      maxHeight: expanded[p.id] ? `${(p.subprojects.length + (creatingSubFor === p.id ? 1 : 0)) * 30 + 30}px` : 0,
                      opacity: expanded[p.id] ? 1 : 0,
                      marginTop: expanded[p.id] ? 1 : 0,
                      transition: "max-height 260ms cubic-bezier(.22,1,.36,1), opacity 200ms ease, margin-top 260ms cubic-bezier(.22,1,.36,1)",
                    }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          {p.subprojects.map((s) => (
                            renamingItem?.kind === "subproject" && renamingItem.id === s.id ? (
                              <div key={s.id} style={{ marginLeft: 16, padding: "2px 0" }} onClick={(e) => e.stopPropagation()}>
                                <InlineRenameRow initial={s.name} indent={8} onConfirm={commitRename} onCancel={() => setRenamingItem(null)} />
                              </div>
                            ) : (
                              <div
                                key={s.id}
                                onClick={() => selectSubproject(p.id, s.id)}
                                title={s.name}
                                style={{
                                  display: "flex", alignItems: "center", gap: 6,
                                  padding: "5px 8px", marginLeft: 16, borderRadius: 6,
                                  cursor: "pointer", height: 24,
                                  background: selectedSubprojectId === s.id ? COLORS.blue : "transparent",
                                  animation: flashSid === s.id && selectedSubprojectId !== s.id ? "ovioFlash 1.4s ease-out 0.25s" : undefined,
                                }}
                                onMouseEnter={(e) => { setHoveredId(s.id); if (selectedSubprojectId !== s.id) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                                onMouseLeave={(e) => { setHoveredId(null); if (selectedSubprojectId !== s.id) e.currentTarget.style.background = "transparent"; }}
                              >
                                <Disc size={13} color={selectedSubprojectId === s.id ? COLORS.text : COLORS.textTertiary} strokeWidth={1.8} />
                                <span style={{
                                  fontSize: 12.5,
                                  color: selectedSubprojectId === s.id ? COLORS.text : COLORS.text,
                                  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>{s.name}</span>
                                {hoveredId === s.id && (
                                  <IconButton onClick={(e) => { e.stopPropagation(); startRename({ kind: "subproject", pid: p.id, id: s.id }); }} title="Rename subproject" small><Pencil size={11} /></IconButton>
                                )}
                                {hoveredId === s.id && (
                                  <IconButton onClick={(e) => { e.stopPropagation(); removeSubproject(p.id, s.id); }} title="Delete subproject" small><Trash2 size={11} /></IconButton>
                                )}
                              </div>
                            )
                          ))}
                        </div>
                        {creatingSubFor === p.id && (
                          <InlineCreateRow placeholder="Subproject name" indent={24} onConfirm={(name) => addSubprojectLocal(p.id, name)} onCancel={() => setCreatingSubFor(null)} />
                        )}
                      </div>
                  </div>
                ))}
              </div>
            )}
            {creatingProject && (
              <div style={{ animation: "ovioFadeUp 220ms ease both" }}>
                <InlineCreateRow placeholder="Project name" indent={8} onConfirm={addProject} onCancel={() => setCreatingProject(false)} />
              </div>
            )}
          </div>
        </div>

        {/* Main area */}
        {!selectedSubprojectId ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: COLORS.windowBg }}>
            {noApiKey ? (
              <div style={{ ...stepIn(0), display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: `${COLORS.blue}10`, display: "flex", alignItems: "center", justifyContent: "center", animation: "ovioFloat 3s ease-in-out infinite" }}>
                  <Brain size={22} color={COLORS.blue} />
                </div>
                <div style={{ fontWeight: 600, color: COLORS.text, fontSize: 15 }}>Add an API key to get started</div>
                <div style={{ color: COLORS.textSecondary, lineHeight: 1.6 }}>Unlock AI notes and cloud transcription.</div>
              </div>
            ) : (
              <div style={{ ...stepIn(0), display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>Let&apos;s set up your recording space</div>
                <div style={{ color: COLORS.textSecondary, lineHeight: 1.6, fontSize: 13.5 }}>
                  Select a subproject from the sidebar<br />
                  or create one to start recording
                </div>
                <button onClick={() => setCreatingProject(true)} style={{
                  display: "flex", alignItems: "center", gap: 6, marginTop: 6,
                  background: "#FFFFFF", color: "#0A0A0D", border: "none", fontWeight: 600,
                  fontSize: 12.5, borderRadius: 999, padding: "8px 16px", cursor: "pointer",
                }}>
                  <Plus size={14} /> New project
                </button>
              </div>
            )}
          </div>
        ) : folderNotesOpen ? (
          <FolderNotesView
            projectName={currentProject?.name}
            subName={currentSubproject?.name}
            sources={folderSources}
            notes={aiNotes}
            isGenerating={notesGenerating}
            progress={notesProgress}
            error={notesError}
            lastUpdated={notesLastUpdated}
            provider={notesProvider}
            onClose={exitFolderNotes}
            onRegenerate={regenerateNotes}
          />
        ) : !activeRecordingId ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: COLORS.windowBg }}>
            <div style={{ height: 48, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface, animation: "ovioFadeDown 320ms cubic-bezier(.22,1,.36,1) both" }}>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{currentRecordings.length} recording{currentRecordings.length === 1 ? "" : "s"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  onClick={addFiles}
                  disabled={vaultBusy}
                  title="Attach images, PDFs and documents to this folder"
                  style={{
                    display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.borderStrong}`,
                    background: COLORS.surface, color: COLORS.text,
                    fontSize: 12.5, fontWeight: 500, borderRadius: 999, padding: "6px 13px",
                    cursor: vaultBusy ? "wait" : "pointer",
                    transition: "transform 120ms ease, border-color 160ms ease, background 160ms ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.blue; e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <Paperclip size={13} /> Add Files
                </button>
                <button
                  onClick={enterFolderNotes}
                  disabled={eligibleRecordings.length === 0}
                  title={eligibleRecordings.length === 0
                    ? "Record something first — each recording needs a transcript or AI notes to combine"
                    : `Create ONE combined note from all ${eligibleRecordings.length} recording${eligibleRecordings.length === 1 ? "" : "s"} in this folder`}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.borderStrong}`,
                    background: COLORS.surface, color: eligibleRecordings.length === 0 ? COLORS.textTertiary : COLORS.text,
                    fontSize: 12.5, fontWeight: 500, borderRadius: 999, padding: "6px 13px",
                    cursor: eligibleRecordings.length === 0 ? "default" : "pointer",
                    opacity: eligibleRecordings.length === 0 ? 0.55 : 1,
                    transition: "transform 120ms ease, border-color 160ms ease, background 160ms ease",
                  }}
                  onMouseEnter={(e) => { if (eligibleRecordings.length > 0) { e.currentTarget.style.borderColor = COLORS.blue; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  <Layers size={13} /> Combine Notes
                </button>
                <button onClick={createRecording} title={ambientShortcutLabel ? `Tip: press ${ambientShortcutLabel} anywhere on your Mac to start an ambient recording` : undefined} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "#FFFFFF", color: "#0A0A0D", fontSize: 12.5, fontWeight: 500, borderRadius: 999, padding: "7px 14px", cursor: "pointer", transition: "transform 120ms ease, background 160ms ease, box-shadow 200ms ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.blue; e.currentTarget.style.boxShadow = "0 4px 12px rgba(180,85,45,0.35)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.text; e.currentTarget.style.boxShadow = "none"; }}>
                  <Mic size={13} /> New Recording
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
              {currentRecordings.length === 0 ? (
                <div style={{ fontSize: 13, color: COLORS.textTertiary, marginTop: 12, lineHeight: 1.6 }}>No recordings yet. Click "New Recording" to start.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {currentRecordings.map((rec, i) => (
                    <div key={rec.id} data-rec-id={rec.id} onClick={() => openRecording(rec)}
                      style={{
                        ...rowIn(i),
                        animation: flyingOutId === rec.id ? "ovioFlyOut 300ms ease both" : rowIn(i).animation,
                        position: "relative",
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer",
                        transition: "transform 150ms ease, border-color 150ms ease, box-shadow 180ms ease",
                      }}
                      onMouseEnter={(e) => { setHoveredId(rec.id); e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 5px 14px rgba(0,0,0,0.08)"; }}
                      onMouseLeave={(e) => { setHoveredId(null); e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
                      <div style={{ width: 34, height: 34, borderRadius: 999, background: COLORS.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Disc size={15} color={COLORS.textSecondary} />
                      </div>
                      {renamingItem?.kind === "recording" && renamingItem.id === rec.id ? (
                        <div style={{ flex: 1, minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                          <InlineRenameRow initial={rec.label} indent={0} onConfirm={commitRename} onCancel={() => setRenamingItem(null)} />
                        </div>
                      ) : (
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.label}</div>
                          <div style={{ fontSize: 12, color: COLORS.textTertiary, marginTop: 1 }}>{formatDate(rec.createdAt)}</div>
                        </div>
                      )}
                      {hoveredId === rec.id && renamingItem?.id !== rec.id && (
                        <>
                          <IconButton onClick={(e) => { e.stopPropagation(); beginMove(rec.id); }} title="Move to another folder" small><FolderInput size={12} /></IconButton>
                          <IconButton onClick={(e) => { e.stopPropagation(); startRename({ kind: "recording", sid: selectedSubprojectId, id: rec.id }); }} title="Rename recording" small><Pencil size={12} /></IconButton>
                          <IconButton onClick={(e) => { e.stopPropagation(); removeRecording(selectedSubprojectId, rec.id); }} title="Delete recording" small><Trash2 size={12} /></IconButton>
                        </>
                      )}
                      <div style={{ fontSize: 12, color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums" }}>{formatTime(rec.duration || 0)}</div>
                      <ChevronRight size={15} color={COLORS.textTertiary}
                        style={{
                          opacity: hoveredId === rec.id ? 1 : 0,
                          transform: hoveredId === rec.id ? "translateX(0)" : "translateX(-4px)",
                          transition: "opacity 160ms ease, transform 160ms ease",
                        }} />
                      {/* Transfer popup moved to a centered modal (TransferModal) */}
                      {movePickFor === rec.id && (
                        <TransferModal
                          open
                          currentLabel={moveCurrentLabel}
                          targets={moveTargets}
                          onClose={() => setMovePickFor(null)}
                          onPick={(sid, name) => pickMoveTarget(rec.id, sid, name)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>

            {/* ===== Vault — bottom drawer, pinned at the foot of the folder view.
                Hidden until files are added or opened manually. ===== */}
            <div style={{ flexShrink: 0, padding: "0 24px 14px", background: COLORS.windowBg }}>
              <VaultSection
                files={currentVaultFiles}
                busy={vaultBusy}
                open={vaultOpen}
                onToggle={() => setVaultOpen((v) => !v)}
                onAdd={addFiles}
                onView={viewFile}
                onRemove={removeFile}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Recording area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, background: COLORS.windowBg, position: "relative", animation: "ovioScaleIn 420ms cubic-bezier(.22,1,.36,1) both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, height: 64, animation: "ovioFadeUp 420ms cubic-bezier(.22,1,.36,1) both" }}>
                {bars.map((h, i) => (
                  <div key={i} style={{
                    width: 3, height: h, borderRadius: 2,
                    background: isRecording ? COLORS.text : COLORS.borderStrong,
                    transition: "height 220ms ease, background 180ms ease",
                    animation: `ovioGrowBar 520ms cubic-bezier(.22,1,.36,1) ${Math.min(i * 16, 400)}ms both`,
                  }} />
                ))}
              </div>

              <div style={{ fontSize: 64, fontWeight: 200, letterSpacing: 1, color: COLORS.text, fontVariantNumeric: "tabular-nums", animation: "ovioPopIn 560ms cubic-bezier(.22,1,.36,1) both" }}>{formatTime(elapsed)}</div>

              <div style={{ display: "flex", alignItems: "center", gap: 28, animation: "ovioFadeUp 480ms 120ms cubic-bezier(.22,1,.36,1) both" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                  <button onClick={() => setNoteOpen((o) => !o)} title="Add a note"
                    style={{ width: 52, height: 52, borderRadius: 999, border: `1px solid ${COLORS.borderStrong}`, background: noteOpen ? COLORS.text : COLORS.surface, color: noteOpen ? COLORS.text : COLORS.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 150ms ease, color 150ms ease, transform 120ms ease, border-color 150ms ease", transform: "scale(1)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.text; e.currentTarget.style.transform = "scale(1.06)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "scale(1)"; }}>
                    <PenLine size={18} />
                  </button>
                  <span style={{ fontSize: 11.5, color: COLORS.textSecondary }}>Add note</span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative" }}>
                    {isRecording && (
                      <>
                        <span style={{ position: "absolute", inset: 0, borderRadius: 999, border: `2px solid ${COLORS.red}`, animation: "ovioRingPulse 1.8s ease-out infinite" }} />
                        <span style={{ position: "absolute", inset: 0, borderRadius: 999, border: `2px solid ${COLORS.red}`, animation: "ovioRingPulse 1.8s ease-out 0.6s infinite" }} />
                      </>
                    )}
                    <button onClick={toggleRecording}
                      style={{ width: 76, height: 76, borderRadius: 999, border: `1px solid ${COLORS.borderStrong}`, background: COLORS.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: isRecording ? `0 0 0 6px rgba(255,59,48,0.12)` : "0 1px 2px rgba(0,0,0,0.06)", transition: "box-shadow 200ms ease, transform 130ms ease, border-color 150ms ease", position: "relative", transform: "scale(1)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.text; e.currentTarget.style.transform = "scale(1.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.transform = "scale(1)"; }}>
                      {isRecording ? (
                        <span key="rec" style={{ display: "flex", animation: "ovioRecordOn 300ms cubic-bezier(.22,1,.36,1) both" }}>
                          <Square size={22} fill={COLORS.red} color={COLORS.red} />
                        </span>
                      ) : (
                        <span key="pause" style={{ display: "flex", animation: "ovioRecordOff 300ms cubic-bezier(.22,1,.36,1) both" }}>
                          <div style={{ width: 26, height: 26, borderRadius: 999, background: COLORS.red }} />
                        </span>
                      )}
                    </button>
                  </div>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary, transition: "color 150ms ease" }}>
                    {isRecording ? "Tap to pause" : transcript.length > 0 || elapsed > 0 ? "Tap to resume" : "Tap to record"}
                  </span>
                </div>

                <div style={{ width: 52 }} />
              </div>

              {noteOpen && (
                <div style={{ position: "absolute", bottom: 128, width: 420, maxWidth: "80%", background: COLORS.surface, border: `1px solid ${COLORS.borderStrong}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", padding: 10, display: "flex", gap: 8, alignItems: "center", animation: "ovioPopIn 200ms cubic-bezier(.22,1,.36,1) both" }}>
                  <input ref={noteInputRef} value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddNote(); if (e.key === "Escape") { setNoteInput(""); setNoteOpen(false); } }}
                    placeholder={`Note at ${formatTime(elapsed)}…`}
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 14, fontFamily: FONT, color: COLORS.text, background: "transparent", padding: "6px 4px" }} />
                  <button onClick={handleAddNote} style={{ border: "none", background: COLORS.blue, color: COLORS.text, fontSize: 12.5, fontWeight: 500, borderRadius: 8, padding: "8px 12px", cursor: "pointer" }}>Save</button>
                </div>
              )}

              {speechError && (
                <div style={{ position: "absolute", bottom: 24, fontSize: 12, color: COLORS.red, maxWidth: 420, textAlign: "center", animation: "ovioFadeUp 300ms ease both" }}>{speechError}</div>
              )}
            </div>

            {/* Right sidebar */}
            <div style={{ width: 400, minWidth: 400, display: "flex", flexDirection: "column", borderLeft: `1px solid ${COLORS.border}`, background: COLORS.sidebarBg, animation: "ovioSlideLeft 420ms cubic-bezier(.22,1,.36,1) both" }}>
              {/* Tabs */}
              <div style={{ height: 48, minHeight: 48, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px 0 12px", borderBottom: `1px solid ${COLORS.border}`, animation: "ovioFadeDown 300ms ease both" }}>
                <div ref={tabBarRef} style={{ display: "flex", gap: 2, position: "relative" }}>
                  <span style={{
                    position: "absolute", bottom: 0, height: 2, borderRadius: 2,
                    background: COLORS.accent,
                    left: tabGlow.left, width: tabGlow.width,
                    transition: "left 240ms cubic-bezier(.22,1,.36,1), width 240ms cubic-bezier(.22,1,.36,1)",
                  }} />
                  {[
                    { id: "transcript", icon: <MessageSquareText size={13} />, label: "Transcript" },
                    { id: "ai-notes", icon: <Brain size={13} />, label: "AI Notes" },
                  ].map((t) => (
                    <button key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => setTab(t.id)}
                      style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: tab === t.id ? COLORS.accentSoft : "transparent", color: tab === t.id ? COLORS.accent : COLORS.textSecondary, fontSize: 12, fontWeight: 600, borderRadius: 7, padding: "6px 9px", cursor: "pointer", transition: "background 180ms ease, color 180ms ease" }}>
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
                    <div style={{ fontSize: 13, color: COLORS.textTertiary, marginTop: 12, lineHeight: 1.6, animation: "ovioTabIn 280ms ease both" }}>
                      {isRecording ? `Listening…${engineLabel ? ` — ${engineLabel}` : ""}` : "Start recording to see a live transcript here."}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0, animation: "ovioTabIn 280ms ease both" }}>
                      {/* User notes — their own section pinned at the top */}
                      {notes.length > 0 && (
                        <div style={{
                          marginBottom: 14, padding: "10px 12px",
                          background: COLORS.noteHighlight, border: `1px solid ${COLORS.noteBorder}`,
                          borderRadius: 10, maxHeight: 220, overflowY: "auto", flexShrink: 0,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "#FF9F0A", marginBottom: 8, position: "sticky", top: -10, marginTop: -10, paddingTop: 10, background: COLORS.noteHighlight }}>
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
                          {isRecording ? `Listening…${engineLabel ? ` — ${engineLabel}` : ""}` : "Start recording to see a live transcript here."}
                        </div>
                      )}
                    </div>
                  )
                )}

                {tab === "ai-notes" && (
                  <div style={{ animation: "ovioTabIn 280ms ease both" }}>
                    {noApiKey ? (
                      <div style={{ textAlign: "center", padding: "32px 0", color: COLORS.textTertiary, fontSize: 13, lineHeight: 1.6 }}>
                        <Brain size={28} style={{ marginBottom: 12, opacity: 0.7 }} />
                        <div>Add an API key in Settings — or switch to Ollama — to generate AI notes.</div>
                      </div>
                    ) : (
                      <>
                        {notesGenerating && <GeneratingPanel progress={notesProgress} />}

                        {notesLastUpdated && (
                          <div className="ai-notes-content" style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                              <span style={{ fontSize: 11, color: COLORS.textTertiary }}>Updated {timeSince(notesLastUpdated)}</span>
                              <AiNotesToolbar aiNotes={aiNotes} onRegenerate={regenerateNotes} isGenerating={notesGenerating} providerLabel={notesProvider} />
                            </div>
                          </div>
                        )}

                        {notesGenerating && !aiNotes && !notesError && (
                          <div style={{ padding: "32px 0", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>
                            Generating in-depth summary from your transcript…
                          </div>
                        )}

                        {notesError && (
                          <div style={{ padding: "12px", background: "rgba(255,93,93,0.12)", borderRadius: 8, color: COLORS.red, fontSize: 12, marginBottom: 12 }}>{notesError}</div>
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
                  <div style={{ maxHeight: 240, overflowY: "auto", padding: "12px 16px 4px", display: "flex", flexDirection: "column", gap: 10, animation: "ovioFadeUp 260ms cubic-bezier(.22,1,.36,1) both" }}>
                    {aiMessages.length === 0 && !aiLoading && (
                      <div style={{ fontSize: 12, color: COLORS.textTertiary, textAlign: "center", padding: "10px 0" }}>Ask anything about your recording</div>
                    )}
                    {aiMessages.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
                          fontSize: 12.5, lineHeight: 1.5,
                          background: m.role === "user" ? COLORS.text : COLORS.surface2,
                          color: m.role === "user" ? COLORS.text : COLORS.text,
                          whiteSpace: "pre-wrap",
                          animation: m.role === "user" ? "ovioChatInUser 260ms cubic-bezier(.22,1,.36,1) both" : "ovioChatInBot 300ms cubic-bezier(.22,1,.36,1) both",
                        }}>{m.content}</div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div style={{ fontSize: 12, color: COLORS.textTertiary, padding: "6px 0", display: "flex", alignItems: "center", gap: 5 }}>
                        Thinking
                        <span style={{ letterSpacing: 1 }}>
                          <span style={{ animation: "ovioDots 1.2s infinite" }}>.</span><span style={{ animation: "ovioDots 1.2s 0.2s infinite" }}>.</span><span style={{ animation: "ovioDots 1.2s 0.4s infinite" }}>.</span>
                        </span>
                      </div>
                    )}
                    <div ref={aiEndRef} />
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                  <button onClick={() => setAiOpen((o) => !o)} title={aiOpen ? "Hide chat" : "Show chat"}
                    style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: COLORS.surface, color: aiOpen ? COLORS.textTertiary : COLORS.textSecondary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 150ms ease, color 150ms ease, transform 120ms ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surface3; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.surface; }}>
                    {aiOpen ? <X size={13} /> : <Sparkles size={13} />}
                  </button>
                  <input value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && aiInput.trim()) handleAskAI(); }}
                    placeholder="Ask a question about this recording…"
                    style={{ flex: 1, border: "none", outline: "none", fontSize: 12.5, fontFamily: FONT, color: COLORS.text, background: "transparent", padding: "4px 0" }} />
                  <button onClick={handleAskAI} disabled={!aiInput.trim() || aiLoading}
                    style={{ width: 28, height: 28, borderRadius: 999, border: "none", background: aiInput.trim() ? COLORS.blue : COLORS.border, color: COLORS.text, cursor: aiInput.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 150ms ease, transform 120ms ease" }}
                    onMouseEnter={(e) => { if (aiInput.trim()) e.currentTarget.style.transform = "scale(1.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}>
                    <Send size={12} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Vault fullscreen viewer (images / PDFs / text) */}
      {vaultLightbox?.file && (
        <VaultLightbox
          payload={vaultLightbox}
          onClose={() => setVaultLightbox(null)}
          onRemove={removeFile}
        />
      )}

      {/* Move-to-folder confirmation toast */}
      {moveToast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          zIndex: 400, display: "flex", alignItems: "center", gap: 8,
          background: COLORS.text, color: COLORS.text, fontSize: 12.5, fontWeight: 500,
          borderRadius: 999, padding: "9px 16px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          pointerEvents: "none", animation: "ovioToastIn 260ms cubic-bezier(.22,1,.36,1) both, ovioFadeOut 200ms ease 2200ms both",
        }}>
          <Check size={13} style={{ flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380 }}>
            Moved to {moveToast}
          </span>
        </div>
      )}
    </div>
  );
}
