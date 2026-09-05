export async function verifyGroqKey(key) {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.ok) {
    const data = await res.json();
    const models = data.data || [];
    const hasWhisper = models.some((m) => m.id === "whisper-large-v3-turbo" || m.id === "whisper-large-v3");
    return { ok: true, whisperSupported: hasWhisper };
  }
  if (res.status === 401) return { ok: false, error: "Invalid API key (401)" };
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
