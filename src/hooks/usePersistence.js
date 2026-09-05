import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "ovio_data";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("[ovio] Failed to save to localStorage:", err.message);
  }
}

function loadPurged() {
  const data = loadFromStorage();
  if (!data) return data;
  const quickNotesIds = new Set(
    (data.projects || [])
      .filter((p) => p && p.name === "Quick Notes")
      .flatMap((p) => (p.subprojects || []).map((s) => s.id))
  );
  const projects = (data.projects || []).filter((p) => p && p.name !== "Quick Notes");
  const recordingsBySub = {};
  Object.entries(data.recordingsBySub || {}).forEach(([subId, recs]) => {
    if (!quickNotesIds.has(subId)) recordingsBySub[subId] = recs;
  });
  if (projects.length !== (data.projects || []).length ||
      Object.keys(recordingsBySub).length !== Object.keys(data.recordingsBySub || {}).length) {
    const cleaned = { projects, recordingsBySub };
    saveToStorage(cleaned);
    return cleaned;
  }
  return data;
}

export default function usePersistence() {
  const saved = useRef(loadPurged());
  const [projects, setProjects] = useState(saved.current?.projects || []);
  const [recordingsBySub, setRecordingsBySub] = useState(saved.current?.recordingsBySub || {});

  useEffect(() => {
    saveToStorage({ projects, recordingsBySub });
  }, [projects, recordingsBySub]);

  const clearAll = useCallback(() => {
    setProjects([]);
    setRecordingsBySub({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const exportData = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ projects, recordingsBySub }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ovio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [projects, recordingsBySub]);

  const importData = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.projects) setProjects(data.projects);
          if (data.recordingsBySub) setRecordingsBySub(data.recordingsBySub);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }, []);

  return {
    projects,
    setProjects,
    recordingsBySub,
    setRecordingsBySub,
    clearAll,
    exportData,
    importData,
  };
}
