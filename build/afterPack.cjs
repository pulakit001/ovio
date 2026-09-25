/**
 * afterPack hook — the SAFETY NET for unsigned local builds.
 *
 * Why afterPack, not afterSign: electron-builder only fires afterSign when a
 * real Developer ID signing actually happened. Local builds that run with no
 * certificate never reach afterSign, which is how the old broken flow ended
 * up shipping a fully-unsigned app to GitHub Releases — the exact cause of
 * the "Apple could not verify Ovio" Gatekeeper dialog.
 *
 * This hook runs for EVERY mac build, right after the app bundle is packed:
 *
 *  - If a Developer ID Application certificate IS in the keychain (or
 *    CSC_NAME / CSC_LINK is set), electron-builder has already signed the app
 *    itself (identity is no longer forced to null) and will notarize it via
 *    `mac.notarize: true`. We only VERIFY the result and fail loudly if it
 *    somehow came out unsigned — so a bad release can never ship silently.
 *
 *  - If NO certificate exists (a plain local dev build), we ad-hoc sign
 *    (`codesign -s -`) because a fully-unsigned binary is killed on Apple
 *    Silicon with a misleading "damaged" error. Ad-hoc builds still show the
 *    standard Gatekeeper dialog on other machines — which is exactly why the
 *    release pipeline (`.github/workflows/release.yml`) REQUIRES a real cert.
 */
const { execSync } = require('child_process');
const path = require('path');

function findDeveloperIdIdentity() {
  if (process.env.CSC_NAME) return process.env.CSC_NAME;
  try {
    const out = execSync('security find-identity -v -p codesigning').toString();
    const match = out.match(/"?(Developer ID Application: [^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isSigned(appPath) {
  try {
    execSync(`codesign --verify --strict "${appPath}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );
  const identity = findDeveloperIdIdentity();

  if (identity) {
    // electron-builder signed with the real cert (and notarize: true kicks in
    // after this hook for the notarization step). Verify it stuck.
    if (!isSigned(appPath)) {
      throw new Error(
        `Developer ID certificate "${identity}" is available, but ${appPath} ` +
        `came out of the pack UNSIGNED. Refusing to continue — a signed ` +
        `release was expected. Check mac.identity / CSC_* configuration.`
      );
    }
    console.log(`✅ ${appPath} is signed (notarization runs next via mac.notarize).`);
    return;
  }

  // No cert — this is a local/dev build. Ad-hoc sign so the binary at least
  // runs on this Apple Silicon machine.
  console.log(`• No Developer ID certificate found — ad-hoc signing ${appPath}`);
  console.log('  (Local build only. Release builds MUST go through the GitHub Actions');
  console.log('   workflow, which supplies the certificate + notarization credentials.)');
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
};
