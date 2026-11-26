// Deterministic app navigation for the Dashboard's natural-language search.
// Content questions still go to the configured AI model; explicit requests to
// open or find something should never depend on an LLM to navigate correctly.

const GENERAL_PROJECT_ID = "general-folder-project";
const GENERAL_SUB_ID = "general-folder-sub";

function clean(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function requestTarget(query) {
  return clean(query)
    .replace(/^(?:please )?(?:open|go to|take me to|navigate to|show me|show|find|search for|search)\s+/, "")
    .replace(/^(?:the |my |a |an )/, "")
    .replace(/\b(?:project|folder|recording|meeting|file)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchScore(needle, candidate) {
  const target = clean(needle);
  const text = clean(candidate);
  if (!target || !text) return 0;
  if (text === target) return 100;
  if (text.includes(target)) return 70 - Math.min(text.indexOf(target), 30);
  const terms = target.split(" ").filter((term) => term.length > 1);
  const hits = terms.filter((term) => text.includes(term));
  return hits.length === terms.length && hits.length > 0 ? hits.length * 12 : 0;
}

function locationFor(projects, subId) {
  const project = (projects || []).find((item) => (item.subprojects || []).some((sub) => sub.id === subId));
  const folder = project?.subprojects?.find((sub) => sub.id === subId);
  return { project, folder };
}

export function resolveWorkspaceNavigation(query, { projects = [], recordingsBySub = {}, vaultBySub = {} } = {}) {
  const original = String(query || "").trim();
  const normalized = clean(original);
  const isNavigation = /^(?:please )?(?:open|go to|take me to|navigate to|show me|show|find|search for|search)\b/.test(normalized);
  if (!isNavigation) return null;

  if (/\b(settings|preferences|configuration)\b/.test(normalized)) return { kind: "view", view: "settings", label: "Settings" };
  if (/\b(recorder|record|new recording)\b/.test(normalized) && !/\b(latest|last|named)\b/.test(normalized)) return { kind: "view", view: "recorder", label: "Recorder" };
  if (/\b(dashboard|home|library|projects)\b/.test(normalized) && !/\b(named|called)\b/.test(normalized)) return { kind: "view", view: "dashboard", label: "Dashboard" };

  if (/\b(latest|last)\b.*\b(recording|meeting)\b/.test(normalized)) {
    const latest = Object.entries(recordingsBySub || {}).flatMap(([sid, recordings]) => (recordings || []).map((recording) => ({ sid, recording })))
      .sort((a, b) => (b.recording?.createdAt || 0) - (a.recording?.createdAt || 0))[0];
    if (latest?.recording) {
      const { project, folder } = locationFor(projects, latest.sid);
      return { kind: "recording", pid: project?.id || GENERAL_PROJECT_ID, sid: latest.sid, rid: latest.recording.id, label: latest.recording.label || "Untitled recording", detail: folder?.name || (latest.sid === GENERAL_SUB_ID ? "General Folder" : "") };
    }
  }

  const target = requestTarget(original);
  if (!target) return null;
  const choices = [];

  for (const project of projects || []) {
    const projectScore = matchScore(target, project.name);
    if (projectScore) choices.push({ score: projectScore, kind: "project", pid: project.id, sid: project.subprojects?.[0]?.id || null, label: project.name || "Untitled project" });
    for (const folder of project.subprojects || []) {
      const folderScore = matchScore(target, `${project.name || ""} ${folder.name || ""}`) || matchScore(target, folder.name);
      if (folderScore) choices.push({ score: folderScore + 2, kind: "folder", pid: project.id, sid: folder.id, label: folder.name || "Untitled folder", detail: project.name || "" });
    }
  }

  for (const [sid, recordings] of Object.entries(recordingsBySub || {})) {
    const { project, folder } = locationFor(projects, sid);
    for (const recording of recordings || []) {
      const resultScore = matchScore(target, recording.label);
      if (resultScore) choices.push({ score: resultScore + 4, kind: "recording", pid: project?.id || GENERAL_PROJECT_ID, sid, rid: recording.id, label: recording.label || "Untitled recording", detail: folder?.name || (sid === GENERAL_SUB_ID ? "General Folder" : "") });
    }
  }

  for (const [sid, files] of Object.entries(vaultBySub || {})) {
    const { project, folder } = locationFor(projects, sid);
    for (const file of files || []) {
      const resultScore = matchScore(target, file.name);
      if (resultScore) choices.push({ score: resultScore + 3, kind: "file", pid: project?.id || GENERAL_PROJECT_ID, sid, fileId: file.id, label: file.name || "Untitled file", detail: folder?.name || (sid === GENERAL_SUB_ID ? "General Folder" : "") });
    }
  }

  choices.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return choices[0] || null;
}

export function workspaceContext({ projects = [], vaultBySub = {} } = {}) {
  const rows = [];
  for (const project of projects || []) {
    rows.push(`PROJECT: ${project.name || "Untitled project"}`);
    for (const folder of project.subprojects || []) rows.push(`FOLDER: ${project.name || "Untitled project"} / ${folder.name || "Untitled folder"}`);
  }
  for (const [sid, files] of Object.entries(vaultBySub || {})) {
    const { project, folder } = locationFor(projects, sid);
    for (const file of files || []) rows.push(`FILE: ${file.name || "Untitled file"} — ${project?.name || "General Folder"}${folder?.name ? ` / ${folder.name}` : ""}`);
  }
  return rows.join("\n");
}
