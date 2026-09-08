import { useState, useRef, useCallback, useEffect } from "react";
import { transcribePcmCloud } from "../services/groqStt";
import { useSettings } from "../context/SettingsContext";

const SAMPLE_RATE = 16000;
const CHUNK_MS = 5000;   // longer chunks give the model more context → better accuracy
const OVERLAP_MS = 1000; // audio re-sent with the next chunk so boundary words aren't lost
const WINDOW_MS = 2 * 60 * 1000;
let windowRef = { id: -1 };

export default function useTranscription() {
  const { settings, getActiveGroqKeys } = useSettings();
  const [transcript, setTranscript] = useState([]);
  const [interim, setInterim] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState("");

  const audioCtxRef = useRef(null);
  const streamRef = useRef(null);
  const processorRef = useRef(null);
  const bufferRef = useRef(null);
  const lastTickRef = useRef(0);
  const runningRef = useRef(false);
  const tickerRef = useRef(null);

  const userStoppedRef = useRef(false);

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
    bufferRef.current = new Float32Array(0);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    queueRef.current = [];
    setIsTranscribing(false);
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
    cleanup();
    setInterim("");
  }, [cleanup]);

  const transcribeChunk = useCallback(
    async (chunk) => {
      const mode = settings?.mode || "hybrid";
      const useCloud = mode === "cloud" || !window.electronAPI;
      const groqKeys = getActiveGroqKeys();

      try {
        let text = "";
        const localModel = settings?.localSttModel || "turbo";
        if (useCloud) {
          if (!groqKeys[0]?.key) throw new Error("No Groq key for cloud transcription");
          // Rotate across every active key; transcribePcmCloud retries 429s.
          text = await transcribePcmCloud(chunk, groqKeys, {
            model: settings?.sttModel || "whisper-large-v3-turbo",
          });
        } else if (mode === "local") {
          text = await window.electronAPI.transcribePcm(chunk, localModel);
        } else {
          // Hybrid: local first; fall back to cloud when local fails OR
          // returns nothing (previously only the empty case fell back, and a
          // local crash lost the chunk entirely).
          try {
            text = await window.electronAPI.transcribePcm(chunk, localModel);
          } catch (localErr) {
            console.warn("[ovio] local transcription failed, trying cloud:", localErr.message);
            text = "";
          }
          if (!text && groqKeys[0]?.key) {
            text = await transcribePcmCloud(chunk, groqKeys, {
              model: settings?.sttModel || "whisper-large-v3-turbo",
            });
          }
        }

        if (runningRef.current && text) {
          const trimmed = (text || "").trim();
          if (trimmed) {
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
          }
        }
      } catch (err) {
        if (runningRef.current) {
          setError(err.message || "Transcription failed");
        }
      }
    },
    [settings, getActiveGroqKeys]
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
        const b = bufferRef.current;
        const merged = new Float32Array(b.length + data.length);
        merged.set(b);
        merged.set(data, b.length);
        bufferRef.current = merged;
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setIsTranscribing(true);
      setInterim("");

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
  }, [cleanup, tick]);

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
