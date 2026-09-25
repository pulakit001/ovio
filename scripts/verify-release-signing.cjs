#!/usr/bin/env node
/**
 * verify-release-signing.cjs — HARD GATE against silently-broken releases.
 *
 * Run after `electron-builder --mac` (locally or in CI) on the packed .app.
 *
 * Two modes:
 *  - REQUIRE_NOTARIZED=1 (set by CI when a Developer ID cert is configured):
 *    fails unless the app is Developer-ID signed AND Gatekeeper-approved as
 *    "Notarized Developer ID" AND stapled. An unsigned release can never ship.
 *  - Default (no cert configured, e.g. local build): reports the signing
 *    status and fails only if the app is COMPLETELY unsigned — ad-hoc is
 *    accepted, since that's the best possible without a paid Apple account.
 *
 * Usage: node scripts/verify-release-signing.cjs [path/to/Ovio.app]
 *        (defaults to the newest .app under release/mac*)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REQUIRE_NOTARIZED = process.env.REQUIRE_NOTARIZED === '1';

const argPath = process.argv[2];
let appPath = argPath;

if (!appPath) {
  const candidates = ['release/mac-arm64', 'release/mac', 'release/mac-universal']
    .flatMap((dir) => {
      try {
        return fs.readdirSync(dir)
          .filter((f) => f.endsWith('.app'))
          .map((f) => path.join(dir, f));
      } catch {
        return [];
      }
    });
  if (!candidates.length) {
    console.error('✖ No .app found under release/. Build first: npm run electron:build');
    process.exit(1);
  }
  appPath = candidates[0];
}

if (!fs.existsSync(appPath)) {
  console.error(`✖ Not found: ${appPath}`);
  process.exit(1);
}

console.log(`Verifying signing of: ${appPath}${REQUIRE_NOTARIZED ? ' (notarization REQUIRED)' : ''}\n`);
let failed = false;

// 1 — signature must exist and NOT be ad-hoc ("Signature=adhoc" means unsigned by Apple)
// NOTE: codesign prints "Signature=adhoc" and "TeamIdentifier=" on STDERR even
// on success — merge 2>&1 through the shell or the ad-hoc check silently fails.
let sigInfo = '';
try {
  sigInfo = execSync(`codesign --display --verbose=4 "${appPath}" 2>&1`, { stdio: 'pipe' }).toString();
} catch (e) {
  sigInfo = ((e.stdout || '') + (e.stderr || '')).toString();
}
const adhoc = /Signature=adhoc/i.test(sigInfo);
const teamIdMatch = sigInfo.match(/TeamIdentifier=(\S+)/);

if (adhoc || !teamIdMatch) {
  if (REQUIRE_NOTARIZED) {
    console.error('✖ FAIL: app is ad-hoc signed or has no TeamIdentifier — a notarized');
    console.error('  Developer ID build was required. Check CSC_* configuration.');
    failed = true;
  } else if (adhoc) {
    console.log('• Ad-hoc signed (no Developer ID cert configured) — acceptable:');
    console.log('  users see the one-time "Open Anyway" Gatekeeper prompt, which the');
    console.log('  README and in-app popup document. Set MAC_CSC_LINK + Apple secrets');
    console.log('  in CI (or install a cert locally) to remove it entirely.');
  } else {
    console.error('✖ FAIL: app is completely unsigned — this crashes on Apple Silicon.');
    console.error('  Something is badly wrong with the packaging step.');
    failed = true;
  }
} else {
  console.log(`✔ Signed with Team ID ${teamIdMatch[1]} (not ad-hoc)`);
}

// 2 — Gatekeeper assessment (only meaningful / required when notarizing)
if (REQUIRE_NOTARIZED) {
  try {
    const assess = execSync(`spctl --assess --verbose --type execute "${appPath}"`, { stdio: 'pipe' }).toString();
    if (/Notarized Developer ID/i.test(assess)) {
      console.log('✔ Gatekeeper: accepted, source=Notarized Developer ID');
    } else {
      console.error(`✖ FAIL: Gatekeeper assessment is not "Notarized Developer ID":\n  ${assess.trim()}`);
      failed = true;
    }
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).toString().trim();
    console.error(`✖ FAIL: Gatekeeper rejected the app:\n  ${out}`);
    failed = true;
  }

  // 3 — stapled notarization ticket
  try {
    execSync(`xcrun stapler validate "${appPath}"`, { stdio: 'pipe' });
    console.log('✔ Notarization ticket is stapled (offline verification works)');
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).toString().trim();
    console.error(`✖ FAIL: stapled ticket missing/invalid:\n  ${out}`);
    console.error('  Run: xcrun stapler staple "' + appPath + '"');
    failed = true;
  }
} else {
  console.log('• Notarization check skipped (no cert configured — REQUIRE_NOTARIZED not set)');
}

if (failed) {
  console.error('\n✖ Signing verification FAILED — do NOT publish this build.');
  process.exit(1);
}
if (REQUIRE_NOTARIZED) {
  console.log('\n✅ Fully signed and notarized — safe to publish. No Gatekeeper dialog will appear.');
} else {
  console.log('\n✅ Verified (ad-hoc mode) — publishable, but users will need the one-time Open Anyway bypass.');
}
