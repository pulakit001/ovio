import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  CornerDownLeft,
  HelpCircle,
  Inbox,
  Mic,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";
import { COLORS, CTA, FONT, isLight } from "../ui/theme";
import { askLibrary } from "../services/ai";
import { useSettings } from "../context/SettingsContext";
import { PrimaryButton } from "../ui/kit";

const GENERAL_PROJECT_ID = "general-folder-project";
const GENERAL_SUB_ID = "general-folder-sub";

const DASH_CSS = `
@keyframes ovioLibraryEnter {
  from { opacity: 0; transform: translateY(12px); filter: blur(4px); }
  to { opacity: 1; transform: translateY(0); filter: blur(0); }
}
@keyframes ovioWave {
  0%, 60%, 100% { transform: rotate(0deg); }
  10% { transform: rotate(16deg); }
  20% { transform: rotate(-8deg); }
  30% { transform: rotate(14deg); }
  40% { transform: rotate(-4deg); }
  50% { transform: rotate(10deg); }
}
.library-wave {
  display: inline-block;
  transform-origin: 70% 75%;
  animation: ovioWave 2.4s ease-in-out 500ms 2 both;
  cursor: default;
}
.library-wave:hover { animation: ovioWave 1.6s ease-in-out infinite; }
.library-search-tray {
  border-radius: 24px;
  padding: 9px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.library-chip {
  appearance: none;
  border: none;
  border-radius: 12px;
  padding: 0 14px;
  height: 36px;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 560;
  cursor: pointer;
  transition: background 160ms ease, color 160ms ease, transform 180ms cubic-bezier(.16,1,.3,1);
}
.library-chip:active { transform: scale(0.97); }
.library-search-bar {
  appearance: none;
  width: 100%;
  height: 62px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 9px;
  border-radius: 18px;
  margin: 0;
  box-sizing: border-box;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}
.library-search-bar:focus-within { border-color: var(--ovio-border-strong) !important; }
.library-ask-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 15px;
  font-weight: 450;
}
.library-ask-input::placeholder { color: var(--ovio-text); opacity: 0.42; }
.library-ask-ghost {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 9px; background: transparent; cursor: pointer;
  transition: background 150ms ease, color 150ms ease;
}
.library-ask-ghost:hover { background: var(--ovio-surface2); color: var(--ovio-text) !important; }
@keyframes ovioSpin { to { transform: rotate(360deg); } }
.library-spinner {
  width: 15px; height: 15px; border-radius: 999px;
  border: 2px solid currentColor; border-top-color: transparent;
  animation: ovioSpin 700ms linear infinite;
}
@keyframes ovioShimmer { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
.library-skeleton { display: block; height: 11px; border-radius: 6px; animation: ovioShimmer 1.3s ease-in-out infinite; }
.library-answer {
  border-radius: 16px;
  padding: 18px 20px 16px;
  animation: ovioLibraryEnter 380ms cubic-bezier(.16,1,.3,1) both;
}
.library-cite {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 4px; margin: 0 1px;
  border: none; border-radius: 5px; vertical-align: 2px;
  font-family: inherit; font-size: 10px; font-weight: 650; cursor: pointer;
  transition: color 150ms ease;
}
.library-cite:hover { color: var(--ovio-text) !important; }
.library-source {
  display: inline-flex; align-items: center; gap: 7px; max-width: 260px;
  height: 30px; padding: 0 11px; border-radius: 9px; background: transparent;
  font-family: inherit; font-size: 12px; font-weight: 550; cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.library-source:hover { border-color: var(--ovio-border-strong) !important; color: var(--ovio-text) !important; background: var(--ovio-surface2); }
.library-chip:focus-visible,
.library-cite:focus-visible,
.library-source:focus-visible,
.library-ask-ghost:focus-visible {
  outline: 2px solid var(--ovio-text);
  outline-offset: 2px;
}
.library-project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
}
.library-project-card > * {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}
.library-folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
}
.library-project-card {
  appearance: none;
  width: 100%;
  min-width: 0;
  min-height: 236px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  text-align: left;
  color: var(--ovio-text);
  background: var(--ovio-surface);
  border: 1px solid var(--ovio-border);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  font-family: inherit;
  transition: transform 220ms cubic-bezier(.16,1,.3,1), border-color 180ms ease, background 180ms ease;
}
.library-project-card:hover {
  transform: translateY(-3px);
  border-color: var(--ovio-border-strong);
  background: var(--ovio-surface2);
}
.library-project-card:focus-visible,
.library-back:focus-visible,
.library-icon-button:focus-visible,
.library-recording-main:focus-visible,
.library-recording-actions:focus-visible,
.library-action:focus-visible,
.library-more:focus-visible {
  outline: 2px solid var(--ovio-text);
  outline-offset: 3px;
}
.library-project-card:hover .library-project-arrow { transform: translate(2px, -2px); color: var(--ovio-text); }
.library-project-arrow { transition: transform 180ms cubic-bezier(.16,1,.3,1), color 180ms ease; }
.library-project-edit { opacity: 0; }
.library-project-card:hover .library-project-edit,
.library-project-card:focus-within .library-project-edit { opacity: 1; }
@media (hover: none) {
  .library-project-edit { opacity: 1; }
}
.library-project-rename {
  width: 100%;
  box-sizing: border-box;
  margin: -3px 0;
  padding: 3px 8px;
  border: 1px solid var(--ovio-border-strong);
  border-radius: 8px;
  background: var(--ovio-surface2);
  color: var(--ovio-text);
  font-family: inherit;
  font-size: 19px;
  font-weight: 620;
  letter-spacing: -0.022em;
  line-height: 1.22;
  outline: none;
  transition: border-color 160ms ease;
}
.library-project-rename:focus { border-color: var(--ovio-text); }
.library-folder-card {
  background: var(--ovio-surface);
  border: 1px solid var(--ovio-border);
  border-radius: 16px;
  overflow: hidden;
  animation: ovioLibraryEnter 440ms cubic-bezier(.16,1,.3,1) both;
}
.library-folder-head { transition: background 160ms ease; }
.library-folder-head:hover { background: var(--ovio-surface2); }
.library-recording {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  padding: 0 10px;
  transition: background 150ms ease;
}
.library-recording:hover { background: var(--ovio-surface2); }
.library-recording-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 11px;
  border: none;
  background: transparent;
  color: inherit;
  padding: 9px 0;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.library-recording .library-recording-actions { opacity: 0; transition: opacity 150ms ease; }
.library-recording:hover .library-recording-actions,
.library-recording:focus-within .library-recording-actions { opacity: 1; }
.library-icon-button,
.library-action,
.library-back,
.library-more {
  font-family: inherit;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease, transform 180ms cubic-bezier(.16,1,.3,1);
}
.library-icon-button:hover,
.library-action:hover,
.library-back:hover { color: var(--ovio-text); border-color: var(--ovio-border-strong); background: var(--ovio-surface2); }
.library-more:hover { color: var(--ovio-text); }
@media (max-width: 820px) {
  .library-project-grid,
  .library-folder-grid { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .library-wave, .library-wave:hover, .library-skeleton { animation: none; }
}
@media (max-width: 620px) {
  .library-page { padding-left: 20px !important; padding-right: 20px !important; }
  .library-greeting-title { font-size: 34px !important; }
  .library-project-card { min-height: 220px; }
  .library-recording-actions { opacity: 1 !important; }
}
`;

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function formatLatest(timestamp) {
  if (!timestamp) return "No recordings yet";
  return `Last recorded ${formatDate(timestamp)}`;
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const byNewest = (recordings) => (recordings || []).slice().sort((a, b) => b.createdAt - a.createdAt);

function ProjectCard({ project, index, onOpen, onRename, general = false }) {
  const visibleFolders = project.subs.slice(0, 3);
  const remainingFolders = project.subs.length - visibleFolders.length;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (!renaming) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renaming]);

  const beginRename = (event) => {
    event.stopPropagation();
    if (general || !onRename) return;
    setDraft(project.name || "");
    setRenaming(true);
  };

  const commitRename = () => {
    const clean = (draft || "").trim();
    setRenaming(false);
    if (!clean || clean === project.name) return;
    onRename?.(project.id, clean);
  };

  const cancelRename = () => {
    setRenaming(false);
    setDraft("");
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="library-project-card"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (renaming) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      style={{ animation: `ovioLibraryEnter 500ms cubic-bezier(.16,1,.3,1) ${70 + index * 45}ms both` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "20px 20px 0" }}>
        <div
          style={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: COLORS.surface3,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
            fontSize: 19,
            fontWeight: 650,
            letterSpacing: "-0.03em",
          }}
        >
          {general ? <Inbox size={20} strokeWidth={1.7} /> : (project.name || "?").trim().charAt(0).toUpperCase()}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {!general && onRename && (
            <button
              type="button"
              className="library-icon-button library-project-edit"
              onClick={beginRename}
              title="Rename project"
              aria-label={`Rename ${project.name}`}
              style={{
                width: 30,
                height: 30,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid transparent",
                borderRadius: 8,
                background: "transparent",
                color: COLORS.textTertiary,
                cursor: "pointer",
              }}
            >
              <Pencil size={13} />
            </button>
          )}
          <ArrowUpRight className="library-project-arrow" size={18} color={COLORS.textTertiary} style={{ flexShrink: 0 }} />
        </div>
      </div>

      <div style={{ padding: "18px 20px 18px", flex: 1, display: "flex", flexDirection: "column" }}>
        {renaming ? (
          <input
            ref={renameInputRef}
            className="library-project-rename"
            value={draft}
            maxLength={60}
            aria-label="Project name"
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelRename();
              }
            }}
            onBlur={commitRename}
          />
        ) : (
          <div
            title={project.name}
            style={{
              color: COLORS.text,
              fontSize: 19,
              fontWeight: 620,
              letterSpacing: "-0.022em",
              lineHeight: 1.22,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {project.name}
          </div>
        )}
        <div style={{ color: COLORS.textTertiary, fontSize: 12.5, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {general ? "Your recording inbox" : `${plural(project.subs.length, "subproject")} · ${plural(project.total, "recording")}`}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: "auto", paddingTop: 18, minWidth: 0 }}>
          {general ? (
            <FolderPill label={plural(project.total, "unsorted recording")} />
          ) : visibleFolders.length > 0 ? (
            <>
              {visibleFolders.map((sub) => <FolderPill key={sub.id} label={sub.name} />)}
              {remainingFolders > 0 && <FolderPill label={`+${remainingFolders}`} />}
            </>
          ) : (
            <span style={{ color: COLORS.textTertiary, fontSize: 12 }}>No subprojects yet</span>
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          padding: "0 20px",
          borderTop: `1px solid ${COLORS.border}`,
          color: COLORS.textTertiary,
          fontSize: 11.5,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        <AudioLines size={13} style={{ flexShrink: 0 }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{formatLatest(project.latest)}</span>
      </div>
    </div>
  );
}

function FolderPill({ label }) {
  return (
    <span
      style={{
        minWidth: 0,
        maxWidth: "min(160px, 100%)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        // Squared tag, not a pill: a small radius and a flat fill read as a
        // label on the card rather than a chip floating above it.
        borderRadius: 6,
        background: COLORS.surface3,
        color: COLORS.textSecondary,
        padding: "3px 7px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.01em",
      }}
    >
      {label}
    </span>
  );
}

function greetingFor(hour) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function useFirstName() {
  const { settings } = useSettings();
  const saved = String(settings?.userName || "").trim();
  const [name, setName] = useState("");
  useEffect(() => {
    if (saved) return undefined;
    let alive = true;
    window.electronAPI?.userName?.()
      .then((full) => {
        const first = String(full || "").trim().split(/\s+/)[0] || "";
        if (alive) setName(first ? first.charAt(0).toUpperCase() + first.slice(1) : "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [saved]);
  return saved || name;
}

function Greeting({ onOpenRecorder }) {
  const name = useFirstName();
  const greeting = greetingFor(new Date().getHours());
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 20,
        marginBottom: 26,
        animation: "ovioLibraryEnter 520ms cubic-bezier(.16,1,.3,1) both",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          className="library-greeting-title"
          style={{
            margin: 0,
            color: COLORS.text,
            fontSize: 44,
            fontWeight: 560,
            letterSpacing: "-0.04em",
            lineHeight: 1.08,
            overflowWrap: "anywhere",
          }}
        >
          {greeting}{name ? `, ${name}` : ""}{" "}
          <span className="library-wave" role="img" aria-label="waving hand">👋</span>
        </h1>
        <div style={{ color: COLORS.textSecondary, fontSize: 15, marginTop: 10 }}>
          Here are your projects. Pick up where you left off.
        </div>
      </div>
      <span data-tour="record" style={{ display: "inline-flex", borderRadius: 999 }}>
        <PrimaryButton onClick={onOpenRecorder} style={{ padding: "12px 18px", fontSize: 13 }}>
          <Mic size={14} /> Record
        </PrimaryButton>
      </span>
    </div>
  );
}

// The Ask surface answers across the whole library. These rotate the most
// useful openings; the "What can I ask?" panel below lists the full range so
// people never have to guess what Ovio understands.
const CURATED_QUESTIONS = [
  "What did I record this week?",
  "Summarize my latest recording",
  "What are my open action items?",
  "What decisions were made recently?",
];

// Grouped so the help panel reads like a capability map, not a wall of
// prompts. Every example is answerable from transcripts + AI notes.
const ASK_CATEGORIES = [
  {
    label: "Recap",
    questions: [
      "Summarize my latest recording",
      "What did I record this week?",
      "Recap everything from last month",
    ],
  },
  {
    label: "Actions & decisions",
    questions: [
      "What are my open action items?",
      "What did I commit to?",
      "What decisions were made recently?",
      "List every deadline that came up",
    ],
  },
  {
    label: "People & details",
    questions: [
      "Who was in my last meeting?",
      "Where did we discuss pricing?",
      "What numbers came up this week?",
      "What questions are still unanswered?",
    ],
  },
  {
    label: "Ideas & themes",
    questions: [
      "What ideas did I capture?",
      "What themes keep coming up?",
      "What changed between my last two recordings?",
    ],
  },
];

async function fetchAiKeys() {
  try {
    const plain = await window.settingsAPI?.getPlain?.();
    return {
      openrouterKeys: plain?.openrouterKeys || [],
      aiProvider: plain?.aiProvider || "cloud",
      localLlmModel: plain?.localLlmModel || "qwen2.5-3b",
      aiBehavior: plain?.aiBehavior || {},
    };
  } catch {
    return { openrouterKeys: [], aiProvider: "cloud", localLlmModel: "qwen2.5-3b", aiBehavior: {} };
  }
}

function renderInline(text, sources, onCite, keyBase) {
  const parts = String(text).split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key} style={{ fontWeight: 650, color: COLORS.text }}>{part.slice(2, -2)}</strong>;
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      const src = sources.find((x) => x.n === Number(cite[1]));
      if (!src) return null;
      return (
        <button
          key={key}
          type="button"
          className="library-cite"
          title={`Open “${src.label}”`}
          onClick={() => onCite(src)}
          style={{ background: COLORS.surface3, color: COLORS.textSecondary }}
        >
          {src.n}
        </button>
      );
    }
    return part;
  });
}

function AnswerBody({ text, sources, onCite }) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let list = null;
  lines.forEach((raw, i) => {
    const line = raw.replace(/^#{1,6}\s+/, "");
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) { list = []; blocks.push({ type: "list", items: list }); }
      list.push(bullet[1]);
      return;
    }
    list = null;
    if (line.trim()) blocks.push({ type: "p", text: line, i });
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.62 }}>
      {blocks.map((block, bi) => block.type === "list" ? (
        <ul key={bi} style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {block.items.map((item, ii) => <li key={ii}>{renderInline(item, sources, onCite, `${bi}-${ii}`)}</li>)}
        </ul>
      ) : (
        <p key={bi} style={{ margin: 0 }}>{renderInline(block.text, sources, onCite, `${bi}`)}</p>
      ))}
    </div>
  );
}

function AskPanel({ library, recordingCount, onOpenSearch, onOpenSource }) {
  const light = isLight();
  const [value, setValue] = useState("");
  const [answer, setAnswer] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const askId = useRef(0);

  const latestProject = library.filter((p) => !p.general && p.latest > 0).sort((a, b) => b.latest - a.latest)[0];
  const chips = recordingCount === 0
    ? []
    : [
        ...CURATED_QUESTIONS,
        ...(latestProject ? [`Recap ${latestProject.name.length > 30 ? `${latestProject.name.slice(0, 30)}…` : latestProject.name}`] : []),
      ];

  const ask = async (raw) => {
    const question = String(raw || "").trim();
    if (!question) return;
    const id = ++askId.current;
    setValue(question);
    if (recordingCount === 0) {
      setAnswer({ question, text: "Your library is empty right now. Make a recording and I can answer questions about it.", sources: [] });
      return;
    }
    setAnswer({ question, loading: true, sources: [] });
    try {
      const keys = await fetchAiKeys();
      const res = await askLibrary(keys, question, collectRecordings(library));
      if (id !== askId.current) return;
      setAnswer({ question, text: res.text || "I couldn’t find an answer in your recordings.", sources: res.sources || [] });
    } catch (err) {
      if (id !== askId.current) return;
      setAnswer({ question, error: err?.message || "Couldn’t reach the AI. Check your keys in Settings.", sources: [] });
    }
  };

  const clear = () => {
    askId.current += 1;
    setAnswer(null);
    setValue("");
    setHelpOpen(false);
  };

  const hasText = value.trim().length > 0;
  const tray = light
    ? { background: "rgba(10,10,10,0.035)", border: `1px solid ${COLORS.border}` }
    : { background: "rgba(255,255,255,0.04)", border: `1px solid ${COLORS.border}` };
  const chipStyle = light
    ? { background: "#FFFFFF", color: COLORS.textSecondary, boxShadow: `inset 0 0 0 1px ${COLORS.border}` }
    : { background: "rgba(255,255,255,0.07)", color: "#D6D6DB" };
  const bar = light
    ? { background: "#FFFFFF", border: `1px solid ${COLORS.borderStrong}`, boxShadow: "0 1px 2px rgba(10,10,10,0.04), 0 10px 28px rgba(10,10,10,0.06)" }
    : { background: "#0A0A0B", border: "1px solid rgba(255,255,255,0.1)" };
  const helpCard = light
    ? { background: "#FFFFFF", border: `1px solid ${COLORS.border}`, boxShadow: "0 8px 26px rgba(10,10,10,0.06)" }
    : { background: COLORS.surface, border: `1px solid ${COLORS.border}` };
  const helpChip = light
    ? { background: "transparent", border: `1px solid ${COLORS.borderStrong}`, color: COLORS.textSecondary }
    : { background: "transparent", border: "1px solid rgba(255,255,255,0.14)", color: COLORS.textSecondary };

  return (
    <div
      data-tour="ask"
      className="library-search-tray"
      style={{ ...tray, animation: "ovioLibraryEnter 520ms cubic-bezier(.16,1,.3,1) 60ms both" }}
    >
      {!answer && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, minWidth: 0, alignItems: "center" }}>
            {chips.map((label) => (
              <button
                key={label}
                type="button"
                className="library-chip"
                title={label}
                onClick={() => ask(label)}
                style={chipStyle}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className="library-chip"
              onClick={() => setHelpOpen((open) => !open)}
              title="See everything you can ask"
              aria-expanded={helpOpen}
              style={{ ...helpChip, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}
            >
              <HelpCircle size={12} /> What can I ask?
            </button>
          </div>

          {helpOpen && (
            <div
              className="library-ask-help"
              style={{
                ...helpCard,
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                animation: "ovioLibraryEnter 220ms cubic-bezier(.16,1,.3,1) both",
              }}
            >
              <div style={{ fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.55 }}>
                Ask in plain language. Ovio reads across <strong style={{ color: COLORS.text, fontWeight: 600 }}>every recording</strong> —
                transcripts, your notes and AI notes — then cites what it used.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                {ASK_CATEGORIES.map((category) => (
                  <div key={category.label} style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 10.5, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: COLORS.textTertiary, marginBottom: 6,
                    }}>
                      {category.label}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {category.questions.map((question) => (
                        <button
                          key={question}
                          type="button"
                          onClick={() => { setHelpOpen(false); ask(question); }}
                          style={{
                            border: "none", background: "transparent", textAlign: "left",
                            padding: "4px 0", cursor: "pointer", fontFamily: FONT,
                            fontSize: 12, lineHeight: 1.45, color: COLORS.textSecondary,
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textSecondary; }}
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <form
        className="library-search-bar"
        onSubmit={(e) => { e.preventDefault(); ask(value); }}
        style={bar}
      >
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#C6F55F",
            color: "#0A0F02",
          }}
        >
          <Sparkles size={17} strokeWidth={2} />
        </span>
        <input
          className="library-ask-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") clear(); }}
          placeholder="Ask anything about your recordings"
          aria-label="Ask a question about your recordings"
          style={{ color: COLORS.text }}
        />
        {answer && (
          <button
            type="button"
            className="library-ask-ghost"
            onClick={clear}
            title="Clear (Esc)"
            aria-label="Clear question"
            style={{ color: COLORS.textTertiary }}
          >
            <X size={15} />
          </button>
        )}
        <button
          type="submit"
          disabled={!hasText || answer?.loading}
          title="Ask (Enter)"
          aria-label="Ask"
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            border: "none",
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: hasText ? "pointer" : "default",
            background: hasText ? CTA.bg : light ? COLORS.surface2 : "rgba(255,255,255,0.08)",
            color: hasText ? CTA.fg : COLORS.textTertiary,
            transition: "background 180ms ease, color 180ms ease",
          }}
        >
          {answer?.loading ? <span className="library-spinner" /> : <CornerDownLeft size={17} strokeWidth={2} />}
        </button>
      </form>

      {answer && (
        <div
          className="library-answer"
          style={{
            background: light ? "#FFFFFF" : COLORS.surface,
            border: `1px solid ${COLORS.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.textTertiary, fontSize: 12, marginBottom: 12, minWidth: 0 }}>
            <Sparkles size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{answer.question}</span>
          </div>
          {answer.loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }} aria-live="polite" aria-label="Reading your recordings">
              {[92, 78, 64].map((w) => (
                <span key={w} className="library-skeleton" style={{ width: `${w}%`, background: COLORS.surface2 }} />
              ))}
              <span style={{ color: COLORS.textTertiary, fontSize: 12, marginTop: 4 }}>Reading across {plural(recordingCount, "recording")}…</span>
            </div>
          ) : answer.error ? (
            <div style={{ color: COLORS.textSecondary, fontSize: 13.5, lineHeight: 1.55 }}>{answer.error}</div>
          ) : (
            <div aria-live="polite">
              <AnswerBody text={answer.text} sources={answer.sources} onCite={onOpenSource} />
              {answer.sources.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${COLORS.border}`, display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {answer.sources.slice(0, 6).map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      className="library-source"
                      onClick={() => onOpenSource(src)}
                      title={`Open “${src.label}”`}
                      style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textSecondary }}
                    >
                      <span style={{ color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums" }}>{src.n}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {!answer.loading && (
            <button
              type="button"
              className="library-more"
              onClick={() => onOpenSearch?.(answer.question)}
              style={{ marginTop: 14, padding: 0, border: "none", background: "transparent", color: COLORS.textTertiary, cursor: "pointer", fontSize: 12, fontWeight: 550 }}
            >
              Search for exact matches instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function collectRecordings(library) {
  return library.flatMap((p) => (p.general
    ? p.recs.map((r) => ({ ...r, sid: GENERAL_SUB_ID, pid: GENERAL_PROJECT_ID, project: "General Folder", folder: "" }))
    : p.subs.flatMap((sub) => sub.recs.map((r) => ({ ...r, sid: sub.id, pid: p.id, project: p.name, folder: sub.name })))));
}

export default function Dashboard({
  projects,
  recordingsBySub,
  onSelectRecording,
  onNavigateToProject,
  onRenameProject,
  onOpenRecorder,
  onOpenSearch,
}) {
  const library = useMemo(
    () => projects
      .filter((project) => project.id !== GENERAL_PROJECT_ID)
      .map((project) => {
        const subs = (project.subprojects || []).map((subproject) => ({
          ...subproject,
          recs: byNewest(recordingsBySub[subproject.id]),
        }));
        const recordings = subs.flatMap((subproject) => subproject.recs);
        return {
          ...project,
          subs,
          total: recordings.length,
          latest: recordings.reduce((latest, recording) => Math.max(latest, recording.createdAt || 0), 0),
        };
      }),
    [projects, recordingsBySub]
  );

  const generalRecordings = useMemo(() => byNewest(recordingsBySub[GENERAL_SUB_ID]), [recordingsBySub]);
  const generalProject = useMemo(
    () => ({
      id: GENERAL_PROJECT_ID,
      name: "General Folder",
      subs: [],
      total: generalRecordings.length,
      latest: generalRecordings[0]?.createdAt || 0,
    }),
    [generalRecordings]
  );

  const askLibraryData = useMemo(
    () => [{ general: true, recs: generalRecordings, latest: generalProject.latest, name: "General Folder", subs: [] }, ...library],
    [library, generalRecordings, generalProject.latest]
  );
  const recordingCount = useMemo(
    () => library.reduce((n, p) => n + p.total, 0) + generalRecordings.length,
    [library, generalRecordings]
  );

  // Clicking a project card hands the whole job to the Recorder tab: it owns
  // the folder tree, the live stage and the search/move tools already.
  const openProject = (project) => onNavigateToProject(project.id, null);

  const actions = (
    <PrimaryButton onClick={onOpenRecorder} style={{ padding: "11px 17px", fontSize: 13 }}>
      <Mic size={14} /> Record
    </PrimaryButton>
  );

  return (
    <>
      <style>{DASH_CSS}</style>
      <main className="library-page" style={{ flex: 1, overflowY: "auto", padding: "0 40px 80px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Greeting onOpenRecorder={onOpenRecorder} />
          <AskPanel
            library={askLibraryData}
            recordingCount={recordingCount}
            onOpenSearch={onOpenSearch}
            onOpenSource={(src) => onSelectRecording(src.pid, src.sid, { id: src.id })}
          />
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 16,
              margin: "40px 2px 16px",
              animation: "ovioLibraryEnter 520ms cubic-bezier(.16,1,.3,1) 100ms both",
            }}
          >
            <h2 style={{ margin: 0, color: COLORS.text, fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em" }}>
              Your projects
            </h2>
            <span style={{ color: COLORS.textTertiary, fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {plural(library.length, "project")} · {plural(recordingCount, "recording")}
            </span>
          </div>
          <div className="library-project-grid" data-tour="projects">
            <ProjectCard
              project={generalProject}
              index={0}
              general
              onOpen={() => onNavigateToProject(GENERAL_PROJECT_ID, GENERAL_SUB_ID)}
            />
            {library.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index + 1}
                onRename={onRenameProject}
                onOpen={() => openProject(project)}
              />
            ))}
          </div>
          {library.length === 0 && generalRecordings.length === 0 && (
            <div style={{ color: COLORS.textTertiary, fontSize: 12.5, marginTop: 18 }}>
              Start a recording to build your library.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
