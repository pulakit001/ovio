import { useState } from "react";
import { Sparkles, ArrowRight, CornerDownLeft } from "lucide-react";
import { COLORS, FONT, RADIUS, TYPE, CTA, isLight } from "./theme";

// ============================================================================
// Ovio UI kit — the shared building blocks of the black-canvas language.
//
// Philosophy (one place, so every screen agrees):
//   • Page = flat black. Depth comes from hairlines + lifted card surfaces.
//   • Type = huge and quiet for titles, small uppercase eyebrows for labels.
//   • Action = one high-contrast white pill per view; everything else is a
//     ghost or an outline so the CTA always wins.
//   • Accent = lime, reserved for intelligence and progress. Never decorative.
// ============================================================================

// Small uppercase label that names a band or a card's category.
export function Eyebrow({ children, style }) {
  return (
    <div
      style={{
        fontSize: TYPE.eyebrow,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: COLORS.textTertiary,
        fontFamily: FONT,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// The page header: a breadcrumb trail, then a very large, tightly tracked
// title. This is the single most recognisable element of the design.
export function PageHeader({ breadcrumb, title, subtitle, actions, delay = 0 }) {
  const crumbs = Array.isArray(breadcrumb) ? breadcrumb : breadcrumb ? [breadcrumb] : [];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
        marginBottom: 26,
        animation: `ovioFadeUp 520ms cubic-bezier(.22,1,.36,1) ${delay}ms both`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {crumbs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {i > 0 && <span style={{ color: COLORS.textTertiary, fontSize: 13 }}>/</span>}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: i === crumbs.length - 1 ? 500 : 400,
                    color: i === crumbs.length - 1 ? COLORS.textSecondary : COLORS.textTertiary,
                  }}
                >
                  {c}
                </span>
              </span>
            ))}
          </div>
        )}
        <h1
          style={{
            margin: 0,
            fontSize: TYPE.display,
            fontWeight: 500,
            letterSpacing: "-0.045em",
            lineHeight: 1.02,
            color: COLORS.text,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 12, maxWidth: 720 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// A large soft card. Depth is a hairline and a barely-there top sheen.
export function Card({ children, style, hoverable = false, onClick, pad = 24 }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={hoverable ? () => setHover(true) : undefined}
      onMouseLeave={hoverable ? () => setHover(false) : undefined}
      style={{
        background: "var(--ovio-surface)",
        border: `1px solid ${hover ? COLORS.borderStrong : COLORS.border}`,
        borderRadius: RADIUS.card,
        padding: pad,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 200ms ease, background 200ms ease, transform 200ms cubic-bezier(.16,1,.3,1)",
        transform: hover && onClick ? "translateY(-2px)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Rounded-square icon holder used on feature cards.
export function IconTile({ children, size = 44, accent = false }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.tile,
        background: accent ? COLORS.accentSoft : "var(--ovio-surface2)",
        color: accent ? COLORS.accent : COLORS.textSecondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}

// The single high-contrast action. Full-width when `full`.
export function PrimaryButton({ children, onClick, full = false, style, disabled = false, trailing = null }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        width: full ? "100%" : "auto",
        border: "none",
        borderRadius: RADIUS.chip,
        background: disabled ? COLORS.surface3 : hover ? CTA.bgHover : CTA.bg,
        color: disabled ? COLORS.textTertiary : CTA.fg,
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: "-0.01em",
        padding: "15px 22px",
        cursor: disabled ? "default" : "pointer",
        fontFamily: FONT,
        opacity: disabled ? 0.6 : 1,
        transition: "background 160ms ease, transform 160ms cubic-bezier(.16,1,.3,1), opacity 160ms ease",
        transform: hover && !disabled ? "scale(1.006)" : "none",
        ...style,
      }}
    >
      {children}
      {trailing}
    </button>
  );
}

// Quiet outline action for secondary choices.
export function GhostButton({ children, onClick, style, active = false, title }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        background: active ? COLORS.surface2 : hover ? COLORS.surface : "transparent",
        border: `1px solid ${hover || active ? COLORS.borderStrong : COLORS.border}`,
        borderRadius: RADIUS.chip,
        color: COLORS.text,
        fontSize: 13,
        fontWeight: 500,
        padding: "9px 16px",
        cursor: "pointer",
        fontFamily: FONT,
        transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// The floating "ask" bar. Sits over the canvas at the bottom of a view: a
// dark glass pill with suggestion chips stacked above it. Submitting hands
// the text to the caller (which routes it to search / an action).
export function AiBar({ chips = [], placeholder = "Ask anything about your meetings", onSubmit, onExpand }) {
  const [value, setValue] = useState("");
  const submit = (text) => {
    const q = (text ?? value).trim();
    if (!q) return;
    onSubmit?.(q);
    setValue("");
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        width: "min(620px, 100%)",
        animation: "ovioFadeUp 620ms cubic-bezier(.22,1,.36,1) 200ms both",
      }}
    >
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          {chips.map((c) => {
            const idle = isLight() ? "rgba(10,10,10,0.05)" : "rgba(255,255,255,0.05)";
            const hot = isLight() ? "rgba(10,10,10,0.09)" : "rgba(255,255,255,0.09)";
            const line = isLight() ? "rgba(10,10,10,0.10)" : "rgba(255,255,255,0.09)";
            return (
              <button
                key={c.label}
                onClick={c.onClick}
                style={{
                  background: idle,
                  border: `1px solid ${line}`,
                  color: COLORS.textSecondary,
                  fontSize: 12.5,
                  fontWeight: 500,
                  borderRadius: RADIUS.chip,
                  padding: "7px 14px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  transition: "background 180ms ease, color 180ms ease, border-color 180ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = hot;
                  e.currentTarget.style.color = COLORS.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = idle;
                  e.currentTarget.style.color = COLORS.textSecondary;
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          background: COLORS.glass,
          border: `1px solid ${COLORS.glassBorder}`,
          borderRadius: RADIUS.chip,
          padding: "8px 8px 8px 10px",
          backdropFilter: "blur(22px)",
          WebkitBackdropFilter: "blur(22px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
        }}
      >
        <button
          type="button"
          onClick={() => (onExpand ? onExpand() : submit())}
          title="Ask"
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 11,
            border: "none",
            background: COLORS.accent,
            color: "#0A0F02",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Sparkles size={16} strokeWidth={2.2} />
        </button>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            color: COLORS.text,
            fontSize: 14,
            fontFamily: FONT,
            textAlign: "center",
          }}
        />
        <button
          type="submit"
          title="Send"
          style={{
            width: 34,
            height: 34,
            flexShrink: 0,
            borderRadius: 11,
            border: "1px solid " + COLORS.glassBorder,
            background: "transparent",
            color: COLORS.textSecondary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <CornerDownLeft size={15} />
        </button>
      </form>
    </div>
  );
}

// Small labelled metric tile — the "PROFILE / 100% / 9 of 9 fields" block.
export function StatTile({ label, value, sub, onClick, style }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        background: "var(--ovio-surface2)",
        border: `1px solid ${hover && onClick ? COLORS.borderStrong : COLORS.border}`,
        borderRadius: RADIUS.panel,
        padding: "18px 22px 20px",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 200ms ease, background 200ms ease",
        ...style,
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          fontSize: 40,
          fontWeight: 600,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          color: COLORS.text,
          marginTop: 12,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12.5, color: COLORS.textTertiary, marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

// Big tappable feature card: icon tile, eyebrow, title, meta line.
export function FeatureCard({ icon, eyebrow, title, meta, onClick, accent = false, style }) {
  return (
    <Card hoverable onClick={onClick} pad={26} style={{ display: "flex", flexDirection: "column", gap: 18, ...style }}>
      <IconTile accent={accent}>{icon}</IconTile>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <div style={{ fontSize: TYPE.title, fontWeight: 500, letterSpacing: "-0.02em", color: COLORS.text }}>
          {title}
        </div>
        {meta && <div style={{ fontSize: 13, color: COLORS.textTertiary }}>{meta}</div>}
      </div>
    </Card>
  );
}

// A single circular icon control — the window chrome's only chrome.
export function IconButton({ children, onClick, title, ariaLabel, size = 38, active = false }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel || title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.chip,
        border: `1px solid ${hover || active ? COLORS.borderStrong : "transparent"}`,
        background: active ? COLORS.surface2 : hover ? COLORS.surface : "transparent",
        color: COLORS.textSecondary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 180ms ease, border-color 180ms ease, color 180ms ease",
      }}
    >
      {children}
    </button>
  );
}

export { ArrowRight, isLight };
