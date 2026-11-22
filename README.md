# Ovio

Local-first meeting recorder with on-device transcription and AI summaries.

## Download

Every release is published on the [Releases page](https://github.com/pulakit001/ovio/releases/latest).
Pick the file for your operating system:

| OS | File | Notes |
| --- | --- | --- |
| macOS (Apple Silicon: M1–M5) | `Ovio-mac-arm64.dmg` | Most Macs sold since late 2020 |
| macOS (Intel) | `Ovio-mac-x64.dmg` | Intel Macs only |
| Windows (64-bit) | `Ovio-Setup.exe` | Windows 10/11 |
| Linux (Debian/Ubuntu) | `Ovio-amd64.deb` | Debian, Ubuntu, Mint, Pop!_OS |
| Linux (any distro) | `Ovio-x86_64.AppImage` | Portable, no install needed |

The `.zip` / `.zip.blockmap` macOS files are for Ovio's in-app auto-updater — do not download those by hand.

Ovio is not yet notarized by Apple or signed with a Windows code-signing certificate, so both systems
show a one-time security prompt on first launch. The steps below show how to get past it.

## macOS

1. Download `Ovio-mac-arm64.dmg` (Apple Silicon) or `Ovio-mac-x64.dmg` (Intel).
2. Open the `.dmg` and drag **Ovio** into the **Applications** folder.
3. Eject the disk image.
4. First launch will say *"Apple could not verify 'Ovio' is free of malware"*. Click **Done**
   (not *Move to Trash*), then open **System Settings → Privacy & Security**, scroll down to
   **Security** and click **Open Anyway**, then confirm with your password / Touch ID.
   From then on Ovio opens normally.

If you prefer the terminal, this removes the same quarantine flag and skips the dialog entirely:

```bash
xattr -dr com.apple.quarantine /Applications/Ovio.app
```

### macOS via Homebrew

```bash
brew tap pulakit001/ovio https://github.com/pulakit001/ovio
brew trust pulakit001/ovio
brew install --cask ovio
```

Add `--force` if an older `Ovio.app` is already in `/Applications`. Update with
`brew upgrade --cask ovio`, remove with `brew uninstall --cask ovio`
(add `--zap` only if you also want to delete recordings and projects).

## Windows

1. Download `Ovio-Setup.exe`.
2. Run it. Windows SmartScreen will show *"Windows protected your PC"* — click **More info**,
   then **Run anyway**.
3. Follow the installer; Ovio is installed per-user and a desktop shortcut is created.
4. Launch **Ovio** from the Start menu.

## Linux

### Debian / Ubuntu (.deb)

```bash
sudo apt install ./Ovio-amd64.deb
ovio
```

`apt` pulls in the required libraries automatically. If you are on an older release, use
`sudo dpkg -i Ovio-amd64.deb && sudo apt-get install -f` instead.

### AppImage (any distribution)

```bash
chmod +x Ovio-x86_64.AppImage
./Ovio-x86_64.AppImage
```

If it fails to start with a FUSE error, install the runtime once
(`sudo apt install libfuse2` on Ubuntu 22.04+) or run `./Ovio-x86_64.AppImage --appimage-extract`
and start `squashfs-root/AppRun`.
