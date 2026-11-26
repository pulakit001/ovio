#!/usr/bin/env bash
#
# Ovio one-line installer for macOS.
#
#   curl -fsSL https://raw.githubusercontent.com/pulakit001/ovio/main/scripts/install.sh | bash
#
# What it does:
#   1. Checks the platform (Apple Silicon or Intel Mac, macOS 13+)
#   2. Downloads the matching latest-release DMG from GitHub Releases
#   3. Mounts it, copies Ovio.app to /Applications, unmounts
#   4. Lets macOS keep its normal signature and Gatekeeper checks intact
#   5. Launches Ovio
#
# Existing user data (recordings, transcripts, history) in
# ~/Library/Application Support/ovio is never touched.

set -euo pipefail

REPO="pulakit001/ovio"
APP_NAME="Ovio"
INSTALL_DIR="/Applications"

log()  { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# --- 1. Platform checks ------------------------------------------------------
[[ "$(uname -s)" == "Darwin" ]] || die "This installer is for macOS only."
case "$(uname -m)" in
  arm64) ARCH="arm64" ;;
  x86_64) ARCH="x64" ;;
  *) die "This Mac architecture is not supported by Ovio." ;;
esac

MACOS_MAJOR=$(sw_vers -productVersion | cut -d. -f1)
[[ "$MACOS_MAJOR" -ge 13 ]] || die "macOS 13 or newer is required (you have $(sw_vers -productVersion))."

command -v curl >/dev/null 2>&1 || die "curl is required but not installed."

# --- 2. Download -------------------------------------------------------------
DMG_URL="https://github.com/${REPO}/releases/latest/download/${APP_NAME}-mac-${ARCH}.dmg"
TMP_DIR=$(mktemp -d)
MOUNT_DIR="${TMP_DIR}/mount"
MOUNTED=0
cleanup() {
  if [[ "$MOUNTED" -eq 1 ]]; then hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true; fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
mkdir "$MOUNT_DIR"
DMG_PATH="${TMP_DIR}/${APP_NAME}-mac-${ARCH}.dmg"

log "Downloading (~100 MB, this can take a minute)…"
curl -#fL "$DMG_URL" -o "$DMG_PATH" || die "Download failed."
ok "Downloaded $(du -h "$DMG_PATH" | cut -f1 | tr -d ' ')"

# --- 3. Mount and verify -----------------------------------------------------
log "Mounting DMG…"
hdiutil attach "$DMG_PATH" -nobrowse -readonly -quiet -mountpoint "$MOUNT_DIR" \
  || die "Could not mount the DMG."
MOUNTED=1
[[ -d "${MOUNT_DIR}/${APP_NAME}.app" ]] || die "Unexpected DMG layout — ${APP_NAME}.app not found."
codesign --verify --deep --strict "${MOUNT_DIR}/${APP_NAME}.app" \
  || die "The downloaded app failed its macOS signature check."

# --- 4. Install --------------------------------------------------------------
log "Installing to ${INSTALL_DIR}…"
if [[ -d "${INSTALL_DIR}/${APP_NAME}.app" ]]; then
  log "Removing previous installation…"
  rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
fi
ditto "${MOUNT_DIR}/${APP_NAME}.app" "${INSTALL_DIR}/${APP_NAME}.app" \
  || die "Copy to /Applications failed (permission issue?)."
hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
MOUNTED=0
ok "Installed ${INSTALL_DIR}/${APP_NAME}.app"

# --- 5. Launch ---------------------------------------------------------------
log "Launching ${APP_NAME}…"
open "${INSTALL_DIR}/${APP_NAME}.app"

ok "Done! ${APP_NAME} is installed and running."
echo
echo "  Your recordings/history in ~/Library/Application Support/ovio were kept."
echo "  Uninstall anytime by dragging ${APP_NAME} from /Applications to the Trash."
