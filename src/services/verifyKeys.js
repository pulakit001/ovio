export async function verifyOpenRouterKey(key) {
  if (!key) return { ok: false, error: "Paste your OpenRouter API key to continue." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    // `/models` is public and returns 200 without a key. `/auth/key` requires
    // authentication, so a successful response proves this key is usable.
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Invalid API key (401)" };
    if (res.status === 429) return { ok: false, error: "Rate limited (429)" };
    return { ok: false, error: `Verification failed (${res.status})` };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === "AbortError"
        ? "OpenRouter verification timed out. Check your connection and try again."
        : "Could not reach OpenRouter. Check your connection and try again.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
