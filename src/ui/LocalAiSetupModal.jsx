import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, Sparkles, X } from "lucide-react";
import { COLORS, CTA, FONT } from "./theme";

function percent(model) {
  return Math.round(Math.max(0, Math.min(1, model?.progress || 0)) * 100);
}

// A single-purpose gate for local notes. It intentionally does not trap the
// user: downloads keep running in Electron after this panel is closed.
export function LocalAiSetupModal({ modelId, onClose }) {
  const [models, setModels] = useState([]);
  const [error, setError] = useState("");
  const api = window.electronAPI?.localLlm;
  const refresh = useCallback(async () => {
    try {
      const next = await api?.status?.();
      if (Array.isArray(next)) setModels(next);
    } catch (err) {
      setError(err?.message || "Ovio could not check the local model.");
    }
  }, [api]);

  useEffect(() => {
    refresh();
    const off = api?.onDownloadProgress?.(() => refresh());
    return () => off?.();
  }, [api, refresh]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const model = useMemo(() => models.find((entry) => entry.id === modelId), [models, modelId]);
  const ready = !!model?.downloaded;
  const downloading = !!model?.downloading;
  const start = async () => {
    setError("");
    try {
      await api?.download?.(modelId);
    } catch (err) {
      setError(err?.message || "The model download could not start. Try again.");
    } finally {
      refresh();
    }
  };

  const title = ready
    ? "Your local notes model is ready"
    : downloading
      ? "Your local notes model is downloading"
      : "Local notes need one download";
  const body = ready
    ? "You can close this panel and try your AI note action again. Everything stays on this device."
    : `Ovio needs ${model?.title || "this local model"} before it can write notes on-device. You can keep using the app while it downloads.`;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ovio-local-ai-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1250, display: "grid", placeItems: "center", padding: 24, background: "rgba(0,0,0,.38)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", fontFamily: FONT, animation: "ovioFadeIn 180ms ease both" }}
    >
      <section style={{ width: 452, maxWidth: "100%", padding: "24px 24px 20px", borderRadius: 22, color: COLORS.text, background: COLORS.surface, border: `1px solid ${COLORS.border}`, boxShadow: "0 24px 70px rgba(0,0,0,.28)", animation: "ovioScaleIn 260ms cubic-bezier(.22,1,.36,1) both" }}>
        <header style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
          <span style={{ width: 38, height: 38, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 11, color: COLORS.text, background: COLORS.surface2 }}>
            {ready ? <Check size={18} /> : <Sparkles size={18} />}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 id="ovio-local-ai-title" style={{ margin: 0, fontSize: 19, lineHeight: 1.3, letterSpacing: "-.021em", fontWeight: 600 }}>{title}</h2>
            <p style={{ margin: "7px 0 0", fontSize: 12.5, lineHeight: 1.62, color: COLORS.textSecondary }}>{body}</p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 26, height: 26, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: 7, color: COLORS.textTertiary, background: "transparent", cursor: "pointer" }}><X size={15} /></button>
        </header>

        {model && <div style={{ marginTop: 20, padding: 14, borderRadius: 13, border: `1px solid ${COLORS.border}`, background: COLORS.surface2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
            <span style={{ fontWeight: 650 }}>{model.title}</span>
            <span style={{ color: COLORS.textSecondary, whiteSpace: "nowrap" }}>{ready ? "Ready" : downloading ? `${percent(model)}%` : model.sizeLabel}</span>
          </div>
          <p style={{ margin: "4px 0 0", color: COLORS.textSecondary, fontSize: 11.5, lineHeight: 1.5 }}>{model.description}</p>
          {(downloading || ready) && <div style={{ height: 5, overflow: "hidden", marginTop: 12, borderRadius: 99, background: COLORS.border }}><div style={{ width: `${ready ? 100 : Math.max(percent(model), 1)}%`, height: "100%", borderRadius: 99, background: COLORS.text }} /></div>}
        </div>}

        {error && <p style={{ margin: "14px 0 0", color: COLORS.red, fontSize: 11.5, lineHeight: 1.5 }}>{error}</p>}
        {!model && !error && <p style={{ margin: "14px 0 0", color: COLORS.textSecondary, fontSize: 12 }}>Checking the installed models…</p>}

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 20 }}>
          <span style={{ maxWidth: 220, color: COLORS.textTertiary, fontSize: 11, lineHeight: 1.5 }}>Keep Ovio open while a download runs. Closing this panel does not cancel it.</span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {(downloading || ready) && <button onClick={onClose} style={{ padding: "9px 13px", border: `1px solid ${COLORS.borderStrong}`, borderRadius: 8, color: COLORS.text, background: "transparent", font: `500 12.5px ${FONT}`, cursor: "pointer" }}>{ready ? "Try again" : "Continue in background"}</button>}
            {!ready && !downloading && <button onClick={start} disabled={!model} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", border: "none", borderRadius: 8, opacity: model ? 1 : .5, color: CTA.fg, background: CTA.bg, font: `600 12.5px ${FONT}`, cursor: model ? "pointer" : "wait" }}><Download size={14} />Download model</button>}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
