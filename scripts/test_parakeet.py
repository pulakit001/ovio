#!/usr/bin/env python3
"""
Offline Parakeet engine test (no HTTP/WebSocket in the loop).

  1. BATCH: transcribe a wav file once and compute WER against a reference.
  2. STREAM: feed the same wav through a streaming Session exactly like the
     app does (incremental chunks -> partials -> finals) and verify that
     partials arrive incrementally and that stream quality matches batch.

Usage:
  python scripts/test_parakeet.py --wav sample.wav --reference "expected text"
      [--model-path /path/to/parakeet-tdt-0.6b-v3.nemo]
      [--chunk-seconds 0.5] [--device mps]

Requires: nemo_toolkit[asr], numpy. (jiwer not needed — WER is computed here.)
"""

import argparse
import asyncio
import os
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "electron"))
import parakeet_server as ps  # noqa: E402


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_wav(path):
    with wave.open(path, "rb") as w:
        rate = w.getframerate()
        channels = w.getnchannels()
        width = w.getsampwidth()
        frames = w.readframes(w.getnframes())
    if width == 2:
        audio = np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 4:
        audio = np.frombuffer(frames, dtype="<i4").astype(np.float32) / 2147483648.0
    else:
        raise SystemExit(f"unsupported sample width: {width} bytes")
    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)
    if rate != 16000:
        n_out = int(len(audio) * 16000 / rate)
        audio = np.interp(np.linspace(0, len(audio) - 1, n_out), np.arange(len(audio)), audio).astype(np.float32)
    return audio.astype(np.float32)


NORMALIZE = str.maketrans("", "", ".,!?;:’‘“\"()[]")

def words(text):
    return (text or "").lower().translate(NORMALIZE).split()


def wer(reference, hypothesis):
    r, h = words(reference), words(hypothesis)
    if not r:
        return 0.0 if not h else 1.0
    dp = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, len(h) + 1):
            cur = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev = cur
    return dp[len(h)] / len(r)


class FakeWS:
    """Collects everything a Session would send over the WebSocket."""
    def __init__(self):
        self.messages = []

    async def send_json(self, obj):
        self.messages.append(obj)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run_stream(engine, audio, chunk_seconds, settle_seconds):
    ws = FakeWS()
    session = ps.Session(engine, ws)
    session.start()
    chunk = int(chunk_seconds * ps.SAMPLE_RATE)
    t0 = asyncio.get_event_loop().time()
    for i in range(0, len(audio), chunk):
        session.feed(audio[i:i + chunk].tobytes())
        await asyncio.sleep(chunk_seconds)  # simulated real-time feed
    # Give the decode loop a moment to produce the last partial.
    deadline = t0 + settle_seconds + len(audio) / ps.SAMPLE_RATE
    while asyncio.get_event_loop().time() < deadline and len(ws.messages) == 0:
        await asyncio.sleep(0.25)
    await asyncio.sleep(settle_seconds)
    final_text = await session.finish()
    partials = [m["text"] for m in ws.messages if m["type"] == "partial"]
    finals = [m["text"] for m in ws.messages if m["type"] == "final"]
    return partials, finals, final_text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav", help="16 kHz (or resampleable) wav file")
    ap.add_argument("--reference", default="", help="reference transcript for WER")
    ap.add_argument("--model-path", default=os.environ.get("PARAKEET_MODEL_PATH", ""))
    ap.add_argument("--chunk-seconds", type=float, default=0.5)
    ap.add_argument("--settle-seconds", type=float, default=3.0)
    ap.add_argument("--device", default="", help="cuda | mps | cpu")
    args = ap.parse_args()

    if args.device:
        os.environ["PARAKEET_DEVICE"] = args.device
    ps.ARGS = argparse.Namespace(model_path=args.model_path)

    print(f"loading engine (stub={os.environ.get('PARAKEET_STUB') == '1'})…")
    engine = ps.Engine()
    print(f"engine ready: device={engine.device}")

    failures = []

    if args.wav:
        audio = load_wav(args.wav)
        dur = len(audio) / ps.SAMPLE_RATE
        print(f"\n[batch] {args.wav} ({dur:.1f}s)")
        batch_text = engine.transcribe(audio)
        print(f"  text: {batch_text}")
        if args.reference:
            b_wer = wer(args.reference, batch_text)
            print(f"  WER vs reference: {b_wer * 100:.1f}%")
            if b_wer > 0.35:
                failures.append(f"batch WER too high: {b_wer:.2f}")

        print(f"\n[stream] chunk={args.chunk_seconds}s (simulated real-time)")
        partials, finals, final_text = asyncio.run(run_stream(
            engine, audio, args.chunk_seconds, args.settle_seconds
        ))
        print(f"  partials: {len(partials)}, finals: {len(finals)}")
        if partials:
            print(f"  first partial: {partials[0]}")
            print(f"  last  partial: {partials[-1]}")
        stream_text = " ".join(finals + ([final_text] if final_text else [])).strip()
        print(f"  stream text: {stream_text}")

        if len(partials) < 1:
            failures.append("streaming produced no incremental partials")
        if not stream_text and batch_text.strip():
            failures.append("streaming produced no final text though batch did")
        if args.reference and batch_text.strip():
            s_wer = wer(args.reference, stream_text)
            print(f"  stream WER vs reference: {s_wer * 100:.1f}%")
            if s_wer > b_wer + 0.10:
                failures.append(f"stream WER ({s_wer:.2f}) much worse than batch ({b_wer:.2f})")
    else:
        # No wav — still exercise the pipeline with synthetic speech-like noise.
        rng = np.random.default_rng(7)
        t = np.arange(ps.SAMPLE_RATE * 3, dtype=np.float32) / ps.SAMPLE_RATE
        audio = (0.2 * np.sin(2 * np.pi * 220 * t) * (1 + np.sin(2 * np.pi * 3 * t))).astype(np.float32)
        audio += 0.001 * rng.standard_normal(len(audio)).astype(np.float32)
        print("\n[stream] synthetic tone (protocol smoke test)")
        partials, finals, final_text = asyncio.run(run_stream(engine, audio, 0.5, 3.0))
        print(f"  partials: {len(partials)}, finals: {len(finals)}, final: {final_text!r}")

    if failures:
        print("\nFAILED:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nPASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
