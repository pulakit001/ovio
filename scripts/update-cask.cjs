#!/usr/bin/env node
// Point Casks/ovio.rb at a release.
//
// The Homebrew cask is what `brew install --cask ovio` (and therefore the
// install command on the website) resolves, so it must always name the newest
// release. It drifted once — releases shipped for a while while the cask still
// pinned 1.3.7 — which installed an old build for every new user. The release
// workflow now runs this after the DMGs are built.
//
// Usage:
//   node scripts/update-cask.cjs <version> [release-dir]
//   CASK_PATH=/tmp/ovio.rb node scripts/update-cask.cjs 1.4.8 ./release
//
// Exits 1 when either DMG is missing, so a release never publishes a cask that
// points at a file nobody built.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function sha256(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buf = Buffer.allocUnsafe(1 << 20);
  try {
    for (;;) {
      const read = fs.readSync(fd, buf, 0, buf.length, null);
      if (!read) break;
      hash.update(buf.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function main() {
  const version = (process.argv[2] || "").replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error("usage: node scripts/update-cask.cjs <version> [release-dir]");
    process.exit(2);
  }
  const releaseDir = process.argv[3] || "release";
  const caskPath = process.env.CASK_PATH || path.join("Casks", "ovio.rb");

  const dmgs = {
    arm: path.join(releaseDir, "Ovio-mac-arm64.dmg"),
    intel: path.join(releaseDir, "Ovio-mac-x64.dmg"),
  };
  const missing = Object.values(dmgs).filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error(`✖ missing release file(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  const shas = { arm: sha256(dmgs.arm), intel: sha256(dmgs.intel) };
  const before = fs.readFileSync(caskPath, "utf8");

  // Only the first sha256 inside each arch block belongs to that arch.
  let next = before.replace(/(version\s+")[^"]*(")/, `$1${version}$2`);
  next = next.replace(/(on_arm do\b[\s\S]*?sha256\s+")[0-9a-f]{64}(")/, `$1${shas.arm}$2`);
  next = next.replace(/(on_intel do\b[\s\S]*?sha256\s+")[0-9a-f]{64}(")/, `$1${shas.intel}$2`);

  if (next === before) {
    console.log(`✔ ${caskPath} already points at ${version}`);
    return;
  }
  fs.writeFileSync(caskPath, next);
  console.log(`✔ ${caskPath} → ${version}`);
  console.log(`  arm64 ${shas.arm}`);
  console.log(`  x64   ${shas.intel}`);
}

main();
