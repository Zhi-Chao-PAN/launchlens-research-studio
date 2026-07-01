/**
 * Research run starring / bookmarking (client-side localStorage).
 *
 * Starred runs appear first in history and can be filtered.
 */

const STORAGE_KEY = "ll:starred-runs";

function getStorage(): Storage | null {
  // Works in browser (window.localStorage) and test environments
  try {
    const g = globalThis as unknown as { localStorage?: Storage };
    if (g.localStorage && typeof g.localStorage.getItem === "function") {
      // Test that it actually works (private mode Safari etc.)
      g.localStorage.getItem("__test__");
      return g.localStorage;
    }
  } catch {
    /* noop */
  }
  return null;
}

export function getStarredRunIds(): string[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s: unknown) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function isRunStarred(id: string): boolean {
  return getStarredRunIds().includes(id);
}

export function starRun(id: string): string[] {
  const current = getStarredRunIds();
  if (current.includes(id)) return current;
  const next = [id, ...current];
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }
  return next;
}

export function unstarRun(id: string): string[] {
  const current = getStarredRunIds();
  const next = current.filter((rid) => rid !== id);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function toggleStar(id: string): boolean {
  if (isRunStarred(id)) {
    unstarRun(id);
    return false;
  } else {
    starRun(id);
    return true;
  }
}

/* ------------------------------------------------------------------ */
/*  Star metadata (notes, tags, timestamps)                            */
/* ------------------------------------------------------------------ */

const STAR_META_KEY = "ll:starred-meta";

export interface StarMetadata {
  starredAt: string;
  note?: string;
  tags?: string[];
  collection?: string;
}

function getMetaMap(): Record<string, StarMetadata> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STAR_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // Defensively drop any entry that doesn't match the StarMetadata
    // shape — a partial localStorage write or a schema migration could
    // leave a single corrupt entry that would later crash
    // getStarNote/getStarMetadata.
    const out: Record<string, StarMetadata> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (isValidStarMetadata(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function isValidStarMetadata(v: unknown): v is StarMetadata {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  if (typeof m.starredAt !== "string") return false;
  if (m.note !== undefined && typeof m.note !== "string") return false;
  if (m.collection !== undefined && typeof m.collection !== "string") return false;
  if (m.tags !== undefined) {
    if (!Array.isArray(m.tags)) return false;
    if (!m.tags.every((t) => typeof t === "string")) return false;
  }
  return true;
}

function saveMetaMap(map: Record<string, StarMetadata>): void {
  const storage = getStorage();
  if (!storage) return;
  try { storage.setItem(STAR_META_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

export function setStarNote(id: string, note: string): void {
  if (!isRunStarred(id)) return;
  const map = getMetaMap();
  map[id] = { ...(map[id] || { starredAt: new Date().toISOString() }), note };
  saveMetaMap(map);
}

export function getStarNote(id: string): string | undefined {
  return getMetaMap()[id]?.note;
}

export function setStarTags(id: string, tags: string[]): void {
  if (!isRunStarred(id)) return;
  const map = getMetaMap();
  map[id] = { ...(map[id] || { starredAt: new Date().toISOString() }), tags };
  saveMetaMap(map);
}

export function getStarMetadata(id: string): StarMetadata | undefined {
  return getMetaMap()[id];
}

export function getAllStarMetadata(): Record<string, StarMetadata> {
  return getMetaMap();
}

/* ------------------------------------------------------------------ */
/*  Collections / folders for starred runs                             */
/* ------------------------------------------------------------------ */

export function addToCollection(id: string, collection: string): void {
  if (!isRunStarred(id)) return;
  const map = getMetaMap();
  map[id] = { ...(map[id] || { starredAt: new Date().toISOString() }), collection };
  saveMetaMap(map);
}

export function getCollections(): string[] {
  const map = getMetaMap();
  const cols = new Set<string>();
  for (const meta of Object.values(map)) {
    if (meta.collection) cols.add(meta.collection);
  }
  return Array.from(cols).sort();
}

export function getStarredInCollection(collection: string): string[] {
  const map = getMetaMap();
  return getStarredRunIds().filter((id) => map[id]?.collection === collection);
}

export function removeFromCollection(id: string): void {
  const map = getMetaMap();
  if (map[id]) {
    delete map[id].collection;
    saveMetaMap(map);
  }
}

/* ------------------------------------------------------------------ */
/*  Bulk operations                                                    */
/* ------------------------------------------------------------------ */

export function starRunsBatch(ids: string[]): string[] {
  const current = new Set(getStarredRunIds());
  let changed = false;
  for (const id of ids) {
    if (!current.has(id)) {
      current.add(id);
      changed = true;
    }
  }
  if (changed) {
    const next = Array.from(current);
    const storage = getStorage();
    if (storage) { try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {} }
  }
  return getStarredRunIds();
}

export function unstarRunsBatch(ids: string[]): string[] {
  const idSet = new Set(ids);
  const current = getStarredRunIds();
  // Only write when something actually changes; otherwise the storage
  // write is a no-op that still risks touching mtime (and would
  // unnecessarily notify storage event listeners).
  if (ids.length === 0 || !current.some((id) => idSet.has(id))) {
    return current;
  }
  const next = current.filter((id) => !idSet.has(id));
  const storage = getStorage();
  if (storage) { try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {} }
  // Also clean up metadata for unstarred runs
  const map = getMetaMap();
  let metaChanged = false;
  for (const id of ids) {
    if (map[id]) { delete map[id]; metaChanged = true; }
  }
  if (metaChanged) saveMetaMap(map);
  return next;
}

export function clearAllStars(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
      storage.removeItem(STAR_META_KEY);
    } catch { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Statistics                                                         */
/* ------------------------------------------------------------------ */

export interface StarStats {
  totalStarred: number;
  withNotes: number;
  withTags: number;
  collections: number;
  collectionBreakdown: Array<{ name: string; count: number }>;
}

export function getStarStats(): StarStats {
  const ids = getStarredRunIds();
  const map = getMetaMap();
  let withNotes = 0, withTags = 0;
  const colCounts = new Map<string, number>();
  for (const id of ids) {
    const m = map[id];
    if (m?.note) withNotes++;
    if (m?.tags && m.tags.length > 0) withTags++;
    if (m?.collection) {
      colCounts.set(m.collection, (colCounts.get(m.collection) || 0) + 1);
    }
  }
  const collectionBreakdown = Array.from(colCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  return {
    totalStarred: ids.length,
    withNotes,
    withTags,
    collections: colCounts.size,
    collectionBreakdown,
  };
}

export function searchStarred(ids: string[], query: string): string[] {
  if (!query.trim()) return ids;
  const q = query.toLowerCase();
  const map = getMetaMap();
  return ids.filter((id) => {
    if (id.toLowerCase().includes(q)) return true;
    const m = map[id];
    if (m?.note?.toLowerCase().includes(q)) return true;
    if (m?.tags?.some((t) => t.toLowerCase().includes(q))) return true;
    if (m?.collection?.toLowerCase().includes(q)) return true;
    return false;
  });
}
