import { useState, useMemo, useRef } from "react";
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
} from "lucide-react";

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
  orange: "#B4552D",
  purple: "#7A5C9E",
  selected: "#F2E5D8",
  accent: "#B4552D",
  accentSoft: "#F3E5D9",
  noteHighlight: "#F6EDE0",
  noteBorder: "#E4D0B4",
};

const DEPT_COLORS = ["#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#FF453A", "#64D2FF", "#FFD60A", "#FF375F"];

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif';

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

function StatCard({ icon, label, value, sub, color, progress, onClick, subtitle }) {
  const [lift, setLift] = useState(false);
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setLift(true)}
      onMouseLeave={() => setLift(false)}
      title={subtitle}
      style={{
        flex: 1, minWidth: 180, background: COLORS.surface,
        border: `1px solid ${COLORS.border}`, borderRadius: 16,
        padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 10,
        cursor: onClick ? "pointer" : "default",
        transform: lift ? "translateY(-3px)" : "translateY(0)",
        boxShadow: lift ? "0 8px 24px rgba(0,0,0,0.10)" : "0 1px 2px rgba(0,0,0,0.04)",
        transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
        borderColor: lift ? COLORS.borderStrong : COLORS.border,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
          <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 500 }}>{label}</span>
        </div>
        {progress !== undefined && (
          <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="26" cy="26" r={r} fill="none" stroke={COLORS.border} strokeWidth="5" />
              <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
                style={{ transition: "stroke-dashoffset 600ms ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: COLORS.text }}>
              {Math.round(progress * 100)}%
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: COLORS.text, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: COLORS.textTertiary }}>{sub}</div>}
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
              background: "#1D1D1F", color: "#fff", fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap",
              padding: "4px 8px", borderRadius: 6, pointerEvents: "none", zIndex: 10,
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            }}>
              {d.label}: {d.value}{unit}
              <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", border: "5px solid transparent", borderTopColor: "#1D1D1F" }} />
            </div>
          )}
          <div style={{
            width: "100%", maxWidth: 28,
            height: `${Math.max((d.value / max) * 70, 3)}px`,
            background: hover === i ? (d.color || COLORS.blue) : (d.color || COLORS.blue),
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
      <div style={{ width: 36, height: 36, borderRadius: 999, background: "#EFE9DC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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

export default function Dashboard({ projects, recordingsBySub, onSelectRecording, onNavigateToProject, onClearAll }) {
  const [expandedDept, setExpandedDept] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
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

  const deptData = useMemo(() => {
    const depts = [];
    projects.forEach((proj) => {
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

  const last7Days = useMemo(() => {
    const now = Date.now();
    const dayMs = 86400000;
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = now - (6 - i) * dayMs;
      const dayEnd = dayStart + dayMs;
      const count = allRecordings.filter((r) => r.createdAt >= dayStart && r.createdAt < dayEnd).length;
      return {
        label: new Date(dayStart).toLocaleDateString([], { weekday: "short" }),
        value: count,
        color: count > 0 ? COLORS.blue : COLORS.border,
        highlight: i === 6,
      };
    });
  }, [allRecordings]);

  const durationByDept = useMemo(() => {
    return deptData
      .filter((d) => d.totalDuration > 0)
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .map((d, i) => ({
        label: d.name.slice(0, 4),
        value: Math.round(d.totalDuration / 60),
        color: DEPT_COLORS[i % DEPT_COLORS.length],
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

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        height: 52, minHeight: 52, display: "flex", alignItems: "center",
        padding: "0 24px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Dashboard</div>
        <div style={{ flex: 1 }} />
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#ECE5D9")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <Trash2 size={11} /> Clear
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <StatCard
            icon={<FileText size={14} color={COLORS.blue} />} label="Total Meetings"
            value={allRecordings.length}
            sub={`Across ${projects.length} project${projects.length === 1 ? "" : "s"}`}
            color={COLORS.blue}
            progress={Math.min(allRecordings.length / 10, 1)}
            subtitle="View all meetings"
            onClick={() => contentRef.current?.querySelector("#all-meetings")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          />
          <StatCard
            icon={<Clock size={14} color={COLORS.green} />} label="Total Duration"
            value={formatDurationHr(Math.round(totalDuration / 60))}
            sub={`Avg: ${formatDurationHr(Math.round(avgDuration / 60))} per meeting`}
            color={COLORS.green}
            progress={Math.min(Math.round(totalDuration / 60) / 120, 1)}
            subtitle="Hours logged with Ovio"
          />
          <StatCard
            icon={<Brain size={14} color={COLORS.purple} />} label="AI Summaries"
            value={recordingsWithAI}
            sub={`${allRecordings.length > 0 ? Math.round((recordingsWithAI / allRecordings.length) * 100) : 0}% coverage`}
            color={COLORS.purple}
            progress={allRecordings.length > 0 ? recordingsWithAI / allRecordings.length : 0}
            subtitle="Meetings with AI-generated notes"
          />
          <StatCard
            icon={<TrendingUp size={14} color={COLORS.orange} />} label="Transcript Lines"
            value={totalTranscriptLines.toLocaleString()}
            sub={`${allRecordings.length > 0 ? Math.round(totalTranscriptLines / allRecordings.length) : 0} lines avg`}
            color={COLORS.orange}
            progress={Math.min(totalTranscriptLines / 200, 1)}
            subtitle={`${allRecordings.filter((r) => r.transcript?.length).length} recordings captured`}
          />
        </div>

        {/* Charts */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 14 }}>Meetings — Last 7 Days</div>
            <BarVisualization data={last7Days} />
          </div>
          {durationByDept.length > 0 && (
            <div style={{ flex: 1, minWidth: 260, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 14 }}>Duration by Department (min)</div>
              <BarVisualization data={durationByDept} />
            </div>
          )}
        </div>

        {/* Departments */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Folder size={13} /> Departments
          </div>

          {deptData.length === 0 ? (
            <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "28px 18px", textAlign: "center", fontSize: 13, color: COLORS.textTertiary }}>
              No projects yet. Create one from the recorder view.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {deptData.map((dept, di) => (
                <div key={dept.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, overflow: "hidden" }}>
                  <div onClick={() => setExpandedDept(expandedDept === dept.id ? null : dept.id)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", transition: "background 120ms ease" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F1EBDF")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {expandedDept === dept.id ? <ChevronDown size={14} color={COLORS.textTertiary} /> : <ChevronRight size={14} color={COLORS.textTertiary} />}
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${DEPT_COLORS[di % DEPT_COLORS.length]}14`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: DEPT_COLORS[di % DEPT_COLORS.length] }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.text }}>{dept.name}</div>
                      <div style={{ fontSize: 11, color: COLORS.textTertiary, marginTop: 1 }}>
                        {dept.subprojects.length} subproject{dept.subprojects.length === 1 ? "" : "s"} · {dept.meetingCount} meeting{dept.meetingCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: COLORS.textSecondary }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{formatDurationHr(Math.round(dept.totalDuration / 60))}</div>
                        <div style={{ fontSize: 10, color: COLORS.textTertiary }}>duration</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{dept.aiCount}/{dept.meetingCount}</div>
                        <div style={{ fontSize: 10, color: COLORS.textTertiary }}>AI done</div>
                      </div>
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
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#EFE9DD")}
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

        {/* All Meetings */}
        {allRecordings.length > 0 && (
          <div>
            <div id="all-meetings" style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Calendar size={13} /> All Meetings
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allRecordings.map((rec) => (
                <MeetingRow key={rec.id} rec={rec} onSelect={handleSelectMeeting} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}