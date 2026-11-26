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
