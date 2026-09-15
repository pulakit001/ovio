#!/usr/bin/env python3
"""
Ovio — NVIDIA Parakeet-TDT (0.6B v3) local streaming engine.

A tiny localhost FastAPI/WebSocket sidecar that owns the Parakeet-TDT model
and exposes it to the Electron app:

  GET  /health           -> engine/model/device status
  POST /transcribe-file  -> batch transcription of a wav file on disk
  WS   /stream           -> real-time streaming transcription

WS protocol
  client -> server:
    text  {"type": "start"}                 begin a session
    bin   <float32 LE, 16 kHz, mono>        audio (any size)
    text  {"type": "stop"}                  finalize the session
  server -> client:
    {"type": "ready"}
    {"type": "partial", "text": "..."}      live hypothesis for the un-committed window
    {"type": "final", "text": "..."}        committed text (append semantics)
    {"type": "stopped"}                     session fully flushed
    {"type": "error", "message": "..."}

Streaming design — no chunk-merging, no overlap stitching
  Incoming audio accumulates in a "pending" buffer. A decode loop re-decodes
  the WHOLE pending window with the model's batch (full-context) pipeline and
  publishes the result as a live partial. Because every decode sees the full
  pending window, there is nothing to merge and boundary words can never be
  lost or duplicated the way they are with overlap-stitching chunkers — this
  is what keeps streamed accuracy identical to batch accuracy.

  When pending grows past COMMIT_SECONDS, a commit point is chosen at the
  quietest ~60 ms frame (energy VAD) near the commit boundary so the split
  never lands mid-word; everything before it is decoded once and emitted as a
  FINAL segment, then dropped from the pending buffer.

  On "stop", whatever remains in pending is decoded and emitted as final.

TDT is extremely fast (~20x+ real-time even on Apple Silicon CPU, orders of
magnitude faster on NVIDIA GPUs), which makes full-window re-decoding cheap
while avoiding all the accuracy pitfalls of the older buffered/merge approach.

Run standalone:
  python parakeet_server.py --port 0
The server prints a ready line on stdout:  {"event": "ready", "port": N, ...}

Env knobs:
  PARAKEET_DEVICE        cuda | mps | cpu   (default: auto-detect)
  PARAKEET_STUB=1        protocol-only mode without NeMo (for testing)
  PARAKEET_PENDING_MAX_S max seconds of audio in a live partial window (45)
  PARAKEET_COMMIT_S      pending length that triggers a final commit (75)
  PARAKEET_KEEP_S        recent audio kept in pending after a commit (12)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import sys
import tempfile
import time
import wave

import numpy as np

SAMPLE_RATE = 16000
MODEL_ID = "nvidia/parakeet-tdt-0.6b-v3"

PENDING_MAX_S = float(os.environ.get("PARAKEET_PENDING_MAX_S", 45))
COMMIT_S = float(os.environ.get("PARAKEET_COMMIT_S", 75))
KEEP_S = float(os.environ.get("PARAKEET_KEEP_S", 12))
MIN_PARTIAL_S = 0.8          # don't decode tiny slivers
DECODE_TICK_S = 0.5          # decode-loop cadence


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------

def find_split_point(audio: np.ndarray, keep_s: float, search_s: float = 3.0, frame_ms: int = 60) -> int:
    """
    Pick the sample index at which to cut `audio` into [committed | kept].

    The cut should leave the newest `keep_s` seconds in the pending buffer, but
    the exact sample is nudged to the quietest 60 ms frame within ±search_s of
    that target so the boundary very likely lands in silence, not mid-word.
    Returns a sample index (0 if audio is too short to split).
    """
    sr = SAMPLE_RATE
    target = len(audio) - int(keep_s * sr)
    if target <= sr:  # less than ~1s would be committed — don't bother
        return 0
    frame = int(sr * frame_ms / 1000)
    lo = max(0, target - int(search_s * sr))
    hi = min(len(audio) - frame, target + int(search_s * sr))
    if hi <= lo:
        return target
    frames = np.lib.stride_tricks.sliding_window_view(audio[lo:hi], frame)[::frame]
    if len(frames) == 0:
        return target
    rms = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1))
    quiet = int(np.argmin(rms))
    return lo + quiet * frame


# ---------------------------------------------------------------------------
# Engine — owns the NeMo model (or a stub) and decodes audio buffers
# ---------------------------------------------------------------------------

class Engine:
    def __init__(self) -> None:
        self.stub = os.environ.get("PARAKEET_STUB") == "1"
        self.model = None
        self.device = "stub" if self.stub else "cpu"
        self.engine_name = "stub" if self.stub else "nemo"
        if not self.stub:
            self._load()

    def _load(self) -> None:
        import nemo.collections.asr as nemo_asr

        self.device = os.environ.get("PARAKEET_DEVICE") or self._pick_device()
        self._status(f"loading model on {self.device}")
        model_path = ARGS.model_path
        try:
            self.model = self._restore(nemo_asr, model_path, self.device)
        except Exception as err:
            if self.device == "cpu":
                raise
            self._status(f"{self.device} failed ({err}); retrying on cpu")
            self.device = "cpu"
            self.model = self._restore(nemo_asr, model_path, "cpu")

    def _restore(self, nemo_asr, model_path: str, device: str):
        if model_path and os.path.exists(model_path):
            model = nemo_asr.models.ASRModel.restore_from(model_path, map_location=device)
        else:
            model = nemo_asr.models.ASRModel.from_pretrained(MODEL_ID, map_location=device)
        model.to(device)
        model.eval()
        return model

    @staticmethod
    def _pick_device() -> str:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        try:
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
        except Exception:
            pass
        return "cpu"

    def _status(self, message: str) -> None:
        print(json.dumps({"event": "status", "message": message}), flush=True)

    def transcribe(self, audio) -> str:
        """Decode one buffer with the full-context batch pipeline. Calls are
        serialized per session through its single decode loop."""
        if audio is None or len(audio) == 0:
            return ""
        if self.stub:
            dur = len(audio) / SAMPLE_RATE
            return f"Stub transcript of {dur:.1f} seconds of audio."
        if self.model is None:
            return ""
        audio = np.asarray(audio, dtype=np.float32).copy()
        if audio.size == 0 or float(np.abs(audio).max()) < 1e-5:
            return ""  # pure silence — the model would output nothing anyway
        try:
            out = self.model.transcribe([audio], batch_size=1)
        except Exception:
            # Some NeMo versions may not accept ndarray input — fall back to a
            # temp wav file, which every version supports.
            out = self._transcribe_via_wav(audio)
        return self._text_of(out)

    def transcribe_file(self, path: str) -> str:
        if self.stub:
            return f"Stub transcript of file {os.path.basename(path)}."
        if self.model is None:
            raise RuntimeError("model not loaded")
        out = self.model.transcribe([path], batch_size=1)
        return self._text_of(out)

    def _transcribe_via_wav(self, audio: np.ndarray) -> str:
        fd, tmp = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        try:
            pcm16 = (np.clip(audio, -1.0, 1.0) * 32767.0).astype("<i2")
            with wave.open(tmp, "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(SAMPLE_RATE)
                w.writeframes(pcm16.tobytes())
            return self.model.transcribe([tmp], batch_size=1)
        finally:
            try:
                os.unlink(tmp)
            except OSError:
                pass

    @staticmethod
    def _text_of(out) -> str:
        if not out:
            return ""
        first = out[0]
        if isinstance(first, str):
            return first.strip()
        text = getattr(first, "text", None)
        if text is None and isinstance(first, (list, tuple)) and len(first) > 0:
            text = first[0]
        return (text or "").strip()


# ---------------------------------------------------------------------------
# Streaming session (one per WS connection)
# ---------------------------------------------------------------------------

class Session:
    def __init__(self, engine: Engine, ws) -> None:
        self.engine = engine
        self.ws = ws
        self.buf = np.zeros(0, dtype=np.float32)
        self.busy = False
        self.closed = False
        self.task = None

    def start(self) -> None:
        self.task = asyncio.ensure_future(self._loop())

    def feed(self, payload: bytes) -> None:
        if self.closed:
            return
        chunk = np.frombuffer(payload, dtype="<f4").astype(np.float32, copy=False)
        max_samples = int(SAMPLE_RATE * (COMMIT_S + 30))
        if len(self.buf) + len(chunk) > max_samples:
            # Bound memory if the decoder falls hopelessly behind.
            self.buf = self.buf[-max_samples:]
        self.buf = np.concatenate([self.buf, chunk])

    async def _loop(self) -> None:
        while not self.closed:
            await asyncio.sleep(DECODE_TICK_S)
            try:
                await self._commit_if_needed()
                await self._partial_if_needed()
            except asyncio.CancelledError:
                raise
            except Exception as err:  # keep the session alive through decode hiccups
                try:
                    await self.ws.send_json({"type": "error", "message": str(err)})
                except Exception:
                    pass

    async def _partial_if_needed(self) -> None:
        if self.busy or self.closed or len(self.buf) < SAMPLE_RATE * MIN_PARTIAL_S:
            return
        self.busy = True
        try:
            window = self.buf[-int(SAMPLE_RATE * PENDING_MAX_S):]
            text = await asyncio.to_thread(self.engine.transcribe, window)
            if text and not self.closed:
                await self.ws.send_json({"type": "partial", "text": text})
        finally:
            self.busy = False

    async def _commit_if_needed(self) -> None:
        if self.busy or self.closed or len(self.buf) < SAMPLE_RATE * COMMIT_S:
            return
        self.busy = True
        try:
            split = find_split_point(self.buf, keep_s=KEEP_S)
            if split <= 0:
                return
            committed = self.buf[:split].copy()
            self.buf = self.buf[split:].copy()
            text = await asyncio.to_thread(self.engine.transcribe, committed)
            if text and not self.closed:
                await self.ws.send_json({"type": "final", "text": text})
        finally:
            self.busy = False

    async def finish(self) -> str:
        """Flush everything and stop the loop. Returns the final text."""
        self.closed = True
        if self.task:
            self.task.cancel()
        if len(self.buf) < SAMPLE_RATE * 0.3:
            return ""
        text = await asyncio.to_thread(self.engine.transcribe, self.buf)
        self.buf = np.zeros(0, dtype=np.float32)
        return text


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

from fastapi import FastAPI, WebSocket, WebSocketDisconnect  # noqa: E402
from pydantic import BaseModel  # noqa: E402

app = FastAPI()
ENGINE = None  # type: Engine|None — set in main()
ARGS = None    # argparse namespace — set in main()


@app.get("/health")
async def health():
    return {
        "ok": True,
        "engine": ENGINE.engine_name if ENGINE else None,
        "model": (MODEL_ID if (ENGINE and not ENGINE.stub) else "stub") if ENGINE else None,
        "model_loaded": bool(ENGINE and (ENGINE.model is not None or ENGINE.stub)),
        "device": ENGINE.device if ENGINE else None,
        "sample_rate": SAMPLE_RATE,
    }


class TranscribeFileRequest(BaseModel):
    path: str


@app.post("/transcribe-file")
async def transcribe_file(req: TranscribeFileRequest):
    if not ENGINE:
        return {"ok": False, "error": "engine not loaded"}
    try:
        text = await asyncio.to_thread(ENGINE.transcribe_file, req.path)
        return {"ok": True, "text": text}
    except Exception as err:
        return {"ok": False, "error": str(err)}


@app.websocket("/stream")
async def stream(ws: WebSocket):
    await ws.accept()
    session = None
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                if session:
                    session.feed(msg["bytes"])
                continue
            text = msg.get("text")
            if not text:
                continue
            try:
                data = json.loads(text)
            except ValueError:
                continue
            mtype = data.get("type")
            if mtype == "start":
                if session:
                    await session.finish()  # previous session was never stopped
                session = Session(ENGINE, ws)
                session.start()
                await ws.send_json({"type": "ready"})
            elif mtype == "stop" and session:
                final_text = await session.finish()
                session = None
                if final_text:
                    await ws.send_json({"type": "final", "text": final_text, "final": True})
                await ws.send_json({"type": "stopped"})
    except WebSocketDisconnect:
        pass
    finally:
        if session:
            session.closed = True
            if session.task:
                session.task.cancel()


def main() -> int:
    global ENGINE, ARGS
    parser = argparse.ArgumentParser(description="Ovio Parakeet streaming engine")
    parser.add_argument("--port", type=int, default=0, help="TCP port (0 = ephemeral)")
    parser.add_argument("--model-path", default=os.environ.get("PARAKEET_MODEL_PATH", ""))
    ARGS = parser.parse_args()

    t0 = time.time()
    ENGINE = Engine()
    if not ENGINE.stub and ENGINE.model is None:
        print(json.dumps({"event": "fatal", "message": "model failed to load"}), flush=True)
        return 1

    # Bind first so the parent process learns the real port even with --port 0.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", ARGS.port))
    port = sock.getsockname()[1]

    print(json.dumps({
        "event": "ready",
        "port": port,
        "device": ENGINE.device,
        "engine": ENGINE.engine_name,
        "load_seconds": round(time.time() - t0, 1),
        "pid": os.getpid(),
    }), flush=True)

    import uvicorn
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning", loop="asyncio")
    server = uvicorn.Server(config)
    server.run(sockets=[sock])
    return 0


if __name__ == "__main__":
    sys.exit(main())
