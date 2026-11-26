export const LOCAL_CONTEXT_TOKENS = 8192;

export function buildAiBehaviorBlock(behavior) {
  const b = behavior || {};
  const lines = [];
  if (b.customInstructions && String(b.customInstructions).trim()) {
    lines.push(`USER'S CUSTOM INSTRUCTIONS (highest priority, follow exactly):\n${String(b.customInstructions).trim()}`);
  }
  const skills = b.skills || {};
  const sections = [];
  if (skills.overview !== false) sections.push("## Overview\n2-4 well-developed paragraphs covering the purpose, people, topics and main outcome.");
  if (skills.keyPoints !== false) sections.push("## Key Takeaways\n6-12 specific bullets. Begin each with a **bold lead-in phrase**.");
  if (skills.detailedSummary !== false) sections.push("## Detailed Notes\nUse one `### <Topic>` subsection for every distinct theme, with clear explanation and specific supporting details.");
  if (skills.followUps !== false) sections.push("## Decisions\nList decisions and reasoning.\n\n## Action Items\nUse `- [ ] **Owner** — task (deadline)`.\n\n## Open Questions\nList unresolved questions and risks.");
  if (sections.length) lines.push(`NOTE SECTIONS TO PRODUCE (in this order, after the title and TL;DR):\n\n${sections.join("\n\n")}`);
  lines.push(b.depth === "concise" ? "DEPTH: concise — keep only decision-relevant content." : "DEPTH: long and exhaustive — this is the user's permanent record. Include detail and context.");
  return lines.join("\n\n");
}

export const NOTES_FORMAT_RULES = `FORMATTING (the app renders ONLY this markdown subset — use nothing else):
- "# Title" once at the very top, followed by one "> **TL;DR:** ..." line.
- Use "## Section", "### Subsection", bullets, numbered lists, action checkboxes and pipe tables.
- Leave one blank line between blocks. Never use HTML, code fences or emoji.`;

export function buildNotesSystem(behavior) {
  return [
    "You are an expert note-taker who turns meeting and lecture transcripts into detailed, structured study notes.",
    "Output ONLY the notes in markdown. Never invent information; use ‘Not mentioned’ when necessary.",
    NOTES_FORMAT_RULES,
    buildAiBehaviorBlock(behavior),
    "Finish with a ## Summary section containing 5-8 crisp bullets.",
  ].join("\n\n");
}
