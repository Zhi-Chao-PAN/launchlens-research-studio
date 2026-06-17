/**
 * Research tags system.
 *
 * - Each run can have multiple tags
 * - Tags are stored separately from runs (in localStorage)
 * - Supports: add/remove tags per run, list all tags, filter runs by tag
 */

export interface RunTag {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

const TAGS_KEY = "research_tags";
const RUN_TAGS_KEY = "research_run_tags";

// ---- Tag management ----

export function getAllTags(): RunTag[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTags(tags: RunTag[]): void {
  try {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  } catch {
    // ignore
  }
}

export function createTag(name: string, color?: string): RunTag {
  const tags = getAllTags();
  const existing = tags.find(
    (t) => t.name.toLowerCase() === name.toLowerCase().trim()
  );
  if (existing) return existing;

  const tag: RunTag = {
    id: "tag_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    name: name.trim(),
    color: color || getRandomColor(),
    createdAt: Date.now(),
  };

  tags.push(tag);
  saveTags(tags);
  return tag;
}

export function deleteTag(tagId: string): void {
  // Remove tag definition
  const tags = getAllTags().filter((t) => t.id !== tagId);
  saveTags(tags);

  // Remove tag from all runs
  const runTags = getAllRunTags();
  for (const runId of Object.keys(runTags)) {
    runTags[runId] = runTags[runId].filter((id) => id !== tagId);
    if (runTags[runId].length === 0) {
      delete runTags[runId];
    }
  }
  saveAllRunTags(runTags);
}

export function renameTag(tagId: string, newName: string): RunTag | null {
  const tags = getAllTags();
  const tag = tags.find((t) => t.id === tagId);
  if (!tag) return null;

  tag.name = newName.trim();
  saveTags(tags);
  return tag;
}

// ---- Run-tag associations ----

function getAllRunTags(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(RUN_TAGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveAllRunTags(runTags: Record<string, string[]>): void {
  try {
    localStorage.setItem(RUN_TAGS_KEY, JSON.stringify(runTags));
  } catch {
    // ignore
  }
}

export function getRunTags(runId: string): string[] {
  const runTags = getAllRunTags();
  return runTags[runId] || [];
}

export function addTagToRun(runId: string, tagId: string): void {
  const runTags = getAllRunTags();
  if (!runTags[runId]) {
    runTags[runId] = [];
  }
  if (!runTags[runId].includes(tagId)) {
    runTags[runId].push(tagId);
    saveAllRunTags(runTags);
  }
}

export function removeTagFromRun(runId: string, tagId: string): void {
  const runTags = getAllRunTags();
  if (!runTags[runId]) return;
  runTags[runId] = runTags[runId].filter((id) => id !== tagId);
  if (runTags[runId].length === 0) {
    delete runTags[runId];
  }
  saveAllRunTags(runTags);
}

export function bulkAddTags(runIds: string[], tagIds: string[]): void {
  const runTags = getAllRunTags();
  for (const runId of runIds) {
    if (!runTags[runId]) {
      runTags[runId] = [];
    }
    for (const tagId of tagIds) {
      if (!runTags[runId].includes(tagId)) {
        runTags[runId].push(tagId);
      }
    }
  }
  saveAllRunTags(runTags);
}

export function bulkRemoveTags(runIds: string[], tagIds: string[]): void {
  const runTags = getAllRunTags();
  for (const runId of runIds) {
    if (!runTags[runId]) continue;
    runTags[runId] = runTags[runId].filter((id) => !tagIds.includes(id));
    if (runTags[runId].length === 0) {
      delete runTags[runId];
    }
  }
  saveAllRunTags(runTags);
}

/**
 * Get all runs that have a specific tag.
 */
export function getRunsWithTag(tagId: string): string[] {
  const runTags = getAllRunTags();
  return Object.keys(runTags).filter((runId) => runTags[runId].includes(tagId));
}

/**
 * Get tag details for a list of tag IDs.
 */
export function getTagDetails(tagIds: string[]): RunTag[] {
  const allTags = getAllTags();
  const tagMap = new Map(allTags.map((t) => [t.id, t]));
  return tagIds.map((id) => tagMap.get(id)).filter((t): t is RunTag => !!t);
}

/**
 * Get tag usage count.
 */
export function getTagUsageCount(tagId: string): number {
  const runTags = getAllRunTags();
  return Object.values(runTags).filter((tags) => tags.includes(tagId)).length;
}

// ---- Helpers ----

const TAG_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e",
];

function getRandomColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

/**
 * Migrate old keyword-based tags if needed.
 * Kept for future use.
 */
export function countTotalTags(): number {
  return getAllTags().length;
}
