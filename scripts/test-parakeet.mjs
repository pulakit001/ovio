#!/usr/bin/env node
//
// End-to-end test for the Parakeet sidecar's WebSocket streaming protocol.
//
//   npm run test:parakeet                       -> spawns a stub server, tests protocol
//   npm run test:parakeet -- --port 57777       -> test an already-running server
//   npm run test:parakeet -- --wav file.wav     -> stream a real 16 kHz wav
//
// Asserts: ready -> incremental partials -> final(s) -> stopped, and that the
// concatenated finals are non-empty when real audio was sent.
//
// Uses Node's built-in WebSocket (Node >= 22).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const PORT = arg("port", null);
const WAV = arg("wav", null);
const CHUNK_MS = parseInt(arg("chunk-ms", "400"), 10);
const SERVER_DIR = path.resolve(new URL("..", import.meta.url).pathname, "electron");

let child = null;

function wavToFloat32(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("not a wav file");
  // Walk chunks to find fmt + data.
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = { audioFormat: buf.readUInt16LE(pos + 8), channels: buf.readUInt16LE(pos + 10), sampleRate: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 14) };
    if (id === "data") { data = buf.subarray(pos + 8, pos + 8 + size); break; }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("malformed wav");
  if (fmt.bits !== 16) throw new Error(`only 16-bit PCM supported (got ${fmt.bits})`);
  let samples = new Float32Array(Math.floor(data.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  if (fmt.channels > 1) {
    const mono = new Float32Array(Math.floor(samples.length / fmt.channels));
    for (let i = 0; i < mono.length; i++) {
      let s = 0;
      for (let c = 0; c < fmt.channels; c++) s += samples[i * fmt.channels + c];
      mono[i] = s / fmt.channels;
    }
    samples = mono;
  }
  if (fmt.sampleRate !== 16000) {
    const n = Math.floor(samples.length * 16000 / fmt.sampleRate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * fmt.sampleRate) / 16000;
      const i0 = Math.floor(x), frac = x - i0;
      out[i] = samples[i0] * (1 - frac) + (samples[Math.min(i0 + 1, samples.length - 1)] || 0) * frac;
    }
    samples = out;
  }
  return samples;
}

function syntheticAudio(seconds) {
  const n = 16000 * seconds;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / 16000;
    out[i] = 0.2 * Math.sin(2 * Math.PI * 220 * t) * (1 + Math.sin(2 * Math.PI * 3 * t));
  }
  return out;
}

async function spawnStubServer() {
  const py = arg("python", "python3");
  child = spawn(py, [path.join(SERVER_DIR, "parakeet_server.py"), "--port", "0"], {
    env: { ...process.env, PARAKEET_STUB: "1", PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("stub server start timed out")), 30000);
    child.stdout.on("data", (d) => {
      for (const line of d.toString().split("\n")) {
        try {
          const obj = JSON.parse(line);
          if (obj.event === "ready") { clearTimeout(timeout); resolve(obj.port); }
        } catch {}
      }
    });
    child.stderr.on("data", (e) => process.stderr.write(e));
    child.on("exit", (code) => reject(new Error(`stub server exited early (${code})`)));
  });
}

async function main() {
  let port = PORT;
  if (!port) {
    console.log("[test] spawning stub sidecar (PARAKEET_STUB=1)…");
    port = await spawnStubServer();
    console.log(`[test] stub sidecar ready on :${port}`);
  }

  const audio = WAV ? wavToFloat32(path.resolve(WAV)) : syntheticAudio(6);
  console.log(`[test] audio: ${(audio.length / 16000).toFixed(1)}s, chunk=${CHUNK_MS}ms`);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/stream`);
  ws.binaryType = "arraybuffer";

  const events = [];
  const waitFor = (type, timeoutMs) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for '${type}'`)), timeoutMs);
      const check = () => {
        if (events.some((e) => e.type === type)) { clearTimeout(t); resolve(); }
      };
      ws.addEventListener("message", () => check());
      check();
    });

  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(ev.data);
      events.push(m);
      if (m.type === "partial") console.log(`  [partial] ${m.text}`);
      if (m.type === "final") console.log(`  [final]   ${m.text}`);
    } catch {}
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("could not connect to sidecar"));
  });
  console.log("[test] connected");

  ws.send(JSON.stringify({ type: "start" }));
  await waitFor("ready", 10000);
  console.log("[test] session ready — streaming audio");

  const chunkSamples = Math.floor((16000 * CHUNK_MS) / 1000);
  for (let i = 0; i < audio.length; i += chunkSamples) {
    const view = audio.subarray(i, i + chunkSamples);
    // WebSocket.send accepts ArrayBuffer — copy the subarray into one.
    ws.send(new Float32Array(view).buffer);
    await new Promise((r) => setTimeout(r, CHUNK_MS));
  }
  // A live stream must have produced partials WHILE audio was still flowing.
  const hadPartialDuringStream = events.filter((e) => e.type === "partial").length > 0;
  console.log("[test] audio done, sending stop");
  ws.send(JSON.stringify({ type: "stop" }));

  await waitFor("stopped", 30000);
  await new Promise((r) => setTimeout(r, 100));
  ws.close();

  const partials = events.filter((e) => e.type === "partial");
  const finals = events.filter((e) => e.type === "final");
  const errors = events.filter((e) => e.type === "error");
  const streamText = finals.map((f) => f.text).join(" ").trim();

  console.log(`\n[test] summary: partials=${partials.length} finals=${finals.length} errors=${errors.length}`);
  console.log(`[test] transcript: ${streamText || "(empty)"}`);

  const fail = [];
  if (errors.length) fail.push(`server errors: ${errors[0].message}`);
  if (!events.some((e) => e.type === "ready")) fail.push("no ready event");
  if (!hadPartialDuringStream) fail.push("no incremental partial before stop (streaming is not live)");
  if (!events.some((e) => e.type === "stopped")) fail.push("no stopped event");
  if (WAV && !streamText) fail.push("no final text for real audio");

  if (child) child.kill();
  if (fail.length) {
    console.error("\nFAILED:");
    fail.forEach((f) => console.error("  - " + f));
    process.exit(1);
  }
  console.log("\nPASSED ✓");
  process.exit(0);
}

main().catch((err) => {
  console.error("[test] FAILED:", err.message);
  if (child) child.kill();
  process.exit(1);
});

