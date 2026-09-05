const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const MODEL_PRIORITY = [
  { id: "nvidia/nemotron-3-ultra-free", context: 1_000_000, maxOutput: 32768 },
  { id: "google/gemma-4-31b-it:free", context: 256_000, maxOutput: 32768 },
  { id: "nvidia/nemotron-3-super-free", context: 262_000, maxOutput: 32768 },
];

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
  return data.choices?.[0]?.message?.content || "";
}

async function openrouterChatWithRetry(apiKeys, messages, opts) {
  if (!apiKeys || apiKeys.length === 0) throw new Error("No active OpenRouter API keys configured");
  const errors = [];
  for (const k of apiKeys) {
    try {
      const result = await openrouterChat(k.key, messages, opts);
      return { text: result, provider: "openrouter", keyName: k.name || "OpenRouter" };
    } catch (err) {
      errors.push(`${k.name || "OpenRouter"}: ${err.message}`);
    }
  }
  throw new Error(errors.join("\n"));
}

export { openrouterChat, openrouterChatWithRetry, OPENROUTER_BASE, MODEL_PRIORITY };
