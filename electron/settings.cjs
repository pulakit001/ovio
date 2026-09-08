const { app, safeStorage, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SETTINGS_FILE = () => path.join(app.getPath("userData"), "ovio-settings.json");
const MASTER_KEY_FILE = () => path.join(app.getPath("userData"), "ovio.key");

const DEFAULT_SETTINGS = {
  mode: "hybrid",
  sttModel: "whisper-large-v3-turbo",
  localSttModel: "turbo",
  onboardingComplete: false,
  onboardingSkipped: false,
  groqKeys: [],
  openrouterKeys: [],
  agentSkills: {
    overview: true,
    keyTopics: true,
    explanations: true,
    importantDetails: true,
    actionItems: true,
    decisions: true,
    openQuestions: true,
  },
  activeProviders: {
    llm: "groq",
    sttLocal: true,
  },
  aiProvider: "cloud",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "",
};

// ---------------------------------------------------------------------------
// Encryption
//
// v1.2.2: keys are encrypted with AES-256-GCM using a random master key stored
// in userData/ovio.key (mode 0600). This does NOT depend on macOS Keychain /
// safeStorage, which silently broke whenever the app's code signature changed
// (e.g. after re-signing between releases) — every stored key became
// undecryptable and the UI showed "no key". The file-based master key survives
// app updates and re-signing.
//
// Legacy formats ("safeStorage" blobs and the old static AES-CBC fallback) are
// still readable so nothing saved by older versions is lost.//
// ---------------------------------------------------------------------------

let masterKeyCache = null;

function getMasterKey() {
  if (masterKeyCache) return masterKeyCache;
  try {
    const raw = fs.readFileSync(MASTER_KEY_FILE(), "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      masterKeyCache = Buffer.from(raw, "hex");
      return masterKeyCache;
    }
  } catch {}
  const key = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(MASTER_KEY_FILE()), { recursive: true });
    fs.writeFileSync(MASTER_KEY_FILE(), key.toString("hex") + "\n", { mode: 0o600 });
    try { fs.chmodSync(MASTER_KEY_FILE(), 0o600); } catch {}
  } catch {}
  masterKeyCache = key;
  return masterKeyCache;
}

function encrypt(value) {
  if (!value || typeof value !== "string") return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", getMasterKey(), iv);
    const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      type: "gcm",
      data: `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`,
    };
  } catch {}
  try {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return { type: "safeStorage", data: safeStorage.encryptString(value).toString("base64") };
    }
  } catch {}
  return null;
}

function decrypt(entry) {
  if (!entry || !entry.type || !entry.data) return "";
  try {
    if (entry.type === "gcm") {
      const [ivHex, tagHex, dataHex] = entry.data.split(":");
      const decipher = crypto.createDecipheriv("aes-256-gcm", getMasterKey(), Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
    }
    if (entry.type === "safeStorage" && safeStorage) {
      return safeStorage.decryptString(Buffer.from(entry.data, "base64"));
    }
    if (entry.type === "aes") {
      const [ivHex, dataHex] = entry.data.split(":");
      const key = crypto.createHash("sha256").update("ovio-local-fallback-key").digest();
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, Buffer.from(ivHex, "hex"));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
    }
  } catch {}
  return "";
}

function genId() {
  return crypto.randomBytes(5).toString("hex");
}

function maskKey(key) {
  return key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "••••";
}

let cache = null;

// Write the internal (still-encrypted) representation straight to disk.
function writeSettings(settings) {
  cache = settings;
  try {
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Upgrade a freshly-read settings object: migrate legacy plaintext keys into
// encrypted blobs and drop derived display fields that must never hit disk.
function migrateParsed(parsed) {
  const out = { ...DEFAULT_SETTINGS, ...parsed };
  let migrated = false;
  for (const field of ["groqKeys", "openrouterKeys"]) {
    out[field] = (out[field] || []).map((k) => {
      if (!k || typeof k !== "object") return k;
      const entry = { ...k };
      if (typeof entry.key === "string" && entry.key.trim()) {
        // Legacy plaintext key stored on disk — encrypt it, strip the plain value.
        const enc = encrypt(entry.key.trim());
        if (enc) {
          entry.keyEnc = enc;
          migrated = true;
        }
        delete entry.key;
      }
      delete entry.hasKey;
      delete entry.masked;
      delete entry.locked;
      if (!entry.id) {
        entry.id = genId();
        migrated = true;
      }
      return entry;
    });
  }
  if (migrated) writeSettings(out);
  return out;
}

function loadSettings() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), "utf8");
    cache = migrateParsed(JSON.parse(raw));
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

// Strip plaintext key values and derived display fields before writing to
// disk — only the encrypted keyEnc blobs are ever allowed on disk.
function persistSettings(settings) {
  const clean = {
    ...settings,
    groqKeys: (settings.groqKeys || []).map(({ key, hasKey, masked, locked, ...rest }) => rest),
    openrouterKeys: (settings.openrouterKeys || []).map(({ key, hasKey, masked, locked, ...rest }) => rest),
  };
  return writeSettings(clean);
}

// Internal representation: decrypted key + keyEnc kept together so merges can
// preserve blobs. keyEnc must NEVER cross the IPC boundary to the renderer.
function plainKeyEntry(k) {
  const key = decrypt(k.keyEnc);
  const locked = !key && !!k.keyEnc; // blob exists but could not be decrypted
  return {
    id: k.id,
    name: k.name,
    active: k.active,
    keyEnc: k.keyEnc || null,
    key,
    hasKey: !!key || locked,
    masked: key ? maskKey(key) : locked ? "•••• (re-enter key)" : "",
    locked,
  };
}

function getPlainSettings() {
  const s = loadSettings();
  return {
    ...s,
    groqKeys: (s.groqKeys || []).map(plainKeyEntry),
    openrouterKeys: (s.openrouterKeys || []).map(plainKeyEntry),
  };
}

function sanitizeForRenderer(settings) {
  const clone = { ...settings };
  const maskEntry = (k) => {
    const key = k.key || decrypt(k.keyEnc);
    const locked = !key && !!k.keyEnc;
    return {
      id: k.id,
      name: k.name,
      active: k.active,
      masked: key ? maskKey(key) : locked ? "•••• (re-enter key)" : "",
      hasKey: !!key || locked,
      locked,
    };
  };
  clone.groqKeys = (settings.groqKeys || []).map(maskEntry);
  clone.openrouterKeys = (settings.openrouterKeys || []).map(maskEntry);
  return clone;
}

// Merge a key patch from the renderer with the stored keys.
// - Re-encrypts when a new plaintext key is provided.
// - PRESERVES the existing keyEnc when the patch has no key value, so a
//   partial update (e.g. toggling active) can never wipe a stored key.
//   (Previously this re-encrypted an empty string and destroyed the key —
//   the root cause of keys "disappearing".)
// - Stored entries missing from the patch are kept, not dropped.
function mergeProviderKeys(prevKeys, patchedKeys) {
  const prevList = prevKeys || [];
  // Values already stored (decrypted) — used to skip exact duplicates, e.g.
  // when onboarding is re-run with the same key.
  const existingValues = new Set(
    prevList.map((e) => decrypt(e.keyEnc)).filter(Boolean)
  );
  const merged = (patchedKeys || []).map((k) => {
    const prev = prevList.find((e) => e.id === k.id);
    const plainKey = (k.key || "").trim();
    let keyEnc;
    if (plainKey) {
      keyEnc = encrypt(plainKey); // new / replaced value
    } else {
      keyEnc = (prev && prev.keyEnc) || k.keyEnc || null; // keep whatever exists
    }
    // Patch introduces a key value that is already stored under another entry:
    // keep the original entry instead of creating a duplicate.
    if (!prev && plainKey && existingValues.has(plainKey)) {
      const twin = prevList.find((e) => decrypt(e.keyEnc) === plainKey);
      if (twin) return twin;
    }
    if (plainKey) existingValues.add(plainKey);
    return {
      id: k.id || (prev && prev.id) || genId(),
      name: k.name || (prev && prev.name) || "Key",
      active: k.active !== undefined ? k.active : prev ? prev.active !== false : true,
      keyEnc,
    };
  });
  for (const prev of prevList) {
    if (!merged.some((m) => m.id === prev.id)) merged.push(prev);
  }
  return merged;
}

function registerSettingsIpc() {
  ipcMain.handle("settings:get", () => sanitizeForRenderer(loadSettings()));

  ipcMain.handle("settings:getPlain", () => {
    const s = getPlainSettings();
    const toRenderer = (k) => ({
      id: k.id, name: k.name, active: k.active,
      key: k.key, hasKey: k.hasKey, masked: k.masked, locked: k.locked,
    });
    return {
      ...s,
      groqKeys: (s.groqKeys || []).map(toRenderer),
      openrouterKeys: (s.openrouterKeys || []).map(toRenderer),
    };
  });

  const handleUpdate = (_e, patch) => {
    const s = getPlainSettings();
    const merged = { ...s, ...patch };
    if (patch.groqKeys) {
      merged.groqKeys = mergeProviderKeys(s.groqKeys, patch.groqKeys);
    }
    if (patch.openrouterKeys) {
      merged.openrouterKeys = mergeProviderKeys(s.openrouterKeys, patch.openrouterKeys);
    }
    return persistSettings(merged);
  };

  ipcMain.handle("settings:update", handleUpdate);
  ipcMain.handle("settings:set", handleUpdate);
}

module.exports = { registerSettingsIpc, loadSettings, getPlainSettings, sanitizeForRenderer };
