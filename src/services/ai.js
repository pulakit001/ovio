import { groqChatWithRetry, buildNotesSystem, buildAiBehaviorBlock, GEMINI_CONTEXT_TOKENS } from "./geminiCore";
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
    // Cloud first. If cloud keys ARE configured but every one of them failed,
    // surface the errors instead of silently falling back to Ollama — a silent
    // local fallback makes it look like the cloud setting "reverted" to local
    // AI with no explanation. The Ollama fallback only applies when no cloud
    // keys are configured at all.
    const cloudConfigured =
      (groqKeys || []).some((k) => k?.key) || (openrouterKeys || []).some((k) => k?.key);
    const cloudResult = await tryCloud();
    if (cloudResult) {
      result = cloudResult;
    } else if (cloudConfigured) {
      throw new Error(errors.length ? errors.join("\n") : "All cloud API keys failed");
    } else {
      result = await tryOllama();
    }
  }

  if (result) return result;
  throw new Error(errors.length ? errors.join("\n") : "No AI providers configured");
}

/**
 * Generate AI notes from a transcript.
 * keys: { groqKeys, openrouterKeys, aiProvider, ollama }
 * Returns the full result object: { text, provider, keyName }.
 */
// `keys.aiBehavior` (Settings → AI Behavior) is woven into every prompt —
// custom instructions, required note sections and depth.
export async function generateNotes(keys, transcriptLines, onProgress = () => {}) {
  const { groqKeys, openrouterKeys, aiProvider, ollama } = keys;
  const behavior = keys.aiBehavior;
  // Content only — no timestamps. The summary must be organized by ideas,
  // not chronology, so the model is never given timing information.
  const transcriptText = (transcriptLines || []).map((l) => l.text).join("\n\n");
  const system = buildNotesSystem(behavior);
  const isLocal = aiProvider === "localOnly" || aiProvider === "ollama";

  // Single-pass when the transcript comfortably fits the model's context —
  // anything longer goes through the agent pipeline (below) for BOTH cloud
  // and local. Nothing is ever truncated; every word is covered by an agent.
  const words = countWords(transcriptText);
  const singlePassLimit = isLocal ? SINGLE_PASS_LOCAL_WORDS : SINGLE_PASS_CLOUD_WORDS;
  const partWords = isLocal ? PART_WORDS_LOCAL : PART_WORDS_CLOUD;

  if (words <= singlePassLimit) {
    onProgress({ stage: "writing", part: 0, totalParts: 1, percent: 15 });
    // Streaming (Ollama): report live token progress so the bar glides
    // 15% → ~90% while the local model writes instead of sitting frozen.
    // Estimate: full notes run to ~3.5k tokens; tokens ≈ chars / 4.
    let lastTick = 0;
    const onToken = (_piece, full) => {
      const now = Date.now();
      if (now - lastTick < 300) return; // throttle re-renders
      lastTick = now;
      const tokens = full.length / 4;
      const percent = 15 + Math.min(75, (tokens / 3500) * 75);
      onProgress({ stage: "writing", part: 0, totalParts: 1, percent });
    };
    const result = await completeWithFallback(
      groqKeys,
      openrouterKeys,
      [{ role: "user", content: `Here is the full meeting/lecture transcript:\n\n${transcriptText}` }],
      // timeoutMs applies to the local (Ollama) provider: generating full-length
      // notes on-device can take several minutes on larger models. With
      // streaming it acts as an inactivity timeout (reset on every token).
      { system, maxTokens: 8192, temperature: 0.2, aiProvider, ollama, timeoutMs: isLocal ? 1800000 : 480000, onToken }
    );
    onProgress({ stage: "done", part: 1, totalParts: 1, percent: 100 });
    return result;
  }

  onProgress({ stage: "reading", part: 0, totalParts: 0, percent: 2 });
  return generateNotesAgentPipeline(
    groqKeys,
    openrouterKeys,
    transcriptText,
    system,
    { aiProvider, ollama, isLocal, partWords },
    onProgress
  );
}

// Single-pass limits (in words). Local Ollama runs num_ctx 16384 (~12k words)
// — 7000 keeps the system prompt and generated notes safely inside. Cloud
// (Gemini Flash-Lite, ~1M-token window) gets a big budget: ~120k words per
// call keeps prompt + output far inside the window while covering a whole
// meeting/lecture in ONE call up to the single-pass limit below.
const SINGLE_PASS_LOCAL_WORDS = 7000;
const SINGLE_PASS_CLOUD_WORDS = 96000;
// Words per agent in the pipeline (sized for the per-call context window).
const PART_WORDS_LOCAL = 7000;
const PART_WORDS_CLOUD = 80000;
// Concurrent agent calls: local is CPU-bound, cloud is rate-limit bound.
const CONCURRENCY_LOCAL = 2;
const CONCURRENCY_CLOUD = 4;
// Reduce stage: merge only when the accumulated digests are actually too big
// for one call. Digests run ~12% of their input size, so with 80k-word parts
// most transcripts never need a merge round; a many-hour lecture does.
const REDUCE_GROUP = 6;

function countWords(text) {
  return (text || "").split(/\s+/).filter(Boolean).length;
}

function chunkByWords(text, maxWords) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Agent pipeline (map-reduce) for long transcripts — used for BOTH cloud and
// local. "Agents" are focused specialist calls: each one owns one chunk of
// the transcript and preserves every detail; combine passes merge their
// findings into one massive, deeply structured note.
// ---------------------------------------------------------------------------

const AGENT_SYSTEM =
  "You are a meticulous specialist note-taker agent. Capture EVERYTHING that matters, " +
  "organized by ideas. Never summarize away details — preserve specifics: names, " +
  "numbers, dates, decisions, reasoning and explanations.";

async function runAgent(groqKeys, openrouterKeys, { aiProvider, ollama }, messages, opts) {
  const res = await completeWithFallback(groqKeys, openrouterKeys, messages, opts);
  return typeof res === "string" ? res : res?.text || "";
}

// Limited-concurrency worker pool: keeps local Macs responsive and cloud
// providers under rate limits while finishing far faster than sequential.
async function runPool(items, concurrency, worker) {
  const queue = items.map((_, i) => i);
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queue.length) {
      const i = queue.shift();
      await worker(i);
    }
  });
  await Promise.all(runners);
}

// Streaming progress helper: converts Ollama token deltas into throttled
// percent updates (startPercent → endPercent) for long "writing" calls, so
// the bar glides while a local model generates instead of sitting frozen.
// Rough token estimate: notes run to ~3.5k tokens; tokens ≈ chars / 4.
function makeTokenProgress(onProgress, base, startPercent, endPercent = 99) {
  let last = 0;
  return (_piece, full) => {
    const now = Date.now();
    if (now - last < 300) return;
    last = now;
    const tokens = full.length / 4;
    onProgress({
      ...base,
      percent: startPercent + Math.min(endPercent - startPercent, (tokens / 3500) * (endPercent - startPercent)),
    });
  };
}

async function generateNotesAgentPipeline(groqKeys, openrouterKeys, transcriptText, system, cfg, onProgress) {
  const { aiProvider, ollama, isLocal, partWords } = cfg;
  const concurrency = isLocal ? CONCURRENCY_LOCAL : CONCURRENCY_CLOUD;
  const parts = chunkByWords(transcriptText, partWords);
  const partials = new Array(parts.length).fill("");

  // MAP — one specialist agent per part, running with limited concurrency.
  onProgress({ stage: "analyzing", part: 0, totalParts: parts.length, percent: 3 });
  let completed = 0;
  await runPool(parts, concurrency, async (i) => {
    partials[i] = await runAgent(groqKeys, openrouterKeys, { aiProvider, ollama }, [
      {
        role: "user",
        content:
          `You are Agent ${i + 1} of ${parts.length} analyzing ONE part of a long ` +
          `meeting/lecture transcript.\n\n` +
          `Extract and preserve ALL of the following from this part — be exhaustive; ` +
          `this is raw material for the final notes, not a skim summary:\n` +
          `- Every key point, argument and explanation made\n` +
          `- All decisions (and who/what decided them)\n` +
          `- All action items, owners and deadlines\n` +
          `- Names, numbers, dates, metrics and exact terminology\n` +
          `- Reasoning, caveats and open questions\n\n` +
          `Do not skip anything. If a stretch is small talk, note that briefly and ` +
          `still capture anything real.\n\n` +
          `PART ${i + 1}/${parts.length}:\n\n${parts[i]}`,
      },
    ], {
      system: AGENT_SYSTEM,
      maxTokens: 4000,
      temperature: 0.2,
      aiProvider,
      ollama,
      // Streaming: every token restarts the (local) inactivity clock, so a
      // slow prompt-eval can never hit a hard wall, and the bar glides
      // through this agent's slice of the progress range as tokens arrive.
      timeoutMs: isLocal ? 1800000 : 480000,
      onToken: makeTokenProgress(
        onProgress,
        { stage: "analyzing", part: i + 1, totalParts: parts.length },
        5 + (i / parts.length) * 60,
        5 + ((i + 1) / parts.length) * 60
      ),
    });
    completed++;
    onProgress({
      stage: "analyzing",
      part: completed,
      totalParts: parts.length,
      percent: 5 + (completed / parts.length) * 60,
    });
  });

  // REDUCE — merge only while the accumulated digests are too big for one
  // final call. With big Gemini chunks a digest is ~12% of its input, so most
  // transcripts skip this stage entirely; a many-hour lecture merges in
  // hierarchical rounds (groups of REDUCE_GROUP digests per call, in parallel).
  const DIGEST_WORDS_BUDGET = Math.floor(GEMINI_CONTEXT_TOKENS * 0.7); // words of digest text one call can take
  const digestsWordCount = (arr) => arr.reduce((n, d) => n + countWords(d), 0);
  let digests = partials;
  if (digests.length > REDUCE_GROUP && digestsWordCount(digests) > DIGEST_WORDS_BUDGET) {
    onProgress({ stage: "combining", part: 0, totalParts: digests.length, percent: 68 });
    let round = 0;
    while (digests.length > REDUCE_GROUP && digestsWordCount(digests) > DIGEST_WORDS_BUDGET) {
      round++;
      const groups = [];
      for (let i = 0; i < digests.length; i += REDUCE_GROUP) {
        groups.push(digests.slice(i, i + REDUCE_GROUP));
      }
      const next = new Array(groups.length).fill("");
      let doneGroups = 0;
      const groupSpan = 20 / (groups.length * round);
      await runPool(groups, concurrency, async (gi) => {
        next[gi] = await runAgent(groqKeys, openrouterKeys, { aiProvider, ollama }, [
          {
            role: "user",
            content:
              `These are summaries from ${groups[gi].length} specialist agents who analyzed ` +
              `consecutive parts of ONE long transcript:\n\n` +
              groups[gi].map((p) => `— ${p}`).join("\n\n") +
              `\n\nMerge them into one intermediate digest: combine duplicates and keep ` +
              `EVERY unique point, decision, action item, name, number and detail. Do not ` +
              `shorten aggressively — this digest will be merged again with the others.`,
          },
        ], {
          system: AGENT_SYSTEM,
          maxTokens: 4000,
          temperature: 0.2,
          aiProvider,
          ollama,
          // Streaming keeps the local inactivity clock alive across a slow
          // prompt-eval; the bar glides through this group's merge slice.
          timeoutMs: isLocal ? 1800000 : 480000,
          onToken: makeTokenProgress(
            onProgress,
            { stage: "combining", part: gi + 1, totalParts: groups.length },
            68 + gi * groupSpan,
            68 + (gi + 1) * groupSpan
          ),
        });
        doneGroups++;
        onProgress({
          stage: "combining",
          part: doneGroups,
          totalParts: groups.length,
          percent: 68 + doneGroups * groupSpan,
        });
      });
      digests = next;
    }
  }

  // FINAL — one definitive merge into the notes the user actually reads.
  onProgress({ stage: "writing", part: parts.length, totalParts: parts.length, percent: 92 });
  const result = await completeWithFallback(
    groqKeys,
    openrouterKeys,
    [{
      role: "user",
      content:
        `These are the combined findings of ${parts.length} specialist agents that each ` +
        `analyzed a part of one long transcript, in order:\n\n` +
        digests.map((p, i) => `AGENT ${i + 1} FINDINGS:\n${p}`).join("\n\n") +
        `\n\nCombine everything into ONE final, deeply detailed set of notes. Merge ` +
        `duplicates, resolve cross-references between parts, keep every action item, ` +
        `decision, name, number and important detail, and organize by themes rather ` +
        `than chronology. This must read as the single definitive, exhaustive set of ` +
        `notes for the whole session — comprehensive, not condensed.`,
    }],
      { system, maxTokens: 8192, temperature: 0.2, aiProvider, ollama, timeoutMs: isLocal ? 1800000 : 480000, onToken: makeTokenProgress(onProgress, { stage: "writing", part: parts.length, totalParts: parts.length }, 92) }
  );
  onProgress({ stage: "done", part: parts.length, totalParts: parts.length, percent: 100 });
  return result;
}
// ---------------------------------------------------------------------------
// Combined ("folder") notes: ONE ultimate master note synthesized from EVERY
// recording in a subproject — each recording's full transcript plus its
// existing AI notes as reference material. Same agent map-reduce architecture
// as single-recording notes, scaled to many documents, for BOTH cloud and
// local. Nothing is ever truncated: every word of every recording is covered
// by an agent.
// ---------------------------------------------------------------------------

export async function generateFolderNotes(keys, sources, onProgress = () => {}) {
  const { groqKeys, openrouterKeys, aiProvider, ollama } = keys;
  const isLocal = aiProvider === "localOnly" || aiProvider === "ollama";
  const concurrency = isLocal ? CONCURRENCY_LOCAL : CONCURRENCY_CLOUD;
  const partWords = isLocal ? PART_WORDS_LOCAL : PART_WORDS_CLOUD;
  const singlePassWords = isLocal ? SINGLE_PASS_LOCAL_WORDS : SINGLE_PASS_CLOUD_WORDS;

  // One source document per recording: full transcript + the existing AI note
  // for that recording (reference material the model must verify against the
  // transcript).
  const docs = (sources || []).map((s, i) => {
    const transcriptText = (s.transcript || []).map((l) => l.text).join("\n\n");
    const notesText = (s.aiNotes || "").trim();
    return {
      title: s.label || `Recording ${i + 1}`,
      body:
        (transcriptText
          ? `TRANSCRIPT:\n${transcriptText}`
          : "(No transcript captured for this recording.)") +
        (notesText
          ? `\n\nEXISTING AI NOTES FOR THIS RECORDING (reference — verify against the transcript):\n${notesText}`
          : ""),
      words: countWords(transcriptText),
    };
  });
  const totalWords = docs.reduce((n, d) => n + d.words, 0);
  const system = buildFolderNotesSystem(docs.length, keys.aiBehavior);

  // Small folders: one model call over everything when it fits the context.
  if (totalWords <= singlePassWords && docs.length <= 8) {
    onProgress({ stage: "writing", part: 0, totalParts: 1, percent: 15 });
    const result = await completeWithFallback(
      groqKeys,
      openrouterKeys,
      [{
        role: "user",
        content:
          `Below are ${docs.length} related recordings from the same project folder. ` +
          `Create the ONE ultimate, deeply detailed master note from all of them.\n\n` +
          docs.map((d) => `===== RECORDING: "${d.title}" =====\n${d.body}`).join("\n\n"),
      }],
      { system, maxTokens: 8192, temperature: 0.2, aiProvider, ollama, timeoutMs: isLocal ? 1800000 : 480000, onToken: makeTokenProgress(onProgress, { stage: "writing", part: 0, totalParts: 1 }, 15) }
    );
    onProgress({ stage: "done", part: 1, totalParts: 1, percent: 100 });
    return result;
  }

  // MAP — one specialist agent per (recording × chunk), limited concurrency.
  // Together the agents cover EVERY word of EVERY recording.
  const tasks = [];
  docs.forEach((d, di) => {
    const chunks = d.words > 0 ? chunkByWords(d.body, partWords) : [d.body];
    chunks.forEach((chunk, ci) => {
      tasks.push({ docIndex: di, title: d.title, part: ci + 1, total: chunks.length, chunk });
    });
  });
  const partials = new Array(tasks.length).fill("");
  onProgress({ stage: "reading", part: 0, totalParts: tasks.length, percent: 2 });
  onProgress({ stage: "analyzing", part: 0, totalParts: tasks.length, percent: 3 });
  let completed = 0;
  await runPool(tasks, concurrency, async (ti) => {
    const t = tasks[ti];
    partials[ti] = await runAgent(groqKeys, openrouterKeys, { aiProvider, ollama }, [
      {
        role: "user",
        content:
          `You are Agent ${ti + 1} of ${tasks.length}. Each agent analyzes ONE part of ONE ` +
          `recording; together the agents cover EVERY recording in a project folder. ` +
          `Recording: "${t.title}" (part ${t.part}/${t.total}).\n\n` +
          `Extract and preserve ALL of the following — be exhaustive; this is raw ` +
          `material for a master note, not a skim summary:\n` +
          `- Every key point, argument and explanation made\n` +
          `- All decisions (and who/what decided them)\n` +
          `- All action items, owners and deadlines\n` +
          `- Names, numbers, dates, metrics and exact terminology\n` +
          `- Reasoning, caveats and open questions\n` +
          `- How this recording relates to the project as a whole\n\n` +
          `Do not skip anything. If a stretch is small talk, note that briefly and ` +
          `still capture anything real.\n\n` +
          `CONTENT:\n\n${t.chunk}`,
      },
    ], {
      system: AGENT_SYSTEM,
      maxTokens: 4000,
      temperature: 0.2,
      aiProvider,
      ollama,
      timeoutMs: isLocal ? 1800000 : 480000,
      onToken: makeTokenProgress(
        onProgress,
        { stage: "analyzing", part: ti + 1, totalParts: tasks.length },
        3 + (ti / tasks.length) * 60,
        3 + ((ti + 1) / tasks.length) * 60
      ),
    });
    completed++;
    onProgress({
      stage: "analyzing",
      part: completed,
      totalParts: tasks.length,
      percent: 3 + (completed / tasks.length) * 60,
    });
  });

  // REDUCE — group each recording's agent findings into one per-recording
  // digest first, then merge digests across the folder in hierarchical
  // parallel rounds, so ANY number of recordings or words stays in context.
  const perDoc = docs.map((_, di) => {
    const pieces = [];
    tasks.forEach((t, ti) => { if (t.docIndex === di && partials[ti]) pieces.push(partials[ti]); });
    return pieces;
  });

  const mergeGroup = async (label, pieces) =>
    runAgent(groqKeys, openrouterKeys, { aiProvider, ollama }, [
      {
        role: "user",
        content:
          `These are findings from specialist agents who analyzed ${label}:\n\n` +
          pieces.map((p) => `— ${p}`).join("\n\n") +
          `\n\nMerge them into one digest: combine duplicates and keep EVERY unique ` +
          `point, decision, action item, name, number and detail. Do not shorten ` +
          `aggressively — this digest will be merged again with the others.`,
      },
    ], {
      system: AGENT_SYSTEM,
      maxTokens: 4000,
      temperature: 0.2,
      aiProvider,
      ollama,
      timeoutMs: isLocal ? 1800000 : 480000,
      onToken: makeTokenProgress(onProgress, { stage: "combining", part: 0, totalParts: docs.length }, 70, 82),
    });

  onProgress({ stage: "combining", part: 0, totalParts: docs.length, percent: 66 });
  // Round 1 — one digest per recording (skipped when it has a single part).
  let docDigests = await Promise.all(perDoc.map(async (pieces, di) => {
    if (pieces.length === 0) return `(No content captured for "${docs[di].title}".)`;
    if (pieces.length === 1) return pieces[0];
    return mergeGroup(`different parts of the SAME recording "${docs[di].title}"`, pieces);
  }));

  // Round 2+ — merge per-recording digests across the folder.
  const totalMerges = Math.max(1, Math.ceil(docDigests.length / REDUCE_GROUP) - 1);
  let doneMerge = 0;
  while (docDigests.length > REDUCE_GROUP) {
    const groups = [];
    for (let i = 0; i < docDigests.length; i += REDUCE_GROUP) {
      groups.push(docDigests.slice(i, i + REDUCE_GROUP));
    }
    const next = new Array(groups.length).fill("");
    await runPool(groups, concurrency, async (gi) => {
      next[gi] = await mergeGroup(
        `${groups[gi].length} recordings from the same project folder`,
        groups[gi]
      );
      doneMerge++;
      onProgress({
        stage: "combining",
        part: doneMerge,
        totalParts: Math.max(totalMerges, doneMerge),
        percent: 66 + Math.min(24, (doneMerge / Math.max(1, totalMerges)) * 24),
      });
    });
    docDigests = next;
  }

  // FINAL — the one ultimate note for the whole folder.
  onProgress({ stage: "writing", part: 1, totalParts: 1, percent: 92 });
  const result = await completeWithFallback(
    groqKeys,
    openrouterKeys,
    [{
      role: "user",
      content:
        `These are the combined findings of ${tasks.length} specialist agents, organized ` +
        `per recording of a project folder containing ${docs.length} recordings:\n\n` +
        docDigests
          .map((d, i) => `RECORDING "${docs[i].title}" — SYNTHESIZED FINDINGS:\n${d}`)
          .join("\n\n") +
        `\n\nCreate ONE final, deeply detailed MASTER NOTE for the entire folder. ` +
        `Merge duplicates across recordings, connect ideas between sessions, keep every ` +
        `action item, decision, name, number and important detail, and organize by ` +
        `themes rather than by recording or chronology. It must read as the single ` +
        `definitive, exhaustive knowledge base for this project — comprehensive, not condensed.`,
    }],
    { system, maxTokens: 8192, temperature: 0.2, aiProvider, ollama, timeoutMs: isLocal ? 1800000 : 480000, onToken: makeTokenProgress(onProgress, { stage: "writing", part: 1, totalParts: 1 }, 92) }
  );
  onProgress({ stage: "done", part: 1, totalParts: 1, percent: 100 });
  return result;
}

// System prompt for the folder master note — same depth/coverage rules as the
// single-recording notes, adapted for synthesizing across many documents.
function buildFolderNotesSystem(count, behavior) {
  const base = `You are an elite knowledge synthesizer. You will be given material from ${count} related recordings that belong to the same project folder. Produce ONE DEEP, IN-DEPTH, WELL-STRUCTURED master note covering ALL of them — the single definitive knowledge base a reader can study instead of ever opening the individual recordings.

OUTPUT FORMAT (follow exactly):
1. Start with a single "# <Short descriptive title>" heading for the whole folder.
2. Then a short opening paragraph (2-4 sentences): what this project is about, which sessions it draws from, and the single most important takeaway.
3. Then organize the body by THEME using "## <Theme heading>" sections. A theme may draw from several recordings — synthesize ACROSS recordings; do not treat the material as one block per recording.
4. Inside each section: clear explanatory paragraphs that unpack each idea (what it is, what was said about it and in which session, why it matters, how it connects to other sessions), and bullet points whenever several items are listed. **Bold** key terms, names and figures; use \`code\` for exact identifiers; use markdown tables when comparing several items. When a point comes from one specific recording, mention it naturally ("in the planning session…").
5. Include a "## Action Items & Owners" section near the end: every action item from any recording, with owner, deadline and status, consolidated and deduplicated.
6. Include a "## Decisions Made" section: every decision, which session made it, and why.
7. End with a final "## Summary Points" section: 5-10 crisp bullet points capturing the most important takeaways across the whole project.

DEPTH & COVERAGE RULES (most important):
- Cover EVERYTHING. No topic, point, name, number, decision, deadline, example, or argument from ANY recording may be missing.
- Explain, don't just list. For every idea add context: what it is, what was said, why it matters, and how it connects across sessions.
- Go long. A thorough multi-page master note is better than a compressed page. When in doubt, include more explanation, not less.
- Preserve exact names, numbers, dates, deadlines, dollar amounts, IDs, and URLs. Use short verbatim quotes when exact wording matters.
- Distinguish facts from opinions, and decisions from open questions. Note disagreements or contradictions between recordings explicitly.

STYLE RULES:
- Organized by IDEAS and THEMES across the whole folder, never by recording order or time. Do not use timestamps.
- Write in simple, everyday language: short sentences, no unexplained jargon. Expand every acronym and briefly explain every technical term the first time it appears.
- NEVER write one giant wall of text — always break the content into headed sections and bullets as described above.
- If information is absent, write "Not mentioned" rather than guessing.`;
  const behaviorBlock = buildAiBehaviorBlock(behavior);
  return behaviorBlock ? `${base}\n\n${behaviorBlock}` : base;
}


/**
 * Ask a question about a recording.
 * history: optional array of previous { role, content } chat turns so
 * follow-up questions keep their context.
 */
export async function askQuestion(keys, transcriptLines, notesText, question, history = []) {
  const { groqKeys, openrouterKeys, aiProvider, ollama } = keys;
  const behavior = keys.aiBehavior;
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
${notes  }${
    // Settings → AI Behavior applies to chat too.
    keys.aiBehavior?.customInstructions?.trim()
      ? `\n\nUSER'S CUSTOM INSTRUCTIONS (follow exactly):\n${keys.aiBehavior.customInstructions.trim()}`
      : ""
  }`;
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
