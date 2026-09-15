import { useState, useRef, useCallback, useEffect } from "react";
import { generateNotes, generateFolderNotes } from "../services/ai";
import { useSettings } from "../context/SettingsContext";

const DEBOUNCE_MS = 6000;

// Fresh API keys are read straight from the main process on every run — the
// React-context copy can go stale if keys were added or changed mid-session.
async function fetchKeys(settings) {
  try {
    const plain = await window.settingsAPI.getPlain();
    return {
      groqKeys: plain.groqKeys || [],
      openrouterKeys: plain.openrouterKeys || [],
      aiProvider: plain.aiProvider || settings?.aiProvider || "cloud",
      ollama: {
        url: plain.ollamaUrl || settings?.ollamaUrl,
        model: plain.ollamaModel || settings?.ollamaModel,
      },
      // Settings → AI Behavior rides along to every notes/chat call.
      aiBehavior: plain.aiBehavior || settings?.aiBehavior || {},
    };
  } catch {
    return {
      groqKeys: [],
      openrouterKeys: [],
      aiProvider: settings?.aiProvider || "cloud",
      ollama: { url: settings?.ollamaUrl, model: settings?.ollamaModel },
      aiBehavior: settings?.aiBehavior || {},
    };
  }
}

export default function useAutoNotes(transcript, isTranscribing) {
  const { getActiveGroqKeys, getActiveOpenRouterKeys, settings } = useSettings();
  const [aiNotes, setAiNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // Live pipeline progress: { stage, part, totalParts, percent } — drives the
  // animated generation UI (stage labels, agent counter, percent bar).
  const [progress, setProgress] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [notesProvider, setNotesProvider] = useState("");
  const [error, setError] = useState("");
  // What aiNotes currently holds: "recording" (single live transcript) or
  // "folder" (ONE combined note from every recording in a subproject).
  const [notesMode, setNotesMode] = useState("recording");

  const timerRef = useRef(null);
  const lastSigRef = useRef("");
  const transcriptRef = useRef(transcript);
  const busyRef = useRef(false);
  const rerunRef = useRef(false);
  const aliveRef = useRef(true);
  const keysRef = useRef({ groqKeys: [], openrouterKeys: [], aiProvider: "cloud", ollama: null });
  const runRef = useRef(null);
  // When set, generation builds ONE combined note from these recordings
  // instead of the live single transcript: { label, recordings: [...] }.
  const folderSourceRef = useRef(null);

  transcriptRef.current = transcript;
  keysRef.current = {
    groqKeys: [],
    openrouterKeys: [],
    aiProvider: settings?.aiProvider || "cloud",
    ollama: { url: settings?.ollamaUrl, model: settings?.ollamaModel },
  };

  const run = useCallback(async () => {
    keysRef.current = await fetchKeys(settings);
    if (busyRef.current) {
      rerunRef.current = true;
      return;
    }
    const folderSource = folderSourceRef.current;
    if (!folderSource && transcriptRef.current.length === 0) return;

    busyRef.current = true;
    setIsGenerating(true);
    setProgress(null);
    setError("");
    try {
      const result = folderSource
        ? await generateFolderNotes(keysRef.current, folderSource.recordings, (p) => {
            if (aliveRef.current) setProgress(p);
          })
        : await generateNotes(keysRef.current, transcriptRef.current, (p) => {
            if (aliveRef.current) setProgress(p);
          });
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
      setProgress(null);
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
    // Folder mode: the combined note is generated on demand only — never let
    // the per-recording auto-summary clobber it.
    if (folderSourceRef.current) return;
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

  // Kick off ONE combined note for a whole subproject. recordings: array of
  // { label, transcript, notes, aiNotes }.
  const startFolderNotes = (recordings, label = "Folder") => {
    folderSourceRef.current = { label, recordings };
    setNotesMode("folder");
    setError("");
    if (busyRef.current) rerunRef.current = true;
    else runRef.current();
  };

  // Leave folder mode; if a live transcript is loaded, regenerate its own
  // notes so the panel doesn't keep showing the stale combined note.
  const clearFolderNotes = () => {
    if (!folderSourceRef.current) return;
    folderSourceRef.current = null;
    setNotesMode("recording");
    if (transcriptRef.current.length > 0 && !busyRef.current) runRef.current();
  };

  return {
    aiNotes,
    isGenerating,
    progress,
    lastUpdated,
    notesProvider,
    error,
    notesMode,
    startFolderNotes,
    clearFolderNotes,
    regenerate: () => {
      if (busyRef.current) {
        rerunRef.current = true;
      } else {
        runRef.current();
      }
    },
  };
}
