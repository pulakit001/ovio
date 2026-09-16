import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { FONT, COLORS } from "../ui/theme";

// UpdatePrompt — the app's update + remote-message popup.
//
// Two triggers arrive from the main process (electron/updater.cjs):
//  • updater:update   → a newer GitHub release exists. Card offers the
//                       always-latest DMG (Apple-signed the moment the cert
//                       exists). "Later" hides it until the next check.
//  • updater:message  → YOU pushed a message to .updater/message.json in the
//                       repo. Every running Ovio pops it once. Optionally with
//                       a CTA button.
//
// Design: native-Mac feel — quiet panel, hairline border, one accent button,
// springy entrance, portal'd above everything, Escape dismisses.

export default function UpdatePrompt() {
  const [update, setUpdate] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const api = window.electronAPI?.updater;
    if (!api) return undefined;
    const offU = api.onUpdateAvailable?.((info) => setUpdate(info));
    const offM = api.onRemoteMessage?.((msg) => setMessage(msg));
    const onKey = (e) => {
      if (e.key === "Escape") { setUpdate(null); setMessage(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      offU?.(); offM?.();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const card = update || message;
  if (!card) return null;
  const isUpdate = Boolean(update);

  const dismiss = () => { setUpdate(null); setMessage(null); };

  const open = (url) => {
    if (url) window.electronAPI?.updater?.openPage?.(url);
    dismiss();
  };

  const firstLine = (isUpdate ? card.notes : card.body || "")
    .split("\n").map((l) => l.replace(/^[-*#>\s]+/, "").trim()).filter(Boolean)[0] || "";

  return createPortal(
    <div
      onClick={dismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", alignItems: "flex-end", justifyContent: "flex-end",
        padding: 22,
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        animation: "fadeUi 0.2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 340,
          background: COLORS.surface,
          border: `1px solid ${COLORS.borderStrong}`,
          borderRadius: 16,
          boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
          padding: "18px 18px 16px",
          fontFamily: FONT,
          animation: "popUpdate 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, flex: "none",
            background: COLORS.accentSoft,
            border: "1px solid rgba(10,132,255,0.4)",
            display: "grid", placeItems: "center",
            fontSize: 14, color: COLORS.blueBright, fontWeight: 700,
          }}>
            {isUpdate ? "↑" : "●"}
          </div>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: COLORS.text, letterSpacing: "-0.01em" }}>
            {isUpdate ? `Ovio ${card.version} is out` : card.title}
          </div>
        </div>

        <p style={{
          fontSize: 12.5, lineHeight: 1.55, color: COLORS.textSecondary,
          margin: "0 0 14px", letterSpacing: "-0.005em",
          display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {isUpdate
            ? (firstLine || "A new version is available — with fixes and improvements.")
            : firstLine}
        </p>

        <div style={{ display: "flex", gap: 8 }}>
          {isUpdate ? (
            <>
              <button
                onClick={() => open(card.url)}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                  border: "1px solid transparent",
                  background: `linear-gradient(180deg, ${COLORS.blueBright}, ${COLORS.blue})`,
                  color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: FONT,
                  letterSpacing: "-0.005em",
                }}
              >
                Download
              </button>
              <button
                onClick={dismiss}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${COLORS.borderStrong}`,
                  background: "transparent",
                  color: COLORS.textSecondary, fontSize: 13, fontWeight: 500, fontFamily: FONT,
                }}
              >
                Later
              </button>
            </>
          ) : (
            <>
              {card.ctaUrl && card.ctaLabel ? (
                <button
                  onClick={() => open(card.ctaUrl)}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                    border: "1px solid transparent",
                    background: `linear-gradient(180deg, ${COLORS.blueBright}, ${COLORS.blue})`,
                    color: "#fff", fontSize: 13, fontWeight: 600, fontFamily: FONT,
                  }}
                >
                  {card.ctaLabel}
                </button>
              ) : null}
              <button
                onClick={dismiss}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                  border: `1px solid ${COLORS.borderStrong}`,
                  background: "transparent",
                  color: COLORS.textSecondary, fontSize: 13, fontWeight: 500, fontFamily: FONT,
                }}
              >
                Got it
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes popUpdate { from { opacity: 0; transform: translateY(18px) scale(0.96); } to { opacity: 1; transform: none; } }
        @keyframes fadeUi { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          [style*="popUpdate"], [style*="fadeUi"] { animation: none !important; }
        }
      `}</style>
    </div>,
    document.body
  );
}
