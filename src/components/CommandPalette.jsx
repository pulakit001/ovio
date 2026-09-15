import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, FileText, Folder, Paperclip, X, ArrowRight } from "lucide-react";
import { FONT, COLORS } from "../ui/theme";

// Universal search (⌘K): one palette over EVERYTHING in the app —
// recordings (title + transcript + AI notes), projects/subprojects,
// Vault files, and quick actions. Results are scored, grouped, and
// keyboard-navigable (↑↓ move, Enter opens, Esc closes).

// Substring-score: earlier matches and word-start matches rank higher.
function score(query, text) {
  if (!query) return 1;
  const t = String(text || "").toLowerCase();
  const q = query.toLowerCase();
  const idx = t.indexOf(q);
  if (idx === -1) return 0;
  let s = 10 - Math.min(idx, 10);
  if (idx === 0 || /\W/.test(t[idx - 1] || "")) s += 4;
  return s + Math.min(t.length / 400, 2);
}

function snippet(text, query, len = 90) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const idx = t.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1 || idx < 30) return t.slice(0, len) + (t.length > len ? "…" : "");
  return "…" + t.slice(idx - 25, idx - 25 + len) + (idx - 25 + len < t.length ? "…" : "");
}

const ACTIONS = [
  { id: "act-dashboard", kind: "action", icon: "grid", title: "Go to Dashboard", run: (nav) => nav.go("dashboard") },
  { id: "act-recorder", kind: "action", icon: "mic", title: "Go to Recorder", run: (nav) => nav.go("recorder") },
  { id: "act-settings", kind: "action", icon: "gear", title: "Open Settings", run: (nav) => nav.go("settings") },
];

export default function CommandPalette({ open, onClose, projects, recordingsBySub, vaultBySub, nav }) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // ---- Build the searchable index -------------------------------------
  const results = useMemo(() => {
    const q = query.trim();
    const out = [];

    // Actions — only when they match (or no query: show them first).
    for (const a of ACTIONS) {
      const s = score(q, a.title);
      if (!q || s > 0) out.push({ ...a, score: q ? s : 3, group: "Actions" });
    }

    // Recordings: title, transcript lines, AI notes text.
    for (const [sid, recs] of Object.entries(recordingsBySub || {})) {
      for (const r of recs || []) {
        const titleScore = score(q, r.label);
        const transcript = (r.transcript || []).map((t) => t?.text || t?.raw || "").join(" ");
        const notesText = [
          r.aiNotes || "",
          ...(r.notes || []).map((n) => n?.text || ""),
        ].join(" ");
        const tScore = q ? score(q, transcript) : 0;
        const nScore = q ? score(q, notesText) : 0;
        const best = Math.max(titleScore, tScore * 0.8, nScore * 0.8);
        if (!q || best > 0) {
          const where = (projects || []).find((p) => (p.subprojects || []).some((sp) => sp.id === sid));
          const sub = where?.subprojects?.find((sp) => sp.id === sid);
          out.push({
            id: `rec-${r.id}`,
            kind: "recording",
            icon: "rec",
            title: r.label || "Untitled recording",
            group: "Recordings",
            badge: sub ? `${where?.name || ""}${sub.name ? ` / ${sub.name}` : ""}` : "",
            meta: snippet(titleScore >= tScore && titleScore >= nScore ? "" : (tScore >= nScore ? transcript : notesText), q),
            score: best,
            run: () => nav.openRecording(where?.id || null, sid, r.id),
          });
        }
      }
    }

    // Projects + subprojects.
    for (const p of projects || []) {
      if (!p) continue;
      const ps = score(q, p.name);
      if (!q || ps > 0) {
        out.push({
          id: `proj-${p.id}`,
          kind: "project",
          icon: "folder",
          title: p.name,
          group: "Projects",
          meta: `${(p.subprojects || []).length} folder${(p.subprojects || []).length === 1 ? "" : "s"}`,
          score: ps,
          run: () => nav.openProject(p.id, p.subprojects?.[0]?.id || null),
        });
      }
      for (const sp of p.subprojects || []) {
        const ss = score(q, sp.name);
        if (q && ss > 0) {
          out.push({
            id: `sub-${sp.id}`,
            kind: "project",
            icon: "folder",
            title: sp.name,
            group: "Projects",
            badge: p.name,
            score: ss * 0.9,
            run: () => nav.openProject(p.id, sp.id),
          });
        }
      }
    }

    // Vault files.
    for (const [sid, files] of Object.entries(vaultBySub || {})) {
      for (const f of files || []) {
        const s = score(q, f.name);
        if (!q || s > 0) {
          const where = (projects || []).find((p) => (p.subprojects || []).some((sp) => sp.id === sid));
          const sub = where?.subprojects?.find((sp) => sp.id === sid);
          out.push({
            id: `file-${f.id}`,
            kind: "file",
            icon: "file",
            title: f.name,
            group: "Vault files",
            badge: sub ? `${where?.name || ""} / ${sub.name}` : "",
            meta: "",
            score: s,
            run: () => nav.openProject(where?.id || null, sid, { focusVault: true }),
          });
        }
      }
    }

    const ranked = out.sort((a, b) => b.score - a.score).slice(0, 24);
    // Group-preserving order: Actions, Recordings, Projects, Vault.
    const order = { Actions: 0, Recordings: 1, Projects: 2, "Vault files": 3 };
    return ranked.sort((a, b) => (order[a.group] - order[b.group]) || (b.score - a.score));
  }, [query, recordingsBySub, projects, vaultBySub, nav]);

  // Keep selection in range; Enter runs it.
  useEffect(() => { setSel((s) => Math.min(s, Math.max(0, results.length - 1))); }, [results.length]);

  const runAt = useCallback((i) => {
    const r = results[i];
    if (!r) return;
    onClose();
    // Let the palette unmount before navigation rearranges the tree.
    setTimeout(() => r.run?.(), 10);
  }, [results, onClose]);

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); runAt(sel); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const ICONS = {
    rec: <FileText size={13} color={COLORS.textSecondary} />,
    folder: <Folder size={13} color={COLORS.textSecondary} />,
    file: <Paperclip size={13} color={COLORS.textSecondary} />,
    grid: <Search size={13} color={COLORS.textSecondary} />,
    mic: <FileText size={13} color={COLORS.textSecondary} />,
    gear: <Search size={13} color={COLORS.textSecondary} />,
  };

  let lastGroup = null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 960,
        background: "rgba(5,5,7,0.55)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "14vh", padding: "14vh 20px 20px",
        animation: "ovioOverlayIn 140ms ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "100%",
          background: COLORS.surface, border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 14, boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
          overflow: "hidden", fontFamily: FONT,
          animation: "ovioFadeUp 180ms cubic-bezier(.16,1,.3,1) both",
        }}
      >
        {/* Query field */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 14px", borderBottom: `1px solid ${COLORS.border}` }}>
          <Search size={15} color={COLORS.textTertiary} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSel(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search recordings, notes, files, projects…"
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 14, fontFamily: FONT, color: COLORS.text,
            }}
          />
          <button onClick={onClose} title="Close (Esc)"
            style={{ border: "none", background: "transparent", color: COLORS.textTertiary, cursor: "pointer", padding: 2 }}>
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto", padding: "4px 0 6px" }}>
          {results.length === 0 && (
            <div style={{ padding: "22px 16px", fontSize: 12.5, color: COLORS.textTertiary, textAlign: "center" }}>
              Nothing matches “{query}”.
            </div>
          )}
          {results.map((r, i) => {
            const showGroup = r.group !== lastGroup;
            lastGroup = r.group;
            return (
              <div key={r.id}>
                {showGroup && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.09em",
                    textTransform: "uppercase", color: COLORS.textTertiary,
                    padding: "8px 14px 3px",
                  }}>{r.group}</div>
                )}
                <div
                  data-sel={i === sel}
                  onClick={() => runAt(i)}
                  onMouseEnter={() => setSel(i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 14px", cursor: "pointer",
                    background: i === sel ? COLORS.selected : "transparent",
                  }}
                >
                  <span style={{ flexShrink: 0, display: "flex" }}>{ICONS[r.icon]}</span>
                  <span style={{
                    fontSize: 12.5, fontWeight: 500, color: COLORS.text,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    flexShrink: 0, maxWidth: 240,
                  }}>{r.title}</span>
                  {r.badge && (
                    <span style={{
                      fontSize: 10.5, color: COLORS.textTertiary, flexShrink: 0,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130,
                    }}>{r.badge}</span>
                  )}
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 11, color: COLORS.textTertiary,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right",
                  }}>{r.meta || ""}</span>
                  {i === sel && <ArrowRight size={12} color={COLORS.textSecondary} style={{ flexShrink: 0 }} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hints */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "7px 14px", borderTop: `1px solid ${COLORS.border}`,
          fontSize: 10.5, color: COLORS.textTertiary,
        }}>
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span style={{ marginLeft: "auto" }}>esc close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
