/**
 * macOS signing for the packaged app.
 *
 * 1. If a real "Developer ID Application" certificate is installed in the
 *    keychain, the app is signed with it (hardened runtime + entitlements)
 *    and, when notarization credentials are available, submitted to Apple
 *    notarytool and stapled — so Gatekeeper opens it with NO warning.
 * 2. Otherwise it ad-hoc signs (`codesign -s -`), because fully unsigned
 *    apps are killed on Apple Silicon with a misleading "damaged" error.
 *    Ad-hoc builds show the standard "Apple could not verify" dialog that
 *    users can bypass via System Settings → Privacy & Security → Open Anyway.
 *
 * Notarization credentials (any ONE of these):
 *   - a keychain profile created with:
 *       xcrun notarytool store-credentials ovio-notary <apple-id creds>
 *   - env: APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function findDeveloperIdIdentity() {
  try {
    const out = execSync('security find-identity -v -p codesigning').toString();
    const match = out.match(/"?(Developer ID Application: [^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function hasNotaryCredentials() {
  if (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) {
    return { mode: 'env' };
  }
  try {
    execSync('xcrun notarytool history --keychain-profile ovio-notary', { stdio: 'pipe' });
    return { mode: 'keychain' };
  } catch {
    return null;
  }
}

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  const identity = findDeveloperIdIdentity();

  if (!identity) {
    console.log(`• No Developer ID certificate found — ad-hoc signing ${appPath}`);
    console.log('  (Users will need to allow the app in System Settings → Privacy & Security on first launch.)');
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
    return;
  }

  const entitlements = path.join(__dirname, 'entitlements.mac.plist');
  console.log(`• Signing with "${identity}" (hardened runtime) ${appPath}`);
  execSync(
    `codesign --force --deep --sign "${identity}" --options runtime ` +
      `--entitlements "${entitlements}" --timestamp "${appPath}"`,
    { stdio: 'inherit' }
  );

  const creds = hasNotaryCredentials();
  if (!creds) {
    console.log('• Notarization credentials not found — skipping Apple notarization.');
    console.log('  Set APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or run');
    console.log('  `xcrun notarytool store-credentials ovio-notary ...`) to notarize.');
    return;
  }

  const zipPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}-notarize.zip`);
  console.log('• Zipping for notarization…');
  execSync(`ditto -c -k --keepParent "${appPath}" "${zipPath}"`, { stdio: 'inherit' });

  const submitArgs =
    creds.mode === 'keychain'
      ? `--keychain-profile ovio-notary`
      : `--apple-id "${process.env.APPLE_ID}" --team-id "${process.env.APPLE_TEAM_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}"`;

  console.log('• Submitting to Apple notarization (this can take a few minutes)…');
  execSync(`xcrun notarytool submit "${zipPath}" ${submitArgs} --wait`, {
    stdio: 'inherit',
  });

  console.log('• Stapling notarization ticket…');
  execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });

  try {
    fs.unlinkSync(zipPath);
  } catch {}

  console.log('✅ App is signed and notarized — Gatekeeper will open it with no warning.');
};

