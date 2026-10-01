#!/usr/bin/env bash
#
# Ovio one-line installer for macOS (Apple Silicon).
#
#   curl -fsSL https://raw.githubusercontent.com/pulakit001/ovio/main/scripts/install.sh | bash
#
# Why this exists: Ovio is free open source without a paid Apple Developer
# certificate, so a DMG download triggers the scary "Apple could not verify"
# Gatekeeper dialog. This installer never shows that dialog: it clears the
# quarantine attribute BEFORE the app is opened for the first time. Same
# result as the documented manual bypass (System Settings → Privacy &
# Security → Open Anyway, or `xattr -cr`), just automatic.
#
# What it does:
#   1. Checks the platform (Apple Silicon Mac, macOS 13+)
#   2. Downloads the latest Ovio-mac.dmg from GitHub Releases
#   3. Mounts it, copies Ovio.app to /Applications, unmounts
#   4. Clears the quarantine attribute (the one that triggers the dialog)
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
[[ "$(uname -m)" == "arm64" ]] || die "Ovio currently supports Apple Silicon (M1–M4) Macs only."

MACOS_MAJOR=$(sw_vers -productVersion | cut -d. -f1)
[[ "$MACOS_MAJOR" -ge 13 ]] || die "macOS 13 or newer is required (you have $(sw_vers -productVersion))."

command -v curl >/dev/null 2>&1 || die "curl is required but not installed."

# --- 2. Resolve the latest release DMG URL -----------------------------------
log "Fetching the latest Ovio release info…"
DMG_URL=$(curl -fsSLI -o /dev/null -w '%{url_effective}' \
  "https://github.com/${REPO}/releases/latest/download/${APP_NAME}-mac.dmg") \
  || die "Could not reach GitHub Releases. Check your internet connection."
ok "Latest release: ${DMG_URL##*/releases/download/}"

# --- 3. Download -------------------------------------------------------------
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT
DMG_PATH="${TMP_DIR}/${APP_NAME}-mac.dmg"

log "Downloading (~100 MB, this can take a minute)…"
curl -#fL "$DMG_URL" -o "$DMG_PATH" || die "Download failed."
ok "Downloaded $(du -h "$DMG_PATH" | cut -f1 | tr -d ' ')"

# --- 4. Mount, install, unmount ---------------------------------------------
log "Mounting DMG…"
hdiutil attach "$DMG_PATH" -nobrowse -readonly -quiet || die "Could not mount the DMG."

# Find the mounted volume robustly (hdiutil output parsing breaks on spaces,
# and already-mounted volumes make the volume name unpredictable). We just
# mounted it, so the volume containing Ovio.app is THE one to use.
MOUNT_DIR=""
for v in /Volumes/*; do
  [[ -d "$v/${APP_NAME}.app" ]] && MOUNT_DIR="$v" && break
done
[[ -n "$MOUNT_DIR" ]] || die "Mounted DMG has no ${APP_NAME}.app inside — unexpected DMG layout."
[[ -d "${MOUNT_DIR}/${APP_NAME}.app" ]] || die "Unexpected DMG layout — ${APP_NAME}.app not found."

log "Installing to ${INSTALL_DIR}…"
if [[ -d "${INSTALL_DIR}/${APP_NAME}.app" ]]; then
  log "Removing previous installation…"
  rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
fi
ditto "${MOUNT_DIR}/${APP_NAME}.app" "${INSTALL_DIR}/${APP_NAME}.app" \
  || die "Copy to /Applications failed (permission issue?)."
hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
ok "Installed ${INSTALL_DIR}/${APP_NAME}.app"

# --- 5. Clear quarantine BEFORE first launch (the whole point) ---------------
log "Clearing macOS quarantine attribute (skips the Gatekeeper dialog)…"
xattr -cr "${INSTALL_DIR}/${APP_NAME}.app" \
  || die "Could not clear quarantine attributes."
ok "Quarantine cleared — no Gatekeeper dialog will appear."

# --- 6. Launch ---------------------------------------------------------------
log "Launching ${APP_NAME}…"
open "${INSTALL_DIR}/${APP_NAME}.app"

ok "Done! ${APP_NAME} is installed and running."
echo
echo "  Your recordings/history in ~/Library/Application Support/ovio were kept."
echo "  Uninstall anytime by dragging ${APP_NAME} from /Applications to the Trash."
