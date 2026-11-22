  # Ovio Transcribe — real-time Parakeet ASR on Android, fully offline

An Android app that runs **NVIDIA Parakeet TDT 0.6B** (ONNX, int8) **locally on the device**
and transcribes your speech **in real time** as you talk. The model is downloaded once from
within the app; after that, transcription works with **no internet at all** — audio never
leaves the phone.

Built on [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (prebuilt JNI `AAR`) with a
Jetpack Compose UI.

## How to run

### With Android Studio
1. Open this folder (`gradle wrapper + local.properties` are already there).
2. Let it sync (Gradle 8.9, AGP 8.7.3, Kotlin 2.0.21).
3. Run the `app` configuration on a device or emulator (`arm64-v8a` phones / `x86_64` emulator).

### From the command line
```bash
./gradlew :app:assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```
(`JAVA_HOME` must be a JDK 17+; e.g. Android Studio's embedded JBR. The sherpa-onnx
runtime is vendored at `app/libs/sherpa-onnx-2.0.1.aar`, so no extra setup is needed.)

## Using the app
1. **Setup** screen → pick **Parakeet TDT 0.6B v2 (English)** or **v3 (English + 24 European
   languages)** and hit *Download* (≈482 / 487 MB; per-file progress is shown).
   The 644 KB *Silero VAD* file is fetched together with it.
2. Tap **Start transcribing**, grant the microphone when asked.
3. Tap the mic — talk. Text appears live (a dim italic preview updates as you speak and gets
   "confirmed" every time a speech segment ends). Use copy/save to keep the transcript.

## How real-time works with an offline model
Parakeet TDT is an offline (non-streaming) model, so the app uses the same
*simulated streaming* architecture as the official sherpa-onnx Parakeet Android apps:

```
mic (16 kHz mono) → Silero VAD → speech segments → Parakeet TDT (offline decode)
                        │
                        └─ while you keep talking: the last ~12 s are re-decoded
                           every 2.5 s and shown as a live "partial" transcript
```

- One worker thread performs VAD feeding and decoding strictly in order, so confirmed text
  arrives chronologically.
- Every finished speech segment (Silero splits at pauses, max 20 s per segment) is decoded
  once, for good, into a confirmed paragraph.
- Tunables are in `StreamingRecognizer`: `PREVIEW_INTERVAL_MS`, `PREVIEW_WINDOW_SECONDS`,
  VAD `threshold` / `minSilenceDuration` / `maxSpeechDuration`, `asrThreads`.

## Where models live on the device
`filesDir/models/<model-dir>/encoder.int8.onnx`, `decoder.int8.onnx`, `joiner.int8.onnx`,
`tokens.txt` and `models/silero_vad.onnx`. Removing a model in Setup deletes the files.

## Credits
- [NVIDIA Parakeet](https://huggingface.co/nvidia) — the ASR models.
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) by k2-fsa — ONNX runtime plumbing,
  Kotlin API and prebuilt Android AAR; model exports maintained by @csukuangfj.
- [Silero VAD](https://github.com/snakers4/silero-vad) — voice activity detection.

## Nice next steps
- Timestamped/auto-punctuation settings, language picker for v3 (`OfflineWhisperModelConfig`
  style per-language prompts don't apply here, but v3 auto-detects language).
- Save/share session audio (already have VAD segments to cut on).
- Hotwords (`hotwordsFile` / `hotwordsScore`) or a domain lexicon.
- XNNPACK/delegate provider: `provider = "cpu"` today, `qnn` when targeting NPU builds.
