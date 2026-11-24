// Local STT setup: live Parakeet state + the "please wait" popup.
//
// Pressing record while the engine/weights are still installing must never
// start a half-working session (that used to surface as a red error line at
// the bottom of the recorder). Instead the recorder asks `useLocalModelSetup`
// whether the local model is usable, and opens `ModelSetupModal` — a calm,
// honest progress card with the exact stage, percentage and bytes downloaded.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Download, X } from "lucide-react";
import { COLORS, CTA, FONT } from "./theme";

// 1.2 GB / 2.5 GB — binary units, one decimal, matching Finder + the cask copy.
function gb(bytes) {
  if (!bytes || bytes < 0) return "";
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

// Status arrives several times a second during the weights download. The
// recorder that consumes this is a big tree, so only re-render when something
// visible actually changed (stage, whole percentage or downloaded flag).
function sameVisibleState(a, b) {
  if (!a || !b) return false;
  return (
    a.engine?.state === b.engine?.state &&
    a.engine?.step === b.engine?.step &&
    !!a.weights?.downloading === !!b.weights?.downloading &&
    !!a.weights?.downloaded === !!b.weights?.downloaded &&
    Math.round((a.weights?.progress || 0) * 100) === Math.round((b.weights?.progress || 0) * 100)
  );
}

export function useLocalModelSetup() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const api = window.electronAPI?.parakeetAPI;
    if (!api) return;
    let alive = true;
    const apply = (st) => {
      if (!alive || !st) return;
      setStatus((prev) => (sameVisibleState(prev, st) ? prev : st));
    };
    api.status?.().then(apply).catch(() => {});
    const off = api.onStatus?.(apply);
    return () => {
      alive = false;
      if (typeof off === "function") off();
    };
  }, []);

  const api = window.electronAPI?.parakeetAPI;
  const engine = status?.engine || {};
  const weights = status?.weights || {};

  const engineReady = engine.state === "ready";
  const engineInstalling = engine.state === "installing";
  const engineError = engine.state === "error";
  const weightsDownloaded = !!weights.downloaded;
  const weightsDownloading = !!weights.downloading;
  const percent = weightsDownloaded ? 100 : Math.round((weights.progress || 0) * 100);
  const ready = engineReady && weightsDownloaded;

  // What is actually happening right now — drives every line in the popup.
  const stage = ready
    ? "ready"
    : weightsDownloading
      ? "weights"
      : engineInstalling
        ? "engine"
        : engineError
          ? "error"
          : engineReady
            ? "idle-weights"
            : "idle-engine";

  const start = () => {
    api?.installEngine?.().catch(() => {});
    api?.downloadWeights?.().catch(() => {});
  };

  return {
    available: !!api,
    status,
    engine,
    weights,
    engineReady,
    engineInstalling,
    engineError,
    weightsDownloaded,
    weightsDownloading,
    percent,
    ready,
    stage,
    engineStep: engine.step || null,
    received: weights.received || 0,
    total: weights.total || 0,
    sizeLabel: weights.sizeLabel || "~2.5 GB",
    start,
  };
}

const COPY = {
  weights: {
    title: "Your model is still downloading",
    body: "Ovio is pulling down Parakeet-TDT v3 so it can transcribe on this Mac. Recording unlocks the moment it lands — nothing to set up.",
  },
  engine: {
    title: "Getting your model ready",
    body: "Ovio is building its local transcription engine — a one-time install of Python packages. The model download starts right after.",
  },
  "idle-weights": {
    title: "One download left",
    body: "The engine is ready. Parakeet-TDT v3 still needs its model file before it can hear anything.",
  },
  "idle-engine": {
    title: "Parakeet isn’t installed yet",
    body: "Local transcription needs a one-time engine install plus the model file. Start it here and record as soon as it finishes.",
  },
  error: {
    title: "The local engine hit a problem",
    body: "The install didn’t finish, so recording can’t run on-device yet. Try again — the download picks up from the start.",
  },
  ready: {
    title: "Your model is ready",
    body: "Parakeet-TDT v3 is installed and runs on this Mac. Your voice never leaves the machine.",
  },
};

function Stepper({ setup }) {
  const steps = [
    { key: "Engine", done: setup.engineReady, active: setup.engineInstalling },
    {
      key: `Model · ${setup.sizeLabel}`,
      done: setup.weightsDownloaded,
      active: setup.weightsDownloading,
    },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {steps.map((s) => (
        <div
          key={s.key}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            border: `1px solid ${s.done ? COLORS.accent : COLORS.border}`,
            background: s.done ? COLORS.accentSoft : "transparent",
            color: s.done ? COLORS.text : s.active ? COLORS.textSecondary : COLORS.textTertiary,
            borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 550,
          }}
        >
          {s.done ? (
            <Check size={11} color={COLORS.accent} strokeWidth={3} />
          ) : (
            <span
              style={{
                width: 5, height: 5, borderRadius: 999,
                background: s.active ? COLORS.accent : COLORS.textTertiary,
                animation: s.active ? "ovioPulse 1.6s ease-in-out infinite" : "none",
              }}
            />
          )}
          {s.key}
        </div>
      ))}
    </div>
  );
}

export function ModelSetupModal({ setup, onClose, onReady }) {
  const copy = COPY[setup.stage] || COPY["idle-engine"];
  const busy = setup.stage === "weights" || setup.stage === "engine";
  const indeterminate = setup.stage === "engine";
  const showBar = setup.stage !== "error" && setup.stage !== "ready";

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stepLabel = setup.stage === "weights"
    ? "Downloading model file"
    : setup.stage === "engine"
      ? setup.engineStep === "packages"
        ? "Installing Python packages"
        : setup.engineStep === "venv"
          ? "Creating the engine environment"
          : setup.engineStep === "pip"
            ? "Preparing the package manager"
            : "Looking for Python"
      : "";

  const bytesLine = setup.stage === "weights"
    ? setup.total
      ? `${gb(setup.received) || "0.0 GB"} of ${gb(setup.total)}`
      : `${gb(setup.received) || "0.0 GB"} downloaded`
    : setup.stage === "engine"
      ? "Usually 5–15 minutes on the first run"
      : "";

  const primary = setup.stage === "ready"
    ? { label: "Start recording", onClick: () => onReady?.() }
    : setup.stage === "error" || setup.stage === "idle-engine" || setup.stage === "idle-weights"
      ? { label: setup.stage === "error" ? "Try again" : "Start download", onClick: setup.start }
      : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ovio-model-wait-title"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.42)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        padding: 24, fontFamily: FONT,
        animation: "ovioFadeIn 180ms ease both",
      }}
    >
      <div
        style={{
          width: 470, maxWidth: "100%",
          background: COLORS.surface,
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 26,
          padding: "26px 26px 22px",
          boxShadow: "0 30px 90px rgba(0,0,0,0.45)",
          animation: "ovioScaleIn 280ms cubic-bezier(.22,1,.36,1) both",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 13, flexShrink: 0,
            background: setup.stage === "error" ? "rgba(255,93,93,0.12)" : COLORS.accentSoft,
            border: `1px solid ${setup.stage === "error" ? "rgba(255,93,93,0.3)" : "transparent"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {setup.stage === "error"
              ? <AlertTriangle size={18} color={COLORS.red} />
              : setup.stage === "ready"
                ? <Check size={18} color={COLORS.accent} strokeWidth={2.6} />
                : <Download size={18} color={COLORS.accent} />}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
            <div id="ovio-model-wait-title" style={{
              fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em",
              color: COLORS.text, lineHeight: 1.25,
            }}>
              {copy.title}
            </div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: COLORS.textSecondary, marginTop: 8 }}>
              {setup.stage === "error" && setup.engine.error ? setup.engine.error : copy.body}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 26, height: 26, borderRadius: 999, border: "none",
              background: "transparent", color: COLORS.textTertiary,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surface2; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <Stepper setup={setup} />
        </div>

        {showBar && (
          <div style={{
            marginTop: 18, padding: "16px 16px 14px",
            background: COLORS.surface2, border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.text }}>
                {stepLabel}
              </div>
              <div style={{
                fontSize: 22, fontWeight: 300, letterSpacing: "-0.02em",
                color: COLORS.text, fontVariantNumeric: "tabular-nums",
              }}>
                {indeterminate ? "…" : `${setup.percent}%`}
              </div>
            </div>

            <div style={{
              position: "relative", height: 10, borderRadius: 999,
              background: COLORS.surface3, overflow: "hidden", marginTop: 10,
            }}>
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: 0,
                width: indeterminate ? "38%" : `${Math.max(setup.percent, 1.5)}%`,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.accentBright})`,
                transition: "width 700ms cubic-bezier(.22,1,.36,1)",
                animation: indeterminate ? "ovioBarSlide 1.7s cubic-bezier(.5,0,.5,1) infinite" : "none",
              }} />
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg, rgba(255,255,255,0) 30%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 70%)",
                backgroundSize: "220% 100%",
                animation: "ovioShimmer 2.2s linear infinite",
                pointerEvents: "none",
              }} />
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, marginTop: 9, fontSize: 11, color: COLORS.textTertiary,
            }}>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{bytesLine}</span>
              <span>Runs in the background</span>
            </div>
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginTop: 18,
        }}>
          <div style={{ fontSize: 11, color: COLORS.textTertiary, lineHeight: 1.5, maxWidth: 250 }}>
            {busy ? "Keep Ovio open — quitting pauses the install." : "You can use cloud transcription meanwhile in Settings."}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {primary && (
              <button
                onClick={primary.onClick}
                style={{
                  border: "none", borderRadius: 999, padding: "10px 18px",
                  background: CTA.bg, color: CTA.fg, fontFamily: FONT,
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  transition: "transform 160ms cubic-bezier(.16,1,.3,1), opacity 160ms ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.02)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
              >
                {primary.label}
              </button>
            )}
            {busy && (
              <button
                onClick={onClose}
                style={{
                  border: `1px solid ${COLORS.borderStrong}`, borderRadius: 999,
                  padding: "10px 18px", background: "transparent", color: COLORS.text,
                  fontFamily: FONT, fontSize: 12.5, fontWeight: 550, cursor: "pointer",
                }}
              >
                Got it — I’ll wait
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
