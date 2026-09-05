import { useState, useRef, useCallback, useEffect } from "react";
import { generateNotes } from "../services/groq";
import { useSettings } from "../context/SettingsContext";

const DEBOUNCE_MS = 6000;

export default function useAutoNotes(transcript, isTranscribing) {
  const { getActiveGroqKeys, getActiveOpenRouterKeys, settings } = useSettings();
  const [aiNotes, setAiNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notesProvider, setNotesProvider] = useState("");
  const [error, setError] = useState("");

  const timerRef = useRef(null);
  const lastSigRef = useRef("");
  const transcriptRef = useRef(transcript);
  const busyRef = useRef(false);
  const rerunRef = useRef(false);
  const aliveRef = useRef(true);
  const keysRef = useRef({ groqKeys: [], openrouterKeys: [], agentSkills: {}, aiProvider: "cloud", ollama: null });
  const runRef = useRef(null);

  transcriptRef.current = transcript;
  keysRef.current = {
    groqKeys: [],
    openrouterKeys: [],
    agentSkills: settings?.agentSkills || {},
    aiProvider: settings?.aiProvider || "cloud",
    ollama: { url: settings?.ollamaUrl, model: settings?.ollamaModel },
  };

  const run = useCallback(async () => {
    try {
      const plain = await window.settingsAPI.getPlain();
      keysRef.current = {
        groqKeys: plain.groqKeys || [],
        openrouterKeys: plain.openrouterKeys || [],
        agentSkills: settings?.agentSkills || {},
        aiProvider: plain.aiProvider || settings?.aiProvider || "cloud",
        ollama: { url: plain.ollamaUrl || settings?.ollamaUrl, model: plain.ollamaModel || settings?.ollamaModel },
      };
    } catch {}
    if (busyRef.current) {
      rerunRef.current = true;
      return;
    }
    if (transcriptRef.current.length === 0) return;

    busyRef.current = true;
    setIsGenerating(true);
    setError("");
    try {
      const snapshot = transcriptRef.current;
      const result = await generateNotes(keysRef.current, snapshot);
      if (!aliveRef.current) return;
      const text = typeof result === "string" ? result : result?.text || "";
      setAiNotes(text);
      setNotesProvider(typeof result === "object" ? result?.keyName || result?.provider || "" : "");
      setLastUpdated(Date.now());
    } catch (err) {
      if (aliveRef.current) {
        setError(err.message || "Failed to generate notes");
      }
    } finally {
      busyRef.current = false;
      if (!aliveRef.current) return;
      if (rerunRef.current) {
        rerunRef.current = false;
        setImmediate(() => runRef.current());
      } else {
        setIsGenerating(false);
      }
    }
  }, [settings]);

  runRef.current = run;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const sig = transcript.map((l) => `${l.time}|${l.text}`).join("\n");
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (transcript.length > 0) {
      timerRef.current = setTimeout(() => run(), DEBOUNCE_MS);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [transcript, run]);

  return {
    aiNotes,
    isGenerating,
    lastUpdated,
    notesProvider,
    error,
    regenerate: () => {
      if (busyRef.current) {
        rerunRef.current = true;
      } else {
        runRef.current();
      }
    },
  };
}
