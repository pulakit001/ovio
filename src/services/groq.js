import { groqChatWithRetry, buildNotesSystem } from "./groqCore";
import { openrouterChatWithRetry } from "./openrouterCore";
import { ollamaChatWithRetry } from "./ollama";

/**
 * Unified AI provider interface with local (Ollama) support.
 *
 * opts.aiProvider controls routing:
 *   "cloud"     → Groq → OpenRouter → Ollama (last-resort local fallback)
 *   "ollama"    → Ollama (local-first) → Groq → OpenRouter
 *   "localOnly" → Ollama only. Nothing ever leaves the device.
 *
 * opts.ollama: { url, model } — the local Ollama daemon config.
 * Returns { text, provider, keyName }.
 */
export async function completeWithFallback(groqKeys, openrouterKeys, messages, opts = {}) {
  const { ollama, aiProvider = "cloud" } = opts;
  const errors = [];

  const tryOllama = async () => {
    if (!ollama || (!ollama.url && !ollama.model)) {
      errors.push("Ollama: not configured (set a URL in Settings)");
      return null;
    }
    try {
      return await ollamaChatWithRetry(ollama, messages, opts);
    } catch (err) {
      errors.push(err.message);
      return null;
    }
  };

  const tryCloud = async () => {
    if (groqKeys && groqKeys.length > 0) {
      try {
        return await groqChatWithRetry(groqKeys, messages, opts);
      } catch (err) {
        errors.push(`Groq: ${err.message}`);
      }
    }
    if (openrouterKeys && openrouterKeys.length > 0) {
      try {
        return await openrouterChatWithRetry(openrouterKeys, messages, opts);
      } catch (err) {
        errors.push(`OpenRouter: ${err.message}`);
      }
    }
    return null;
  };

  let result = null;
  if (aiProvider === "localOnly") {
    result = await tryOllama();
  } else if (aiProvider === "ollama") {
    result = (await tryOllama()) || (await tryCloud());
  } else {
    result = (await tryCloud()) || (await tryOllama());
  }

  if (result) return result;
  throw new Error(errors.length ? errors.join("\n") : "No AI providers configured");
}

/**
 * Generate AI notes from a transcript.
 * keys: { groqKeys, openrouterKeys, agentSkills, aiProvider, ollama }
 * Returns the full result object: { text, provider, keyName }.
 */
export async function generateNotes(keys, transcriptLines) {
  const { groqKeys, openrouterKeys, aiProvider, ollama } = keys;
  // Content only — no timestamps. The summary must be organized by ideas,
  // not chronology, so the model is never given timing information.
  const transcriptText = (transcriptLines || []).map((l) => l.text).join("\n\n");
  const system = buildNotesSystem();
  const result = await completeWithFallback(
    groqKeys,
    openrouterKeys,
    [{ role: "user", content: `Here is the full meeting/lecture transcript:\n\n${transcriptText}` }],
    { system, maxTokens: 8192, temperature: 0.2, aiProvider, ollama }
  );
  return result;
}

/**
 * Ask a question about a recording.
 * history: optional array of previous { role, content } chat turns so
 * follow-up questions keep their context.
 */
export async function askQuestion(keys, transcriptLines, notesText, question, history = []) {
  const { groqKeys, openrouterKeys, aiProvider, ollama } = keys;
  // Cap the transcript so very long recordings can't overflow the model's
  // context window — the most recent lines matter most for answering.
  const MAX_TRANSCRIPT_LINES = 200;
  const lines = transcriptLines && transcriptLines.length > 0 ? transcriptLines : null;
  const transcriptText = lines
    ? lines.slice(-MAX_TRANSCRIPT_LINES).map((l) => `[${l.time}] ${l.text}`).join("\n")
    : "(No transcript captured yet.)";
  const notes = notesText || "(No summary generated yet.)";
  const system = `You are a helpful AI assistant for this session. Answer using ONLY the transcript, summary, and conversation history below. If the answer is not present, say so briefly and do not invent information.

ANSWER STYLE (very important):
- Keep answers SHORT, direct, and clear. Lead with the actual answer in 1-3 sentences.
- NEVER ramble, lecture, or over-explain. Do not repeat or rephrase the question back. Do not add background or context the user did not ask for.
- Use a short bullet list ONLY when the answer genuinely contains multiple items; otherwise answer in plain sentences.
- If more detail exists but was not asked for, offer it in one closing line like "Want the full detail?" instead of dumping it.
- Plain text only for short answers: no headings, no markdown structure, unless the answer is genuinely a list.

TRANSCRIPT:
${transcriptText}

SUMMARY:
${notes}`;
  const messages = [...(history || []), { role: "user", content: question }];
  const result = await completeWithFallback(
    groqKeys,
    openrouterKeys,
    messages,
    // Short reply budget — physically caps rambling while leaving room for a small list.
    { system, maxTokens: 900, temperature: 0.3, aiProvider, ollama }
  );
  return result.text;
}

export function hasApiKey() {
  return true;
}

export function getModel() {
  return "Groq GPT OSS 20B / OpenRouter fallback / Ollama (local)";
}
