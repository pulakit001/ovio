const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const FALLBACK_MODELS = [
  {
    id: "nvidia/nemotron-3-ultra-free",
    name: "NVIDIA Nemotron 3 Ultra",
    context: 1_000_000,
    maxOutput: 32_768,
  },
  {
    id: "google/gemma-4-31b-it:free",
    name: "Google Gemma 4 31B",
    context: 256_000,
    maxOutput: 32_768,
  },
  {
    id: "nvidia/nemotron-3-super-free",
    name: "NVIDIA Nemotron 3 Super",
    context: 262_000,
    maxOutput: 32_768,
  },
];

const ACTIVE_MODEL = FALLBACK_MODELS[0];

export function hasOpenRouterKey() {
  return !!OPENROUTER_API_KEY;
}

export function getActiveModel() {
  return ACTIVE_MODEL;
}

export async function openrouterChat(messages, { system, maxTokens = 4096, temperature = 0.3 } = {}) {
  if (!OPENROUTER_API_KEY) throw new Error("Missing OpenRouter API key");

  const body = {
    model: ACTIVE_MODEL.id,
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages,
    ],
    temperature,
    max_tokens: Math.min(maxTokens, ACTIVE_MODEL.maxOutput),
  };

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://ovio.app",
      "X-Title": "Ovio Meeting Notes",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}
