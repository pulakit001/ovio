import { useCallback, useEffect, useRef, useState } from "react";

const SAMPLE_RATE = 16000;

export default function useTranscription() {
  const [transcript, setTranscript] = useState([]);
  const [interim, setInterim] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [activeEngine, setActiveEngine] = useState(null);
  const [enginePending, setEnginePending] = useState(false);
  const streamRef = useRef(null); const contextRef = useRef(null); const processorRef = useRef(null); const socketRef = useRef(null); const pendingRef = useRef([]);

  const clearInterim = useCallback(() => setInterim(""), []);
  const append = useCallback((text) => {
    const clean = String(text || "").trim(); if (!clean) return;
    setTranscript((previous) => [...previous, { time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), text: clean }]);
  }, []);
  const cleanup = useCallback(() => {
    try { socketRef.current?.close(); } catch {} socketRef.current = null;
    try { processorRef.current?.disconnect(); } catch {} processorRef.current = null;
    try { contextRef.current?.close(); } catch {} contextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    pendingRef.current = [];
  }, []);
  const stop = useCallback(async () => {
    try { socketRef.current?.send(JSON.stringify({ type: "stop" })); } catch {}
    cleanup(); setIsTranscribing(false); setActiveEngine(null); setEnginePending(false); setInterim("");
  }, [cleanup]);
  const start = useCallback(async () => {
    if (isTranscribing) return;
    setError(""); setEnginePending(true);
    try {
      const endpoint = await window.electronAPI?.parakeetAPI?.ensureServer?.();
      if (!endpoint?.port) throw new Error("Install Parakeet and download its model in Settings before recording.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const context = new AudioContext({ sampleRate: SAMPLE_RATE }); contextRef.current = context;
      const source = context.createMediaStreamSource(stream); const processor = context.createScriptProcessor(4096, 1, 1); processorRef.current = processor;
      const socket = new WebSocket(`ws://127.0.0.1:${endpoint.port}/stream`); socket.binaryType = "arraybuffer"; socketRef.current = socket;
      socket.onopen = () => { socket.send(JSON.stringify({ type: "start" })); pendingRef.current.forEach((chunk) => socket.send(chunk.buffer)); pendingRef.current = []; setEnginePending(false); setActiveEngine("parakeet"); setIsTranscribing(true); };
      socket.onmessage = (event) => { try { const message = JSON.parse(event.data); if (message.type === "partial") setInterim(message.text || ""); if (message.type === "final") { append(message.text); setInterim(""); } if (message.type === "error") setError(message.message || "Parakeet could not transcribe this audio."); } catch {} };
      socket.onerror = () => setError("Parakeet connection failed. Check Local transcription in Settings.");
      processor.onaudioprocess = (event) => { const chunk = new Float32Array(event.inputBuffer.getChannelData(0)); if (socket.readyState === WebSocket.OPEN) socket.send(chunk.buffer); else if (pendingRef.current.length < 120) pendingRef.current.push(chunk); };
      source.connect(processor); processor.connect(context.destination);
    } catch (err) { cleanup(); setEnginePending(false); setError(err.name === "NotAllowedError" ? "Microphone access was denied — allow it to enable transcription." : (err.message || "Unable to start transcription.")); }
  }, [append, cleanup, isTranscribing]);
  useEffect(() => () => cleanup(), [cleanup]);
  return { transcript, setTranscript, interim, isTranscribing, error, activeEngine, enginePending, start, stop, clearInterim };
}
