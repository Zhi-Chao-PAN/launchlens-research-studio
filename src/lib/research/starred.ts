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
