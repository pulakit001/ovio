#!/bin/bash
# Ovio — start fresh on macOS.
#
# Removes the Ovio app, its caches, settings, downloaded models and the local
# Parakeet/Whisper runtime (~7 GB), but keeps your recordings and library:
#   ~/Library/Application Support/ovio/files
#   ~/Library/Application Support/ovio/library
#
# Usage:
#   bash reset-macos.sh               # reset only
#   bash reset-macos.sh --install     # reset, then install the latest release
#   curl -fsSL https://raw.githubusercontent.com/pulakit001/ovio/main/scripts/reset-macos.sh | bash -s -- --install

set -u

usage() {
  cat <<'EOS'
Usage: reset-macos.sh [--install]

  (no flag)   remove the app, caches, settings and models; keep recordings
  --install   do that, then install the latest release with Homebrew
EOS
}

INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --install) INSTALL=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

SUPPORT=""
for d in "$HOME/Library/Application Support/ovio" "$HOME/Library/Application Support/Ovio"; do
  if [ -d "$d" ]; then SUPPORT="$d"; break; fi
done

if [ -n "$SUPPORT" ]; then
  echo "→ Data kept: $SUPPORT/files and $SUPPORT/library"
fi

# 1. Quit the app so nothing is rewritten while we clean up.
if pgrep -x Ovio >/dev/null 2>&1 || [ -d "/Applications/Ovio.app" ]; then
  echo "→ Quitting Ovio…"
  osascript -e 'tell application "Ovio" to quit' >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    pgrep -x Ovio >/dev/null 2>&1 || break
    sleep 0.5
  done
  if pgrep -x Ovio >/dev/null 2>&1; then
    kill $(pgrep -x Ovio) 2>/dev/null || true
    sleep 1
  fi
fi

# 2. Unregister the Homebrew cask (never --zap: that would delete recordings).
if command -v brew >/dev/null 2>&1 && brew list --cask ovio >/dev/null 2>&1; then
  echo "→ Unregistering the Homebrew cask…"
  HOMEBREW_NO_AUTO_UPDATE=1 brew uninstall --cask --force ovio >/dev/null 2>&1 || true
fi

# 3. Remove the app bundles.
for app in "/Applications/Ovio.app" "$HOME/Applications/Ovio.app"; do
  if [ -e "$app" ]; then
    echo "→ Removing $app"
    rm -rf "$app"
  fi
done

# 4. Remove everything macOS caches about the app outside its support folder.
for p in \
  "$HOME/Library/Caches/com.ovio.app" \
  "$HOME/Library/Caches/ovio" \
  "$HOME/Library/Caches/Ovio" \
  "$HOME/Library/Preferences/com.ovio.app.plist" \
  "$HOME/Library/Saved Application State/com.ovio.app.savedState" \
  "$HOME/Library/HTTPStorages/com.ovio.app" \
  "$HOME/Library/HTTPStorages/com.ovio.app.binarycookies" \
  "$HOME/Library/WebKit/com.ovio.app" \
  "$HOME/Library/Logs/Ovio" \
  "$HOME/Library/Containers/com.ovio.app"; do
  if [ -e "$p" ]; then rm -rf "$p"; fi
done

# 5. Inside the support folder, delete everything except files/ and library/.
if [ -n "$SUPPORT" ]; then
  echo "→ Clearing settings, caches, models and the local runtime…"
  for entry in "$SUPPORT"/* "$SUPPORT"/.[!.]*; do
    [ -e "$entry" ] || continue
    case "$(basename "$entry")" in
      files|library) continue ;;
    esac
    rm -rf "$entry"
  done
fi

echo
echo "✓ Ovio removed. Your recordings and library are untouched."
if [ -n "$SUPPORT" ]; then
  du -sh "$SUPPORT/files" "$SUPPORT/library" 2>/dev/null
fi

# 6. Optionally install the latest release again.
if [ "$INSTALL" -eq 1 ]; then
  echo
  if command -v brew >/dev/null 2>&1; then
    echo "→ Installing the latest Ovio…"
    brew tap pulakit001/ovio https://github.com/pulakit001/ovio >/dev/null 2>&1 || true
    HOMEBREW_NO_AUTO_UPDATE=1 brew install --cask ovio
  else
    echo "Homebrew not found. Download the DMG from:"
    echo "  https://github.com/pulakit001/ovio/releases/latest"
  fi
else
  echo
  echo "Reinstall the latest build with:"
  echo "  brew install --cask ovio"
fi
