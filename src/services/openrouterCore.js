const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const MODEL_PRIORITY = [
  { id: "inclusionai/ling-3.2-flash:free", label: "Ling 3.2 Flash", context: 1_048_576, maxOutput: 262_144 },
];

// Strip reasoning blocks and a wrapping ```markdown fence some models emit.
function cleanOutput(text) {
  return (text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, "$1")
    .trim();
}

// Transient failures worth retrying: rate limits, overload, timeouts, network drops.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch() wrapper that retries transient errors (429/5xx/network) with
 * exponential backoff. Non-retryable responses are returned as-is so the
 * caller can surface the provider's detailed error message.
 */
async function fetchWithRetry(url, options, { retries = 2, baseDelayMs = 1200 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
      lastErr.status = res.status;
      lastErr.res = res;
    } catch (err) {
      // Network-level failure (fetch rejects) — retryable.
      lastErr = err;
    }
    if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastErr;
}

async function openrouterChat(apiKey, messages, { system, maxTokens = 4096, temperature = 0.3 } = {}) {
  if (!apiKey) throw new Error("Missing OpenRouter API key");

  const body = {
    model: MODEL_PRIORITY[0].id,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
    temperature,
    max_tokens: Math.min(maxTokens, MODEL_PRIORITY[0].maxOutput),
  };

  let res;
  try {
    res = await fetchWithRetry(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://ovio.app",
        "X-Title": "Ovio Meeting Notes",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err && err.status && err.res) {
      const text = await err.res.text().catch(() => "");
      throw new Error(`OpenRouter error ${err.status} (after retries): ${text}`);
    }
    throw new Error(`OpenRouter request failed: ${err?.message || err}`);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`OpenRouter error: ${data.error.message || JSON.stringify(data.error)}`);
  const text = cleanOutput(data.choices?.[0]?.message?.content);
  if (!text) throw new Error(`${MODEL_PRIORITY[0].id} returned an empty response`);
  return text;
}

async function openrouterChatWithRetry(apiKeys, messages, opts) {
  // Ignore entries with no usable key material (e.g. a stored key that could
  // not be decrypted) so the error message is actionable.
  const keys = (apiKeys || []).filter((k) => k && k.key);
  if (keys.length === 0) {
    throw new Error(
      (apiKeys || []).length > 0
        ? "OpenRouter keys are saved but their values could not be read — re-add the key in Settings"
        : "No active OpenRouter API keys configured"
    );
  }
  const errors = [];
  for (const k of keys) {
    try {
      const result = await openrouterChat(k.key, messages, opts);
      return { text: result, provider: "openrouter", keyName: `OpenRouter · ${MODEL_PRIORITY[0].label}` };
    } catch (err) {
      errors.push(`${k.name || "OpenRouter"}: ${err.message}`);
    }
  }
  throw new Error(errors.join("\n"));
}

export { openrouterChat, openrouterChatWithRetry, OPENROUTER_BASE, MODEL_PRIORITY };
