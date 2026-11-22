// Ovio updater — lightweight release checks + a remote message feed.
//
// Two jobs, both friendly to a no-account, no-telemetry app:
//
//  1. UPDATE CHECK — fetch this repo's own public releases (GitHub API, no
//     auth, no analytics). If the newest release version is higher than the
//     running app, the renderer can show an "update available" popup with a
//     one-click download of the latest DMG. We never auto-install: the popup
//     hands the user the always-current, Apple-signed-when-it-exists DMG.
//
//  2. REMOTE MESSAGE ("command a popup on all users' apps") — when you want
//     every installed Ovio to show a message (release announcement, critical
//     note, anything), you edit ONE JSON file in this repo:
//     .updater/message.json (on the main branch). Within CHECK_INTERVAL_MS
//     every running Ovio picks it up and pops the message once per unique id.
//     To clear the popup for everyone: set "enabled": false.
//
// Network: two GETs at most, at most once per CHECK_INTERVAL_MS, only while
// the app runs. No POSTs, no identifiers, no telemetry — same privacy story
// as the rest of Ovio.

const { net } = require("electron");
const { app } = require("electron");

const RELEASES_API = "https://api.github.com/repos/pulakit001/ovio/releases?per_page=5";
const MESSAGE_URL = "https://raw.githubusercontent.com/pulakit001/ovio/main/.updater/message.json";
const RELEASE_PAGE = "https://github.com/pulakit001/ovio/releases/latest";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 8000;

// Each OS downloads its own installer from the same release.
const ASSET_PATTERN = {
  darwin: /mac-(arm64|x64)\.dmg$/i,
  win32: /\.exe$/i,
  linux: /\.AppImage$/i,
};

function pickAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const pattern = ASSET_PATTERN[process.platform];
  if (!pattern) return null;
  const matches = assets.filter((a) => pattern.test(a.name));
  if (process.platform === "darwin") {
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    return matches.find((a) => a.name.includes(arch)) || matches[0] || null;
  }
  return matches[0] || null;
}

// Seen message ids live only in memory: a popup shows once per app run.
// (Re-launching the app may re-show an enabled message — acceptable, and
// it keeps everything stateless with zero writes to disk.)
const seenMessageIds = new Set();
let timer = null;
let stopped = false;

function fetchJson(url) {
  return new Promise((resolve) => {
    try {
      const req = net.request({ url, method: "GET" });
      req.setHeader("User-Agent", "Ovio-Updater");
      req.setHeader("Accept", "application/vnd.github+json");
      let done = false;
      const finish = (val) => {
        if (!done) { done = true; resolve(val); }
      };
      setTimeout(() => finish(null), TIMEOUT_MS);
      req.on("response", (res) => {
        if (res.statusCode !== 200) return finish(null);
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => {
          try { finish(JSON.parse(body)); } catch { finish(null); }
        });
      });
      req.on("error", () => finish(null));
      req.end();
    } catch {
      resolve(null);
    }
  });
}

function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function checkOnce(onUpdate, onMessage) {
  if (stopped) return;

  // 1 — newest published release vs running version
  const releases = await fetchJson(RELEASES_API);
  if (Array.isArray(releases) && releases.length && onUpdate) {
    const latest = releases.find((r) => !r.draft);
    if (latest && compareVersions(latest.tag_name, app.getVersion()) > 0) {
      const asset = pickAsset(latest);
      onUpdate({
        version: String(latest.tag_name).replace(/^v/, ""),
        notes: typeof latest.body === "string" ? latest.body.slice(0, 600) : "",
        url: asset?.browser_download_url || latest.html_url || RELEASE_PAGE,
        releasePage: latest.html_url || RELEASE_PAGE,
      });
    }
  }

  // 2 — the remote message feed (your popup controller)
  const msg = await fetchJson(MESSAGE_URL);
  if (msg && msg.enabled && msg.id && msg.title && onMessage && !seenMessageIds.has(msg.id)) {
    seenMessageIds.add(msg.id);
    onMessage({
      id: msg.id,
      title: String(msg.title).slice(0, 120),
      body: String(msg.body || "").slice(0, 600),
      ctaLabel: msg.ctaLabel ? String(msg.ctaLabel).slice(0, 40) : "",
      ctaUrl: msg.ctaUrl ? String(msg.ctaUrl).slice(0, 500) : "",
    });
  }
}

function startUpdater({ onUpdateAvailable, onRemoteMessage } = {}) {
  stopped = false;
  // First check after 25s (let the app finish booting / welcome animation),
  // then on the interval.
  setTimeout(() => {
    checkOnce(onUpdateAvailable, onRemoteMessage);
    timer = setInterval(() => checkOnce(onUpdateAvailable, onRemoteMessage), CHECK_INTERVAL_MS);
  }, 25000);
}

function stopUpdater() {
  stopped = true;
  if (timer) clearInterval(timer);
}

module.exports = { startUpdater, stopUpdater, compareVersions };
