// Ovio theme system — monochrome black canvas, ONE accent, big soft geometry.
//
// The design philosophy: near-black surfaces, hairline strokes, huge quiet
// display type, and a single lime "intelligence" accent reserved for AI and
// progress. Everything else is neutral white/gray. Primary actions invert to
// solid white so the highest-contrast element in any view is the CTA.
//
// COLORS is a live object: applyTheme() mutates it in place so every inline
// style that reads COLORS re-resolves on the next render. Hairlines and glass
// surfaces are exposed as CSS variables (--ovio-*) for the few places where
// colors are baked into CSS strings (Settings/Onboarding style blocks, pill
// borders). Export names stay stable for every existing import — `blue` and
// `blueBright` are retained but re-pointed at the neutral / lime ramp so the
// old blue vocabulary disappears app-wide without touching call sites.

export const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "InterVar", "Segoe UI Variable Text", "Segoe UI", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';

// ---- The one accent. Lime, used only for intelligence + progress. ----
const LIME = {
  dark: {
    accent: "#C6F55F",       // fills, progress bars, sparkle
    accentBright: "#D7FF77", // hover / text on dark
    accentInk: "#0A0F02",    // text on a lime fill
    accentSoft: "rgba(198,245,95,0.13)",
  },
  light: {
    accent: "#8FC22B",
    accentBright: "#6E9E12",
    accentInk: "#0A0F02",
    accentSoft: "rgba(143,194,43,0.16)",
  },
};

const DARK = {
  // Canvas + surfaces: pure neutral, no blue cast.
  windowBg: "#000000",
  surface: "#0B0B0D",
  surface2: "#141416",
  surface3: "#1C1C20",
  sidebarBg: "#070708",
  border: "rgba(255,255,255,0.075)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "#F7F7F8",
  textSecondary: "#9C9CA4",
  textTertiary: "#5E5E66",
  // Legacy "blue" names, now the neutral ramp + the lime accent.
  blue: "#8B8B93",
  blueBright: LIME.dark.accentBright,
  accent: LIME.dark.accent,
  accentSoft: LIME.dark.accentSoft,
  selected: "rgba(255,255,255,0.08)",
  green: LIME.dark.accent,
  red: "#FF5D5D",
  orange: "#FFA23A",
  purple: "#B7A6FF",
  noteHighlight: "rgba(198,245,95,0.06)",
  noteBorder: "rgba(198,245,95,0.22)",
  glass: "rgba(12,12,14,0.72)",
  glassBorder: "rgba(255,255,255,0.12)",
  keycapBg: "#101012",
};

const LIGHT = {
  windowBg: "#FAFAF8",
  surface: "#FFFFFF",
  surface2: "#F1F1EE",
  surface3: "#E7E7E2",
  sidebarBg: "#F4F4F1",
  border: "rgba(10,10,10,0.08)",
  borderStrong: "rgba(10,10,10,0.18)",
  text: "#131315",
  textSecondary: "#5B5B63",
  textTertiary: "#9A9AA2",
  blue: "#6E6E76",
  blueBright: LIME.light.accentBright,
  accent: LIME.light.accent,
  accentSoft: LIME.light.accentSoft,
  selected: "rgba(10,10,10,0.06)",
  green: LIME.light.accent,
  red: "#E5484D",
  orange: "#E8871A",
  purple: "#7C6AE8",
  noteHighlight: "rgba(143,194,43,0.08)",
  noteBorder: "rgba(143,194,43,0.28)",
  glass: "rgba(255,255,255,0.86)",
  glassBorder: "rgba(10,10,10,0.1)",
  keycapBg: "#FFFFFF",
};

export const THEMES = { dark: DARK, light: LIGHT };

// Geometry + type scale — the "feel" half of the system. Cards are big and
// soft, display type is large and tightly tracked, eyebrows are small caps.
export const RADIUS = { card: 26, panel: 22, tile: 16, chip: 999, input: 999 };
export const TYPE = {
  display: 52,     // page titles
  hero: 42,        // greetings / hero statements
  title: 22,       // card titles
  body: 14,
  label: 13,
  eyebrow: 11,
};

let currentMode = "light";

// The live palette — every component reads this at render time. Defaults to
// light so the very first frame (before saved settings load) matches the
// default appearance instead of flashing black.
export const COLORS = { ...LIGHT };

export function getThemeMode() {
  return currentMode;
}

export function isLight() {
  return currentMode === "light";
}

// Invert-safe primary CTA tokens: white on dark, near-black on light.
export const CTA = {
  get bg() { return currentMode === "light" ? "#131315" : "#FFFFFF"; },
  get fg() { return currentMode === "light" ? "#FFFFFF" : "#0A0A0C"; },
  get bgHover() { return currentMode === "light" ? "#2A2A2E" : "#EDEDEF"; },
};

// Swap the active palette in place + refresh the CSS variables used by
// baked style blocks. Safe to call before DOM exists (main-process-free).
export function applyTheme(mode) {
  currentMode = mode === "light" ? "light" : "dark";
  Object.assign(COLORS, THEMES[currentMode]);
  if (typeof document !== "undefined") {
    const r = document.documentElement.style;
    r.setProperty("--ovio-border", COLORS.border);
    r.setProperty("--ovio-border-strong", COLORS.borderStrong);
    r.setProperty("--ovio-surface", COLORS.surface);
    r.setProperty("--ovio-surface2", COLORS.surface2);
    r.setProperty("--ovio-window-bg", COLORS.windowBg);
    r.setProperty("--ovio-glass", COLORS.glass);
    r.setProperty("--ovio-glass-border", COLORS.glassBorder);
    r.setProperty("--ovio-keycap-bg", COLORS.keycapBg);
    r.setProperty("--ovio-text", COLORS.text);
    // Global chrome that lives in index.css (scrollbars, text selection).
    r.setProperty("--ovio-scroll-thumb", currentMode === "light" ? "rgba(10,10,10,0.16)" : "rgba(255,255,255,0.14)");
    r.setProperty("--ovio-scroll-thumb-hover", currentMode === "light" ? "rgba(10,10,10,0.28)" : "rgba(255,255,255,0.26)");
    r.setProperty("--ovio-selection", currentMode === "light" ? "rgba(143,194,43,0.26)" : "rgba(198,245,95,0.28)");
    document.documentElement.style.background = COLORS.windowBg;
  }
  return currentMode;
}

// The page is a flat black canvas — no glow fields, no gradient wash. The
// "depth" comes from hairlines and card surfaces, the way print does it.
export const GRADIENTS = {
  get pageGlow() {
    return currentMode === "light" ? "#FAFAF8" : "#000000";
  },
  get cardGlow() {
    return currentMode === "light"
      ? "linear-gradient(180deg, rgba(10,10,10,0.012) 0%, rgba(255,255,255,0) 42%)"
      : "linear-gradient(180deg, rgba(255,255,255,0.022) 0%, rgba(255,255,255,0) 42%)";
  },
  orb:
    "radial-gradient(circle at 34% 30%, #E9F7C4 0%, #C6F55F 40%, #7FA52A 78%, #2C3B08 100%)",
};

// The hero orb is retired in this language — kept as a soft neutral sphere so
// any legacy caller renders something calm rather than a blue glow.
export function orbStyle(size = 260) {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "radial-gradient(circle at 34% 30%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 55%, rgba(255,255,255,0) 100%)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
    position: "relative",
  };
}

// Shared button styles. Primary = solid white pill (dark) / near-black pill
// (light) so the highest-contrast CTA inverts with the theme.
export const PILL = {
  get primary() {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      border: "none",
      borderRadius: RADIUS.chip,
      background: CTA.bg,
      color: CTA.fg,
      fontWeight: 600,
      cursor: "pointer",
      transition: "transform 160ms cubic-bezier(.16,1,.3,1), background 160ms ease, opacity 160ms ease",
      boxShadow: "none",
    };
  },
  primaryHover: {
    transform: "scale(1.012)",
  },
  secondary: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADIUS.chip,
    border: "1px solid var(--ovio-border-strong)",
    background: "transparent",
    color: "var(--ovio-text, #F7F7F8)",
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform 160ms cubic-bezier(.16,1,.3,1), border-color 160ms ease, background 160ms ease",
  },
  secondaryHover: {
    transform: "scale(1.012)",
  },
  ghost: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: RADIUS.chip,
    border: "none",
    background: "transparent",
    fontWeight: 500,
    cursor: "pointer",
    transition: "color 160ms ease, background 160ms ease",
  },
};

// Standard card: hairline stroke on a slightly-lifted near-black surface,
// generously rounded. Usable as a plain style object.
export function CARD(opts = {}) {
  const { pad = 24 } = opts;
  return {
    background: "var(--ovio-surface)",
    border: "1px solid var(--ovio-border)",
    borderRadius: RADIUS.card,
    padding: pad,
  };
}

// Hover language: the hairline brightens, nothing glows. Inline styles can't
// express :hover — screens drive it with onMouseEnter/onMouseLeave.
export function glowHover() {
  return {
    transition:
      "border-color 200ms ease, background 200ms ease, transform 200ms cubic-bezier(.16,1,.3,1)",
  };
}

export function glowIn() {
  return { borderColor: COLORS.borderStrong };
}

export function glowOut() {
  return { borderColor: COLORS.border };
}

// Small quiet chip — used for statuses and meta. Neutral by default; pass a
// color only when the chip carries real state.
export function badgeStyle(color = COLORS.textSecondary, extra = {}) {
  return {
    color,
    background: `${color}1F`,
    borderRadius: RADIUS.chip,
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: "0.03em",
    padding: "3px 10px",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    ...extra,
  };
}
