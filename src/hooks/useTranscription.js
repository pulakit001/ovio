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
  const busyRef = useRef(false);
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
    setIsTranscribing(false);
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
    cleanup();
    setInterim("");
  }, [cleanup]);

  const transcribeChunk = useCallback(
    async (chunk) => {
      if (busyRef.current) return;
      const mode = settings?.mode || "hybrid";
      const useCloud = mode === "cloud" || !window.electronAPI;
      const groqKeys = getActiveGroqKeys();
      const cloudUsesKeys = useCloud
        ? groqKeys.slice(0, 1) // STT only needs one key at a time
        : groqKeys;

      busyRef.current = true;
      try {
        let text = "";
        const localModel = settings?.localSttModel || "turbo";
        if (useCloud) {
          if (!cloudUsesKeys[0]?.key) throw new Error("No Groq key for cloud transcription");
          text = await transcribePcmCloud(chunk, cloudUsesKeys, {
            model: settings?.sttModel || "whisper-large-v3-turbo",
          });
        } else if (mode === "local") {
          text = await window.electronAPI.transcribePcm(chunk, localModel);
        } else if (window.electronAPI) {
          text = await window.electronAPI.transcribePcm(chunk, localModel);
          if (!text && groqKeys[0]?.key) {
            text = await transcribePcmCloud(chunk, [groqKeys[0]], {
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
      } finally {
        busyRef.current = false;
      }
    },
    [settings, getActiveGroqKeys]
  );

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
      transcribeChunk(chunk);
    }
  }, [transcribeChunk]);

  const start = useCallback(async () => {
    cleanup();
    setError("");
    userStoppedRef.current = false;
    runningRef.current = true;
    bufferRef.current = new Float32Array(0);
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
