// Ovio theme system — dual palette (dark + light), one accent.
// COLORS is a live object: applyTheme() mutates it in place so every inline
// style that reads COLORS re-resolves on the next render. Hairlines and glass
// surfaces are exposed as CSS variables (--ovio-*) for the few places where
// colors are baked into CSS strings (Settings/Onboarding style blocks, pill
// borders). Export names stay stable for every existing import.

export const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';

const DARK = {
  windowBg: "#050507",
  surface: "#111216",
  surface2: "#16181D",
  surface3: "#1D2026",
  sidebarBg: "#0B0C10",
  border: "rgba(255,255,255,0.07)",
  borderStrong: "rgba(255,255,255,0.14)",
  text: "#F5F6F8",
  textSecondary: "#9BA0AC",
  textTertiary: "#565B66",
  blue: "#2F6BFF",
  blueBright: "#4D8DFF",
  accent: "#2F6BFF",
  accentSoft: "rgba(47,107,255,0.12)",
  selected: "rgba(47,107,255,0.16)",
  green: "#32D583",
  red: "#FF5D5D",
  orange: "#FF9F0A",
  purple: "#9B8AFF",
  noteHighlight: "rgba(47,107,255,0.08)",
  noteBorder: "rgba(47,107,255,0.22)",
  glass: "rgba(17,18,22,0.85)",
  glassBorder: "rgba(255,255,255,0.12)",
  keycapBg: "#0A0B0E",
};

const LIGHT = {
  windowBg: "#F7F5F0",
  surface: "#FFFFFF",
  surface2: "#F2EFE8",
  surface3: "#E9E5DA",
  sidebarBg: "#EFECE4",
  border: "rgba(20,18,12,0.08)",
  borderStrong: "rgba(20,18,12,0.16)",
  text: "#1A1B1E",
  textSecondary: "#5C6069",
  textTertiary: "#9CA0A8",
  blue: "#2F6BFF",
  blueBright: "#1F5AF0",
  accent: "#2F6BFF",
  accentSoft: "rgba(47,107,255,0.10)",
  selected: "rgba(47,107,255,0.13)",
  green: "#1F9D5B",
  red: "#E5484D",
  orange: "#E8871A",
  purple: "#7C6AE8",
  noteHighlight: "rgba(47,107,255,0.07)",
  noteBorder: "rgba(47,107,255,0.25)",
  glass: "rgba(255,255,255,0.88)",
  glassBorder: "rgba(20,18,12,0.1)",
  keycapBg: "#FFFFFF",
};

export const THEMES = { dark: DARK, light: LIGHT };

let currentMode = "dark";

// The live palette — every component reads this at render time.
export const COLORS = { ...DARK };

export function getThemeMode() {
  return currentMode;
}

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
  }
  return currentMode;
}

// Radial light falling from the top of the window. Live: follows the theme.
// Deliberately restrained — a whisper of light, not a glow.
export const GRADIENTS = {
  get pageGlow() {
    if (currentMode === "light") {
      return (
        "radial-gradient(120% 70% at 50% -10%, rgba(47,107,255,0.05) 0%, rgba(47,107,255,0.015) 38%, rgba(247,245,240,0) 70%), #F7F5F0"
      );
    }
    return (
      "radial-gradient(120% 70% at 50% -10%, rgba(47,107,255,0.055) 0%, rgba(47,107,255,0.02) 38%, rgba(5,5,7,0) 70%), #050507"
    );
  },
  get cardGlow() {
    if (currentMode === "light") {
      return "radial-gradient(90% 90% at 50% 0%, rgba(47,107,255,0.03) 0%, rgba(255,255,255,0) 60%)";
    }
    return "radial-gradient(90% 90% at 50% 0%, rgba(47,107,255,0.04) 0%, rgba(17,18,22,0) 60%)";
  },
  orb:
    "radial-gradient(circle at 32% 28%, #9DBAFF 0%, #4D8DFF 22%, #2F6BFF 45%, #1436A6 68%, #071233 100%)",
};

// The glowing hero orb: layered radial gradients + blur. Drop into any
// absolutely-positioned div; pair with ovioGlowBreathe + ovioOrbFloat.
export function orbStyle(size = 260) {
  return {
    width: size,
    height: size,
    borderRadius: "44% 56% 52% 48% / 48% 46% 54% 52%",
    background: GRADIENTS.orb,
    filter: "blur(1px)",
    boxShadow:
      "0 0 60px 12px rgba(47,107,255,0.45), 0 0 160px 40px rgba(47,107,255,0.18), inset 0 0 40px rgba(255,255,255,0.12)",
    position: "relative",
  };
}

// Shared button styles. Primary = solid white pill (dark) / near-black pill
// (light) so the highest-contrast CTA inverts with the theme.
export const PILL = {
  get primary() {
    const light = currentMode === "light";
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      border: "none",
      borderRadius: 999,
      background: light ? "#111216" : "#FFFFFF",
      color: light ? "#FFFFFF" : "#0A0A0D",
      fontWeight: 600,
      cursor: "pointer",
      transition: "transform 160ms cubic-bezier(.16,1,.3,1), opacity 160ms ease",
      boxShadow: "none",
    };
  },
  primaryHover: {
    transform: "scale(1.02)",
  },
  secondary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    border: "1px solid var(--ovio-border-strong)",
    background: "var(--ovio-surface)",
    color: "var(--ovio-text, #F5F6F8)",
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform 160ms cubic-bezier(.16,1,.3,1), border-color 160ms ease, background 160ms ease",
  },
  secondaryHover: {
    transform: "scale(1.02)",
  },
  ghost: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    border: "none",
    background: "transparent",
    fontWeight: 500,
    cursor: "pointer",
    transition: "color 160ms ease, background 160ms ease",
  },
};

// Standard card: hairline border, rounded, theme-aware via vars.
export function CARD(opts = {}) {
  const { pad = 18 } = opts;
  return {
    background: "var(--ovio-surface)",
    border: "1px solid var(--ovio-border)",
    borderRadius: 18,
    padding: pad,
  };
}

// Hover language: border lights up, no glow, no drop shadows — quiet and
// physical, like macOS list rows. Inline styles can't express :hover —
// screens drive it with onMouseEnter/onMouseLeave (see glowIn/glowOut).
export function glowHover(intensity = 1) {
  return {
    transition:
      "border-color 200ms ease, background 200ms ease, transform 200ms cubic-bezier(.16,1,.3,1)",
  };
}

export function glowIn(intensity = 1) {
  return {
    borderColor: `rgba(77,141,255,${0.5 * intensity})`,
  };
}

export function glowOut() {
  return { borderColor: COLORS.border };
}

// Small saturated badge chip — the "Features" pill.
export function badgeStyle(color = COLORS.blue, extra = {}) {
  return {
    color,
    background: `${color}1F`,
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    padding: "3px 10px",
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    ...extra,
  };
}
