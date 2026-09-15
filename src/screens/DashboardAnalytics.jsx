import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Calendar,
  Clock,
  Brain,
  FileText,
  TrendingUp,
  Folder,
  Disc,
  PenLine,
  Activity,
} from "lucide-react";
import { COLORS as T, FONT as FONT_T } from "../ui/theme";

const COLORS = T; // live theme tokens

// Categorical chart palette — one hue, brightness ladder; light variant on paper.
const DEPT_COLORS_DARK = ["#8AB0FF", "#5B93FF", "#2F6BFF", "#2257DB", "#1A44AD", "#153483", "#10255C", "#0B1A3D"];
const DEPT_COLORS_LIGHT = ["#2F6BFF", "#2257DB", "#1A44AD", "#4D8DFF", "#7FA8FF", "#A9C4FF", "#153483", "#10255C"];
const deptColors = () => (T.windowBg.startsWith("#F") ? DEPT_COLORS_LIGHT : DEPT_COLORS_DARK);

const FONT = FONT_T;

const ANIM_CSS = `
@keyframes ovioDashIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ovioBarGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes ovioCellIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ovioSlideTop { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
`;

const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------
function fmtHrMin(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m${s > 0 ? ` ${s}s` : ""}`;
  return `${s}s`;
}
function fmtDate(ts, opts) {
  return new Date(ts).toLocaleDateString([], opts || { month: "short", day: "numeric" });
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ---------------------------------------------------------------------------
// Data model (shared shapes; recordings carry project/subcontext)
// ---------------------------------------------------------------------------
export function flattenRecordings(projects, recordingsBySub) {
  const out = [];
  projects.forEach((p) =>
    (p.subprojects || []).forEach((s) => {
      (recordingsBySub[s.id] || []).forEach((r) =>
        out.push({ ...r, projectId: p.id, projectName: p.name, subId: s.id, subName: s.name })
      );
    })
  );
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function deptSeries(projects, recordingsBySub) {
  const depts = [];
  projects.forEach((proj) => {
    const subRecs = [];
    let totalDur = 0;
    let totalLines = 0;
    let aiCount = 0;
    let noteCount = 0;
    proj.subprojects.forEach((sub) => {
      (recordingsBySub[sub.id] || []).forEach((r) => {
        subRecs.push({ ...r, subprojectName: sub.name });
        totalDur += r.duration || 0;
        totalLines += r.transcript?.length || 0;
        if (r.aiNotes) aiCount++;
        noteCount += r.notes?.length || 0;
      });
    });
    depts.push({
      id: proj.id,
      name: proj.name,
      subprojects: proj.subprojects || [],
      recordings: subRecs,
      totalDuration: totalDur,
      totalLines,
      aiCount,
      noteCount,
      meetingCount: subRecs.length,
    });
  });
  return depts.sort((a, b) => b.meetingCount - a.meetingCount);
}

function dayCounts(recordings, daysBack) {
  const end = startOfDay(new Date());
  const map = new Map();
  recordings.forEach((r) => {
    const idx = Math.floor((startOfDay(new Date(r.createdAt)) - end) / DAY_MS + daysBack - 1 + 1);
    if (idx >= 0 && idx < daysBack) map.set(idx, (map.get(idx) || 0) + 1);
  });
  return Array.from({ length: daysBack }, (_, i) => map.get(i) || 0);
}

function monthSeries(recordings, monthsBack) {
  const now = new Date();
  const out = [];
  for (let m = monthsBack - 1; m >= 0; m--) {
    const start = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - m + 1, 1);
    const count = recordings.filter((r) => r.createdAt >= start.getTime() && r.createdAt < end.getTime()).length;
    out.push({ label: start.toLocaleDateString([], { month: "short" }), value: count });
  }
  return out;
}

function yearGrid(recordings, now = new Date()) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const first = new Date(end.getTime() - 364 * DAY_MS);
  first.setHours(0, 0, 0, 0);
  const gridStart = new Date(first.getTime() - first.getDay() * DAY_MS);
  const days = Math.floor((end - gridStart) / DAY_MS) + 1;
  const cols = Math.ceil(days / 7);
  const counts = new Map();
  recordings.forEach((r) => {
    const d = startOfDay(new Date(r.createdAt));
    const idx = Math.floor((d - gridStart) / DAY_MS);
    if (idx >= 0 && idx < days) counts.set(idx, (counts.get(idx) || 0) + 1);
  });
  const cells = [];
  let total = 0;
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const idx = c * 7 + r;
      const date = new Date(gridStart.getTime() + idx * DAY_MS);
      const count = idx < days ? counts.get(idx) || 0 : 0;
      total += count;
      col.push({ idx, date, count, inYear: idx < days });
    }
    cells.push(col);
  }
  const max = Math.max(1, ...counts.values());
  const monthLabels = cells
    .map((col) => {
      const d = col[0].date;
      if (d.getDate() <= 7) {
        return { colStart: col[0].date.getTime(), label: col[0].date.toLocaleDateString([], { month: "short" }) };
      }
      return null;
    })
    .filter(Boolean);
  let busiest = null;
  counts.forEach((v, k) => {
    if (!busiest || v > busiest.count) busiest = { count: v, date: new Date(gridStart.getTime() + k * DAY_MS) };
  });
  return { cells, cols, max, total, gridStart, days, monthLabels, busiest, end };
}

// ---------------------------------------------------------------------------
// Animation primitives
// ---------------------------------------------------------------------------
function useCountUp(target, dur = 850) {
  const [v, setV] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const from = ref.current;
    const to = target;
    if (to === from) { setV(to); return; }
    const t0 = performance.now();
    let timer;
    const step = () => {
      const p = Math.min((performance.now() - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      const cur = from + (to - from) * e;
      setV(Math.round(cur));
      ref.current = cur;
      timer = p < 1 ? setTimeout(step, 16) : setTimeout(() => setV(to), 0);
    };
    timer = setTimeout(step, 16);
    return () => clearTimeout(timer);
  }, [target, dur]);
  return v;
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

export function AnimatedNumber({ value, format, className, dur }) {
  const v = useCountUp(value, dur);
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{format ? format(v) : v.toLocaleString()}</span>;
}

const stagger = (i) => ({ animation: `ovioDashIn 420ms cubic-bezier(.22,1,.36,1) both`, animationDelay: `${i * 60}ms` });

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
export function ChartBars({ items, height = 120, unit = "", color, valueFormat, showValues, onItemClick, animKey, labelHeight }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  const bar = (i, it) => (typeof color === "function" ? color(i, it) : color || COLORS.blue);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: height + (labelHeight || 18) + 6, width: "100%", position: "relative", paddingTop: 22 }}>
      {items.map((it, i) => (
        <div key={`${animKey}-${i}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", position: "relative" }}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          {hover === i && (
            <div style={{
              position: "absolute", bottom: `calc(${Math.max((it.value / max) * height, 2)}px + 26px)`, left: "50%", transform: "translateX(-50%)",
              background: COLORS.sidebarBg, color: "#fff", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
              padding: "4px 8px", borderRadius: 6, pointerEvents: "none", zIndex: 20,
              boxShadow: "0 4px 12px rgba(0,0,0,0.22)",
            }}>
              {it.label}: {valueFormat ? valueFormat(it.value) : it.value}{unit}
            </div>
          )}
          <div style={{ position: "relative", width: "100%", maxWidth: 34, height, justifyContent: "flex-end", display: "flex" }}>
            {(showValues && it.value > 0) && (
              <span style={{ position: "absolute", top: height - Math.max((it.value / max) * height, 2) - 16, width: "100%", textAlign: "center", fontSize: 9.5, fontWeight: 600, color: COLORS.textSecondary, fontVariantNumeric: "tabular-nums" }}>
                {it.value}
              </span>
            )}
            <div onClick={onItemClick ? () => onItemClick(it) : undefined}
              style={{
                width: "100%", height: Math.max((it.value / max) * height, it.value > 0 ? 2 : 1),
                background: bar(i, it), borderRadius: 5,
                transformOrigin: "bottom", animation: `ovioBarGrow 520ms cubic-bezier(.22,1,.36,1) both`,
                animationDelay: `${i * 40}ms`,
                opacity: hover === null ? 1 : (hover === i ? 1 : 0.45),
                transition: "opacity 180ms ease",
                cursor: onItemClick ? "pointer" : "default",
              }} />
          </div>
          <span style={{ fontSize: 9.5, color: COLORS.textTertiary, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.2, minHeight: 12 }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Donut({ segments, size = 132, centerLabel, centerValue }) {
  const mounted = useMounted();
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, segments.reduce((s, x) => s + (x.value || 0), 0));
  let acc = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS.border} strokeWidth="9" />
          {segments.filter((s) => s.value > 0).map((s, i) => {
            const len = (s.value / total) * c;
            const off = acc;
            acc += len;
            return (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth="9"
                strokeLinecap="butt" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={mounted ? -off : c}
                style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)", transitionDelay: `${i * 60}ms` }} />
            );
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{centerValue ?? total}</div>
          {centerLabel && <div style={{ fontSize: 9.5, color: COLORS.textTertiary }}>{centerLabel}</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: COLORS.textSecondary }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span style={{ fontWeight: 600, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
            <span style={{ color: COLORS.textTertiary, fontSize: 10.5 }}>{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function YearHeatmap({ recordings, now }) {
  const [hover, setHover] = useState(null);
  const grid = useMemo(() => yearGrid(recordings, now), [recordings, now]);
  const cell = 13, gap = 3;
  const tone = (count) => {
    if (count === 0) return { background: COLORS.surface2 };
    const k = Math.min(0.35 + (count / Math.max(1, grid.max)) * 0.75, 1);
    return { background: `rgba(180,85,45,${k.toFixed(2)})` };
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11, color: COLORS.textSecondary, marginBottom: 12, flexWrap: "wrap" }}>
        <span>{grid.total} meeting{grid.total === 1 ? "" : "s"} in the last year</span>
        {grid.busiest && (
          <span style={{ color: COLORS.textTertiary }}>
            · busiest: {fmtDate(grid.busiest.date, { weekday: "short", month: "short", day: "numeric" })} ({grid.busiest.count})
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ color: COLORS.textTertiary, fontSize: 10.5 }}>less</span>
        {[{ b: COLORS.surface2 }, { b: "rgba(47,107,255,0.4)" }, { b: "rgba(47,107,255,0.75)" }].map((x, i) => (
          <span key={i} style={{ width: cell - 3, height: cell - 3, borderRadius: 3, background: x.b }} />
        ))}
        <span style={{ color: COLORS.textTertiary, fontSize: 10.5 }}>more</span>
      </div>

      <div style={{ display: "flex", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: gap, marginTop: 14 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} style={{ height: cell, fontSize: 8.5, color: COLORS.textTertiary, lineHeight: `${cell}px` }}>{d}</span>
          ))}
        </div>
        <div style={{ flex: 1, overflowX: "auto", position: "relative" }}>
          {/* month labels */}
          <div style={{ display: "flex", height: 14, marginBottom: gap, position: "relative" }}>
            {grid.monthLabels.map((ml, i) => (
              <span key={i} style={{
                position: "absolute", left: `${(ml.colStart - grid.gridStart) / DAY_MS / 7 * (cell + gap)}px`,
                fontSize: 9.5, color: COLORS.textTertiary, whiteSpace: "nowrap",
              }}>{ml.label}</span>
            ))}
          </div>
          <div style={{ display: "flex", gap }}>
            {grid.cells.map((col, c) => (
              <div key={c} style={{ display: "flex", flexDirection: "column", gap, animation: `ovioCellIn 300ms ease both`, animationDelay: `${c * 12}ms` }}>
                {col.map((day, r) => {
                  const key = `${c}-${r}`;
                  const active = hover === key;
                  return (
                    <div key={key}
                      onMouseEnter={() => setHover(key)}
                      onMouseLeave={() => setHover(null)}
                      onClick={undefined}
                      title={day.count > 0 ? `${fmtDate(day.date, { month: "short", day: "numeric", year: "numeric" })} — ${day.count} meeting${day.count === 1 ? "" : "s"}` : fmtDate(day.date, { month: "short", day: "numeric" })}
                      style={{
                        width: cell, height: cell, borderRadius: 3,
                        ...tone(day.count),
                        outline: active ? `1.5px solid ${COLORS.text}` : (c === grid.cols - 1 ? `1px solid ${COLORS.borderStrong}` : "none"),
                        opacity: day.inYear ? 1 : 0.25,
                        cursor: "default",
                      }} />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared UI atoms
// ---------------------------------------------------------------------------
function SectionCard({ title, icon, subtitle, delay = 0, children, action }) {
  return (
    <div style={{ ...stagger(delay), background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {icon}
        <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, letterSpacing: -0.2 }}>{title}</span>
        {subtitle && <span style={{ fontSize: 11, color: COLORS.textTertiary }}>{subtitle}</span>}
        <div style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, sub, delay, icon, accent }) {
  return (
    <div style={{ ...stagger(delay), flex: 1, minWidth: 130, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10.5, fontWeight: 600, color: COLORS.textTertiary, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || COLORS.text, letterSpacing: -0.4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: COLORS.textTertiary, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function MeetingRow({ rec, onSelect, deptLabel }) {
  return (
    <div onClick={onSelect ? () => onSelect(rec) : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
        background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10,
        cursor: onSelect ? "pointer" : "default", transition: "border-color 150ms ease, transform 150ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.borderStrong; e.currentTarget.style.background = COLORS.surface3; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.background = COLORS.surface; }}>
      <div style={{ width: 32, height: 32, borderRadius: 999, background: COLORS.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Disc size={14} color={COLORS.textSecondary} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.label}</div>
        <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 2, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>{fmtDate(rec.createdAt, { month: "short", day: "numeric", year: "numeric" })}</span>
          {deptLabel && <span style={{ background: COLORS.surface2, borderRadius: 4, padding: "1px 5px" }}>{deptLabel}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, fontSize: 11.5, color: COLORS.textSecondary, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Clock size={10} /> {fmtDur(rec.duration || 0)}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, color: COLORS.textTertiary }}>{rec.transcript?.length || 0} lines</span>
        {(rec.notes || []).length > 0 && <span style={{ display: "flex", alignItems: "center", gap: 2, color: COLORS.textTertiary }}><PenLine size={9} /> {(rec.notes || []).length}</span>}
        {rec.aiNotes && (
          <span style={{ width: 20, height: 20, borderRadius: 5, background: `${COLORS.blue}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Brain size={10} color={COLORS.blue} />
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: "40px 20px", textAlign: "center", color: COLORS.textTertiary, fontSize: 13 }}>
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full-screen analytics overlay
// ---------------------------------------------------------------------------
export default function AnalyticsOverlay({ kind, deptId, projects, recordingsBySub, onClose, onOpenMeeting }) {
  const recordings = useMemo(() => flattenRecordings(projects, recordingsBySub), [projects, recordingsBySub]);
  const depts = useMemo(() => deptSeries(projects, recordingsBySub), [projects, recordingsBySub]);
  const dept = kind === "department" ? depts.find((d) => d.id === deptId) || null : null;

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalDur = recordings.reduce((s, r) => s + (r.duration || 0), 0);
  const totalLines = recordings.reduce((s, r) => s + (r.transcript?.length || 0), 0);
  const withAI = recordings.filter((r) => r.aiNotes).length;
  const daily90 = useMemo(() => dayCounts(recordings, 90), [recordings]);
  const monthly = useMemo(() => monthSeries(recordings, 12), [recordings]);
  const longest = useMemo(
    () => recordings.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0)).slice(0, 8).filter((r) => (r.duration || 0) > 0),
    [recordings]
  );
  const topTalkers = useMemo(
    () => recordings.slice().sort((a, b) => (b.transcript?.length || 0) - (a.transcript?.length || 0)).slice(0, 8).filter((r) => (r.transcript?.length || 0) > 0),
    [recordings]
  );

  const openMeeting = useCallback((rec) => {
    const proj = projects.find((p) => (p.subprojects || []).some((s) => (recordingsBySub[s.id] || []).some((r) => r.id === rec.id)));
    const sub = proj?.subprojects.find((s) => (recordingsBySub[s.id] || []).some((r) => r.id === rec.id));
    if (proj && sub && onOpenMeeting) onOpenMeeting(proj.id, sub.id, rec);
  }, [projects, recordingsBySub, onOpenMeeting]);

  const title = {
    meetings: "All Meetings",
    duration: "Total Duration",
    ai: "AI Summaries",
    transcripts: "Transcript Lines",
    year: "Year in Review",
    departments: "Departments",
    department: dept?.name || "Department",
  }[kind];

  const subtitle = {
    meetings: `${recordings.length} recording${recordings.length === 1 ? "" : "s"} · every activity in one view`,
    duration: `Every minute logged across your workspace`,
    ai: `${withAI} of ${recordings.length} meetings covered by AI`,
    transcripts: `${totalLines.toLocaleString()} transcript lines captured`,
    year: "Everything that happened across the last 12 months",
    departments: "Full breakdown for every project",
    department: `All activity inside ${dept?.name || "this department"}`,
  }[kind];

  if (!kind) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 700, background: COLORS.windowBg, display: "flex", flexDirection: "column", fontFamily: FONT }}>
      <style>{ANIM_CSS}</style>

      {/* Top bar */}
      <div style={{ height: 56, minHeight: 56, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface, animation: "ovioSlideTop 300ms ease both" }}>
        <button onClick={onClose} title="Back to dashboard"
          style={{ display: "flex", alignItems: "center", gap: 4, border: `1px solid ${COLORS.borderStrong}`, background: "transparent", color: COLORS.textSecondary, fontSize: 12, fontWeight: 600, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}
          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surface3; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ArrowLeft size={13} /> Back
        </button>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
          <div style={{ fontSize: 11, color: COLORS.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} title="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, border: "none", background: "transparent", color: COLORS.textSecondary, borderRadius: 8, cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surface3; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px 60px" }}>
        {recordings.length === 0 ? (
          <EmptyState text="No recordings yet — record your first meeting and this analysis will come alive." />
        ) : (
          <div style={{ maxWidth: 1060, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {kind === "meetings" && <MeetingsView recordings={recordings} depts={depts} daily90={daily90} total={recordings.length} monthly={monthly} openMeeting={openMeeting} />}
            {kind === "duration" && <DurationView recordings={recordings} depts={depts} totalDur={totalDur} longest={longest} openMeeting={openMeeting} />}
            {kind === "ai" && <AIView recordings={recordings} depts={depts} withAI={withAI} total={recordings.length} openMeeting={openMeeting} />}
            {kind === "transcripts" && <TranscriptsView recordings={recordings} depts={depts} totalLines={totalLines} topTalkers={topTalkers} openMeeting={openMeeting} />}
            {kind === "year" && <YearView recordings={recordings} depts={depts} monthly={monthly} />}
            {kind === "departments" && <DepartmentsView depts={depts} recordingsBySub={recordingsBySub} openMeeting={openMeeting} navigable />}
            {kind === "department" && dept && <DepartmentView dept={dept} openMeeting={openMeeting} />}
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingsView({ recordings, depts, daily90, total, monthly, openMeeting }) {
  const capturedDays = new Set(recordings.map((r) => startOfDay(new Date(r.createdAt)).toDateString())).size;
  const perDept = depts.filter((d) => d.meetingCount > 0);
  const thisWeek = recordings.filter((r) => r.createdAt >= startOfDay(new Date()).getTime() - 7 * DAY_MS).length;
  const busiestDayIdx = daily90.indexOf(Math.max(...daily90));
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat delay={0} icon={<Activity size={12} color={COLORS.blue} />} label="Total" value={<AnimatedNumber value={total} />} sub="recordings" />
        <MiniStat delay={1} icon={<Calendar size={12} color={COLORS.blue} />} label="This week" value={<AnimatedNumber value={thisWeek} />} sub="last 7 days" />
        <MiniStat delay={2} icon={<Folder size={12} color={COLORS.blue} />} label="Departments" value={<AnimatedNumber value={depts.length} />} sub="in use" />
        <MiniStat delay={3} icon={<Calendar size={12} color={COLORS.blue} />} label="Active days" value={<AnimatedNumber value={capturedDays} />} sub="days with meetings" />
      </div>

      <SectionCard title="Meetings per day" subtitle="last 90 days" delay={4} icon={<TrendingUp size={14} color={COLORS.blue} />}
        action={busiestDayIdx >= 0 ? <span style={{ fontSize: 11, color: COLORS.textTertiary }}>busiest: {daily90[busiestDayIdx]} on {fmtDate(new Date(Date.now() - (89 - busiestDayIdx) * DAY_MS), { weekday: "short", month: "short", day: "numeric" })}</span> : null}
      >
        <ChartBars items={daily90.map((v, i) => ({ label: i === 89 ? "today" : fmtDate(new Date(Date.now() - (89 - i) * DAY_MS), { weekday: "short" }), value: v }))}
          height={120} color={(i) => (i === 89 ? COLORS.blue : "#1D2B66")} showValues={false} animKey="m90" />
      </SectionCard>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <SectionCard title="By department" delay={5} icon={<Folder size={14} color={COLORS.blue} />} subtitle={perDept.length > 0 ? "share of meetings" : ""}
          action={<span style={{ fontSize: 11, color: COLORS.textTertiary }}>{perDept.length} department{perDept.length === 1 ? "" : "s"}</span>}
        >
          {perDept.length > 0 ? (
            <Donut segments={perDept.map((d, i) => ({ label: d.name, value: d.meetingCount, color: deptColors()[i % 8] }))}
              size={140} centerValue={total} centerLabel="meetings" />
          ) : <div style={{ color: COLORS.textTertiary, fontSize: 12 }}>No per-department data yet.</div>}
        </SectionCard>

        <SectionCard title="Trend" subtitle="last 12 months" delay={6} icon={<Calendar size={14} color={COLORS.blue} />}>
          <ChartBars items={monthly.map((m) => ({ label: m.label, value: m.value }))} height={110} color="#1D2B66" animKey="m12" />
        </SectionCard>
      </div>

      <SectionCard title="Every meeting" subtitle="newest first" delay={7} icon={<Calendar size={14} color={COLORS.blue} />}
        action={<span style={{ fontSize: 11, color: COLORS.textTertiary, cursor: "default" }}>click to open</span>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {recordings.map((r) => (
            <MeetingRow key={r.id} rec={r} onSelect={openMeeting} deptLabel={r.projectName} />
          ))}
        </div>
      </SectionCard>
    </>
  );
}

function DurationView({ recordings, depts, totalDur, longest, openMeeting }) {
  const avg = recordings.length > 0 ? Math.round(totalDur / recordings.length) : 0;
  const deptBars = depts.filter((d) => d.totalDuration > 0).sort((a, b) => b.totalDuration - a.totalDuration)
    .map((d, i) => ({ label: d.name, value: Math.round(d.totalDuration / 60), color: deptColors()[i % 8] }));
  const dailyBars = useMemo(() => {
    const end = startOfDay(new Date());
    return Array.from({ length: 30 }, (_, i) => {
      const dayStart = new Date(end.getTime() - (29 - i) * DAY_MS);
      const s = recordings.filter((r) => r.createdAt >= dayStart.getTime() && r.createdAt < dayStart.getTime() + DAY_MS)
        .reduce((a, r) => a + (r.duration || 0), 0);
      return { label: fmtDate(dayStart, { weekday: "short" }), value: Math.round(s / 60) };
    });
  }, [recordings]);
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat delay={0} icon={<Clock size={12} color={COLORS.blue} />} label="Total" value={fmtHrMin(Math.round(totalDur / 60))} sub="logged" />
        <MiniStat delay={1} icon={<Clock size={12} color={COLORS.blue} />} label="Average" value={fmtDur(avg)} sub="per meeting" />
        <MiniStat delay={2} icon={<Activity size={12} color={COLORS.blue} />} label="Longest" value={longest[0] ? fmtDur(longest[0].duration) : "—"} sub={longest[0]?.label || "no data"} />
        <MiniStat delay={3} icon={<Calendar size={12} color={COLORS.blue} />} label="Days active" value={<AnimatedNumber value={new Set(recordings.map((r) => startOfDay(new Date(r.createdAt)).toDateString())).size} />} sub="of last 90" />
      </div>

      <SectionCard title="Duration by department" subtitle="all departments" delay={4} icon={<Folder size={14} color={COLORS.blue} />}
        action={<span style={{ fontSize: 11, color: COLORS.textTertiary }}>{deptBars.length} department{deptBars.length === 1 ? "" : "s"}</span>}>
        {deptBars.length > 0 ? (
          <ChartBars items={deptBars} height={120} showValues unit="m" valueFormat={(v) => fmtHrMin(v)} animKey="ddep" />
        ) : <div style={{ color: COLORS.textTertiary, fontSize: 12 }}>No durations recorded yet.</div>}
      </SectionCard>

      <SectionCard title="Minutes per day" subtitle="last 30 days" delay={5} icon={<TrendingUp size={14} color={COLORS.blue} />}>
        <ChartBars items={dailyBars} height={110} showValues unit="m" color={(i) => (i === 29 ? COLORS.blue : "#1D2B66")} animKey="d30" />
      </SectionCard>

      {longest.length > 0 && (
        <SectionCard title="Longest meetings" subtitle="top by duration" delay={6} icon={<Clock size={14} color={COLORS.blue} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {longest.map((r) => <MeetingRow key={r.id} rec={r} onSelect={openMeeting} deptLabel={r.projectName} />)}
          </div>
        </SectionCard>
      )}
    </>
  );
}

function AIView({ recordings, depts, withAI, total, openMeeting }) {
  const coverage = depts.filter((d) => d.meetingCount > 0).map((d, i) => ({
    label: d.name,
    done: d.aiCount,
    total: d.meetingCount,
    color: deptColors()[i % 8],
  }));
  const without = recordings.filter((r) => !r.aiNotes);
  const withList = recordings.filter((r) => r.aiNotes);
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat delay={0} icon={<Brain size={12} color={COLORS.blue} />} label="Covered" value={<AnimatedNumber value={withAI} />} sub="meetings" />
        <MiniStat delay={1} icon={<Activity size={12} color={COLORS.blue} />} label="Coverage" value={`${total > 0 ? Math.round((withAI / total) * 100) : 0}%`} sub="of all meetings" />
        <MiniStat delay={2} icon={<FileText size={12} color={COLORS.blue} />} label="Missing" value={<AnimatedNumber value={without.length} />} sub="still need a summary" />
      </div>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <SectionCard title="Coverage" delay={3} icon={<Brain size={14} color={COLORS.blue} />}>
          <Donut
            segments={[
              { label: "With AI summary", value: withAI, color: COLORS.blue },
              { label: "Without", value: total - withAI, color: COLORS.border },
            ]}
            size={140} centerValue={`${total > 0 ? Math.round((withAI / total) * 100) : 0}%`} centerLabel="covered" />
        </SectionCard>

        <SectionCard title="Coverage by department" delay={4} icon={<Folder size={14} color={COLORS.blue} />} subtitle="with summary / total">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
            {coverage.map((d, i) => (
              <div key={i} style={{ width: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: COLORS.textSecondary, marginBottom: 4 }}>
                  <span>{d.label}</span>
                  <span style={{ fontWeight: 600, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{d.done}/{d.total}</span>
                </div>
                <div style={{ height: 7, background: COLORS.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${d.total > 0 ? (d.done / d.total) * 100 : 0}%`, background: d.color, borderRadius: 4, animation: "ovioBarGrow 600ms cubic-bezier(.22,1,.36,1) both", transformOrigin: "left" }} />
                </div>
              </div>
            ))}
            {coverage.length === 0 && <div style={{ color: COLORS.textTertiary, fontSize: 12 }}>No data yet.</div>}
          </div>
        </SectionCard>
      </div>

      {withList.length > 0 && (
        <SectionCard title="AI summaries" subtitle="generated" delay={5} icon={<Brain size={14} color={COLORS.blue} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {withList.map((r) => <MeetingRow key={r.id} rec={r} onSelect={openMeeting} deptLabel={r.projectName} />)}
          </div>
        </SectionCard>
      )}
      {without.length > 0 && (
        <SectionCard title="Still waiting for a summary" subtitle="generate from the recorder" delay={6} icon={<Activity size={14} color={COLORS.blue} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {without.map((r) => <MeetingRow key={r.id} rec={r} onSelect={openMeeting} deptLabel={r.projectName} />)}
          </div>
        </SectionCard>
      )}
    </>
  );
}

function TranscriptsView({ recordings, depts, totalLines, topTalkers, openMeeting }) {
  const avg = recordings.length > 0 ? Math.round(totalLines / recordings.length) : 0;
  const captured = recordings.filter((r) => r.transcript?.length).length;
  const deptBars = depts.filter((d) => d.totalLines > 0).sort((a, b) => b.totalLines - a.totalLines)
    .map((d, i) => ({ label: d.name, value: d.totalLines, color: deptColors()[i % 8] }));
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat delay={0} icon={<FileText size={12} color={COLORS.blue} />} label="Total lines" value={<AnimatedNumber value={totalLines} />} sub="captured" />
        <MiniStat delay={1} icon={<Activity size={12} color={COLORS.blue} />} label="Average" value={<AnimatedNumber value={avg} />} sub="lines per meeting" />
        <MiniStat delay={2} icon={<FileText size={12} color={COLORS.blue} />} label="Recordings" value={<AnimatedNumber value={captured} />} sub="with transcript" />
      </div>

      <SectionCard title="Lines by department" subtitle="all departments" delay={3} icon={<Folder size={14} color={COLORS.blue} />}
        action={<span style={{ fontSize: 11, color: COLORS.textTertiary }}>{deptBars.length} department{deptBars.length === 1 ? "" : "s"}</span>}>
        {deptBars.length > 0 ? (
          <ChartBars items={deptBars} height={120} showValues animKey="tdep" />
        ) : <div style={{ color: COLORS.textTertiary, fontSize: 12 }}>No transcript data yet.</div>}
      </SectionCard>

      {topTalkers.length > 0 && (
        <SectionCard title="Most transcribed meetings" subtitle="top by line count" delay={4} icon={<TrendingUp size={14} color={COLORS.blue} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topTalkers.map((r) => <MeetingRow key={r.id} rec={r} onSelect={openMeeting} deptLabel={r.projectName} />)}
          </div>
        </SectionCard>
      )}
    </>
  );
}

function YearView({ recordings, depts, monthly }) {
  const daily = useMemo(() => {
    const end = startOfDay(new Date());
    const out = [];
    let acc = 0;
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(end.getTime() - i * DAY_MS);
      const c = recordings.filter((r) => r.createdAt >= dayStart.getTime() && r.createdAt < dayStart.getTime() + DAY_MS).length;
      acc += c;
      out.push({ label: fmtDate(dayStart, { weekday: "short" }), value: c });
    }
    return { bars: out, last30: acc };
  }, [recordings]);
  const activeDept = depts.slice(0, 5).filter((d) => d.meetingCount > 0);
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <MiniStat delay={0} icon={<Calendar size={12} color={COLORS.blue} />} label="This month" value={<AnimatedNumber value={monthly[monthly.length - 1]?.value || 0} />} sub="meetings" />
        <MiniStat delay={1} icon={<Activity size={12} color={COLORS.blue} />} label="Last 30 days" value={<AnimatedNumber value={daily.last30} />} sub="meetings" />
        <MiniStat delay={2} icon={<Calendar size={12} color={COLORS.blue} />} label="Year total" value={<AnimatedNumber value={yearGrid(recordings).total} />} sub="last 12 months" />
      </div>

      <SectionCard title="Year heatmap" subtitle="one cell = one day" delay={3} icon={<Calendar size={14} color={COLORS.blue} />}>
        <YearHeatmap recordings={recordings} />
      </SectionCard>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <SectionCard title="By month" subtitle="last 12 months" delay={4} icon={<TrendingUp size={14} color={COLORS.blue} />}>
          <ChartBars items={monthly} height={120} showValues animKey="y12" color={(i, it) => (it.value > 0 ? COLORS.blue : "#1D2B66")} />
        </SectionCard>
        {activeDept.length > 0 && (
          <SectionCard title="Top departments" subtitle="by meetings" delay={5} icon={<Folder size={14} color={COLORS.blue} />}>
            <Donut segments={activeDept.map((d, i) => ({ label: d.name, value: d.meetingCount, color: deptColors()[i % 8] }))} size={132} centerValue={yearGrid(recordings).total} centerLabel="meetings" />
          </SectionCard>
        )}
      </div>
    </>
  );
}

function DepartmentsView({ depts, recordingsBySub, openMeeting }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {depts.length === 0 && <EmptyState text="No projects yet. Create one from the recorder view." />}
      {depts.map((d, di) => (
        <SectionCard key={d.id} delay={di} title={d.name} icon={<Folder size={14} color={deptColors()[di % 8]} />}
          subtitle={`${d.meetingCount} meeting${d.meetingCount === 1 ? "" : "s"} · ${fmtHrMin(Math.round(d.totalDuration / 60))} · ${d.totalLines} lines · ${d.aiCount} AI`}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
            <MiniStat delay={0} label="Meetings" value={<AnimatedNumber value={d.meetingCount} />} />
            <MiniStat delay={1} label="Duration" value={fmtHrMin(Math.round(d.totalDuration / 60))} />
            <MiniStat delay={2} label="Transcript" value={<AnimatedNumber value={d.totalLines} />} sub="lines" />
            <MiniStat delay={3} label="AI coverage" value={`${d.meetingCount > 0 ? Math.round((d.aiCount / d.meetingCount) * 100) : 0}%`} />
          </div>
          {d.subprojects.map((sub) => {
            const recs = (recordingsBySub[sub.id] || []).slice().sort((a, b) => b.createdAt - a.createdAt);
            if (recs.length === 0) return null;
            return (
              <div key={sub.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textTertiary, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
                  {sub.name} · {recs.length} recording{recs.length === 1 ? "" : "s"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {recs.map((r) => <MeetingRow key={r.id} rec={r} onSelect={openMeeting} />)}
                </div>
              </div>
            );
          })}
          {d.subprojects.filter((s) => (recordingsBySub[s.id] || []).length === 0).length === d.subprojects.length && (
            <div style={{ color: COLORS.textTertiary, fontSize: 12 }}>No recordings in this department yet.</div>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

function DepartmentView({ dept, openMeeting }) {
  const daily = useMemo(() => dayCounts(dept.recordings, 90), [dept]);
  const perSub = (dept.subprojects || []).map((s) => {
    const recs = (dept.recordings || []).filter((r) => r.subId === s.id);
    return {
      ...s,
      recs,
      dur: recs.reduce((a, r) => a + (r.duration || 0), 0),
      lines: recs.reduce((a, r) => a + (r.transcript?.length || 0), 0),
      total: recs.length,
    };
  }).filter((s) => s.recs.length > 0);
  const color = DEPT_COLORS[dept.id % DEPT_COLORS.length];
  return (
    <>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
          <div style={{ width: 12, height: 12, borderRadius: 4, background: color }} />
        </div>
        <MiniStat delay={0} icon={<Calendar size={12} color={color} />} label="Meetings" value={<AnimatedNumber value={dept.meetingCount} />} sub={`${(dept.subprojects || []).length} subproject${(dept.subprojects || []).length === 1 ? "" : "s"}`} />
        <MiniStat delay={1} icon={<Clock size={12} color={color} />} label="Duration" value={fmtHrMin(Math.round(dept.totalDuration / 60))} sub="logged" />
        <MiniStat delay={2} icon={<FileText size={12} color={color} />} label="Transcript" value={<AnimatedNumber value={dept.totalLines} />} sub="lines" />
        <MiniStat delay={3} icon={<Brain size={12} color={color} />} label="AI coverage" value={`${dept.meetingCount > 0 ? Math.round((dept.aiCount / dept.meetingCount) * 100) : 0}%`} sub={`${dept.aiCount}/${dept.meetingCount} meetings`} />
      </div>

      <SectionCard title="Activity" subtitle="meetings per day · last 90 days" delay={4} icon={<TrendingUp size={14} color={color} />}>
        <ChartBars items={daily.map((v, i) => ({ label: i === 89 ? "today" : fmtDate(new Date(Date.now() - (89 - i) * DAY_MS), { weekday: "short" }), value: v }))}
          height={110} color={(i) => (i === 89 ? color : "#1D2B66")} animKey={`d${dept.id}`} />
      </SectionCard>

      {perSub.map((s, i) => (
        <SectionCard key={s.id} delay={5 + i} title={s.name} icon={<Disc size={14} color={color} />}
          subtitle={`${s.total} recording${s.total === 1 ? "" : "s"} · ${fmtHrMin(Math.round(s.dur / 60))} · ${s.lines} lines`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {s.recs.map((r) => <MeetingRow key={r.id} rec={r} onSelect={openMeeting} />)}
          </div>
        </SectionCard>
      ))}
      {perSub.length === 0 && <EmptyState text="No recordings in any subproject here yet." />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Week strip (paged 7-day card shown on the dashboard)
// ---------------------------------------------------------------------------
export function WeekStrip({ recordings, onOpen, onNavigate }) {
  const [offset, setOffset] = useState(0);
  const MIN_OFFSET = -52;
  const weekDays = useMemo(() => {
    const end = startOfDay(new Date());
    const weekStart = new Date(end.getTime() - (end.getDay()) * DAY_MS + offset * 7 * DAY_MS);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart.getTime() + i * DAY_MS);
      const next = new Date(day.getTime() + DAY_MS);
      const count = recordings.filter((r) => r.createdAt >= day.getTime() && r.createdAt < next.getTime()).length;
      return {
        label: i === 0 ? "Sun" : i === 6 ? "Sat" : day.toLocaleDateString([], { weekday: "short" }).slice(0, 2),
        fullLabel: day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
        value: count, color: count > 0 ? COLORS.blue : COLORS.border,
        highlight: offset === 0 && i === new Date().getDay(),
      };
    });
  }, [recordings, offset]);
  const weekCount = weekDays.reduce((s, d) => s + d.value, 0);
  const start = weekDays[0]?.fullLabel || "";
  const endLabel = weekDays[6]?.fullLabel || "";
  const range = useMemo(() => {
    const a = weekDays[0]?.fullLabel.split(", ")[1] || weekDays[0]?.fullLabel;
    const b = weekDays[6]?.fullLabel.split(", ")[1] || weekDays[6]?.fullLabel;
    return `${a} – ${b}`;
  }, [weekDays]);

  return (
    <div style={{ flex: 1, minWidth: 260, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Calendar size={13} color={COLORS.textSecondary} />
        <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>Meetings</span>
        <span style={{ fontSize: 11.5, color: COLORS.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{range}</span>
        <span style={{ fontSize: 10.5, background: weekCount > 0 ? COLORS.selected : COLORS.border, color: weekCount > 0 ? COLORS.blue : COLORS.textTertiary, fontWeight: 600, borderRadius: 999, padding: "1px 7px" }}>
          {weekCount}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setOffset((o) => Math.min(o + 1, 0))} disabled={offset >= 0} title="Next week"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, border: `1px solid ${COLORS.borderStrong}`, background: "transparent", color: offset >= 0 ? COLORS.border : COLORS.textSecondary, borderRadius: 6, cursor: offset >= 0 ? "default" : "pointer", fontFamily: FONT }}
          onMouseEnter={(e) => { if (offset < 0) e.currentTarget.style.background = COLORS.surface3; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronRight size={13} />
        </button>
        <button onClick={() => setOffset((o) => Math.max(o - 1, MIN_OFFSET))} disabled={offset <= MIN_OFFSET} title="Previous week (up to a year)"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, border: `1px solid ${COLORS.borderStrong}`, background: "transparent", color: offset <= MIN_OFFSET ? COLORS.border : COLORS.textSecondary, borderRadius: 6, cursor: offset <= MIN_OFFSET ? "default" : "pointer", fontFamily: FONT }}
          onMouseEnter={(e) => { if (offset > MIN_OFFSET) e.currentTarget.style.background = COLORS.surface3; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
          <ChevronLeft size={13} />
        </button>
        <button onClick={onOpen} title="Full year view"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, border: "none", background: COLORS.blue, color: "#fff", borderRadius: 6, cursor: "pointer", fontFamily: FONT }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = "brightness(1)"; }}>
          <Maximize2 size={12} />
        </button>
      </div>

      {offset !== 0 && (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: COLORS.textTertiary }}>
            {offset === -1 ? "Last week" : `${Math.abs(offset)} weeks ago`} · {fmtDate(new Date(Date.now() + offset * 7 * DAY_MS), { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <button onClick={() => setOffset(0)} style={{ border: "none", background: "transparent", color: COLORS.blue, fontSize: 10.5, fontWeight: 600, cursor: "pointer", fontFamily: FONT, padding: 0 }}>
            jump to this week
          </button>
        </div>
      )}

      <div key={offset} style={{ display: "flex", alignItems: "flex-end", gap: 5, cursor: "pointer", paddingTop: 2 }} onClick={onOpen} title="Open full year view">
        {weekDays.map((d, i) => (
          <div key={`${offset}-${i}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ height: 58, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{
                width: "100%", maxWidth: 24, height: `${Math.max((d.value / Math.max(1, ...weekDays.map((x) => x.value))) * 52, 0)}px`,
                minHeight: d.value > 0 ? 3 : 1, background: d.color, borderRadius: 4, margin: "0 auto",
                transformOrigin: "bottom", animation: "ovioBarGrow 420ms cubic-bezier(.22,1,.36,1) both", animationDelay: `${i * 45}ms`,
                opacity: d.value > 0 ? 1 : 0.55,
              }} />
            </div>
            <span style={{ fontSize: 9, color: d.highlight ? COLORS.blue : COLORS.textTertiary, fontWeight: d.highlight ? 700 : 400, whiteSpace: "nowrap" }}>
              {d.value}{d.highlight ? " ·" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}