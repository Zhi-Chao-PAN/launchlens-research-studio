/**
 * Research tags system.
 *
 * - Each run can have multiple tags
 * - Tags are stored separately from runs (in localStorage)
 * - Supports: add/remove tags per run, list all tags, filter runs by tag
 * - Extended: merge, search, stats, colors, popular, bulk ops
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
    if (!Array.isArray(parsed)) return [];
    // Drop any entry that doesn't match the RunTag shape so a partial
    // localStorage write can't poison createTag's .find() / push().
    return parsed.filter(isValidRunTag);
  } catch {
    return [];
  }
}

function isValidRunTag(v: unknown): v is RunTag {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return false;
  if (typeof t.name !== "string") return false;
  if (typeof t.createdAt !== "number" || !Number.isFinite(t.createdAt)) return false;
  if (t.color !== undefined && typeof t.color !== "string") return false;
  return true;
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

export function getOrCreateTag(name: string, color?: string): RunTag {
  return createTag(name, color);
}

export function deleteTag(tagId: string): void {
  const tags = getAllTags().filter((t) => t.id !== tagId);
  saveTags(tags);

  const runTags = getAllRunTags();
  for (const runId of Object.keys(runTags)) {
    runTags[runId] = runTags[runId].filter((id) => id !== tagId);
    if (runTags[runId].length === 0) {
      delete runTags[runId];
    }
  }
  saveAllRunTags(runTags);
}

export function bulkDeleteTags(tagIds: string[]): number {
  if (tagIds.length === 0) return 0;
  const tagSet = new Set(tagIds);
  const tags = getAllTags().filter((t) => !tagSet.has(t.id));
  saveTags(tags);

  const runTags = getAllRunTags();
  for (const runId of Object.keys(runTags)) {
    runTags[runId] = runTags[runId].filter((id) => !tagSet.has(id));
    if (runTags[runId].length === 0) {
      delete runTags[runId];
    }
  }
  saveAllRunTags(runTags);
  return tagIds.length;
}

export function renameTag(tagId: string, newName: string): RunTag | null {
  const tags = getAllTags();
  const tag = tags.find((t) => t.id === tagId);
  if (!tag) return null;

  const trimmed = newName.trim();
  const collision = tags.find(
    (t) => t.id !== tagId && t.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (collision) {
    return null;
  }

  tag.name = trimmed;
  saveTags(tags);
  return tag;
}

export function setTagColor(tagId: string, color: string): RunTag | null {
  if (!validateTagColor(color)) return null;

  const tags = getAllTags();
  const tag = tags.find((t) => t.id === tagId);
  if (!tag) return null;

  tag.color = color;
  saveTags(tags);
  return tag;
}

export function validateTagColor(color: string): boolean {
  if (!color || typeof color !== "string") return false;
  const trimmed = color.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(trimmed)) return true;
  return TAG_COLORS.some((c) => c.toLowerCase() === trimmed);
}

export function mergeTags(sourceTagIds: string[], targetTagId: string): RunTag | null {
  const tags = getAllTags();
  const target = tags.find((t) => t.id === targetTagId);
  if (!target) return null;

  const sourceSet = new Set(sourceTagIds.filter((id) => id !== targetTagId));
  if (sourceSet.size === 0) return target;

  const runTags = getAllRunTags();
  for (const runId of Object.keys(runTags)) {
    const tagIds = runTags[runId];
    const hasTarget = tagIds.includes(targetTagId);
    const hasSource = tagIds.some((id) => sourceSet.has(id));

    if (hasSource && !hasTarget) {
      runTags[runId] = [...tagIds.filter((id) => !sourceSet.has(id)), targetTagId];
    } else if (hasSource && hasTarget) {
      runTags[runId] = tagIds.filter((id) => !sourceSet.has(id));
    }
  }
  saveAllRunTags(runTags);

  const remainingTags = tags.filter((t) => !sourceSet.has(t.id));
  saveTags(remainingTags);

  return target;
}

export function searchTags(query: string): RunTag[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  return getAllTags()
    .filter((t) => t.name.toLowerCase().includes(trimmed))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(trimmed) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(trimmed) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.name.localeCompare(b.name);
    });
}

// ---- Run-tag associations ----

function getAllRunTags(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(RUN_TAGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [runId, ids] of Object.entries(parsed)) {
      if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
        out[runId] = ids;
      }
    }
    return out;
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

export function getRunsWithTag(tagId: string): string[] {
  const runTags = getAllRunTags();
  return Object.keys(runTags).filter((runId) => runTags[runId].includes(tagId));
}

export function getTagDetails(tagIds: string[]): RunTag[] {
  const allTags = getAllTags();
  const tagMap = new Map(allTags.map((t) => [t.id, t]));
  return tagIds.map((id) => tagMap.get(id)).filter((t): t is RunTag => !!t);
}

export function getTagUsageCount(tagId: string): number {
  const runTags = getAllRunTags();
  return Object.values(runTags).filter((tags) => tags.includes(tagId)).length;
}

export function getPopularTags(limit: number = 10): (RunTag & { usageCount: number })[] {
  const allTags = getAllTags();
  return allTags
    .map((tag) => ({ ...tag, usageCount: getTagUsageCount(tag.id) }))
    .filter((t) => t.usageCount > 0)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, Math.max(0, limit));
}

export interface TagStats {
  totalTags: number;
  totalTaggedRuns: number;
  tagsWithUsage: number;
  tagsWithoutUsage: number;
  avgTagsPerRun: number;
  mostUsedTag: (RunTag & { usageCount: number }) | null;
  leastUsedTag: (RunTag & { usageCount: number }) | null;
}

export function getTagStats(): TagStats {
  const allTags = getAllTags();
  const runTags = getAllRunTags();
  const runIds = Object.keys(runTags);

  const tagsWithCount = allTags.map((tag) => ({
    ...tag,
    usageCount: getTagUsageCount(tag.id),
  }));

  const tagsWithUsage = tagsWithCount.filter((t) => t.usageCount > 0);
  const tagsWithoutUsage = tagsWithCount.filter((t) => t.usageCount === 0);

  const totalTagAssociations = tagsWithCount.reduce((sum, t) => sum + t.usageCount, 0);
  const avgTagsPerRun = runIds.length > 0 ? totalTagAssociations / runIds.length : 0;

  const sorted = [...tagsWithUsage].sort((a, b) => b.usageCount - a.usageCount);

  return {
    totalTags: allTags.length,
    totalTaggedRuns: runIds.length,
    tagsWithUsage: tagsWithUsage.length,
    tagsWithoutUsage: tagsWithoutUsage.length,
    avgTagsPerRun: Math.round(avgTagsPerRun * 100) / 100,
    mostUsedTag: sorted.length > 0 ? sorted[0] : null,
    leastUsedTag: sorted.length > 0 ? sorted[sorted.length - 1] : null,
  };
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

export function getTagColorPalette(): string[] {
  return [...TAG_COLORS];
}

export function countTotalTags(): number {
  return getAllTags().length;
}
