// Gemini (Google AI Studio) — Ovio's primary cloud notes provider.
// Replaces the old Groq console integration: same internal interface
// (chatWithRetry + prompt builders), different wire format.
//
// Model: Gemini Flash-Lite — the cheapest, fastest Flash tier that still
// holds quality on structured note-writing. Fallback ids step down the
// flash-lite lineage if one is ever retired.
//
// Context strategy: Flash-Lite carries a ~1M-token window, so the notes
// pipeline (services/ai.js) reads PROVIDER_CONTEXTS from here and raises
// its chunk sizes accordingly — small transcripts go in one call; huge ones
// are split into the smallest number of big "chining agent" chunks, and the
// merge stage only runs when the combined digests are still too big.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Primary + fallbacks (cheapest first). Kept in one place so a model
// retirement is a one-line fix.
export const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

// Token budget we design around (Flash-Lite window is ~1M; we stay far below
// it for attention quality). Roughly: 1 token ≈ 4 chars ≈ 0.75 words.
export const GEMINI_CONTEXT_TOKENS = 200000;

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      lastErr = err;
    }
    if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt);
  }
  throw lastErr;
}

// One Gemini generateContent call. Returns the text or "" (empty).
async function geminiCall(apiKey, messages, { system, maxTokens = 8192, temperature = 0.3 } = {}) {
  if (!apiKey) throw new Error("Missing Gemini API key");

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  let res;
  try {
    res = await fetchWithRetry(
      `${GEMINI_BASE}/models/${GEMINI_MODELS[0]}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      }
    );
  } catch (err) {
    if (err && err.status && err.res) {
      const text = await err.res.text().catch(() => "");
      throw new Error(`Gemini error ${err.status} (after retries): ${text}`);
    }
    throw new Error(`Gemini request failed: ${err?.message || err}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").trim();
  return text;
}

// Multi-key + model-fallback wrapper. Mirrors groqChatWithRetry's contract:
// returns { text, provider, keyName } or throws an aggregated error.
async function geminiChatWithRetry(apiKeys, messages, opts) {
  const keys = (apiKeys || []).filter((k) => k && k.key);
  if (keys.length === 0) {
    throw new Error(
      (apiKeys || []).length > 0
        ? "Gemini keys are saved but their values could not be read — re-add the key in Settings"
        : "No active Gemini API keys configured"
    );
  }
  const errors = [];
  for (const k of keys) {
    for (const model of GEMINI_MODELS) {
      try {
        const text = await geminiCall(k.key, messages, { ...opts, model });
        if (!text || !text.trim()) throw new Error("Gemini returned an empty response");
        return { text, provider: "gemini", keyName: k.name || "Gemini" };
      } catch (err) {
        errors.push(`${k.name || "Gemini"} (${model}): ${err.message}`);
        // 401/403 = key problem: no point trying other models with this key.
        if (/error 40[13]/.test(err.message)) break;
      }
    }
  }
  throw new Error(errors.join("\n"));
}

// User's AI-behavior settings woven into every prompt (same shape as the
// old Groq builders so the rest of the app is untouched).
export function buildAiBehaviorBlock(behavior) {
  const b = behavior || {};
  const lines = [];
  if (b.customInstructions && String(b.customInstructions).trim()) {
    lines.push(
      `USER'S CUSTOM INSTRUCTIONS (highest priority, follow exactly):\n${String(b.customInstructions).trim()}`
    );
  }
  const skills = b.skills || {};
  const sections = [];
  if (skills.overview !== false) {
    sections.push(
      "## Overview\n2-4 well-developed paragraphs: what this session was, who took part (names and roles when mentioned), why it happened, the main topics covered, and the single most important outcome."
    );
  }
  if (skills.keyPoints !== false) {
    sections.push(
      "## Key Takeaways\n6-12 bullets. Each bullet starts with a **bold lead-in phrase** followed by one or two complete, specific sentences. No vague filler."
    );
  }
  if (skills.detailedSummary !== false) {
    sections.push(
      "## Detailed Notes\nThe heart of the document and by far its longest part. One `### <Topic>` subsection for EVERY distinct topic, theme or concept discussed (typically 4-12 subsections). Inside each subsection: open with an explanatory paragraph (what it is, what was said, why it matters), then bullets for the specifics, with indented sub-bullets for supporting detail, examples, numbers and reasoning. Use a table whenever 3+ items are compared or listed with attributes, and numbered lists for steps or sequences."
    );
  }
  if (skills.followUps !== false) {
    sections.push(
      "## Decisions\nBullets: each decision, who made it and the reasoning. Write \"- No explicit decisions were made.\" if none.\n\n" +
      "## Action Items\nTask checkboxes in the form `- [ ] **Owner** — task (deadline)`. Use \"Unassigned\" / omit the deadline when not mentioned. Write \"- No action items were mentioned.\" if none.\n\n" +
      "## Open Questions\nBullets for unresolved questions, risks, disagreements and things to follow up on."
    );
  }
  if (sections.length) lines.push(`NOTE SECTIONS TO PRODUCE (in this order, after the title and TL;DR):\n\n${sections.join("\n\n")}`);
  lines.push(
    b.depth === "concise"
      ? "DEPTH: concise — compress hard, keep only decision-relevant content."
      : "DEPTH: long and exhaustive — this is the user's permanent record. A thorough multi-page document is the goal; when in doubt, include more explanation and detail, not less."
  );
  return lines.join("\n\n");
}

export const NOTES_FORMAT_RULES = `FORMATTING (the app renders ONLY this markdown subset — use nothing else):
- "# Title" once at the very top: a short, specific, descriptive title for the session.
- Directly under it, one "> **TL;DR:** ..." line — two sentences capturing the essence.
- "## Section" for top-level sections and "### Subsection" for topics within them.
- "- " bullets; nest supporting detail with exactly two spaces: "  - detail".
- "1. " numbered lists for steps, sequences or ranked items.
- "- [ ] " checkboxes for action items only.
- Pipe tables with a header row and a |---| separator row.
- "> " for notable direct quotes or key definitions.
- **bold** for key terms, names, figures and dates; *italic* for emphasis; \`code\` for exact identifiers, commands, file names.
- Leave one blank line between blocks. Never use HTML, code fences, or emoji. Never wrap the output in a code block.`;

const NOTES_QUALITY_RULES = `CONTENT RULES:
- Cover EVERYTHING of substance. No topic, point, name, number, date, deadline, example, argument or decision may be missing.
- Explain, don't just list: every idea gets context — what it is, what was said about it, why it matters, how it connects to the rest.
- Preserve exact names, numbers, amounts, dates, IDs and terminology. Use short verbatim quotes when the exact wording matters.
- Organize by ideas and themes, never by chronology. Never include timestamps.
- Clean up the transcript: fix obvious speech-to-text errors from context, drop filler and small talk, but keep every real point.
- Distinguish facts from opinions, and decisions from open questions. Note disagreements explicitly.
- Write in clear, plain language with short sentences. Expand acronyms and briefly explain technical terms the first time they appear.
- Never invent information. If something wasn't said, write "Not mentioned".
- Never produce a wall of text: paragraphs stay under ~5 sentences, broken up by bullets, sub-bullets and tables.`;

export function buildNotesSystem(behavior) {
  return [
    "You are an expert note-taker who turns meeting and lecture transcripts into long, deeply detailed, beautifully structured notes — the kind a reader can study instead of ever listening to the recording.",
    "Output ONLY the notes in markdown. No preamble, no closing remarks, no commentary about the task.",
    NOTES_FORMAT_RULES,
    NOTES_QUALITY_RULES,
    buildAiBehaviorBlock(behavior),
    "Finish with a \"## Summary\" section: 5-8 crisp bullets capturing the most important points of the whole session.",
  ].join("\n\n");
}

export { geminiChatWithRetry as groqChatWithRetry, GEMINI_BASE };
