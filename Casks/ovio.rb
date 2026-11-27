cask "ovio" do
  version "1.4.9"

  on_arm do
    sha256 "e42ecac655fab3753028b392d58993195da0cb8463e09cb1852f3fcfecb16bd1"
    url "https://github.com/pulakit001/ovio/releases/download/v#{version}/Ovio-mac-arm64.dmg"
  end
  on_intel do
    sha256 "b7cdf3eebe51991bb0b2498583502a51b3556400424188359d6e2012df3d49cf"
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
