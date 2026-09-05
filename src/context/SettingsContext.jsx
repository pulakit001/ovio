import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

const SettingsContext = createContext(null);

const DEFAULT_AGENT_SKILLS = {
  overview: true,
  keyTopics: true,
  explanations: true,
  importantDetails: true,
  actionItems: true,
  decisions: true,
  openQuestions: true,
};

// Older settings files used different skill ids — map them forward.
const SKILL_ALIASES = { meetingSummary: "overview", followUps: "actionItems" };

function normalizeAgentSkills(raw) {
  const merged = { ...DEFAULT_AGENT_SKILLS };
  for (const [k, v] of Object.entries(raw || {})) {
    const id = SKILL_ALIASES[k] || k;
    if (id in merged && typeof v === "boolean") merged[id] = v;
  }
  return merged;
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
          mode: s.mode || "hybrid",
          sttModel: s.sttModel || "whisper-large-v3-turbo",
          onboardingComplete: !!s.onboardingComplete,
          onboardingSkipped: !!s.onboardingSkipped,
          groqKeys: s.groqKeys || [],
          openrouterKeys: s.openrouterKeys || [],
          agentSkills: normalizeAgentSkills(s.agentSkills),
          aiProvider: s.aiProvider || "cloud",
          ollamaUrl: s.ollamaUrl || "http://localhost:11434",
          ollamaModel: s.ollamaModel || "",
        });
        setActualKeys({
          groqKeys: plain.groqKeys || [],
          openrouterKeys: plain.openrouterKeys || [],
        });
      } else {
        setSettings({
          mode: "hybrid",
          sttModel: "whisper-large-v3-turbo",
          onboardingComplete: true,
          onboardingSkipped: false,
          groqKeys: [],
          openrouterKeys: [],
          agentSkills: DEFAULT_AGENT_SKILLS,
          aiProvider: "cloud",
          ollamaUrl: "http://localhost:11434",
          ollamaModel: "",
        });
      }
    } catch (e) {
      setSettings({
        mode: "hybrid",
        sttModel: "whisper-large-v3-turbo",
        onboardingComplete: true,
        onboardingSkipped: false,
        groqKeys: [],
        openrouterKeys: [],
        agentSkills: DEFAULT_AGENT_SKILLS,
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
        if (patch.agentSkills) next.agentSkills = normalizeAgentSkills(patch.agentSkills);
        return next;
      });
      return true;
    },
    []
  );

  const getActiveGroqKeys = useCallback(() => {
    return actualKeys.groqKeys.filter((k) => k.active || k.active === undefined);
  }, [actualKeys]);

  const getActiveOpenRouterKeys = useCallback(() => {
    return actualKeys.openrouterKeys.filter((k) => k.active || k.active === undefined);
  }, [actualKeys]);

  const hasAnyKey = useCallback(() => {
    return actualKeys.groqKeys.length > 0 || actualKeys.openrouterKeys.length > 0;
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
