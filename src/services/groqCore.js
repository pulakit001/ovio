const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "openai/gpt-oss-20b";

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

async function groqChat(apiKey, messages, { system, maxTokens = 4096, temperature = 0.3 } = {}) {
  if (!apiKey) throw new Error("Missing Groq API key");

  const body = {
    model: GROQ_MODEL,
    messages: [...(system ? [{ role: "system", content: system }] : []), ...messages],
    temperature,
    max_tokens: maxTokens,
  };

  let res;
  try {
    res = await fetchWithRetry(`${GROQ_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err && err.status && err.res) {
      const text = await err.res.text().catch(() => "");
      throw new Error(`Groq error ${err.status} (after retries): ${text}`);
    }
    throw new Error(`Groq request failed: ${err?.message || err}`);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function groqChatWithRetry(apiKeys, messages, opts) {
  if (!apiKeys || apiKeys.length === 0) throw new Error("No active Groq API keys configured");
  const errors = [];
  for (const k of apiKeys) {
    try {
      const result = await groqChat(k.key, messages, opts);
      return { text: result, provider: "groq", keyName: k.name || "Groq" };
    } catch (err) {
      errors.push(`${k.name || "Groq"}: ${err.message}`);
    }
  }
  throw new Error(errors.join("\n"));
}

export function buildNotesSystem() {
  return `You are an elite note-taker and educator. Convert the transcript below into ONE DEEP, IN-DEPTH, WELL-STRUCTURED summary document. The reader must be able to fully understand and study everything that was discussed from your summary alone, without ever seeing the transcript or hearing the session.

OUTPUT FORMAT (follow exactly):
1. Start with a single "# <Short descriptive title>" heading.
2. Then a short opening paragraph (2-4 sentences) that gives the big picture: what the session was about, who/what was involved, and the single most important takeaway.
3. Then organize the body by THEME using "## <Theme heading>" sections — one section per distinct subject or idea of the session. Cover every theme that appeared; nothing may be skipped.
4. Inside each section: write clear explanatory paragraphs that unpack the idea (what it is, what was said about it, why it matters, how it connects to other ideas), and use bullet points whenever several items are listed. **Bold** key terms, names, and figures; use \`code\` for exact identifiers; use markdown tables when comparing several items.
5. End with a final "## Summary Points" section: 5-10 crisp bullet points capturing the most important study points of the whole session.

DEPTH & COVERAGE RULES (most important):
- Cover EVERYTHING. No topic, point, name, number, decision, deadline, example, or argument from the transcript may be missing.
- Explain, don't just list. For every idea add context: what it is, what was said about it, why it matters, and how it connects to the rest of the session.
- Go long. A thorough 1-2 page summary is better than a compressed half page. When in doubt, include more explanation, not less.
- Preserve exact names, numbers, dates, deadlines, dollar amounts, IDs, and URLs. Use short verbatim quotes when the exact wording matters.
- Weave action items, decisions, and open questions naturally into the relevant theme sections.
- Distinguish facts from opinions, and decisions from open questions.

STYLE RULES:
- Organized by IDEAS and THEMES, never by time. Do NOT mention when anything was said, do not use timestamps, and do not narrate the order the conversation happened in. Group related content by theme even if it was scattered across the session.
- Write in simple, everyday language: short sentences, no unexplained jargon. Expand every acronym and briefly explain every technical term the first time it appears.
- NEVER write one giant wall of text — always break the content into headed sections and bullets as described above.
- If information is absent, write "Not mentioned" rather than guessing.`;
}

export { groqChat, groqChatWithRetry, GROQ_MODEL, GROQ_BASE };
