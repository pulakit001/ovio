# Ovio Remote Popup — how to command every installed app

The file `.updater/message.json` in this repo is a broadcast channel.
Every running Ovio checks it at startup and every 6 hours.

## To show a popup on all users' apps

1. Edit `.updater/message.json`:

```json
{
  "enabled": true,
  "id": "anything-unique-1",
  "title": "Headline users will see",
  "body": "One or two sentences. First line is what shows in the popup.",
  "ctaLabel": "Optional button text",
  "ctaUrl": "https://github.com/pulakit001/ovio/releases"
}
```

2. Commit and push to `main`.
3. Within 6 hours (or on next app launch) every Ovio pops the message once.

## Rules

- `id` must be unique per message — each app shows each id only once.
- To retract the popup for everyone: `"enabled": false`, push.
- `ctaLabel` + `ctaUrl` together create the blue action button.
- URLs must be github.com/githubusercontent.com (opened in the user's browser).
- No telemetry, no identifiers: two anonymous GETs per check, same as before.

## Update-available popup (automatic)

Separate from your messages: whenever a GitHub release is published with a
version higher than the running app, users get an "Ovio X.Y is out" card with
a Download button pointing at the always-latest DMG. Nothing to maintain.

## Code map (for future work)

- `electron/updater.cjs` — checks releases + message feed, forwards to renderer
- `electron/preload.cjs` → `window.electronAPI.updater` — bridge
- `src/components/UpdatePrompt.jsx` — the popup UI (update + message modes)
