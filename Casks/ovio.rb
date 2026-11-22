cask "ovio" do
  version "1.3.3"

  on_arm do
    sha256 "7f6da6715ab95cc76e45b7458b065f855de81f1e6b89df0dda1e74d5721216ab"
    url "https://github.com/pulakit001/ovio/releases/download/v#{version}/Ovio-mac-arm64.dmg"
  end
  on_intel do
    sha256 "dea96c2b4a051befa4ac3039c883fce765ccb7db565cdfc9f66eca17ceb1b49e"
    url "https://github.com/pulakit001/ovio/releases/download/v#{version}/Ovio-mac-x64.dmg"
  end

  name "Ovio"
  desc "Meeting recorder with on-device transcription and AI summaries"
  homepage "https://github.com/pulakit001/ovio"

  app "Ovio.app"

  # Builds are ad-hoc signed (no Developer ID yet), so a quarantined copy is
  # refused by Gatekeeper on first launch. Homebrew removed `--no-quarantine`
  # in 4.7, so clear the flag here to keep `brew install --cask ovio` working.
  postflight_steps do
    run "/usr/bin/xattr",
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/Ovio.app"]
  end

  uninstall quit: "com.ovio.app"

  # Recordings, transcripts and projects live in the app's support folder, so
  # only `brew uninstall --zap` touches them.
  zap trash: [
    "~/Library/Application Support/ovio",
    "~/Library/Caches/com.ovio.app",
    "~/Library/Logs/Ovio",
    "~/Library/Preferences/com.ovio.app.plist",
    "~/Library/Saved Application State/com.ovio.app.savedState",
  ]

  caveats <<~EOS
    Ovio is not notarized by Apple yet. This cask clears macOS's quarantine flag
    on install so it launches without the "Apple could not verify" dialog.
    Microphone and screen-recording permissions are still requested on first use.
  EOS
end
