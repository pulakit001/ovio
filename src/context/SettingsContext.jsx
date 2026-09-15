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
  const [actualKeys, setActualKeys] = useState({ groqKeys: [], openrouterKeys: [] });
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      if (window.settingsAPI) {
        const s = await window.settingsAPI.get();
        const plain = await window.settingsAPI.getPlain();
        setSettings({
          mode: s.mode || "local",
          sttModel: s.sttModel || "whisper-large-v3-turbo",
          localSttModel: s.localSttModel || "large",
          onboardingComplete: !!s.onboardingComplete,
          onboardingSkipped: !!s.onboardingSkipped,
          groqKeys: s.groqKeys || [],
          openrouterKeys: s.openrouterKeys || [],
          aiProvider: s.aiProvider || "cloud",
          ollamaUrl: s.ollamaUrl || "http://localhost:11434",
          ollamaModel: s.ollamaModel || "",
          // New backend-backed settings surfaces (Settings tab).
          ambient: s.ambient || { enabled: true, chords: ["CommandOrControl+Shift+Space", "Alt+Shift+Space"] },
          animations: s.animations || "full",
          theme: s.theme || "dark",
          aiBehavior: normalizeAiBehavior(s.aiBehavior),
          legalVersion: s.legalVersion || 1,
        });
        setActualKeys({
          groqKeys: plain.groqKeys || [],
          openrouterKeys: plain.openrouterKeys || [],
        });
      } else {
        setSettings({
          mode: "local",
          sttModel: "whisper-large-v3-turbo",
          localSttModel: "large",
          onboardingComplete: true,
          onboardingSkipped: false,
          groqKeys: [],
          openrouterKeys: [],
          aiProvider: "cloud",
          ollamaUrl: "http://localhost:11434",
          ollamaModel: "",
        });
      }
    } catch (e) {
      setSettings({
        mode: "local",
        sttModel: "whisper-large-v3-turbo",
        localSttModel: "large",
        onboardingComplete: true,
        onboardingSkipped: false,
        groqKeys: [],
        openrouterKeys: [],
        aiProvider: "cloud",
        ollamaUrl: "http://localhost:11434",
        ollamaModel: "",
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
  const getActiveGroqKeys = useCallback(() => {
    return actualKeys.groqKeys.filter((k) => (k.active || k.active === undefined) && k.key);
  }, [actualKeys]);

  const getActiveOpenRouterKeys = useCallback(() => {
    return actualKeys.openrouterKeys.filter((k) => (k.active || k.active === undefined) && k.key);
  }, [actualKeys]);

  const hasAnyKey = useCallback(() => {
    return actualKeys.groqKeys.some((k) => k.key) || actualKeys.openrouterKeys.some((k) => k.key);
  }, [actualKeys]);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        loaded,
        loading,
        refresh,
        update,
        getActiveGroqKeys,
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
