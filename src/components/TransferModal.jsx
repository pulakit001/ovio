import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Folder, Inbox, Search, MoveRight, X } from "lucide-react";
import { FONT, COLORS } from "../ui/theme";

// Slick centered transfer popup (portaled to document.body — the app shell
// keeps entrance-animation transforms that would trap position:fixed).
// Lists General Folder first, then every project/subproject except the
// recording's current location. Search filters as you type; the chosen
// target fires a little flying-folder confirm before committing.
export default function TransferModal({ open, currentLabel, targets, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null); // { sid, name } while flying
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const general = targets.find((t) => t.isGeneral && t.sid !== undefined);
  const rest = useMemo(() => {
    const list = targets.filter((t) => !t.isGeneral);
    const filtered = q
      ? list.filter((t) => `${t.pname} ${t.sname}`.toLowerCase().includes(q))
      : list;
    return filtered.slice(0, 60);
  }, [targets, q]);
  const showGeneral = general && (!q || "general folder inbox".includes(q));

  const choose = (t) => {
    if (picked) return;
    setPicked(t);
    setTimeout(() => {
      onPick(t.sid, t.name);
      setPicked(null);
    }, 420);
  };

  if (!open) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 950,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        animation: "ovioOverlayIn 200ms ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 430, maxWidth: "94%", maxHeight: "78vh", display: "flex", flexDirection: "column",
          background: COLORS.surface, border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 20, boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
          fontFamily: FONT, overflow: "hidden",
          animation: "ovioStepIn 380ms cubic-bezier(.16,1,.3,1) both",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 18px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MoveRight size={15} color={COLORS.blueBright} />
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text, letterSpacing: -0.2, flex: 1 }}>
              Move recording
            </div>
            <button onClick={onClose} title="Close"
              style={{ border: "none", background: "transparent", color: COLORS.textTertiary, cursor: "pointer", padding: 4, display: "flex" }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.textTertiary, marginTop: 3 }}>
            From <span style={{ color: COLORS.textSecondary, fontWeight: 600 }}>{currentLabel || "current folder"}</span>
          </div>
          {/* Search */}
          <div style={{
            marginTop: 12, display: "flex", alignItems: "center", gap: 7,
            background: COLORS.surface2, border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: "7px 10px",
          }}>
            <Search size={13} color={COLORS.textTertiary} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 12.5, fontFamily: FONT, color: COLORS.text,
              }}
            />
          </div>
        </div>

        {/* Targets */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {showGeneral && (
            <TargetRow
              icon={<Inbox size={14} color={COLORS.blueBright} />}
              name="General Folder"
              sub="Your recording inbox"
              picked={picked?.sid === general.sid}
              disabled={picked && picked.sid !== general.sid}
              onChoose={() => choose(general)}
              glow
            />
          )}
          {rest.map((t) => (
            <TargetRow
              key={t.sid}
              icon={<Folder size={14} color={COLORS.blue} strokeWidth={1.8} />}
              name={t.sname}
              sub={t.pname}
              picked={picked?.sid === t.sid}
              disabled={picked && picked.sid !== t.sid}
              onChoose={() => choose(t)}
            />
          ))}
          {!showGeneral && rest.length === 0 && (
            <div style={{ padding: "22px 10px", textAlign: "center", fontSize: 12.5, color: COLORS.textTertiary }}>
              {q ? `No projects match “${query}”` : "No other folders yet — create a project first."}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TargetRow({ icon, name, sub, onChoose, picked, disabled, glow }) {
  const [hover, setHover] = useState(false);
  const active = picked;
  return (
    <button
      onClick={onChoose}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      disabled={disabled}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        border: `1px solid ${active ? COLORS.blue : hover ? COLORS.borderStrong : COLORS.border}`,
        background: active ? COLORS.selected : hover ? COLORS.surface2 : "transparent",
        borderColor: active ? "rgba(77,141,255,0.55)" : COLORS.border,
        borderRadius: 12, padding: "9px 11px", cursor: disabled ? "default" : "pointer",
        fontFamily: FONT, marginBottom: 4, opacity: disabled ? 0.35 : 1,
        transform: active ? "scale(1.015)" : "scale(1)",
        transition: "border-color 160ms ease, background 160ms ease, box-shadow 200ms ease, transform 200ms cubic-bezier(.16,1,.3,1), opacity 160ms ease",
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: 9, background: COLORS.surface2,
        border: `1px solid ${COLORS.border}`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        <div style={{ fontSize: 10.5, color: COLORS.textTertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {glow && (
        <span style={{
          fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", color: COLORS.blueBright,
          background: COLORS.accentSoft, borderRadius: 999, padding: "2px 7px", flexShrink: 0,
        }}>
          INBOX
        </span>
      )}
      <MoveRight
        size={14}
        color={active ? COLORS.blueBright : COLORS.textTertiary}
        style={{
          flexShrink: 0,
          transform: active ? "translateX(4px)" : hover ? "translateX(2px)" : "translateX(0)",
          opacity: active || hover ? 1 : 0.5,
          transition: "transform 220ms cubic-bezier(.16,1,.3,1), opacity 160ms ease",
        }}
      />
    </button>
  );
}
