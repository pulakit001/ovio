// Shared animation keyframes + entrance helpers for the whole app.
// Dark-theme motion vocabulary: springy overshoot easing, glow that breathes,
// entrances that rise with a blur-to-sharp focus. Every screen animates with
// this same set.

export const ANIM_CSS = `
@keyframes ovioFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ovioFadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioFadeDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioPopIn {
  from { opacity: 0; transform: scale(0.62); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes ovioScaleIn {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes ovioSlideLeft {
  from { opacity: 0; transform: translateX(26px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes ovioSlideRight {
  from { opacity: 0; transform: translateX(-26px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes ovioViewIn {
  from { opacity: 0; transform: translateY(9px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioViewSwapA {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioViewSwapB {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioTabIn {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioStepIn {
  from { opacity: 0; transform: translateY(18px) scale(0.97); filter: blur(6px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
/* Signature entrance: rise from blur — cinematic, used for hero blocks. */
@keyframes ovioRiseIn {
  from { opacity: 0; transform: translateY(26px) scale(0.96); filter: blur(10px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
@keyframes ovioRingPulse {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(1.55); opacity: 0; }
}
@keyframes ovioPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes ovioBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
@keyframes ovioSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes ovioGrowBar {
  from { transform: scaleY(0.35); opacity: 0; }
  to { transform: scaleY(1); opacity: 1; }
}
@keyframes ovioRecordOn {
  0% { transform: scale(0.55); opacity: 0; }
  45% { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes ovioRecordOff {
  0% { transform: scale(1.18); opacity: 0; }
  60% { transform: scale(0.94); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes ovioChatInUser {
  from { opacity: 0; transform: translateX(16px) scale(0.97); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes ovioChatInBot {
  from { opacity: 0; transform: translateX(-16px) scale(0.97); }
  to { opacity: 1; transform: translateX(-0) scale(1); }
}
@keyframes ovioDots {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-3px); opacity: 1; }
}
@keyframes ovioShimmer {
  0% { background-position: -220% 0; }
  100% { background-position: 220% 0; }
}
@keyframes ovioFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
@keyframes ovioFlowDash {
  to { stroke-dashoffset: -28; }
}
@keyframes ovioSettingsIn {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes ovioSettingsOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(14px); }
}
@keyframes ovioOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes ovioOverlayOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
@keyframes ovioFlyOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to { opacity: 0; transform: translateY(-10px) scale(0.9); }
}
@keyframes ovioToastIn {
  from { opacity: 0; transform: translate(-50%, 10px) scale(0.96); }
  to { opacity: 1; transform: translate(-50%, 0) scale(1); }
}
@keyframes ovioFadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
/* Blue flash for saved/updated highlights (was warm beige in the light theme). */
@keyframes ovioFlash {
  0% { background-color: rgba(47,107,255,0.28); }
  100% { background-color: transparent; }
}
/* ---- New dark-vocabulary keyframes ---- */
/* The hero orb breathes: outer glow swells and settles. */
@keyframes ovioGlowBreathe {
  0%, 100% { box-shadow: 0 0 60px 12px rgba(47,107,255,0.45), 0 0 160px 40px rgba(47,107,255,0.18), inset 0 0 40px rgba(255,255,255,0.12); }
  50% { box-shadow: 0 0 90px 22px rgba(77,141,255,0.6), 0 0 220px 60px rgba(47,107,255,0.26), inset 0 0 48px rgba(255,255,255,0.16); }
}
/* The orb levitates — slow, weightless drift. */
@keyframes ovioOrbFloat {
  0%, 100% { transform: translateY(0) rotate(0.001deg); }
  50% { transform: translateY(-14px) rotate(0.001deg); }
}
/* Organic blob morph for the orb silhouette. */
@keyframes ovioOrbMorph {
  0%, 100% { border-radius: 44% 56% 52% 48% / 48% 46% 54% 52%; }
  33% { border-radius: 56% 44% 46% 54% / 52% 56% 44% 48%; }
  66% { border-radius: 48% 52% 58% 42% / 44% 50% 50% 56%; }
}
/* Ambient light drifting across the page background. */
@keyframes ovioWaveFlow {
  0%, 100% { background-position: 50% -10%; }
  50% { background-position: 52% 0%; }
}
/* Recording indicator: halo pulse. */
@keyframes ovioHalo {
  0% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(2.1); opacity: 0; }
}
/* Text shimmer for loading headlines. */
@keyframes ovioTextShimmer {
  0% { opacity: 0.45; }
  50% { opacity: 1; }
  100% { opacity: 0.45; }
}
/* Marquee-free sliding underline for nav pills. */
@keyframes ovioNavGlow {
  0%, 100% { box-shadow: 0 0 0 1px rgba(47,107,255,0.5); }
  50% { box-shadow: 0 0 0 1px rgba(77,141,255,0.8); }
}
`;

// Entrance stagger for lists: each item rises in with a small delay.
export function rowIn(i, step = 32) {
  return {
    animation: "ovioFadeUp 360ms cubic-bezier(.16,1,.3,1) both",
    animationDelay: `${Math.min(i * step, 400)}ms`,
  };
}

// Cards / steps: springier, blur-to-sharp entrance for hero blocks and flows.
export function stepIn(i, step = 70) {
  return {
    animation: "ovioStepIn 520ms cubic-bezier(.16,1,.3,1) both",
    animationDelay: `${i * step}ms`,
  };
}

// Cinematic rise for the biggest hero moments (orb, display headlines).
export function riseIn(i = 0, step = 90) {
  return {
    animation: "ovioRiseIn 700ms cubic-bezier(.16,1,.3,1) both",
    animationDelay: `${i * step}ms`,
  };
}

// Micro hover lift used on list rows.
export function liftHover() {
  return {
    transition:
      "transform 180ms cubic-bezier(.16,1,.3,1), box-shadow 200ms ease, border-color 200ms ease, background 160ms ease",
  };
}

// The orb pair: shape + ambient motion in one spread.
export function orbMotion() {
  return {
    animation:
      "ovioOrbFloat 7s ease-in-out infinite, ovioGlowBreathe 6s ease-in-out infinite, ovioOrbMorph 12s ease-in-out infinite",
  };
}
