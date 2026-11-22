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

## Windows

Download `Ovio-Setup.exe` from [Releases](https://github.com/pulakit001/ovio/releases/latest), run it,
then click **More info → Run anyway** on the SmartScreen prompt.

## Linux

Download from [Releases](https://github.com/pulakit001/ovio/releases/latest), then:

```bash
# Debian / Ubuntu
sudo apt install ./Ovio-amd64.deb

# Any distro (needs libfuse2)
chmod +x Ovio-x86_64.AppImage
./Ovio-x86_64.AppImage
```
