// Parakeet-TDT (0.6B v3) sidecar manager.
//
// Owns the full lifecycle of the local Parakeet STT engine:
//   1. A Python virtualenv with nemo_toolkit[asr] + fastapi + uvicorn
//      ("the engine"), built once on demand under userData/parakeet/venv.
//   2. The ~2.5 GB parakeet-tdt-0.6b-v3.nemo weights under userData/models.
//   3. The parakeet_server.py FastAPI/WebSocket sidecar process.
//
// The sidecar streams stateful, full-context transcripts over a WebSocket —
// see electron/parakeet_server.py for the protocol.

const { app, net } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const HF_WEIGHTS_URL =
  "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3/resolve/main/parakeet-tdt-0.6b-v3.nemo";
const WEIGHTS_FILE = "parakeet-tdt-0.6b-v3.nemo";
const SIZE_LABEL = "~2.5 GB";

// Bump when the pinned engine requirements change to force a rebuild.
const ENGINE_VERSION = 1;
const ENGINE_PACKAGES = ["nemo_toolkit[asr]", "fastapi", "uvicorn", "websockets", "numpy"];
const PYTHON_MIN = [3, 10];
const PYTHON_MAX = [3, 13];

// Dev/test mode: PARAKEET_STUB=1 makes the manager pretend the engine and
// weights are installed and starts the sidecar with a stub transcriber, so the
// whole app flow (status, streaming, partials UI) works without the ~3 GB
// install. See scripts/test-parakeet.mjs.
const STUB_MODE = process.env.PARAKEET_STUB === "1";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const engine = {
  state: "missing", // missing | installing | ready | error
  error: null,
  log: [],
  inflight: null,
};

const weights = {
  downloading: false,
  progress: 0,
  inflight: null,
};

const server = {
  proc: null,
  port: null,
  device: null,
  starting: null,
  stopping: false,
  restartAttempts: 0,
  lastRestartAt: 0,
};

let notify = null;
function setNotify(fn) {
  notify = fn;
}
function emit(event) {
  try {
    notify && notify(event, status());
  } catch {}
}

function pushLog(line) {
  engine.log.push(String(line).trimEnd());
  if (engine.log.length > 120) engine.log.splice(0, engine.log.length - 120);
  emit("engine-log");
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function baseDir() {
  return path.join(app.getPath("userData"), "parakeet");
}
function venvDir() {
  return path.join(baseDir(), "venv");
}
function venvPython() {
  return path.join(venvDir(), process.platform === "win32" ? "Scripts\\python.exe" : "bin/python");
}
function venvPip() {
  return path.join(venvDir(), process.platform === "win32" ? "Scripts\\pip.exe" : "bin/pip");
}
function markerFile() {
  return path.join(venvDir(), ".ovio-engine");
}
function modelsDir() {
  return path.join(app.getPath("userData"), "models");
}
function weightsPath() {
  return path.join(modelsDir(), WEIGHTS_FILE);
}
function serverScript() {
  // Packaged builds get the script via extraResources (outside the asar).
  const packaged = path.join(process.resourcesPath || "", "parakeet_server.py");
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, "parakeet_server.py");
}

function engineInstalled() {
  if (STUB_MODE) return true;
  if (!fs.existsSync(venvPython())) return false;
  try {
    return fs.readFileSync(markerFile(), "utf8").trim() === String(ENGINE_VERSION);
  } catch {
    return false;
  }
}
function weightsDownloaded() {
  if (STUB_MODE) return true;
  try {
    return fs.existsSync(weightsPath()) && fs.statSync(weightsPath()).size > 100 * 1024 * 1024;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Engine install (venv + pip)
// ---------------------------------------------------------------------------

function execFile(bin, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env }, ...opts });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (opts.onOut) opts.onOut(d);
    });
    child.stderr.on("data", (d) => {
      err += d;
      if (opts.onErr) opts.onErr(d);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ out, err });
      else reject(new Error(`${path.basename(bin)} ${args[0]} exited with code ${code}\n${(err || out).slice(-800)}`));
    });
  });
}

async function findPython() {
  const candidates = [
    process.env.PARAKEET_PYTHON,
    path.join(process.env.HOME || "", ".local/bin/python3.12"),
    path.join(process.env.HOME || "", ".local/bin/python3.11"),
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.11",
    "/opt/homebrew/bin/python3.13",
    "/usr/local/bin/python3.12",
    "/usr/local/bin/python3.11",
    "python3.12",
    "python3.11",
    "python3.10",
    "python3",
  ].filter(Boolean);
  for (const bin of candidates) {
    try {
      const { out } = await execFile(bin, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { timeout: 15000 });
      const [maj, min] = out.trim().split(".").map((n) => parseInt(n, 10));
      if (maj > PYTHON_MIN[0] || (maj === PYTHON_MIN[0] && min >= PYTHON_MIN[1])) {
        if (maj < PYTHON_MAX[0] || (maj === PYTHON_MAX[0] && min <= PYTHON_MAX[1])) {
          return { bin, version: `${maj}.${min}` };
        }
      }
      pushLog(`skipping ${bin}: Python ${maj}.${min} (need >= 3.10, <= 3.13 for NeMo)`);
    } catch {}
  }
  return null;
}

async function installEngine() {
  if (STUB_MODE) {
    engine.state = "ready";
    pushLog("stub mode: skipping engine install (PARAKEET_STUB=1)");
    emit("engine-ready");
    return { ok: true, stub: true };
  }
  if (engineInstalled()) {
    engine.state = "ready";
    emit("engine-ready");
    return { ok: true, already: true };
  }
  if (engine.inflight) return engine.inflight;

  engine.inflight = (async () => {
    engine.state = "installing";
    engine.error = null;
    pushLog("— Parakeet engine install started —");
    emit("engine-installing");
    try {
      const py = await findPython();
      if (!py) {
        throw new Error(
          "No suitable Python found. NeMo needs Python 3.10–3.13 — install it with 'brew install python@3.12' (or set PARAKEET_PYTHON), then retry."
        );
      }
      pushLog(`using Python ${py.version} at ${py.bin}`);

      fs.mkdirSync(baseDir(), { recursive: true });
      if (!fs.existsSync(venvPython())) {
        pushLog("creating virtualenv…");
        await execFile(py.bin, ["-m", "venv", venvDir()], { onOut: pushLog, onErr: pushLog });
      }

      pushLog("upgrading pip…");
      await execFile(venvPip(), ["install", "--upgrade", "pip", "wheel", "setuptools"], {
        onOut: pushLog,
        onErr: pushLog,
      });

      // The big one: torch + NeMo (~2-3 GB). Progress arrives as pip log lines.
      pushLog(`installing ${ENGINE_PACKAGES.join(" ")} — this can take 5–15 minutes…`);
      await execFile(venvPip(), ["install", "-U", ...ENGINE_PACKAGES], {
        onOut: pushLog,
        onErr: pushLog,
      });

      fs.writeFileSync(markerFile(), String(ENGINE_VERSION));
      engine.state = "ready";
      pushLog("— engine installed —");
      emit("engine-ready");
      return { ok: true };
    } catch (err) {
      engine.state = "error";
      engine.error = err.message;
      pushLog(`— engine install failed: ${err.message} —`);
      emit("engine-error");
      throw err;
    } finally {
      engine.inflight = null;
    }
  })();

  return engine.inflight;
}

// ---------------------------------------------------------------------------
// Weights download (~2.5 GB .nemo from HuggingFace)
// ---------------------------------------------------------------------------

function downloadWeights() {
  if (STUB_MODE) {
    weights.downloading = false;
    weights.progress = 1;
    pushLog("stub mode: skipping weights download (PARAKEET_STUB=1)");
    emit("weights-downloaded");
    return Promise.resolve(weightsPath());
  }
  if (weightsDownloaded()) {
    weights.downloading = false;
    weights.progress = 1;
    emit("weights-downloaded");
    return Promise.resolve(weightsPath());
  }
  if (weights.inflight) return weights.inflight;

  weights.inflight = new Promise((resolve, reject) => {
    fs.mkdirSync(modelsDir(), { recursive: true });
    const dest = weightsPath();
    const tmp = dest + ".part";
    const request = net.request(HF_WEIGHTS_URL);
    let received = 0;
    let total = 0;
    let fileStream = null;
    let lastEmit = 0;

    weights.downloading = true;
    weights.progress = 0;
    emit("weights-downloading");

    request.on("response", (response) => {
      if (response.statusCode >= 400) {
        reject(new Error(`Parakeet weights download failed (HTTP ${response.statusCode})`));
        request.abort();
        return;
      }
      total = parseInt(response.headers["content-length"], 10) || 0;
      fileStream = fs.createWriteStream(tmp);
      response.on("data", (chunk) => {
        received += chunk.length;
        fileStream.write(chunk);
        const progress = total ? received / total : 0;
        weights.progress = progress;
        const now = Date.now();
        if (now - lastEmit > 250) {
          lastEmit = now;
          emit("weights-progress");
        }
      });
      response.on("end", () => {
        fileStream.end(() => {
          try {
            fs.renameSync(tmp, dest);
            weights.downloading = false;
            weights.progress = 1;
            resolve(dest);
            emit("weights-downloaded");
          } catch (err) {
            reject(err);
          }
        });
      });
      response.on("error", reject);
    });
    request.on("error", (err) => {
      try {
        fileStream && fileStream.close();
        fs.existsSync(tmp) && fs.unlinkSync(tmp);
      } catch {}
      weights.downloading = false;
      emit("weights-error");
      reject(err);
    });
    request.end();
  }).finally(() => {
    weights.inflight = null;
    weights.downloading = false;
  });

  return weights.inflight;
}

// ---------------------------------------------------------------------------
// Sidecar server lifecycle
// ---------------------------------------------------------------------------

function ensureServer() {
  if (server.proc && server.port) {
    return Promise.resolve({ port: server.port, device: server.device });
  }
  if (server.starting) return server.starting;

  if (!engineInstalled()) {
    return Promise.reject(new Error("Parakeet engine not installed yet — install it from Settings → Local STT Model."));
  }
  if (!weightsDownloaded()) {
    return Promise.reject(new Error("Parakeet model weights not downloaded yet."));
  }

  server.stopping = false;
  server.starting = new Promise((resolve, reject) => {
    const args = [serverScript(), "--port", "0", "--model-path", STUB_MODE ? "stub" : weightsPath()];
    pushLog(`starting sidecar: ${path.basename(venvPython())} ${path.basename(serverScript())}${STUB_MODE ? " (stub)" : ""}`);
    const spawnEnv = { ...process.env, PYTHONUNBUFFERED: "1", OMP_NUM_THREADS: process.env.OMP_NUM_THREADS || "4" };
    if (STUB_MODE) spawnEnv.PARAKEET_STUB = "1";
    const py = STUB_MODE ? (process.env.PARAKEET_PYTHON || "python3") : venvPython();
    let proc;
    try {
      proc = spawn(py, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: spawnEnv,
      });
    } catch (err) {
      reject(err);
      return;
    }
    server.proc = proc;

    const timeout = setTimeout(() => {
      reject(new Error("Parakeet engine startup timed out after 120s (first model load can be slow — try again)."));
      try { proc.kill(); } catch {}
    }, 120000);

    let buffer = "";
    const handleLine = (line) => {
      let obj;
      try { obj = JSON.parse(line); } catch { return; }
      if (obj.event === "ready") {
        server.port = obj.port;
        server.device = obj.device;
        server.restartAttempts = 0;
        clearTimeout(timeout);
        pushLog(`sidecar ready on port ${obj.port} (${obj.device}${obj.load_seconds ? `, loaded in ${obj.load_seconds}s` : ""})`);
        resolve({ port: obj.port, device: obj.device });
        emit("server-ready");
      } else if (obj.event === "status") {
        pushLog(obj.message);
      } else if (obj.event === "fatal") {
        clearTimeout(timeout);
        reject(new Error(obj.message || "Parakeet engine failed to load"));
      }
    };

    proc.stdout.on("data", (d) => {
      buffer += d.toString();
      let idx;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        handleLine(buffer.slice(0, idx).trim());
        buffer = buffer.slice(idx + 1);
      }
    });
    proc.stderr.on("data", (d) => pushLog(d.toString()));
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      server.proc = null;
      server.port = null;
      server.device = null;
      server.starting = null;
      emit("server-stopped");
      if (!server.stopping && app && weightsDownloaded()) {
        // Crash watchdog — restart with a capped backoff.
        const now = Date.now();
        if (server.restartAttempts < 5 && now - server.lastRestartAt > 30000) {
          server.restartAttempts += 1;
          server.lastRestartAt = now;
          pushLog(`sidecar exited (code ${code}) — restarting (attempt ${server.restartAttempts})`);
          setTimeout(() => {
            if (!server.stopping && !server.proc) ensureServer().catch((e) => pushLog(`restart failed: ${e.message}`));
          }, 3000);
        }
      }
    });
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  return server.starting.finally(() => {
    server.starting = null;
  });
}

function stopServer() {
  server.stopping = true;
  if (server.proc) {
    try { server.proc.kill(); } catch {}
    server.proc = null;
    server.port = null;
    server.device = null;
  }
}

async function transcribeFile(filePath) {
  const { port } = await ensureServer();
  const res = await fetch(`http://127.0.0.1:${port}/transcribe-file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "transcribe-file failed");
  return data.text;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function status() {
  return {
    id: "parakeet",
    sizeLabel: SIZE_LABEL,
    stub: STUB_MODE,
    engine: {
      state: engineInstalled() ? "ready" : engine.state,
      error: engine.error,
      log: engine.log.slice(-8),
    },
    weights: {
      downloaded: weightsDownloaded(),
      downloading: weights.downloading,
      progress: weights.progress,
    },
    server: {
      running: !!(server.proc && server.port),
      port: server.port,
      device: server.device,
    },
  };
}

module.exports = {
  setNotify,
  status,
  engineInstalled,
  weightsDownloaded,
  installEngine,
  downloadWeights,
  ensureServer,
  stopServer,
  transcribeFile,
  weightsPath,
};
