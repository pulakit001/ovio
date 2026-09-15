export async function verifyGroqKey(key) {
  // Gemini (Google AI Studio) key verification — the provider behind Ovio's
  // cloud notes since the Groq console deprecation. Key formats: AIza…
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models",
    { headers: { "x-goog-api-key": key } }
  );
  if (res.ok) {
    const data = await res.json();
    const models = (data.models || []).map((m) => (m.name || "").replace("models/", ""));
    const hasFlashLite = models.some((m) => m.startsWith("gemini-") && m.includes("flash-lite"));
    return { ok: true, whisperSupported: hasFlashLite };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid API key (" + res.status + ")" };
  if (res.status === 429) return { ok: false, error: "Rate limited (429) — try again shortly" };
  return { ok: false, error: `Verification failed (${res.status})` };
}

export async function verifyOpenRouterKey(key) {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.ok) {
    return { ok: true };
  }
  if (res.status === 401) return { ok: false, error: "Invalid API key (401)" };
  if (res.status === 429) return { ok: false, error: "Rate limited (429)" };
  return { ok: false, error: `Verification failed (${res.status})` };
}
