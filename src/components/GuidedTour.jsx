import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { COLORS, CTA, FONT, isLight } from "../ui/theme";

const PAD = 8;
const CARD_W = 330;
const GAP = 14;

const TOUR_CSS = `
@keyframes ovioTourCard { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
.ovio-tour-spot { transition: top 420ms cubic-bezier(.16,1,.3,1), left 420ms cubic-bezier(.16,1,.3,1), width 420ms cubic-bezier(.16,1,.3,1), height 420ms cubic-bezier(.16,1,.3,1), border-radius 420ms ease; }
.ovio-tour-card { transition: top 420ms cubic-bezier(.16,1,.3,1), left 420ms cubic-bezier(.16,1,.3,1); }
.ovio-tour-btn { font-family: inherit; transition: background 150ms ease, color 150ms ease, border-color 150ms ease; }
.ovio-tour-btn:focus-visible { outline: 2px solid var(--ovio-text); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .ovio-tour-spot, .ovio-tour-card { transition: none; } }
`;

function measure(selector) {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

export default function GuidedTour({ open, steps, onFinish, onSkip, onIndexChange }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const nextRef = useRef(null);
  const step = steps[index];

  useEffect(() => { if (open) setIndex(0); }, [open]);

  // Let the shell switch views (Dashboard → Recorder → Settings) ahead of the
  // spotlight so each step can point at a real element.
  useEffect(() => {
    if (open) onIndexChange?.(index);
  }, [open, index, onIndexChange]);

  const remeasure = useCallback(() => {
    setVp({ w: window.innerWidth, h: window.innerHeight });
    setRect(measure(step?.target));
  }, [step]);

  useLayoutEffect(() => {
    if (!open || !step) return undefined;
    const el = step.target && document.querySelector(step.target);
    el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    remeasure();
    const t1 = setTimeout(remeasure, 320);
    const t2 = setTimeout(remeasure, 700);
    window.addEventListener("resize", remeasure);
    window.addEventListener("scroll", remeasure, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("scroll", remeasure, true);
    };
  }, [open, step, remeasure]);

  useEffect(() => { if (open) nextRef.current?.focus(); }, [open, index]);

  const last = index === steps.length - 1;
  const next = useCallback(() => { if (last) onFinish(); else setIndex((i) => i + 1); }, [last, onFinish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const skip = useCallback(() => (onSkip || onFinish)?.(), [onSkip, onFinish]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); skip(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, next, back, skip]);

  if (!open || !step) return null;

  const light = isLight();
  const cardH = 196;
  let cardTop;
  let cardLeft;
  if (rect) {
    const below = rect.top + rect.height + GAP;
    const fitsBelow = below + cardH < vp.h - 12;
    cardTop = fitsBelow ? below : Math.max(12, rect.top - GAP - cardH);
    cardLeft = rect.left + rect.width / 2 - CARD_W / 2;
    cardLeft = Math.min(Math.max(12, cardLeft), vp.w - CARD_W - 12);
  } else {
    cardTop = vp.h / 2 - cardH / 2;
    cardLeft = vp.w / 2 - CARD_W / 2;
  }

  const spot = rect || { top: vp.h / 2, left: vp.w / 2, width: 0, height: 0 };
  const radius = rect ? Math.min(22, rect.height / 2) : 0;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="App tour" style={{ position: "fixed", inset: 0, zIndex: 990, fontFamily: FONT }}>
      <style>{TOUR_CSS}</style>
      <div style={{ position: "absolute", inset: 0 }} onClick={(e) => e.stopPropagation()} />
      <div
        className="ovio-tour-spot"
        aria-hidden
        style={{
          position: "absolute",
          top: spot.top,
          left: spot.left,
          width: spot.width,
          height: spot.height,
          borderRadius: radius,
          boxShadow: `0 0 0 9999px ${light ? "rgba(12,12,14,0.5)" : "rgba(0,0,0,0.7)"}`,
          outline: rect ? `1.5px solid ${light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.5)"}` : "none",
          pointerEvents: "none",
        }}
      />
      <div
        className="ovio-tour-card"
        style={{
          position: "absolute",
          top: cardTop,
          left: cardLeft,
          width: CARD_W,
          boxSizing: "border-box",
          background: COLORS.surface,
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 18,
          padding: "18px 18px 14px",
          boxShadow: light ? "0 24px 60px rgba(10,10,10,0.18)" : "0 24px 70px rgba(0,0,0,0.6)",
        }}
      >
        <div key={index} style={{ animation: "ovioTourCard 320ms cubic-bezier(.16,1,.3,1) both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 12 }} aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((_, i) => (
              <span
                key={i}
                style={{
                  width: i === index ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  background: i <= index ? COLORS.text : COLORS.borderStrong,
                  opacity: i <= index ? (i === index ? 1 : 0.45) : 1,
                  transition: "width 300ms cubic-bezier(.34,1.56,.64,1), background 200ms ease",
                }}
              />
            ))}
          </div>
          <div style={{ color: COLORS.text, fontSize: 16, fontWeight: 620, letterSpacing: "-0.015em" }}>{step.title}</div>
          <div style={{ color: COLORS.textSecondary, fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{step.body}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 16 }}>
          <button
            type="button"
            className="ovio-tour-btn"
            onClick={skip}
            style={{ border: "none", background: "transparent", color: COLORS.textTertiary, fontSize: 12, padding: "6px 4px", cursor: "pointer" }}
          >
            Skip tour
          </button>
          <span style={{ flex: 1 }} />
          {index > 0 && (
            <button
              type="button"
              className="ovio-tour-btn"
              onClick={back}
              aria-label="Previous step"
              style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${COLORS.border}`, borderRadius: 999, background: "transparent", color: COLORS.textSecondary, cursor: "pointer" }}
            >
              <ArrowLeft size={14} />
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            className="ovio-tour-btn"
            onClick={next}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 15px", border: "none", borderRadius: 999, background: CTA.bg, color: CTA.fg, fontSize: 12.5, fontWeight: 620, cursor: "pointer" }}
          >
            {last ? "Start recording" : "Next"} {!last && <ArrowRight size={13} />}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
