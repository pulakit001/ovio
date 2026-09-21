// Durable local storage — the backbone of "your data never disappears".
//
// The renderer used to keep projects/recordings/vault in localStorage. On a
// packaged Electron app that store is flushed to disk lazily and has been
// observed to come back EMPTY after a normal quit (fast quit before Chromium
// flushes, renderer crash, or a reset partition). That is the bug where a new
// user closes the app and everything is gone.
//
// This module keeps every collection as its own JSON file under
//   userData/library/<key>.json
// written ATOMICALLY (temp file + rename) the moment the renderer says so —
// no batching, no flush window, nothing to lose. Reads happen once at boot.
//
// Migration: on first read of a key, if no file exists yet, the renderer may
// pass its old localStorage payload via store:import — we persist it to disk
// so the upgrade path is invisible to the user.

const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const ALLOWED_KEYS = new Set(["library", "vault"]);

function storeDir() {
  const dir = path.join(app.getPath("userData"), "library");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function keyFile(key) {
  // Defensive: keys are code-owned constants, but never let one become a path.
  if (!ALLOWED_KEYS.has(key)) throw new Error(`bad store key: ${key}`);
  return path.join(storeDir(), `${key}.json`);
}

function readKey(key) {
  try {
    const raw = fs.readFileSync(keyFile(key), "utf8");
    return JSON.parse(raw);
  } catch {
    return null; // missing or unreadable == empty; callers use defaults
  }
}

function writeKey(key, value) {
  try {
    const file = keyFile(key);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value), "utf8");
    fs.renameSync(tmp, file); // atomic on POSIX — readers never see a half file
    return { ok: true };
  } catch (e) {
    console.warn(`[ovio] store write failed (${key}):`, e.message);
    return { ok: false, error: e.message };
  }
}

function removeKey(key) {
  try { fs.rmSync(keyFile(key), { force: true }); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

function registerStoreIpc() {
  ipcMain.handle("store:read", (_e, key) => readKey(key));
  // `payload` here is the one-time localStorage migration; identical write path.
  ipcMain.handle("store:write", (_e, key, value) => writeKey(key, value));
  ipcMain.handle("store:import", (_e, key, value) => {
    // Only import when disk is empty — never clobber newer disk data with
    // stale renderer memory (e.g. a second window opened later).
    if (readKey(key) === null) return writeKey(key, value);
    return { ok: true, skipped: true };
  });
  ipcMain.handle("store:remove", (_e, key) => removeKey(key));
}

module.exports = { registerStoreIpc, readKey, writeKey, removeKey };
