// In-app local AI notes engine. This deliberately owns the runtime and model
// files so Ovio never depends on an external daemon or a separate API key.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const LOCAL_LLM_MODELS = {
  "qwen2.5-1.5b": {
    id: "qwen2.5-1.5b",
    title: "Qwen 2.5 · 1.5B",
    description: "Fastest — best for short notes and lower-memory computers",
    sizeLabel: "~1.1 GB",
    uri: "hf:bartowski/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M",
  },
  "qwen2.5-3b": {
    id: "qwen2.5-3b",
    title: "Qwen 2.5 · 3B",
    description: "Recommended balance of speed and detailed notes",
    sizeLabel: "~2.0 GB",
    uri: "hf:bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M",
  },
  "qwen2.5-7b": {
    id: "qwen2.5-7b",
    title: "Qwen 2.5 · 7B",
    description: "Most capable — best for long, nuanced sessions",
    sizeLabel: "~4.7 GB",
    uri: "hf:bartowski/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
  },
};

const DEFAULT_LOCAL_LLM_MODEL = "qwen2.5-3b";
const downloads = new Map();
let loaded = null;

function modelsDir() {
  return path.join(app.getPath("userData"), "local-llm-models");
}
function markerPath(id) {
  return path.join(modelsDir(), `${id}.json`);
}
function savedModelPath(id) {
  try { return JSON.parse(fs.readFileSync(markerPath(id), "utf8")).path || ""; } catch { return ""; }
}

async function llamaModule() {
  // node-llama-cpp is ESM-only. Keeping this import lazy prevents app startup
  // from failing on a machine that never chooses local notes.
  return import("node-llama-cpp");
}

async function getModelPath(id) {
  const def = LOCAL_LLM_MODELS[id];
  if (!def) throw new Error("Unknown local AI model");
  const llama = await llamaModule();
  const downloader = await llama.createModelDownloader({
    modelUri: def.uri,
    dirPath: modelsDir(),
    showCliProgress: false,
  });
  return downloader.entrypointFilePath;
}

async function status() {
  const items = Object.values(LOCAL_LLM_MODELS).map((def) => {
    const file = savedModelPath(def.id);
    const downloaded = !!file && fs.existsSync(file) && fs.statSync(file).size > 50 * 1024 * 1024;
    const bytes = downloaded ? fs.statSync(file).size : 0;
    const active = downloads.get(def.id);
    return {
      ...def,
      downloaded,
      bytes,
      downloading: !!active,
      progress: active?.progress || 0,
      received: active?.received || 0,
      total: active?.total || 0,
      error: active?.error || null,
      active: loaded?.id === def.id,
    };
  });
  return items;
}

async function downloadModel(id, onProgress = () => {}) {
  if (!LOCAL_LLM_MODELS[id]) throw new Error("Unknown local AI model");
  if (downloads.has(id)) return downloads.get(id).promise;
  const state = { progress: 0, received: 0, total: 0, error: null, promise: null };
  const promise = (async () => {
    try {
      const llama = await llamaModule();
      fs.mkdirSync(modelsDir(), { recursive: true });
      const downloader = await llama.createModelDownloader({
        modelUri: LOCAL_LLM_MODELS[id].uri,
        dirPath: modelsDir(),
        showCliProgress: false,
        onProgress: ({ totalSize, downloadedSize }) => {
          state.total = totalSize || 0;
          state.received = downloadedSize || 0;
          state.progress = state.total ? state.received / state.total : 0;
          onProgress({ id, progress: state.progress, received: state.received, total: state.total });
        },
      });
      const file = await downloader.download();
      fs.writeFileSync(markerPath(id), JSON.stringify({ path: file }), "utf8");
      state.progress = 1;
      onProgress({ id, progress: 1, received: state.total || state.received, total: state.total });
      return file;
    } catch (err) {
      state.error = err.message || String(err);
      throw err;
    } finally {
      downloads.delete(id);
    }
  })();
  state.promise = promise;
  downloads.set(id, state);
  return promise;
}

async function ensureLoaded(id) {
  const modelId = LOCAL_LLM_MODELS[id] ? id : DEFAULT_LOCAL_LLM_MODEL;
  if (loaded?.id === modelId) return loaded;
  const file = savedModelPath(modelId);
  if (!fs.existsSync(file) || fs.statSync(file).size < 50 * 1024 * 1024) {
    throw new Error(`Download ${LOCAL_LLM_MODELS[modelId].title} in Settings before using local AI notes.`);
  }
  if (loaded) {
    try { loaded.context.dispose(); } catch {}
    try { loaded.model.dispose(); } catch {}
    loaded = null;
  }
  const { getLlama } = await llamaModule();
  const llama = await getLlama({ logLevel: "error" });
  const model = await llama.loadModel({ modelPath: file });
  // 8K comfortably covers ordinary recorded sessions while avoiding the RAM
  // cliff that makes a local app feel unreliable on Windows and Linux laptops.
  const context = await model.createContext({ contextSize: 8192 });
  loaded = { id: modelId, llama, model, context };
  return loaded;
}

async function generate({ modelId, messages, system, maxTokens = 4096, temperature = 0.3, onToken }) {
  const runtime = await ensureLoaded(modelId);
  const { LlamaChatSession } = await llamaModule();
  const session = new LlamaChatSession({
    contextSequence: runtime.context.getSequence(),
    systemPrompt: system || "You are a helpful note-taking assistant.",
    autoDisposeSequence: true,
  });
  try {
    let answer = "";
    for (const message of messages || []) {
      if (message.role === "assistant") continue;
      answer = await session.prompt(String(message.content || ""), {
        maxTokens: Math.min(Number(maxTokens) || 4096, 4096),
        temperature: Number(temperature) || 0,
        onTextChunk: (chunk) => onToken?.(chunk),
      });
    }
    if (!answer.trim()) throw new Error("The local model returned an empty response");
    return { text: answer.trim(), provider: "local", keyName: LOCAL_LLM_MODELS[runtime.id].title };
  } finally {
    try { session.dispose(); } catch {}
  }
}

function dispose() {
  if (!loaded) return;
  try { loaded.context.dispose(); } catch {}
  try { loaded.model.dispose(); } catch {}
  loaded = null;
}

module.exports = { LOCAL_LLM_MODELS, DEFAULT_LOCAL_LLM_MODEL, status, downloadModel, generate, dispose };
