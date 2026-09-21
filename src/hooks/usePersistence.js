import { useState, useEffect, useCallback, useRef } from "react";

// Durable persistence — disk-backed via the main process (window.electronAPI.store).
//
// Why: localStorage on a packaged Electron app is flushed to disk lazily and
// has been observed to come back EMPTY after a normal quit — new users close
// the app and their recordings/notes are gone. Every collection now lives in
// userData/library/*.json, written atomically (temp + rename) on every change.
// localStorage remains only as a one-time migration source for existing users.

const STORAGE_KEY = "ovio_data";
const DISK_KEY = "library";
const VAULT_KEY = "ovio_vault";
const VAULT_DISK_KEY = "vault";

function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

// ---------- in-memory cache module (single source of truth per key) ----------
const caches = {};          // DISK_KEY -> { projects, recordingsBySub } | null
const loaded = {};          // key -> boolean
const loadingPromises = {}; // key -> Promise (dedupe concurrent loads)
const subscribers = {};     // key -> Set<fn>

function emit(key) {
  (subscribers[key] || new Set()).forEach((fn) => fn(caches[key]));
}

export function subscribeStore(key, fn) {
  if (!subscribers[key]) subscribers[key] = new Set();
  subscribers[key].add(fn);
  if (loaded[key]) fn(caches[key]);
  return () => subscribers[key].delete(fn);
}

export async function ensureLoaded(key) {
  if (loaded[key]) return caches[key];
  if (loadingPromises[key]) return loadingPromises[key];
  loadingPromises[key] = (async () => {
    let value = null;
    try {
      if (window.electronAPI?.store) {
        value = await window.electronAPI.store.read(key);
        // One-time migration: disk empty but localStorage has data → persist it.
        if (value == null) {
          const lsKey = key === VAULT_DISK_KEY ? VAULT_KEY : STORAGE_KEY;
          const legacy = readLS(lsKey);
          if (legacy) {
            await window.electronAPI.store.importOnce(key, legacy);
            value = await window.electronAPI.store.read(key);
          }
        }
      } else {
        value = readLS(key === VAULT_DISK_KEY ? VAULT_KEY : STORAGE_KEY);
      }
    } catch (e) {
      console.warn("[ovio] store load failed:", e?.message);
    }
    caches[key] = value;
    loaded[key] = true;
    emit(key);
    return value;
  })();
  return loadingPromises[key];
}

export async function writeStore(key, value) {
  caches[key] = value;
  loaded[key] = true;
  emit(key);
  try {
    if (window.electronAPI?.store) await window.electronAPI.store.write(key, value);
    else localStorage.setItem(key === VAULT_DISK_KEY ? VAULT_KEY : STORAGE_KEY, JSON.stringify(value));
  } catch (e) {
    console.warn("[ovio] store write failed:", e?.message);
  }
}

// ---------- hook: projects + recordings ----------
function loadPurged(data) {
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
  return { projects, recordingsBySub };
}

export default function usePersistence() {
  const [data, setDataState] = useState(null); // null = still loading from disk
  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    ensureLoaded(DISK_KEY).then((value) => {
      if (!alive) return;
      hydrated.current = true;
      setDataState(loadPurged(value || { projects: [], recordingsBySub: {} }));
    });
    const off = subscribeStore(DISK_KEY, (v) => {
      if (hydrated.current && alive) setDataState(loadPurged(v || { projects: [], recordingsBySub: {} }));
    });
    return () => { alive = false; off(); };
  }, []);

  const persist = useCallback((next) => {
    writeStore(DISK_KEY, next);
  }, []);

  const setProjects = useCallback((updater) => {
    setDataState((prev) => {
      const base = prev || { projects: [], recordingsBySub: {} };
      const projects = typeof updater === "function" ? updater(base.projects) : updater;
      const next = { ...base, projects };
      persist(next);
      return next;
    });
  }, [persist]);

  const setRecordingsBySub = useCallback((updater) => {
    setDataState((prev) => {
      const base = prev || { projects: [], recordingsBySub: {} };
      const recordingsBySub = typeof updater === "function" ? updater(base.recordingsBySub) : updater;
      const next = { ...base, recordingsBySub };
      persist(next);
      return next;
    });
  }, [persist]);

  const clearAll = useCallback(() => {
    setDataState({ projects: [], recordingsBySub: {} });
    writeStore(DISK_KEY, { projects: [], recordingsBySub: {} });
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const exportData = useCallback(() => {
    const src = data || { projects: [], recordingsBySub: {} };
    const blob = new Blob([JSON.stringify(src, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ovio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data]);

  const importData = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          const next = {
            projects: parsed.projects || [],
            recordingsBySub: parsed.recordingsBySub || {},
          };
          setDataState(next);
          writeStore(DISK_KEY, next);
          resolve();
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }, []);

  return {
    // While the disk read is in flight report empty state — callers render
    // onboarding/dashboard normally; content appears within milliseconds.
    projects: data?.projects || [],
    recordingsBySub: data?.recordingsBySub || {},
    setProjects,
    setRecordingsBySub,
    clearAll,
    exportData,
    importData,
  };
}
