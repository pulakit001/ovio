/**
 * Ollama client — local LLM integration for AI notes.
 *
 * Talks to the Ollama HTTP API (default http://localhost:11434):
 *   GET  /api/tags  → list installed models / check the daemon is up
 *   POST /api/chat  → chat completion (stream: false)
 *
 * No API key is required — everything stays on the user's machine.
 */

export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
export const OLLAMA_DEFAULT_MODEL = "llama3.2";

export function normalizeOllamaUrl(url) {
  const u = (url || "").trim() || OLLAMA_DEFAULT_URL;
  return u.replace(/\/+$/, "");
}

/**
 * Check that the Ollama daemon is reachable and gather installed models.
 * Returns { ok, models: [{ id, name, size }], url } on success,
 * or { ok: false, error } on failure. Aborts quickly (2.5s) so the UI
 * never hangs on a dead port.
 */
export async function checkOllama(url = OLLAMA_DEFAULT_URL, { timeoutMs = 2500 } = {}) {
  const base = normalizeOllamaUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) {
      return { ok: false, error: `Ollama responded with HTTP ${res.status}`, url: base };
    }
    const data = await res.json();
    const models = (data.models || []).map((m) => ({
      id: m.name,
      name: m.name,
      size: m.size,
    }));
    return {
      ok: true,
      models,
      url: base,
      error: models.length === 0 ? "Connected, but no models are installed (run: ollama pull llama3.2)" : "",
    };
  } catch (err) {
    const aborted = err && err.name === "AbortError";
    return {
      ok: false,
      url: base,
      error: aborted
        ? "Ollama did not respond in time — is it running?"
        : "Ollama not reachable — start it with `ollama serve`",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single chat completion against a local Ollama model.
 * Mirrors the shape of groqChat / openrouterChat.
 *
 * Robustness: the model is kept warm for 30 minutes between requests
 * (keep_alive) so repeat calls start instantly, the context window is raised
 * to 8192 tokens so long transcripts fit, and transient failures (daemon busy
 * loading the model, connection resets) are retried with a short backoff.
 */
export async function ollamaChat(url, model, messages, { system, maxTokens = 4096, temperature = 0.3, timeoutMs = 180000 } = {}) {
  const body = {
    model: model || OLLAMA_DEFAULT_MODEL,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
    stream: false,
    keep_alive: "30m",
    options: {
      temperature,
      num_predict: maxTokens,
      num_ctx: 8192, // long transcripts need more room than the 2048 default
    },
  };

  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${normalizeOllamaUrl(url)}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        // 404 usually means the model isn't installed — not retryable.
        throw new Error(`Ollama error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.message?.content || "";
    } catch (err) {
      lastErr = err;
      const aborted = err?.name === "AbortError";
      const retryable =
        aborted || /ECONNRESET|ECONNREFUSED|EPIPE|fetch failed|network/i.test(err?.message || "");
      if (retryable && attempt < 1) {
        // The daemon is often just loading the model into memory — give it a beat.
        await new Promise((r) => setTimeout(r, 2500));
        continue;
      }
      if (aborted) {
        throw new Error("Ollama took too long to respond — try a smaller/faster model in Settings.");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/**
 * Try the configured model first; if none is configured (or it fails),
 * fall back to whatever models are installed locally.
 * Returns { text, provider, keyName } like the cloud providers do.
 */
export async function ollamaChatWithRetry(ollamaCfg, messages, opts = {}) {
  const url = normalizeOllamaUrl(ollamaCfg?.url);
  const errors = [];
  const candidates = [];

  if (ollamaCfg?.model) candidates.push(ollamaCfg.model);

  if (candidates.length === 0) {
    const status = await checkOllama(url);
    if (status.ok && status.models.length > 0) {
      candidates.push(...status.models.map((m) => m.id));
    } else {
      throw new Error(status.error || "Ollama is not reachable or has no models installed");
    }
  }

  for (const model of [...new Set(candidates)]) {
    try {
      const text = await ollamaChat(url, model, messages, opts);
      return { text, provider: "ollama", keyName: `Ollama (${model})` };
    } catch (err) {
      errors.push(`Ollama ${model}: ${err.message}`);
    }
  }

  throw new Error(errors.join("\n"));
}

