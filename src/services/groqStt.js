const GROQ_BASE = "https://api.groq.com/openai/v1";

/**
 * Convert Float32Array PCM (16kHz mono) to a WAV Blob.
 */
export function pcmToWavBlob(pcm, sampleRate = 16000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < pcm.length; i++, offset += bytesPerSample) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Transcribe a PCM Float32Array chunk via Groq cloud Whisper.
 * Tries each active Groq key; retries on 429 with backoff.
 * keys: array of { id, key, name, active }
 * model: "whisper-large-v3-turbo" | "whisper-large-v3"
 */
export async function transcribePcmCloud(pcm, keys, { model = "whisper-large-v3-turbo", language = "en" } = {}) {
  if (!keys || keys.length === 0) throw new Error("No Groq key configured for cloud transcription");
  const blob = pcmToWavBlob(pcm);
  const activeKeys = keys.filter((k) => k?.key);

  let lastRateError = "";
  // Try every key at least once so the load is spread across accounts; then
  // a final backoff pass that respects the server's requested retry delay.
  for (const keyObj of activeKeys) {
    let attempt = 0;
    let backoff = 0;
    while (attempt < 3) {
      if (backoff) await sleep(backoff);
      try {
        const form = new FormData();
        form.append("file", new File([blob], "chunk.wav", { type: "audio/wav" }));
        form.append("model", model);
        form.append("language", language);
        form.append("response_format", "json");

        const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${keyObj.key}` },
          body: form,
        });

        if (res.status === 429) {
          const errBody = await res.text().catch(() => "");
          const retry = extractRetrySeconds(errBody, res.headers.get("retry-after"));
          lastRateError = formatRateError(errBody);
          backoff = Math.max(2000, retry) + 500; // wait past the server's window
          attempt++;
          continue;
        }
        if (!res.ok) {
          throw new Error(`Groq STT error ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        return data.text || "";
      } catch (err) {
        if (attempt < 2) {
          await sleep(2 ** attempt * 1000);
          attempt++;
        } else {
          throw err;
        }
      }
    }
  }
  if (lastRateError) throw new Error(lastRateError);
  throw new Error("All Groq STT keys failed");
}

// Pull the "try again in Ns" figure out of a 429 body or Retry-After header.
function extractRetrySeconds(body, header) {
  if (header) {
    const n = parseFloat(header);
    if (!Number.isNaN(n)) return Math.ceil(n * 1000);
  }
  const m = /try again in ([0-9.]+)s/.exec(body || "");
  if (m) return Math.ceil(parseFloat(m[1]) * 1000);
  return 0;
}

// Turn a raw 429 JSON blob into a short, human-friendly message.
function formatRateError(body) {
  let msg = "Groq rate limit reached — transcription temporarily paused.";
  if (!body) return msg;
  try {
    const json = JSON.parse(body);
    const raw = json?.error?.message || "";
    const model = /for model `?([^ `]+)`?/.exec(raw);
    const retry = /try again in ([0-9.]+)s/.exec(raw);
    let friendly = "Groq rate limit reached";
    if (model) friendly += ` on ${model[1]}`;
    friendly += ".";
    if (retry) friendly += ` Retrying in ~${Math.ceil(parseFloat(retry[1]))}s.`;
    return friendly;
  } catch {
    return msg;
  }
}
