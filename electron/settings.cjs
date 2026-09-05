const { app, safeStorage, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SETTINGS_FILE = () => path.join(app.getPath("userData"), "ovio-settings.json");

const DEFAULT_SETTINGS = {
  mode: "hybrid",
  sttModel: "whisper-large-v3-turbo",
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

function createFallback(ivHex, dataHex) {
  const key = crypto.createHash("sha256").update("ovio-local-fallback-key").digest();
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(dataHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

function encrypt(value) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return { type: "safeStorage", data: safeStorage.encryptString(value).toString("base64") };
    }
  } catch {}
  const key = crypto.createHash("sha256").update("ovio-local-fallback-key").digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  return { type: "aes", data: iv.toString("hex") + ":" + encrypted };
}

function decrypt(entry) {
  if (!entry) return "";
  try {
    if (entry.type === "safeStorage") {
      return safeStorage.decryptString(Buffer.from(entry.data, "base64"));
    }
    if (entry.type === "aes") {
      const [ivHex, dataHex] = entry.data.split(":");
      return createFallback(ivHex, dataHex);
    }
  } catch {}
  return "";
}

let cache = null;

function loadSettings() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(SETTINGS_FILE(), "utf8");
    const parsed = JSON.parse(raw);
    cache = { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

function persistSettings(settings) {
  // Strip plaintext key values before caching or writing to disk — only the
  // encrypted keyEnc blobs are ever allowed to be stored.
  const clean = {
    ...settings,
    groqKeys: (settings.groqKeys || []).map(({ key, ...rest }) => rest),
    openrouterKeys: (settings.openrouterKeys || []).map(({ key, ...rest }) => rest),
  };
  cache = clean;
  try {
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(clean, null, 2), "utf8");
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

function sanitizeForRenderer(settings) {
  const clone = { ...settings };
  const maskEntry = (k) => {
    // Derive the mask from whichever key material is available (in-memory
    // plaintext or the encrypted blob) so hasKey/masked stay correct.
    const key = k.key || decrypt(k.keyEnc);
    return {
      id: k.id,
      name: k.name,
      active: k.active,
      masked: key ? `${key.slice(0, 4)}...${key.slice(-4)}` : "",
      hasKey: !!key,
    };
  };
  clone.groqKeys = (settings.groqKeys || []).map(maskEntry);
  clone.openrouterKeys = (settings.openrouterKeys || []).map(maskEntry);
  return clone;
}

/**
 * Merge a key patch from the renderer with the stored keys.
 * - Re-encrypts when a new plaintext key is provided.
 * - PRESERVES the existing keyEnc when the patch has no key value, so a
 *   partial update (e.g. toggling active) can never wipe a stored key.
 */
function mergeProviderKeys(prevKeys, patchedKeys) {
  return (patchedKeys || []).map((k) => {
    const prev = (prevKeys || []).find((e) => e.id === k.id);
    const plainKey = (k.key || "").trim();
    const keyEnc = plainKey ? encrypt(plainKey) : (prev?.keyEnc || encrypt(""));
    return {
      id: k.id,
      name: k.name || prev?.name || "Key",
      active: k.active !== undefined ? k.active : prev?.active !== false,
      keyEnc,
    };
  });
}

function getPlainSettings() {
  const s = loadSettings();
  return {
    ...s,
    groqKeys: (s.groqKeys || []).map((k) => ({ ...k, key: decrypt(k.keyEnc) })),
    openrouterKeys: (s.openrouterKeys || []).map((k) => ({ ...k, key: decrypt(k.keyEnc) })),
  };
}

function registerSettingsIpc() {
  ipcMain.handle("settings:get", () => sanitizeForRenderer(loadSettings()));

  ipcMain.handle("settings:getPlain", () => {
    const s = getPlainSettings();
    return {
      ...s,
      groqKeys: (s.groqKeys || []).map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })),
      openrouterKeys: (s.openrouterKeys || []).map((k) => ({ id: k.id, name: k.name, active: k.active, key: k.key })),
    };
  });

  ipcMain.handle("settings:update", (_e, patch) => {
    const s = getPlainSettings();
    const merged = { ...s, ...patch };

    if (patch.groqKeys) {
      merged.groqKeys = mergeProviderKeys(s.groqKeys, patch.groqKeys);
    }
    if (patch.openrouterKeys) {
      merged.openrouterKeys = mergeProviderKeys(s.openrouterKeys, patch.openrouterKeys);
    }
    return persistSettings(merged);
  });

  ipcMain.handle("settings:set", (_e, patch) => {
    const s = getPlainSettings();
    const merged = { ...s, ...patch };
    if (patch.groqKeys) {
      merged.groqKeys = mergeProviderKeys(s.groqKeys, patch.groqKeys);
    }
    if (patch.openrouterKeys) {
      merged.openrouterKeys = mergeProviderKeys(s.openrouterKeys, patch.openrouterKeys);
    }
    return persistSettings(merged);
  });
}

module.exports = { registerSettingsIpc, loadSettings, getPlainSettings, sanitizeForRenderer };
