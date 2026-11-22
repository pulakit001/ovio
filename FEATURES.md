# Ovio — The Ecosystem Feature Catalog

Every feature is concrete and buildable. Uniqueness is judged against the
2026 field: Otter, Fireflies, Fathom, Granola, Notion, Zoom/Meet/Teams
bundled notes, Wispr Flow, MacWhisper, PLAUD. ∆ = no major competitor has
it today.

---

## A. CAPTURE — "record anything, from anywhere"

| # | Feature | What it is | Why it's unique |
|---|---------|-----------|-----------------|
| A1 | **Menu-bar mini-recorder** | Waveform + timer + stop in the macOS menu bar. Dock icon optional. | Everyone requires opening an app or joining a bot. Ovio: one click, zero presence. |
| A2 | **Universal Mic Capture** | Record system audio (Zoom/Meet/Teams/phone on speaker) *and* mic together via ScreenCaptureKit — no bot, no integrations, works on ANY call including in-person rooms. ∆ | Fireflies/Otter need meeting-platform hooks. Ovio records the room's reality. In-person + phone calls = the entire market they can't touch. |
| A3 | **Offline-first everything** | Plane, cabin, dead zone — record, transcribe, write notes with zero connectivity. ∆ | Every cloud notetaker dies offline. Ovio's "worst network" is the demo. |
| A4 | **Meeting autodetect** | Detects audio from call apps, offers one-click capture (opt-in, local detection). | Fathom added bot-free desktop capture in 2026 — Ovio matches, and adds system-audio. |
| A5 | **Import + batch transcribe** | Drop in old voice memos, lecture recordings, videos. ∆ | MacWhisper does files well; none of the notetakers turn your back-catalog into searchable notes. Habit-former: day-1 value without recording anything. |
| A6 | **iPhone companion (capture)** | Record on phone → lands in Mac library (local network sync). | PLAUD sells $300 hardware for this. Ovio does it with the phone in your pocket. |

## B. NOTES ENGINE — "not a wall of text"

| # | Feature | What it is | Why unique |
|---|---------|-----------|------------|
| B1 | **Template packs** | 1:1, sales, standup, interview, lecture, therapy-session, doctor-visit templates. Output structure follows the meeting type. ∆ | Vertical notetakers (Jump/Zocks for advisors) win BECAUSE of templates. Ovio: horizontal app, vertical-grade output. |
| B2 | **Action items with owners** | Extract who-committed-to-what-by-when → export to Reminders/Todoist/Linear. | Everyone extracts "action items" as text. Owner+date+export = the "so what." |
| B3 | **Follow-up email drafter** | One click: "write the recap email from this meeting" in your tone. | Notion/Fathom summarize. Nobody closes the loop into the actual next action. |
| B4 | **Highlight clips** | Click transcript line → shareable quote card (text + optional audio snippet). | Fathom's most-loved feature, but Ovio's clips stay local and export cleanly. |
| B5 | **Custom vocabulary per project** | Per-project dictionaries: names, tickers, product terms. Boosts STT accuracy. ∆ | Market's #1 accuracy complaint is misrecognized domain terms. Nobody solves it user-side. |
| B6 | **Live translation layer** | Two-language meetings: speaker talks Spanish, you read English live. ∆ | Parakeet already does 25 languages. Killer demo for global teams. |
| B7 | **Tone/style profiles** | "Write notes like my team's wiki" — learns from docs you point it at (local files). | Granola adapts to *your* typing; Ovio adapts to *your* documentation. |

## C. RECALL — "your meetings become memory"

| # | Feature | What it is | Why unique |
|---|---------|-----------|------------|
| C1 | **Cross-meeting Q&A (local RAG)** | "What did we promise Acme in March?" → grounded answer with recording timestamp citations. ∆ | Fireflies charges for cloud Q&A. Ovio: local index, private by default, cite-the-timestamp answers. |
| C2 | **People cards** | Auto-built from meetings: who they are, every conversation, open commitments. Local CRM-lite. ∆ | The #1 reason people keep Fireflies is CRM automation. Ovio gives the individual the same power without any cloud. |
| C3 | **Commitment tracker** | Every "I'll send that by Friday" ever said, tracked to done/not-done. ∆ | The guilt feature. Nothing on the market tracks spoken commitments over time. |
| C4 | **Timeline / day view** | Your day as a horizontal strip: meetings, memos, notes. | Nice-to-have; table stakes for the ecosystem feel. |
| C5 | **Weekly digest** | Monday morning: hours captured, commitments due, topics that recurred 3+. ∆ | This is the retention engine — proves memory without being asked. |
| C6 | **Ovio Vault 2.0** | Files already stored per project → full-text search over PDFs/MD/CSV *and* transcripts together. | Notion has docs, notetakers have audio. Ovio has both, unified, local. |

## D. AGENT — "meetings that act"

| # | Feature | What it is | Why unique |
|---|---------|-----------|------------|
| D1 | **Ovio MCP Server** ∆ | Expose `search_transcripts`, `get_action_items`, `summarize_person`, `get_commitments` as local MCP tools. Claude/Cursor/any agent can privately query your meeting history. | **The strategic unlock.** Notion shipped cloud MCP; nobody does local. Your meetings become context for every AI you use — without uploading anything. Category-creating. |
| D2 | **Post-meeting automations** | "After every sales call → draft follow-up + append to CRM page + set reminder." Local triggers on transcript content. | Notion's agent triggers, but private and local. |
| D3 | **Action inbox** | Daily "here's what you committed" digest with one-tap done/snooze. | Turns notes into a task manager nobody had to feed. |
| D4 | **Ovio CLI** | `ovio ask "what did we decide about pricing?"` from the terminal. | Developers live in terminals; no notetaker has a CLI. Cheap to build on top of C1. |

## E. TRUST — "the privacy story as product"

| # | Feature | What it is | Why unique |
|---|---------|-----------|------------|
| E1 | **Privacy receipt** ∆ | Per-note: "What left this Mac: nothing. Network calls: 0. Click to see the proof." | Turns architecture into a *visible feature*. The Otter-lawsuit era demands this. |
| E2 | **Network ledger** | Settings page: every outbound request ever made, logged and inspectable. ∆ | "Audit the network calls" is README text today. Make it a live UI. |
| E3 | **Panic wipe** | One chord: stop recording + delete last 30s buffer instantly. | For "that went off the record" moments. Nobody has it. |
| E4 | **Consent nudge** | Optional pre-record prompt: "everyone OK being recorded?" with one-tap yes. | Directly addresses the 84%-alter-their-speech stat; makes candor survivable. |
| E5 | **Encrypted export/portability** | One-file encrypted export of everything; import on another machine. | Fathom's lock-in pain is famous. Ovio: "leave anytime, take everything." |

## F. PLATFORM PLAY — "own the local layer"

| # | Feature | What it is | Why unique |
|---|---------|-----------|------------|
| F1 | **Apple Foundation Models notes** | On-device LLM notes with zero setup on macOS 26. ∆ | "Zero keys, zero Ollama, zero downloads" — the only notetaker where notes work on a fresh Mac with no accounts. |
| F2 | **SpeechAnalyzer engine option** | Apple's native STT (macOS 26) as default engine — faster, ~zero-download, per-locale models. Parakeet stays as the power option. | Cuts onboarding from 15 min (2.5 GB) to ~1 min. Rides Apple's platform shift. |
| F3 | **Windows/Linux builds** | whisper.cpp/Parakeet ONNX run cross-platform already. | Expands TAM 5×. Only worth it after macOS wedge is dominant. |
| F4 | **Plugin API (local)** | Community templates, export targets, note post-processors. Sandboxed, local. | Obsidian proved community plugins build ecosystems. Long-game moat. |
| F5 | **Shared spaces (E2E)** | Encrypted team folders: notes sync, raw audio stays on devices. | The paid tier that funds everything without betraying free/local. |

---

## Priority order (build this sequence)

| Wave | Features | Why now |
|------|----------|---------|
| **Wave 1** (next 30 days) | A1, A2, B2, F2 | Menu-bar + universal capture = daily habit. Action items = the "so what." SpeechAnalyzer = onboarding fix. |
| **Wave 2** (30–60 days) | B1, B3, C1, C5, E1 | Templates + email drafting make output feel premium. Local RAG + digest = retention. Privacy receipt = the marketing asset. |
| **Wave 3** (60–90 days) | D1, C2, C3, B5 | MCP server claims the agent category. People cards + commitments = local CRM. Custom vocab = accuracy moat. |
| **Wave 4** (90+) | D2, D3, E5, F1, F4 | Automations, inbox, portability, zero-setup notes, plugin API. |
| **Later** | A6, B6, F3, F5 | Phone capture, live translation, Windows, teams. |

## The five that make Ovio *the* ecosystem product

1. **A2 Universal Mic Capture** — no bot, works on in-person + phone calls. Rewrites the market boundary.
2. **D1 Ovio MCP Server** — your private meeting memory inside every AI tool. Category-creating.
3. **C1+C3 Recall (local RAG + commitment tracker)** — memory that proves itself weekly.
4. **E1 Privacy receipt** — makes "local" visible in one glance. Un-copyable by cloud competitors.
5. **F2 SpeechAnalyzer + F1 Foundation Models** — the only zero-download, zero-account notetaker experience on a new Mac.

## Positioning line for all of it

> **Ovio — the meeting brain that lives on your Mac.**
> Capture anything. Recall everything. Feed every AI you use — and leak nothing.
