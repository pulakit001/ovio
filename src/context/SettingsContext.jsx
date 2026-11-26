import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const SettingsContext = createContext(null);

// The four note sections embedded into every AI note (Settings → AI Behavior).
const DEFAULT_AI_BEHAVIOR = {
  customInstructions: "",
  skills: {
    overview: true,
    keyPoints: true,
    detailedSummary: true,
    followUps: true,
  },
  depth: "detailed",
};

// Older settings files used agent-skill ids — map anything still present
// forward so stale toggles can't break the shape.
function normalizeAiBehavior(raw) {
  return {
    ...DEFAULT_AI_BEHAVIOR,
    ...(raw || {}),
    skills: { ...DEFAULT_AI_BEHAVIOR.skills, ...((raw || {}).skills || {}) },
  };
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [actualKeys, setActualKeys] = useState({ openrouterKeys: [] });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      if (window.settingsAPI) {
        const s = await window.settingsAPI.get();
        const plain = await window.settingsAPI.getPlain();
        setSettings({
          mode: s.mode || "local",
          localSttModel: s.localSttModel || "parakeet",
          onboardingComplete: !!s.onboardingComplete,
          onboardingSkipped: !!s.onboardingSkipped,
          openrouterKeys: s.openrouterKeys || [],
          aiProvider: s.aiProvider || "cloud",
          localLlmModel: s.localLlmModel || "qwen2.5-3b",
          animations: s.animations || "full",
          theme: s.theme || "light",
          aiBehavior: normalizeAiBehavior(s.aiBehavior),
          legalVersion: s.legalVersion || 1,
          userName: s.userName || "",
          tourComplete: !!s.tourComplete,
        });
        setActualKeys({
          openrouterKeys: plain.openrouterKeys || [],
        });
      } else {
        setSettings({
          mode: "local",
          localSttModel: "parakeet",
          onboardingComplete: true,
          onboardingSkipped: false,
          openrouterKeys: [],
          aiProvider: "cloud",
          localLlmModel: "qwen2.5-3b",
        });
      }
    } catch (e) {
      setSettings({
        mode: "local",
        localSttModel: "parakeet",
        onboardingComplete: true,
        onboardingSkipped: false,
        openrouterKeys: [],
        aiProvider: "cloud",
        localLlmModel: "qwen2.5-3b",
      });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback(
    async (patch) => {
      if (window.settingsAPI) {
        const res = await window.settingsAPI.update(patch);
        if (!res || res.ok === false) throw new Error(res?.error || "Failed to save settings");
      }
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (patch.aiBehavior) next.aiBehavior = normalizeAiBehavior(patch.aiBehavior);
        return next;
      });
      return true;
    },
    []
  );

  // Only keys with actual (decrypted) key material count as usable — a stored
  // entry whose value could not be decrypted must not be treated as a key.
  const getActiveOpenRouterKeys = useCallback(() => {
    return actualKeys.openrouterKeys.filter((k) => (k.active || k.active === undefined) && k.key);
  }, [actualKeys]);

  const hasAnyKey = useCallback(() => {
    return actualKeys.openrouterKeys.some((k) => k.key);
  }, [actualKeys]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loaded,
        loading,
        refresh,
        update,
        getActiveOpenRouterKeys,
        hasAnyKey,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
