const path = require("path");
const fs = require("fs");
const { app, net } = require("electron");
const { createWhisperContext, transcribeAsync } = require("whisper-cpp-node");

const HF_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

// Local model catalog. "turbo" ships bundled with the app; the others are
// downloaded on demand into userData/models.
const LOCAL_MODELS = {
  small: {
    id: "small",
    file: "ggml-small.bin",
    url: `${HF_BASE}/ggml-small.bin`,
    sizeLabel: "~466 MB",
    accuracy: "Lightest · basic accuracy",
  },
  turbo: {
    id: "turbo",
    file: "ggml-large-v3-turbo.bin",
    url: `${HF_BASE}/ggml-large-v3-turbo.bin`,
    sizeLabel: "~1.6 GB",
    accuracy: "Fast · great balance",
  },
  large: {
    id: "large",
    file: "ggml-large-v3.bin",
    url: `${HF_BASE}/ggml-large-v3.bin`,
    sizeLabel: "~3.1 GB",
    accuracy: "Most accurate local model",
  },
};

const DEFAULT_MODEL_ID = "turbo";

let activeModelId = DEFAULT_MODEL_ID;
let ctx = null;
let ctxModelId = null;
const downloads = {}; // id -> { progress }
const inflight = {};  // id -> download promise

function bundledDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "models");
  }
  return path.join(__dirname, "..", "models");
}

function downloadsDir() {
  return path.join(app.getPath("userData"), "models");
}

function findModelFile(id) {
  const m = LOCAL_MODELS[id];
  if (!m) return null;
  for (const dir of [downloadsDir(), bundledDir()]) {
    const p = path.join(dir, m.file);
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 1024) return p;
    } catch {}
  }
  return null;
}

function modelStatus() {
  return Object.values(LOCAL_MODELS).map((m) => ({
    id: m.id,
    file: m.file,
    sizeLabel: m.sizeLabel,
    accuracy: m.accuracy,
    downloaded: !!findModelFile(m.id),
    downloading: !!inflight[m.id],
    progress: downloads[m.id]?.progress || 0,
    active: m.id === activeModelId,
  }));
}

// Load (or switch to) a model context. Frees the previous context to keep
// memory in check — only one model lives in memory at a time.
function ensureContext(modelId) {
  const id = LOCAL_MODELS[modelId] ? modelId : DEFAULT_MODEL_ID;
  if (ctx && ctxModelId === id) return ctx;
  const p = findModelFile(id);
  if (!p) {
    throw new Error(`Local model "${id}" is not downloaded yet — get it in Settings → Local STT Model.`);
  }
  if (ctx) {
    try { ctx.free(); } catch {}
    ctx = null;
  }
  ctx = createWhisperContext({
    model: p,
    use_gpu: true,
    no_prints: true,
  });
  ctxModelId = id;
  activeModelId = id;
  return ctx;
}

function initWhisper(modelId) {
  const id = LOCAL_MODELS[modelId] ? modelId : DEFAULT_MODEL_ID;
  if (!findModelFile(id)) return false; // not fatal — downloaded later
  ensureContext(id);
  return true;
}

function isInitialized() {
  return !!ctx;
}

async function transcribePcm(pcm, modelId) {
  const c = ensureContext(modelId);
  try {
    // Accuracy tuning: beam search + word-boundary splitting + greedy temperature.
    const result = await transcribeAsync(c, {
      pcmf32: pcm,
      language: "en",
      n_threads: 6,
      no_timestamps: true,
      beam_size: 5,
      best_of: 5,
      temperature: 0,
      split_on_word: true,
    });
    const text = (result?.segments || [])
      .map((s) => (typeof s === "string" ? s : s?.text ?? s?.[2] ?? ""))
      .join(" ")
      .trim();
    return text;
  } catch (err) {
    throw new Error("Transcription failed: " + err.message);
  }
}

// Stream a model file from HuggingFace into userData/models with progress.
function downloadModel(id, onProgress) {
  const m = LOCAL_MODELS[id];
  if (!m) return Promise.reject(new Error(`Unknown local model: ${id}`));
  const existing = findModelFile(id);
  if (existing) return Promise.resolve(existing);
  if (inflight[id]) return inflight[id];

  inflight[id] = new Promise((resolve, reject) => {
    fs.mkdirSync(downloadsDir(), { recursive: true });
    const dest = path.join(downloadsDir(), m.file);
    const tmp = dest + ".part";
    const request = net.request(m.url);
    let received = 0;
    let total = 0;
    let fileStream = null;

    request.on("response", (response) => {
      if (response.statusCode >= 400) {
        reject(new Error(`Download failed (HTTP ${response.statusCode})`));
        request.abort();
        return;
      }
      total = parseInt(response.headers["content-length"], 10) || 0;
      fileStream = fs.createWriteStream(tmp);
      response.on("data", (chunk) => {
        received += chunk.length;
        fileStream.write(chunk);
        const progress = total ? received / total : 0;
        downloads[id] = { progress };
        try { onProgress?.(progress, received, total); } catch {}
      });
      response.on("end", () => {
        fileStream.end(() => {
          try {
            fs.renameSync(tmp, dest);
            downloads[id] = { progress: 1 };
            resolve(dest);
          } catch (err) {
            reject(err);
          }
        });
      });
      response.on("error", reject);
    });
    request.on("error", (err) => {
      try { fileStream?.close(); fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch {}
      reject(err);
    });
    request.end();
  }).finally(() => {
    delete inflight[id];
  });

  return inflight[id];
}

function destroyWhisper() {
  if (ctx) {
    try { ctx.free(); } catch {}
    ctx = null;
    ctxModelId = null;
  }
}

module.exports = {
  initWhisper,
  transcribePcm,
  destroyWhisper,
  isInitialized,
  modelStatus,
  downloadModel,
  ensureContext,
  findModelFile,
  downloadsDir,
  LOCAL_MODELS,
  DEFAULT_MODEL_ID,
};
