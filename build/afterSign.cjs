const { execSync } = require('child_process');
const path = require('path');

/**
 * Ad-hoc signs the packaged macOS app.
 *
 * electron-builder is configured with `identity: null` because there is no
 * paid Apple Developer certificate. Fully unsigned apps that users download
 * are killed by Gatekeeper on Apple Silicon with a misleading "damaged"
 * error. Ad-hoc signing (`codesign -s -`) embeds a valid signature so macOS
 * shows the standard "unidentified developer" dialog instead, and the app
 * can be opened via right-click -> Open (or `xattr -cr`).
 */
exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`• Ad-hoc signing ${appPath}`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, {
    stdio: 'inherit',
  });
};
