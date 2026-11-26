// Local STT setup: live Parakeet state + the "please wait" popup.
//
// Pressing record while the engine/weights are still installing must never
// start a half-working session (that used to surface as a red error line at
// the bottom of the recorder). Instead the recorder asks `useLocalModelSetup`
// whether the local model is usable, and opens `ModelSetupModal` — a quiet
// progress card with the stage, percentage, bytes and time left.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { COLORS, CTA, FONT } from "./theme";

// 1.2 GB / 2.5 GB — binary units, one decimal.
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
    body: "Ovio is pulling Parakeet-TDT v3 onto this Mac. Recording turns on the moment it finishes.",
  },
  engine: {
    title: "Getting your model ready",
    body: "Ovio is installing its local transcription engine. The model download starts right after.",
  },
  "idle-weights": {
    title: "One download left",
    body: "The engine is in place. Parakeet-TDT v3 still needs its model file before it can hear anything.",
  },
  "idle-engine": {
    title: "Parakeet isn’t installed yet",
    body: "Local transcription needs a one-time engine install plus the model file. Start it here and record as soon as it finishes.",
  },
  error: {
    title: "The local engine hit a problem",
    body: "The install didn’t finish, so recording can’t run on-device yet. Trying again starts it over.",
  },
  ready: {
    title: "Your model is ready",
    body: "Parakeet-TDT v3 is installed and runs on this Mac. Your voice never leaves the machine.",
  },
};

function timeLeft(setup, rate) {
  if (!setup.total) return rate > 0 ? `${(rate / 1048576).toFixed(1)} MB/s` : "";
  const seconds = rate > 0 ? (setup.total - setup.received) / rate : 0;
  if (seconds > 90) return `about ${Math.round(seconds / 60)} min left`;
  if (seconds > 0) return "under a minute left";
  return "";
}

export function ModelSetupModal({ setup, onClose, onReady }) {
  const copy = COPY[setup.stage] || COPY["idle-engine"];
  const busy = setup.stage === "weights" || setup.stage === "engine";
  const indeterminate = setup.stage === "engine";
  const showBar = setup.stage !== "error" && setup.stage !== "ready";

  // Rolling download speed — gives an honest "time left" instead of a label
  // that only restates the percentage.
  const [rate, setRate] = useState(0);
  const sampleRef = useRef({ at: Date.now(), bytes: setup.received });
  useEffect(() => {
    const now = Date.now();
    const elapsed = (now - sampleRef.current.at) / 1000;
    const delta = setup.received - sampleRef.current.bytes;
    if (elapsed < 1 || delta <= 0) return;
    const instant = delta / elapsed;
    sampleRef.current = { at: now, bytes: setup.received };
    setRate((prev) => (prev ? prev * 0.6 + instant * 0.4 : instant));
  }, [setup.received]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stepLabel = setup.stage === "weights"
    ? "Downloading the model"
    : setup.stage === "engine"
      ? setup.engineStep === "packages"
        ? "Installing Python packages"
        : setup.engineStep === "venv"
          ? "Creating the engine environment"
          : setup.engineStep === "pip"
            ? "Preparing the package manager"
            : "Looking for Python"
      : "";

  const detail = setup.stage === "weights"
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
        background: "rgba(0,0,0,0.38)",
        backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
        padding: 24, fontFamily: FONT,
        animation: "ovioFadeIn 180ms ease both",
      }}
    >
      <div
        style={{
          width: 460, maxWidth: "100%",
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 22,
          padding: "24px 24px 20px",
          boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
          animation: "ovioScaleIn 260ms cubic-bezier(.22,1,.36,1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div id="ovio-model-wait-title" style={{
              fontSize: 19, fontWeight: 600, letterSpacing: "-0.021em",
              color: COLORS.text, lineHeight: 1.3,
            }}>
              {copy.title}
            </div>
            <div style={{
              fontSize: 12.5, lineHeight: 1.62, color: COLORS.textSecondary, marginTop: 7,
            }}>
              {copy.body}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 24, height: 24, borderRadius: 6, border: "none",
              background: "transparent", color: COLORS.textTertiary,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0, marginTop: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textTertiary; }}
          >
            <X size={14} />
          </button>
        </div>

        {setup.stage === "error" && setup.engine.error && (
          <div style={{
            marginTop: 14, fontSize: 11.5, lineHeight: 1.55, color: COLORS.red,
            wordBreak: "break-word",
          }}>
            {setup.engine.error}
          </div>
        )}

        {showBar && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 12.5, color: COLORS.text }}>{stepLabel}</div>
              <div style={{
                fontSize: 12.5, color: COLORS.textSecondary,
                fontVariantNumeric: "tabular-nums",
              }}>
                {indeterminate ? "" : `${setup.percent}%`}
              </div>
            </div>

            <div style={{
              position: "relative", height: 6, borderRadius: 3,
              background: COLORS.surface3, overflow: "hidden", marginTop: 8,
            }}>
              <div style={{
                position: "absolute", top: 0, bottom: 0, left: 0,
                width: indeterminate ? "34%" : `${Math.max(setup.percent, 1)}%`,
                background: COLORS.accent,
                animation: indeterminate ? "ovioBarSlide 1.7s cubic-bezier(.5,0,.5,1) infinite" : "none",
              }} />
            </div>

            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, marginTop: 8, fontSize: 11,
              color: COLORS.textTertiary, fontVariantNumeric: "tabular-nums",
            }}>
              <span>{detail}</span>
              <span>{setup.stage === "weights" ? timeLeft(setup, rate) : ""}</span>
            </div>
          </div>
        )}

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginTop: 20,
        }}>
          <div style={{ fontSize: 11, color: COLORS.textTertiary, lineHeight: 1.5, maxWidth: 240 }}>
            {busy ? "Keep Ovio open — quitting pauses the install." : "You can keep using Ovio while a model installs."}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {primary && (
              <button
                onClick={primary.onClick}
                style={{
                  border: "none", borderRadius: 8, padding: "9px 16px",
                  background: CTA.bg, color: CTA.fg, fontFamily: FONT,
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                }}
              >
                {primary.label}
              </button>
            )}
            {busy && (
              <button
                onClick={onClose}
                style={{
                  border: `1px solid ${COLORS.borderStrong}`, borderRadius: 8,
                  padding: "9px 16px", background: "transparent", color: COLORS.text,
                  fontFamily: FONT, fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                }}
              >
                Continue in background
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
