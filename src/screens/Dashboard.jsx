import { useState, useMemo, useRef, useEffect } from "react";
import {
  Clock,
  FileText,
  Brain,
  Calendar,
  Disc,
  TrendingUp,
  Folder,
  ChevronDown,
  ChevronRight,
  Trash2,
  PenLine,
  ArrowUpRight,
  Inbox,
  FolderInput,
  Check,
  Activity,
} from "lucide-react";
import AnalyticsOverlay, { AnimatedNumber, WeekStrip } from "./DashboardAnalytics";
import TransferModal from "../components/TransferModal";
import { COLORS as T, FONT as FONT_T, GRADIENTS } from "../ui/theme";

// Live alias: spread at render time (not module load) so a theme swap is
// picked up. The two extra keys are theme-constant blue tints.
const makeColors = () => ({
  ...T,
  noteHighlight: "rgba(47,107,255,0.08)",
  noteBorder: "rgba(47,107,255,0.22)",
});
let COLORS = makeColors();

// Categorical chart palette — one hue, an opacity/brightness ladder. The
// light-mode entries sit at the front so early indices stay readable on white.
const DEPT_COLORS_DARK = ["#8AB0FF", "#5B93FF", "#2F6BFF", "#2257DB", "#1A44AD", "#153483", "#10255C", "#0B1A3D"];
const DEPT_COLORS_LIGHT = ["#2F6BFF", "#2257DB", "#1A44AD", "#4D8DFF", "#7FA8FF", "#A9C4FF", "#153483", "#10255C"];
const deptColors = () => (T.windowBg.startsWith("#F") ? DEPT_COLORS_LIGHT : DEPT_COLORS_DARK);

const FONT = FONT_T;

// Consistent band label — the quiet rhythm that organizes the whole page.
// Small caps-style eyebrow with a hairline that fades out to the right.
function SectionLabel({ icon, text, delay = 0 }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7, marginBottom: 10, marginTop: 4,
      animation: "ovioRiseSoft 500ms cubic-bezier(.16,1,.3,1) " + delay + "ms both",
    }}>
      {icon ? <span style={{ color: COLORS.blueBright, display: "flex" }}>{icon}</span> : (
        <span style={{
          width: 5, height: 5, borderRadius: 999, background: COLORS.blueBright,
          
        }} />
      )}
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: "0.09em",
        textTransform: "uppercase", color: COLORS.textTertiary,
      }}>{text}</span>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${COLORS.border} 0%, transparent 85%)` }} />
    </div>
  );
}

// Dashboard-specific motion: blur-rise entrances, a headline that settles,
// and a shimmering skeleton state while data resolves.
const DASH_CSS = `
@keyframes ovioRiseSoft {
  from { opacity: 0; transform: translateY(22px) scale(0.985); filter: blur(7px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes ovioHeadline {
  from { opacity: 0; transform: translateY(14px); letter-spacing: 0.02em; }
  to { opacity: 1; transform: translateY(0); letter-spacing: -0.03em; }
}
@keyframes ovioSkeleton {
  0% { background-position: -160% 0; }
  100% { background-position: 260% 0; }
}
@keyframes ovioRowSheen {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(240%); }
}
.ovio-hero-card {
  position: relative;
  overflow: hidden;
  transition: border-color 220ms ease, box-shadow 260ms ease, transform 240ms cubic-bezier(.16,1,.3,1);
}
.ovio-hero-card:hover {
  border-color: rgba(77,141,255,0.5);
  
  transform: translateY(-2px);
}
.ovio-panel {
  background: linear-gradient(180deg, rgba(255,255,255,0.015) 0%, rgba(255,255,255,0) 30%), var(--ovio-surface);
  border: 1px solid var(--ovio-border);
  border-radius: 20px;
}
.ovio-panel-row { transition: background 150ms ease, transform 180ms cubic-bezier(.16,1,.3,1); }
.ovio-panel-row:hover { background: var(--ovio-surface2); }
`;

// Shimmering skeleton block — shown while stats "resolve" (one beat), giving
// the page a deliberate, polished load instead of a pop-in.
function Skeleton({ w = "100%", h = 14, r = 8, style }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: `linear-gradient(100deg, rgba(255,255,255,0.04) 30%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 70%)`,
      backgroundSize: "220% 100%",
      animation: "ovioSkeleton 1.4s ease-in-out infinite",
      ...style,
    }} />
  );
}

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDurationHr(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

// Editorial hero stat — huge readable numeral, quiet label, a hairline
// sparkline of context. No icons-in-boxes, no progress rings: the NUMBER
// is the interface. Hover reveals a subtle "Analyze →" affordance.
function StatCard({ label, value, sub, onClick, subtitle, animate, delay = 0, sparkData }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 620 + delay); // one beat past the skeleton
    return () => clearTimeout(t);
  }, [delay]);
  const [lift, setLift] = useState(false);
  const maxV = Math.max(...(sparkData || [1]), 1);
  return (
    <div
      className="ovio-hero-card"
      onClick={onClick}
      onMouseEnter={() => setLift(true)}
      onMouseLeave={() => setLift(false)}
      title={subtitle}
      style={{
        flex: "1 1 200px", minWidth: 190,
        background: "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 40%), var(--ovio-surface)",
        border: `1px solid ${lift ? "rgba(77,141,255,0.5)" : COLORS.border}`,
        borderRadius: 22,
        padding: "18px 20px 14px",
        display: "flex", flexDirection: "column", gap: 6,
        cursor: onClick ? "pointer" : "default",
        boxShadow: "none",
        animation: `ovioRiseSoft 640ms cubic-bezier(.16,1,.3,1) ${delay}ms both`,
      }}
    >
      <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textSecondary, letterSpacing: "0.02em" }}>{label}</div>
      {ready ? (
        <div style={{
          fontSize: 42, fontWeight: 750, color: COLORS.text, letterSpacing: "-0.035em",
          lineHeight: 1.05, fontVariantNumeric: "tabular-nums",
          animation: "ovioHeadline 520ms cubic-bezier(.16,1,.3,1) both",
        }}>
          {animate ? <AnimatedNumber value={value} /> : value}
        </div>
      ) : (
        <Skeleton w={92} h={38} r={10} style={{ marginTop: 3 }} />
      )}
      {ready && sub ? (
        <div style={{ fontSize: 11.5, color: COLORS.textTertiary, animation: "ovioFadeIn 400ms ease 120ms both" }}>{sub}</div>
      ) : (
        <Skeleton w="58%" h={10} r={5} style={{ marginTop: 2 }} />
      )}
      {/* Hairline sparkline — context without a chart frame */}
      {ready && sparkData && sparkData.length > 1 && (
        <svg width="100%" height="22" viewBox="0 0 100 22" preserveAspectRatio="none" style={{ marginTop: 6, opacity: 0.8 }}>
          <polyline
            points={sparkData.map((v, i) => `${(i / (sparkData.length - 1)) * 100},${20 - (v / maxV) * 17}`).join(" ")}
            fill="none" stroke={COLORS.blueBright} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"
            style={{  }}
          />
          <circle cx="100" cy={20 - (sparkData[sparkData.length - 1] / maxV) * 17} r="1.8" fill={COLORS.blueBright} />
        </svg>
      )}
      {onClick && (
        <span style={{
          position: "absolute", right: 16, top: 16,
          display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, fontWeight: 700,
          color: COLORS.blueBright, opacity: lift ? 1 : 0, transform: lift ? "translateX(0)" : "translateX(-4px)",
          transition: "opacity 200ms ease, transform 220ms cubic-bezier(.16,1,.3,1)", whiteSpace: "nowrap",
        }}>
          Analyze <ChevronRight size={11} />
        </span>
      )}
    </div>
  );
}

function BarVisualization({ data, unit = "" }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [hover, setHover] = useState(null);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, padding: "0 4px", position: "relative" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          {hover === i && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
              background: COLORS.sidebarBg, color: "#fff", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
              padding: "4px 8px", borderRadius: 6, pointerEvents: "none", zIndex: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}>
              {d.label}: {d.value}{unit}
              <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", border: "5px solid transparent", borderTopColor: COLORS.sidebarBg }} />
            </div>
          )}
          <div style={{
            width: "100%", maxWidth: 28,
            height: `${Math.max((d.value / max) * 70, 3)}px`,
            background: d.highlight ? COLORS.blueBright : "#1D2B66",
            borderRadius: 4,
            transition: "height 300ms ease, opacity 200ms ease, filter 200ms ease",
            opacity: hover === null ? (d.highlight ? 1 : 0.55) : (hover === i ? 1 : 0.4),
            filter: hover === i ? "brightness(1.08)" : "none",
            cursor: "pointer",
          }} />
          <span style={{ fontSize: 9, color: COLORS.textTertiary, whiteSpace: "nowrap" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function MeetingRow({ rec, onSelect }) {
  return (
    <div onClick={() => onSelect(rec)}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        background: COLORS.surface, border: `1px solid ${COLORS.border}`,
        borderRadius: 10, cursor: "pointer", transition: "border-color 150ms ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.borderStrong)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}>
      <div style={{ width: 36, height: 36, borderRadius: 999, background: COLORS.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Disc size={15} color={COLORS.textSecondary} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.label}</div>
        <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2, display: "flex", gap: 10, alignItems: "center" }}>
          <span>{formatDate(rec.createdAt)}</span>
          <span>·</span>
          <span>{formatTime(rec.duration || 0)}</span>
          <span>·</span>
          <span>{(rec.transcript || []).length} lines</span>
          {(rec.notes || []).length > 0 && (
            <>
              <span>·</span>
              <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <PenLine size={9} /> {(rec.notes || []).length}
              </span>
            </>
          )}
        </div>
      </div>
      {rec.aiNotes && (
        <div style={{ width: 24, height: 24, borderRadius: 6, background: `${COLORS.blue}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Brain size={12} color={COLORS.blue} />
        </div>
      )}
      <ChevronRight size={14} color={COLORS.textTertiary} />
    </div>
  );
}

export default function Dashboard({ projects, recordingsBySub, setRecordingsBySub, onSelectRecording, onNavigateToProject, onClearAll }) {
  // Refresh the live-colors snapshot on every render so a theme swap applies
  // without a reload (COLORS reads the mutated theme object).
  COLORS = makeColors();
  const [expandedDept, setExpandedDept] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const contentRef = useRef(null);

  const allRecordings = useMemo(() => {
    const list = [];
    Object.entries(recordingsBySub).forEach(([subId, recs]) => {
      recs.forEach((r) => list.push({ ...r, subprojectId: subId }));
    });
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }, [recordingsBySub]);

  const totalDuration = useMemo(() => allRecordings.reduce((sum, r) => sum + (r.duration || 0), 0), [allRecordings]);
  const totalTranscriptLines = useMemo(() => allRecordings.reduce((sum, r) => sum + (r.transcript?.length || 0), 0), [allRecordings]);
  const recordingsWithAI = useMemo(() => allRecordings.filter((r) => r.aiNotes).length, [allRecordings]);
  const avgDuration = useMemo(() => {
    if (allRecordings.length === 0) return 0;
    return Math.round(totalDuration / allRecordings.length);
  }, [totalDuration, allRecordings.length]);

  const GENERAL_PROJECT_ID = "general-folder-project";
  const GENERAL_SUB_ID = "general-folder-sub";

  const deptData = useMemo(() => {
    const depts = [];
    projects.filter((proj) => proj.id !== GENERAL_PROJECT_ID).forEach((proj) => {
      const subRecs = [];
      let totalDur = 0;
      let totalLines = 0;
      let aiCount = 0;
      let noteCount = 0;

      proj.subprojects.forEach((sub) => {
        const recs = recordingsBySub[sub.id] || [];
        recs.forEach((r) => {
          subRecs.push({ ...r, subprojectName: sub.name });
          totalDur += r.duration || 0;
          totalLines += r.transcript?.length || 0;
          if (r.aiNotes) aiCount++;
          noteCount += (r.notes?.length || 0);
        });
      });

      depts.push({
        id: proj.id, name: proj.name, subprojects: proj.subprojects,
        recordings: subRecs, totalDuration: totalDur, totalLines,
        aiCount, noteCount, meetingCount: subRecs.length,
      });
    });
    return depts.sort((a, b) => b.meetingCount - a.meetingCount);
  }, [projects, recordingsBySub]);

  const durationByDept = useMemo(() => {
    return deptData
      .filter((d) => d.totalDuration > 0)
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .map((d, i) => ({
        label: d.name.slice(0, 4),
        value: Math.round(d.totalDuration / 60),
        color: deptColors()[i % 8],
        highlight: true,
      }));
  }, [deptData]);

  const handleSelectMeeting = (rec) => {
    const proj = projects.find((p) =>
      p.subprojects.some((s) => (recordingsBySub[s.id] || []).some((r) => r.id === rec.id))
    );
    const sub = proj?.subprojects.find((s) =>
      (recordingsBySub[s.id] || []).some((r) => r.id === rec.id)
    );
    if (proj && sub) onSelectRecording(proj.id, sub.id, rec);
  };

  // ---- Inbox (General Folder) + per-recording transfer ----
  const generalRecs = useMemo(
    () => (recordingsBySub[GENERAL_SUB_ID] || []).slice().sort((a, b) => b.createdAt - a.createdAt),
    [recordingsBySub]
  );
  const [inboxOpen, setInboxOpen] = useState(false);
  const [transferFor, setTransferFor] = useState(null); // { recId, fromLabel }
  const [transferred, setTransferred] = useState(null); // toast label

  const moveTargets = useMemo(() => {
    const list = [];
    projects.forEach((p) => {
      if (p.id === GENERAL_PROJECT_ID) return;
      p.subprojects.forEach((s) => {
        list.push({ sid: s.id, sname: s.name, pname: p.name, name: s.name });
      });
    });
    return list;
  }, [projects]);

  const commitTransfer = (recId, toSid, toName) => {
    const fromSid = transferFor?.fromSid || GENERAL_SUB_ID;
    setTransferFor(null);
    if (!recId || !toSid || toSid === fromSid) return;
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
    setTransferred(toName);
    setTimeout(() => setTransferred(null), 2600);
  };

  // One deliberate loading beat: skeletons resolve into the real numbers.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 560);
    return () => clearTimeout(t);
  }, []);

  // Last 14 days of meeting counts — the hero sparkline context.
  const spark = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = day.getTime() + 86400000;
      out.push(allRecordings.filter((r) => r.createdAt >= day.getTime() && r.createdAt < next).length);
    }
    return out;
  }, [allRecordings]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return "Late night";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <>
    <style>{DASH_CSS}</style>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header — no bar, just type on the aurora: the greeting IS the header */}
      <div style={{
        paddingTop: 26, paddingBottom: 4, padding: "26px 32px 4px",
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontSize: 26, fontWeight: 800, color: COLORS.text, letterSpacing: "-0.03em", lineHeight: 1.1,
            animation: "ovioHeadline 600ms cubic-bezier(.16,1,.3,1) both",
          }}>
            {greeting}
          </div>
          <div style={{
            fontSize: 12.5, color: COLORS.textTertiary, marginTop: 3,
            animation: "ovioRiseSoft 600ms cubic-bezier(.16,1,.3,1) 90ms both",
          }}>
            {allRecordings.length} recording{allRecordings.length === 1 ? "" : "s"} · {formatDurationHr(Math.round(totalDuration / 60))} captured
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {allRecordings.length > 0 && (
            <div style={{ position: "relative" }}>
              {confirmClear ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: COLORS.red }}>Clear all?</span>
                  <button onClick={() => { onClearAll(); setConfirmClear(false); }}
                    style={{ border: "none", background: COLORS.red, color: "#fff", fontSize: 10, fontWeight: 600, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: FONT }}>Yes</button>
                  <button onClick={() => setConfirmClear(false)}
                    style={{ border: "none", background: COLORS.border, color: COLORS.textSecondary, fontSize: 10, fontWeight: 600, borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: FONT }}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmClear(true)}
                  style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: COLORS.textTertiary, fontSize: 11, cursor: "pointer", fontFamily: FONT, padding: "4px 8px", borderRadius: 5 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <Trash2 size={11} /> Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content — organized document flow: every band has a consistent
          label, rhythm and gutter so the page reads as sections, not tiles. */}
      <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "6px 32px 44px" }}>
        <SectionLabel icon={null} text="Overview" delay={0} />

        {/* ===== Hero stats — huge readable numerals over shimmering skeletons ===== */}
        {!booted ? (
          <div style={{ display: "flex", gap: 14, marginBottom: 26, flexWrap: "wrap" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                flex: "1 1 200px", minWidth: 190, height: 138,
                background: "var(--ovio-surface)", border: `1px solid ${COLORS.border}`,
                borderRadius: 22, padding: "18px 20px",
                animation: `ovioRiseSoft 500ms cubic-bezier(.16,1,.3,1) ${i * 70}ms both`,
              }}>
                <Skeleton w="46%" h={11} r={5} />
                <Skeleton w={100} h={36} r={9} style={{ marginTop: 12 }} />
                <Skeleton w="58%" h={10} r={5} style={{ marginTop: 10 }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14, marginBottom: 26, flexWrap: "wrap" }}>
            <StatCard
              label="Meetings"
              value={allRecordings.length}
              animate
              sub={`across ${projects.filter((p) => p.id !== GENERAL_PROJECT_ID).length || "no"} project${projects.filter((p) => p.id !== GENERAL_PROJECT_ID).length === 1 ? "" : "s"}`}
              sparkData={spark}
              delay={0}
              subtitle="Open the full meetings analysis"
              onClick={() => setAnalytics({ kind: "meetings" })}
            />
            <StatCard
              label="Time captured"
              value={formatDurationHr(Math.round(totalDuration / 60))}
              sub={`${formatDurationHr(Math.round(avgDuration / 60))} average per meeting`}
              delay={70}
              subtitle="Open the full duration analysis"
              onClick={() => setAnalytics({ kind: "duration" })}
            />
            <StatCard
              label="AI summaries"
              value={recordingsWithAI}
              animate
              sub={`${allRecordings.length > 0 ? Math.round((recordingsWithAI / allRecordings.length) * 100) : 0}% of everything recorded`}
              delay={140}
              subtitle="Open the AI coverage analysis"
              onClick={() => setAnalytics({ kind: "ai" })}
            />
            <StatCard
              label="Transcript lines"
              value={totalTranscriptLines.toLocaleString()}
              animate
              sub={`${allRecordings.length > 0 ? Math.round(totalTranscriptLines / allRecordings.length) : 0} lines per meeting`}
              delay={210}
              subtitle="Open the full transcript analysis"
              onClick={() => setAnalytics({ kind: "transcripts" })}
            />
          </div>
        )}

        {/* ===== Activity — week strip + department bars, one quiet band ===== */}
        <SectionLabel icon={<Activity size={12} />} text="Activity" delay={220} />
        <div style={{ display: "flex", gap: 14, marginBottom: 30, flexWrap: "wrap", alignItems: "stretch" }}>
          <div className="ovio-panel" style={{ flex: "1 1 380px", minWidth: 340, padding: "16px 18px", animation: "ovioRiseSoft 600ms cubic-bezier(.16,1,.3,1) 260ms both" }}>
            <WeekStrip
              recordings={allRecordings}
              onOpen={() => setAnalytics({ kind: "year" })}
            />
          </div>
          {durationByDept.length > 0 && (
            <div
              className="ovio-panel"
              onClick={() => setAnalytics({ kind: "departments" })}
              title="Open the full department analysis"
              style={{ flex: "1 1 320px", minWidth: 300, padding: "16px 18px", cursor: "pointer", transition: "border-color 200ms ease, box-shadow 240ms ease", animation: "ovioRiseSoft 600ms cubic-bezier(.16,1,.3,1) 320ms both" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(77,141,255,0.45)";  }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
                Duration by Department <span style={{ color: COLORS.textTertiary, fontWeight: 400 }}>(min)</span>
                <div style={{ flex: 1 }} />
                <span style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 700, color: COLORS.blueBright }}>All <ArrowUpRight size={11} /></span>
              </div>
              <BarVisualization data={durationByDept} />
            </div>
          )}
        </div>

        {/* ===== Inbox — General Folder, pinned above Projects.
            Distinct horizontal design: no subprojects, not deletable, expand
            in place to reveal its recordings with per-recording transfer. ===== */}
        <SectionLabel text="General Folder" delay={340} />
        <div style={{ marginBottom: 30, animation: "ovioRiseSoft 600ms cubic-bezier(.16,1,.3,1) 380ms both" }}>
          <div
            onClick={() => setInboxOpen((o) => !o)}
            className="ovio-hero-card"
            style={{
              display: "flex", alignItems: "center", gap: 14,
              background: "linear-gradient(120deg, rgba(47,107,255,0.10) 0%, rgba(47,107,255,0.03) 45%, rgba(255,255,255,0) 100%), var(--ovio-surface)",
              border: `1px solid ${inboxOpen ? COLORS.blue : COLORS.border}`,
              boxShadow: "none",
              borderRadius: 20, padding: "16px 18px", cursor: "pointer",
              transition: "border-color 200ms ease, box-shadow 220ms ease, transform 240ms cubic-bezier(.16,1,.3,1)",
            }}
            onMouseEnter={(e) => { if (!inboxOpen) e.currentTarget.style.borderColor = "rgba(77,141,255,0.45)"; }}
            onMouseLeave={(e) => { if (!inboxOpen) e.currentTarget.style.borderColor = COLORS.border; }}
          >
            <div style={{
              width: 42, height: 42, borderRadius: 13, flexShrink: 0,
              background: COLORS.accentSoft, border: "1px solid rgba(47,107,255,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              
            }}>
              <Inbox size={19} color={COLORS.blueBright} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, letterSpacing: -0.2 }}>General Folder</span>
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 2 }}>
                Everything you record from anywhere lands here — {generalRecs.length} recording{generalRecs.length === 1 ? "" : "s"}
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 13, color: COLORS.text }}>
                {formatDurationHr(Math.round(generalRecs.reduce((s, r) => s + (r.duration || 0), 0) / 60))}
              </div>
              <div style={{ fontSize: 10, color: COLORS.textTertiary }}>total</div>
            </div>
            {expandedDept === GENERAL_PROJECT_ID || inboxOpen ? <ChevronDown size={15} color={COLORS.textTertiary} /> : <ChevronRight size={15} color={COLORS.textTertiary} />}
          </div>

          {/* Inbox recordings — expand in place */}
          {inboxOpen && (
            <div style={{
              border: `1px solid ${COLORS.border}`, borderTop: "none",
              borderRadius: "0 0 18px 18px", padding: "8px 10px 10px",
              background: COLORS.surface,
              animation: "ovioFadeUp 320ms cubic-bezier(.16,1,.3,1) both",
            }}>
              {generalRecs.length === 0 ? (
                <div style={{ padding: "18px 12px", fontSize: 12.5, color: COLORS.textTertiary, textAlign: "center" }}>
                  Nothing here yet — press the global shortcut in any app to capture your first thought.
                </div>
              ) : (
                generalRecs.map((rec) => (
                  <div key={rec.id}
                    onClick={() => handleSelectMeeting(rec)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 8px",
                      borderRadius: 10, cursor: "pointer", transition: "background 140ms ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface3)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <Disc size={14} color={COLORS.textSecondary} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.label}</div>
                      <div style={{ fontSize: 10.5, color: COLORS.textTertiary }}>{formatDate(rec.createdAt)} · {formatTime(rec.duration || 0)} · {(rec.transcript || []).length} lines</div>
                    </div>
                    {rec.aiNotes && (
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10.5, color: COLORS.blueBright, flexShrink: 0 }}>
                        <Brain size={11} /> noted
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setTransferFor({ recId: rec.id, fromSid: GENERAL_SUB_ID, fromLabel: "General Folder" }); }}
                      title="Move to a project"
                      style={{
                        display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
                        border: `1px solid ${COLORS.borderStrong}`, background: "transparent",
                        color: COLORS.blueBright, fontSize: 10.5, fontWeight: 600,
                        borderRadius: 999, padding: "4px 10px", cursor: "pointer", fontFamily: FONT,
                        transition: "border-color 160ms ease, background 160ms ease",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.blue; e.currentTarget.style.background = COLORS.accentSoft; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.background = "transparent"; }}
                    >
                      <FolderInput size={11} /> Move
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ===== Projects — the library. Fluid rows, staggered entrance. ===== */}
        <SectionLabel icon={<Folder size={12} />} text="Projects" delay={420} />
        <div style={{ marginBottom: 8, animation: "ovioRiseSoft 600ms cubic-bezier(.16,1,.3,1) 440ms both" }}>
          {deptData.length === 0 ? (
            <div className="ovio-panel" style={{ padding: "30px 18px", textAlign: "center", fontSize: 13, color: COLORS.textTertiary }}>
              No projects yet. Create one from the recorder view.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deptData.map((dept, di) => (
                <div key={dept.id} className="ovio-panel" style={{ overflow: "hidden", animation: `ovioRiseSoft 560ms cubic-bezier(.16,1,.3,1) ${480 + di * 60}ms both` }}>
                  <div onClick={() => setExpandedDept(expandedDept === dept.id ? null : dept.id)}
                    className="ovio-panel-row"
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", borderRadius: "20px 20px 0 0" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface2)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {expandedDept === dept.id ? <ChevronDown size={14} color={COLORS.textTertiary} /> : <ChevronRight size={14} color={COLORS.textTertiary} />}
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 999, background: COLORS.blue,  }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text }}>{dept.name}</div>
                      <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 1 }}>
                        {dept.subprojects.length} subproject{dept.subprojects.length === 1 ? "" : "s"} · {dept.meetingCount} meeting{dept.meetingCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: COLORS.textSecondary, alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{formatDurationHr(Math.round(dept.totalDuration / 60))}</div>
                        <div style={{ fontSize: 10, color: COLORS.textTertiary }}>duration</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{dept.aiCount}/{dept.meetingCount}</div>
                        <div style={{ fontSize: 10, color: COLORS.textTertiary }}>AI done</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setAnalytics({ kind: "department", deptId: dept.id }); }}
                        title={`Open the full analysis for ${dept.name}`}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, border: `1px solid ${COLORS.borderStrong}`, background: "transparent", color: COLORS.blue, borderRadius: 7, cursor: "pointer", fontFamily: FONT }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surface3; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  </div>

                  {expandedDept === dept.id && (
                    <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "8px 0" }}>
                      {dept.subprojects.length === 0 ? (
                        <div style={{ padding: "16px 44px", fontSize: 12, color: COLORS.textTertiary }}>No subprojects yet.</div>
                      ) : (
                        dept.subprojects.map((sub) => {
                          const subRecs = (recordingsBySub[sub.id] || []).slice().sort((a, b) => b.createdAt - a.createdAt);
                          return (
                            <div key={sub.id}>
                              <div onClick={() => onNavigateToProject(dept.id, sub.id)}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px 8px 44px", cursor: "pointer", fontSize: 12.5, color: COLORS.textSecondary, fontWeight: 500 }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surface3)}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                <span>{sub.name}</span>
                                <span style={{ color: COLORS.textTertiary }}>·</span>
                                <span style={{ color: COLORS.textTertiary, fontSize: 11 }}>{subRecs.length} recording{subRecs.length === 1 ? "" : "s"}</span>
                                <div style={{ flex: 1 }} />
                                <ChevronRight size={12} color={COLORS.textTertiary} />
                              </div>
                              {subRecs.slice(0, 3).map((rec) => (
                                <MeetingRow key={rec.id} rec={rec} onSelect={handleSelectMeeting} />
                              ))}
                              {subRecs.length > 3 && (
                                <div onClick={() => onNavigateToProject(dept.id, sub.id)}
                                  style={{ padding: "6px 44px 6px 80px", fontSize: 11, color: COLORS.blue, cursor: "pointer" }}>
                                  View all {subRecs.length} recordings →
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>

    {analytics && (
      <AnalyticsOverlay
        kind={analytics.kind}
        deptId={analytics.deptId}
        projects={projects}
        recordingsBySub={recordingsBySub}
        onClose={() => setAnalytics(null)}
        onOpenMeeting={onSelectRecording}
      />
    )}

    {/* Transfer popup + confirmation toast */}
    <TransferModal
      open={!!transferFor}
      currentLabel={transferFor?.fromLabel || "General Folder"}
      targets={moveTargets}
      onClose={() => setTransferFor(null)}
      onPick={(sid, name) => commitTransfer(transferFor?.recId, sid, name)}
    />
    {transferred && (
      <div style={{
        position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 400,
        display: "flex", alignItems: "center", gap: 8,
        background: COLORS.glass, border: `1px solid ${COLORS.glassBorder}`,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        color: COLORS.text, fontSize: 12.5, fontWeight: 600,
        borderRadius: 999, padding: "9px 16px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)", fontFamily: FONT,
        animation: "ovioToastIn 380ms cubic-bezier(.16,1,.3,1) both",
      }}>
        <Check size={13} color={COLORS.green} /> Moved to {transferred}
      </div>
    )}
    </>
  );
}