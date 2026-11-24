# Ovio

Local meeting recorder with on-device transcription.

## macOS (Homebrew)

```bash
brew tap pulakit001/ovio https://github.com/pulakit001/ovio
brew trust pulakit001/ovio
brew install --cask ovio
```

Update: `brew upgrade --cask ovio` · Remove: `brew uninstall --cask ovio`

Prefer the DMG? Grab `Ovio-mac-arm64.dmg` from [Releases](https://github.com/pulakit001/ovio/releases/latest).

Start over without losing recordings:

```bash
curl -fsSL https://raw.githubusercontent.com/pulakit001/ovio/main/scripts/reset-macos.sh | bash -s -- --install
```

That removes the app, caches, settings and downloaded models, keeps `files/` and `library/`,
then reinstalls the latest build. Drop `-s -- --install` to only remove it.

## Windows

Download `Ovio-Setup.exe` from [Releases](https://github.com/pulakit001/ovio/releases/latest), run it,
then click **More info → Run anyway** on the SmartScreen prompt.

To skip the prompt entirely: right-click the file → **Properties** → tick **Unblock** → **Apply**.
(The installer isn't code-signed yet, so Windows warns about it once.)

## Linux

Download from [Releases](https://github.com/pulakit001/ovio/releases/latest), then:

```bash
# Debian / Ubuntu
sudo apt install ./Ovio-amd64.deb

# Any distro (needs libfuse2)
chmod +x Ovio-x86_64.AppImage
./Ovio-x86_64.AppImage
```
