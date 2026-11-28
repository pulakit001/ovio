cask "ovio" do
  version "1.4.10"

  on_arm do
    sha256 "b85c56b477f17b54992616d12a9c17dbb21aed25e78aa9470d063028c6ebcbf7"
    url "https://github.com/pulakit001/ovio/releases/download/v#{version}/Ovio-mac-arm64.dmg"
  end
  on_intel do
    sha256 "e6890b610a0d8f53e107e8cf57cc94706d2a6b541e474525fe07acb14b8e9336"
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
