import { buildNotesSystem, LOCAL_CONTEXT_TOKENS } from "./aiPrompts";
import { localLlmChat } from "./localLlm";
import { openrouterChatWithRetry } from "./openrouterCore";

const CLOUD_CHARS = 240_000;
const LOCAL_CHARS = 20_000;
const FINAL_MAX_TOKENS = 8_000;

export async function completeWithFallback(openrouterKeys, messages, opts = {}) {
  if (opts.aiProvider === "localOnly") return localLlmChat(opts.localLlmModel, messages, opts);
  if (!openrouterKeys?.some((key) => key?.key)) throw new Error("Add your OpenRouter API key in Settings, or choose a downloaded local model.");
  return openrouterChatWithRetry(openrouterKeys, messages, opts);
}

function textFromLines(lines) { return (lines || []).map((line) => line.text || "").filter(Boolean).join("\n\n"); }
function chunks(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const out = []; let current = "";
  for (const word of text.split(/\s+/)) {
    if (`${current} ${word}`.length > maxChars && current) { out.push(current); current = word; }
    else current += `${current ? " " : ""}${word}`;
  }
  if (current) out.push(current);
  return out;
}
async function run(keys, messages, options = {}) {
  return completeWithFallback(keys.openrouterKeys || [], messages, { aiProvider: keys.aiProvider || "cloud", localLlmModel: keys.localLlmModel || "qwen2.5-3b", ...options });
}
async function summarizeLong(keys, source, system, onProgress) {
  const parts = chunks(source, keys.aiProvider === "localOnly" ? LOCAL_CHARS : CLOUD_CHARS);
  if (parts.length === 1) {
    onProgress({ stage: "writing", part: 0, totalParts: 1, percent: 15 });
    const result = await run(keys, [{ role: "user", content: `Write complete notes from this transcript:\n\n${source}` }], { system, maxTokens: FINAL_MAX_TOKENS, temperature: 0.3, onToken: (_piece, full) => onProgress({ stage: "writing", part: 0, totalParts: 1, percent: Math.min(94, 15 + full.length / 160) }) });
    onProgress({ stage: "done", part: 1, totalParts: 1, percent: 100 }); return result;
  }
  const partials = [];
  for (let index = 0; index < parts.length; index += 1) {
    onProgress({ stage: "analyzing", part: index, totalParts: parts.length, percent: 5 + (index / parts.length) * 65 });
    partials.push((await run(keys, [{ role: "user", content: `Extract every decision, action, fact, name, date, number and explanation from transcript part ${index + 1}/${parts.length}.\n\n${parts[index]}` }], { system: "You preserve complete, factual source notes. Do not invent details.", maxTokens: 4000, temperature: 0.2 })).text);
  }
  onProgress({ stage: "writing", part: parts.length, totalParts: parts.length, percent: 78 });
  const result = await run(keys, [{ role: "user", content: `Create one definitive, deeply detailed set of notes from these ordered findings:\n\n${partials.join("\n\n---\n\n")}` }], { system, maxTokens: FINAL_MAX_TOKENS, temperature: 0.3 });
  onProgress({ stage: "done", part: parts.length, totalParts: parts.length, percent: 100 }); return result;
}

export async function generateNotes(keys, transcriptLines, onProgress = () => {}) { return summarizeLong(keys, textFromLines(transcriptLines), buildNotesSystem(keys.aiBehavior), onProgress); }
export async function generateFolderNotes(keys, sources, onProgress = () => {}) {
  const source = (sources || []).map((recording, index) => `RECORDING ${index + 1}: ${recording.label || "Untitled"}\n${textFromLines(recording.transcript)}\n${recording.aiNotes || ""}`).join("\n\n==========\n\n");
  return summarizeLong(keys, source, buildNotesSystem(keys.aiBehavior), onProgress);
}
export async function askQuestion(keys, transcriptLines, notesText, question, history = []) {
  const context = `TRANSCRIPT:\n${textFromLines(transcriptLines)}\n\nNOTES:\n${notesText || "(none)"}`;
  return (await run(keys, [...(history || []).slice(-8), { role: "user", content: `${context}\n\nQuestion: ${question}\n\nAnswer only from the provided material. Say when the answer is not present.` }], { system: "You answer questions accurately from a user's meeting notes. Be specific and concise.", maxTokens: 1600, temperature: 0.2 })).text;
}
export function hasApiKey(keys) { return !!keys?.openrouterKeys?.some((key) => key?.key); }
export async function askLibrary(keys, question, recordings) {
  const source = (recordings || []).slice(0, 40).map((recording, index) => `[${index + 1}] ${recording.label || "Untitled"}\n${textFromLines(recording.transcript)}\n${recording.aiNotes || ""}`).join("\n\n");
  const result = await run(keys, [{ role: "user", content: `LIBRARY:\n${source}\n\nQuestion: ${question}\n\nAnswer from the library only. Cite relevant recordings as [number].` }], { system: "You are a precise personal knowledge assistant. Never invent citations.", maxTokens: 1800, temperature: 0.2 });
  return { text: result.text, sources: (recordings || []).slice(0, 40).map((recording, index) => ({ n: index + 1, id: recording.id, label: recording.label || "Untitled" })) };
}
export function getModel() { return { localContextTokens: LOCAL_CONTEXT_TOKENS }; }
