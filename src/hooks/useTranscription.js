import { useState, useRef, useCallback, useEffect } from "react";
import { transcribePcmCloud } from "../services/groqStt";
import { useSettings } from "../context/SettingsContext";

const SAMPLE_RATE = 16000;
const CHUNK_MS = 5000;   // longer chunks give the model more context → better accuracy
const OVERLAP_MS = 1000; // audio re-sent with the next chunk so boundary words aren't lost
const WINDOW_MS = 2 * 60 * 1000;
let windowRef = { id: -1 };

// Which STT engine new audio should be routed to, derived LIVE from the current
// settings. "cloud" = Groq chunks, "whisper" = local whisper chunks,
// "parakeet" = the native streaming sidecar (local). Used at start() AND when
// the user flips Transcription Mode / Local STT Model mid-recording.
function desiredEngineFor(mode, localSttModel) {
  if ((mode || "local") !== "local") return "cloud";
  return (localSttModel || "large") === "parakeet" ? "parakeet" : "whisper";
}

export default function useTranscription() {
  const { settings, getActiveGroqKeys } = useSettings();
  const [transcript, setTranscript] = useState([]);
  const [interim, setInterim] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState("");
  // Which STT engine is actually producing text right now:
  // "parakeet" | "whisper-large" | "cloud" | null (idle / unknown yet).
  const [activeEngine, setActiveEngine] = useState(null);

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const bufferRef = useRef(null);
  const lastTickRef = useRef(0);
  const runningRef = useRef(false);
  const tickerRef = useRef(null);

  const userStoppedRef = useRef(false);

  // Live plumbing: the transcription FSMs (pump/tick, the Parakeet WS and the
  // engine-switch effect) are all memoized, so they must NOT read `settings`
  // from a stale render closure. These refs hold the current snapshot, and
  // targetRef tracks which engine OWNS new audio right now.
  const settingsRef = useRef(settings);
  const keysRef = useRef(getActiveGroqKeys);
  keysRef.current = getActiveGroqKeys;
  const targetRef = useRef("whisper");
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // --- Parakeet streaming state ---
  const wsRef = useRef(null);            // live WebSocket to the sidecar
  const parakeetActiveRef = useRef(false); // true while the WS path owns audio
  const pkQueueRef = useRef([]);         // audio buffered until the WS opens
  const PK_FLUSH_TIMEOUT_MS = 15000;

  const clearInterim = useCallback(() => setInterim(""), []);

  const cleanup = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    parakeetActiveRef.current = false;
    pkQueueRef.current = [];
    bufferRef.current = new Float32Array(0);
  }, []);

  // Append a finalized piece of text to the transcript (whisper chunks and
  // Parakeet committed segments both funnel through here).
  const appendFinal = useCallback((text) => {
    const trimmed = (text || "").trim();
    if (!trimmed) return;
    setTranscript((prev) => {
      const now = Date.now();
      const winId = Math.floor(now / WINDOW_MS);
      const last = prev[prev.length - 1];
      if (last && windowRef.current.id === winId) {
        return prev.map((e, i) =>
          i === prev.length - 1
            ? { ...e, text: e.text ? `${e.text} ${trimmed}` : trimmed }
            : e
        );
      }
      windowRef.current = { id: winId };
      return [...prev, { time: formatClock(now), text: trimmed }];
    });
  }, []);

  // Start the Parakeet sidecar stream. Returns true when the WS path is live.
  const tryStartParakeet = useCallback(async () => {
    try {
      const api = window.electronAPI?.parakeetAPI;
      if (!api) return false;
      const ep = await api.ensureServer();
      if (!ep?.port) return false;

      const ws = new WebSocket(`ws://127.0.0.1:${ep.port}/stream`);
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("Parakeet stream timed out")), 10000);
        ws.onopen = () => { clearTimeout(t); resolve(); };
        ws.onerror = () => { clearTimeout(t); reject(new Error("Parakeet stream failed to connect")); };
      });

      ws.send(JSON.stringify({ type: "start" }));
      parakeetActiveRef.current = true;
      setActiveEngine("parakeet");

      // Audio that arrived while the socket was opening.
      const queued = pkQueueRef.current;
      pkQueueRef.current = [];
      for (const chunk of queued) {
        try { ws.send(chunk.buffer); } catch {}
      }

      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "partial") {
          if (runningRef.current) setInterim(m.text || "");
        } else if (m.type === "final") {
          if (runningRef.current) {
            appendFinal(m.text);
            setInterim("");
          }
        } else if (m.type === "error") {
          console.warn("[ovio] parakeet stream error:", m.message);
        }
      };

      ws.onclose = () => {
        if (parakeetActiveRef.current) {
          // Unexpected drop mid-session — fall back to the Whisper chunk path
          // for everything recorded from this point on.
          parakeetActiveRef.current = false;
          wsRef.current = null;
          if (runningRef.current) {
            console.warn("[ovio] Parakeet stream closed — falling back to Whisper chunking");
            setActiveEngine("whisper-large");
            lastTickRef.current = Date.now();
            tickerRef.current = setInterval(tick, 500);
          }
        }
      };

      return true;
    } catch (err) {
      console.warn("[ovio] Parakeet unavailable, using Whisper:", err.message);
      parakeetActiveRef.current = false;
      wsRef.current = null;
      return false;
    }
  }, [appendFinal]);

  // Tell the sidecar to flush the tail of the session and wait for the final
  // text (the regular onmessage handler above appends it).
  const flushParakeet = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    await new Promise((resolve) => {
      const t = setTimeout(resolve, PK_FLUSH_TIMEOUT_MS);
      const onMsg = (ev) => {
        try {
          if (JSON.parse(ev.data)?.type === "stopped") {
            clearTimeout(t);
            resolve();
          }
        } catch {}
      };
      ws.addEventListener("message", onMsg);
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch {
        clearTimeout(t);
        resolve();
      }
    });
    try { ws.close(); } catch {}
    wsRef.current = null;
    parakeetActiveRef.current = false;
  }, []);

  const stop = useCallback(async () => {
    // Flush the Parakeet tail BEFORE tearing anything down, so the last
    // segment lands in the transcript.
    if (parakeetActiveRef.current) {
      try { await flushParakeet(); } catch {}
    }
    runningRef.current = false;
    queueRef.current = [];
    setIsTranscribing(false);
    setActiveEngine(null); // label is re-confirmed on the next session
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
    cleanup();
    setInterim("");
  }, [cleanup, flushParakeet]);

  const transcribeChunk = useCallback(
    async (chunk) => {
      // Read settings/K-eys live so a mid-recording Mode switch is honored by
      // every chunk, even though this callback is memoized across renders.
      const s = settingsRef.current || {};
      const mode = s.mode || "local";
      const useCloud = mode === "cloud" || !window.electronAPI;
      const groqKeys = keysRef.current();
      // (Voice-profile biasing was removed from Settings — no per-user prompt.)

      try {
        let text = "";
        const localModel = s.localSttModel === "parakeet" ? "large" : (s.localSttModel || "large");
        if (useCloud) {
          if (!groqKeys[0]?.key) throw new Error("No Groq key for cloud transcription");
          // Rotate across every active key; transcribePcmCloud retries 429s.
          setActiveEngine("cloud");
          text = await transcribePcmCloud(chunk, groqKeys, {
            model: s.sttModel || "whisper-large-v3-turbo",
          });
        } else {
          // Local mode: on-device Whisper only — audio never leaves the Mac.
          setActiveEngine("whisper-large");
          text = await window.electronAPI.transcribePcm(chunk, localModel);
        }

        if (runningRef.current && text) {
          appendFinal(text);
        }
      } catch (err) {
        if (runningRef.current) {
          setError(err.message || "Transcription failed");
        }
      }
    },
    [appendFinal]
  );

  // Serial FIFO pump: chunks are NEVER dropped while a transcription is in
  // flight (the old code discarded any chunk that arrived while busy — audio
  // and all). If the backlog grows past the cap (e.g. a long rate-limit
  // window), the oldest pending chunks are merged into one so no audio is
  // lost and memory stays bounded.
  const MAX_QUEUE = 24; // ~2 minutes of audio at 5s chunks
  const pumpRef = useRef(false);
  const queueRef = useRef([]);

  const pump = useCallback(async () => {
    if (pumpRef.current) return;
    pumpRef.current = true;
    try {
      while (runningRef.current && queueRef.current.length > 0) {
        if (queueRef.current.length > MAX_QUEUE) {
          const overflow = queueRef.current.splice(0, queueRef.current.length - MAX_QUEUE);
          const mergedLen = overflow.reduce((n, c) => n + c.length, 0);
          const merged = new Float32Array(mergedLen);
          let off = 0;
          for (const c of overflow) {
            merged.set(c, off);
            off += c.length;
          }
          queueRef.current.unshift(merged);
        }
        const chunk = queueRef.current.shift();
        await transcribeChunk(chunk);
      }
    } finally {
      pumpRef.current = false;
    }
  }, [transcribeChunk]);

  const tick = useCallback(() => {
    if (!runningRef.current) return;
    const now = Date.now();
    const buf = bufferRef.current;
    if (now - lastTickRef.current >= CHUNK_MS && buf.length > 0) {
      lastTickRef.current = now;
      const keep = Math.floor((SAMPLE_RATE * OVERLAP_MS) / 1000);
      const chunk = buf;
      if (buf.length > keep * 2) {
        bufferRef.current = buf.slice(buf.length - keep);
      } else {
        bufferRef.current = new Float32Array(0);
      }
      queueRef.current.push(chunk);
      pump();
    }
  }, [pump]);

  // Live engine hand-off when the user flips Transcription Mode or the Local
  // STT Model while a session is running:
  //   → parakeet      : drain the buffer, stop whisper chunking, boot/connect
  //                     the sidecar and stream raw audio to it (queued while
  //                     the socket opens). If the sidecar is unavailable,
  //                     roll back to local whisper chunking WITHOUT losing the
  //                     audio that arrived mid-connect.
  //   → whisper/cloud : flush the sidecar tail into the transcript, close the
  //                     socket, hand buffered audio back to the chunk pipeline
  //                     and (re)start the 5s whisper ticker.
  const switchEngine = useCallback(
    async (from, to) => {
      const ws = wsRef.current;
      if (to === "parakeet") {
        if (parakeetActiveRef.current || (ws && ws.readyState === WebSocket.CONNECTING)) return;
        // Whisper audio still parked in the buffer goes out through the old
        // chunk path so nothing recorded before the switch is lost.
        const tail = bufferRef.current;
        if (tail && tail.length > 0) {
          queueRef.current.push(tail);
          bufferRef.current = new Float32Array(0);
          pump();
        }
        if (tickerRef.current) { clearInterval(tickerRef.current); tickerRef.current = null; }
        const ok = await tryStartParakeet();
        if (!ok && runningRef.current) {
          for (const c of pkQueueRef.current) {
            const b = bufferRef.current;
            const merged = new Float32Array(b.length + c.length);
            merged.set(b);
            merged.set(c, b.length);
            bufferRef.current = merged;
          }
          pkQueueRef.current = [];
          if (!tickerRef.current) {
            lastTickRef.current = Date.now();
            tickerRef.current = setInterval(tick, 500);
          }
        }
        return;
      }
      // Handing ownership back to the whisper/cloud chunk pipeline.
      if (parakeetActiveRef.current) {
        try { await flushParakeet(); } catch {}
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        // Socket never opened — audio sat in pkQueue while it connected.
        try { ws.close(); } catch {}
      }
      wsRef.current = null;
      parakeetActiveRef.current = false;
      for (const c of pkQueueRef.current) {
        const b = bufferRef.current;
        const merged = new Float32Array(b.length + c.length);
        merged.set(b);
        merged.set(c, b.length);
        bufferRef.current = merged;
      }
      pkQueueRef.current = [];
      if (runningRef.current && !tickerRef.current) {
        lastTickRef.current = Date.now();
        tickerRef.current = setInterval(tick, 500);
      }
    },
    [tryStartParakeet, flushParakeet, pump, tick]
  );

  // Watch settings and hand the audio pipeline to the newly selected engine.
  useEffect(() => {
    const s = settingsRef.current || {};
    const desired = desiredEngineFor(s.mode, s.localSttModel);
    const prev = targetRef.current;
    targetRef.current = desired;
    if (!runningRef.current || !prev || prev === desired) return;
    switchEngine(prev, desired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, switchEngine]);

  const start = useCallback(async () => {
    cleanup();
    setError("");
    userStoppedRef.current = false;
    runningRef.current = true;
    bufferRef.current = new Float32Array(0);
    queueRef.current = [];
    pumpRef.current = false;
    lastTickRef.current = Date.now();
    windowRef.current = { id: -1 };
    pkQueueRef.current = [];

    const mode = settingsRef.current?.mode || "local";
    const desired = desiredEngineFor(mode, settingsRef.current?.localSttModel);
    targetRef.current = desired;
    const wantParakeet = desired === "parakeet";

    // NOTE: no preemptive engine label here. The label is only set once an
    // engine is CONFIRMED (Parakeet on WS open; whisper/cloud when a chunk
    // actually flows through that path), so the UI never claims "Whisper"
    // while the Parakeet sidecar is still booting or when it falls back.

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;

      const audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        const ws = wsRef.current;
        if (parakeetActiveRef.current && ws && ws.readyState === WebSocket.OPEN) {
          // Native streaming — hand raw audio straight to the sidecar.
          try { ws.send(new Float32Array(data).buffer); } catch {}
        } else if (targetRef.current === "parakeet" && ws && ws.readyState === WebSocket.CONNECTING) {
          // Buffer until the socket opens (flushed by tryStartParakeet).
          pkQueueRef.current.push(new Float32Array(data));
          if (pkQueueRef.current.length > 100) pkQueueRef.current.shift(); // ~25 s cap
        } else {
          // Whisper chunk path.
          const b = bufferRef.current;
          const merged = new Float32Array(b.length + data.length);
          merged.set(b);
          merged.set(data, b.length);
          bufferRef.current = merged;
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsTranscribing(true);
      setInterim("");

      if (wantParakeet) {
        const ok = await tryStartParakeet();
        if (ok) return; // the WS path owns everything now
        console.warn("[ovio] Falling back to Whisper chunk pipeline");
      }
      tickerRef.current = setInterval(tick, 500);
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setError("Microphone access was denied — allow it to enable transcription.");
      } else {
        setError(`Microphone error: ${err.message}`);
      }
      runningRef.current = false;
      setIsTranscribing(false);
    }
  }, [cleanup, tick, tryStartParakeet]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (tickerRef.current) clearInterval(tickerRef.current);
      cleanup();
    };
  }, [cleanup]);

  return {
    transcript,
    setTranscript,
    interim,
    isTranscribing,
    error,
    activeEngine,
    start,
    stop,
    clearInterim,
  };
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
