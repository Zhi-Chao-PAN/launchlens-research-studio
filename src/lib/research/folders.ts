/**
 * Research folders / collections.
 * Organize research runs into customizable folders.
 * Client-side only (localStorage).
 */

export interface ResearchFolder {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  runIds: string[];
  createdAt: number;
  updatedAt: number;
  isSystem?: boolean; // system folders can't be deleted
}

const STORAGE_KEY = "launchlens:folders";
const FOLDER_ASSIGNMENTS_KEY = "launchlens:folder-assignments"; // runId -> folderId[]

// Default system folders
const DEFAULT_FOLDERS: ResearchFolder[] = [
  {
    id: "folder-starred",
    name: "收藏夹",
    icon: "★",
    color: "#fbbf24",
    runIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    position: 0,
    isSystem: true,
  },
  {
    id: "folder-archived",
    name: "归档",
    icon: "★",
    color: "#666688",
    runIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    position: 1,
    isSystem: true,
  },
];

function normalizePositions(folders: ResearchFolder[]): ResearchFolder[] {
  const system = folders.filter((f) => f.isSystem);
  const custom = folders.filter((f) => !f.isSystem);
  system.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  system.forEach((f, i) => { f.position = i; });
  custom.sort((a, b) => {
    const pa = a.position; const pb = b.position;
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  custom.forEach((f, i) => { f.position = system.length + i; });
  return [...system, ...custom];
}

function getStore(): ResearchFolder[] {
  if (typeof localStorage === "undefined") return normalizePositions([...DEFAULT_FOLDERS]);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizePositions([...DEFAULT_FOLDERS]);
    const parsed = JSON.parse(raw) as ResearchFolder[];
    const systemIds = new Set(parsed.filter((f) => f.isSystem).map((f) => f.id));
    const missingSystem = DEFAULT_FOLDERS.filter((f) => !systemIds.has(f.id)).map((f) => ({ ...f }));
    const merged = [...missingSystem, ...parsed.map((f) => ({ ...f }))];
    return normalizePositions(merged);
  } catch {
    return normalizePositions([...DEFAULT_FOLDERS]);
  }
}

function saveStore(folders: ResearchFolder[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
}

function touch(folder: ResearchFolder): ResearchFolder {
  return { ...folder, updatedAt: Date.now() };
}

// Get all folders
export function getFolders(): ResearchFolder[] {
  return getStore().sort((a, b) => {
    // System folders first, then by updatedAt desc
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

// Get a single folder
export function getFolder(id: string): ResearchFolder | undefined {
  return getStore().find((f: ResearchFolder) => f.id === id);
}

// Create a new folder
export function createFolder(
  data: Omit<ResearchFolder, "id" | "createdAt" | "updatedAt" | "runIds" | "isSystem"> & {
    runIds?: string[];
  },
): ResearchFolder {
  const folders = getStore();
  const newFolder: ResearchFolder = {
    id: "folder-" + Math.random().toString(36).slice(2, 10),
    name: data.name,
    description: data.description,
    icon: data.icon || "??",
    color: data.color,
    runIds: data.runIds || [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  folders.push(newFolder);
  saveStore(folders);
  return newFolder;
}

// Update a folder
export function updateFolder(
  id: string,
  updates: Partial<Omit<ResearchFolder, "id" | "createdAt" | "isSystem">>,
): ResearchFolder | null {
  const folders = getStore();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx < 0) return null;
  if (folders[idx].isSystem && (updates.name !== undefined)) {
    // System folders can't be renamed (but other props can change)
    const { name, ...rest } = updates;
    folders[idx] = touch({ ...folders[idx], ...rest });
  } else {
    folders[idx] = touch({ ...folders[idx], ...updates });
  }
  saveStore(folders);
  return folders[idx];
}

// Delete a folder
export function deleteFolder(id: string): boolean {
  const folders = getStore();
  const folder = folders.find((f: ResearchFolder) => f.id === id);
  if (!folder || folder.isSystem) return false;
  const filtered = folders.filter((f) => f.id !== id);
  saveStore(filtered);
  return true;
}

// Add run to folder
export function addRunToFolder(folderId: string, runId: string): boolean {
  const folders = getStore();
  const folder = folders.find((f: ResearchFolder) => f.id === folderId);
  if (!folder) return false;
  if (!folder.runIds.includes(runId)) {
    folder.runIds.push(runId);
    folder.updatedAt = Date.now();
    saveStore(folders);
  }
  return true;
}

// Remove run from folder
export function removeRunFromFolder(folderId: string, runId: string): boolean {
  const folders = getStore();
  const folder = folders.find((f: ResearchFolder) => f.id === folderId);
  if (!folder) return false;
  if (folder.runIds.includes(runId)) {
    folder.runIds = folder.runIds.filter((id) => id !== runId);
    folder.updatedAt = Date.now();
    saveStore(folders);
  }
  return true;
}

// Get folders for a specific run
export function getFoldersForRun(runId: string): ResearchFolder[] {
  return getStore().filter((f) => f.runIds.includes(runId));
}

// Move run from one folder to another
export function moveRun(runId: string, fromFolderId: string, toFolderId: string): boolean {
  const folders = getStore();
  const from = folders.find((f: ResearchFolder) => f.id === fromFolderId);
  const to = folders.find((f: ResearchFolder) => f.id === toFolderId);
  if (!from || !to) return false;

  from.runIds = from.runIds.filter((id) => id !== runId);
  from.updatedAt = Date.now();

  if (!to.runIds.includes(runId)) {
    to.runIds.push(runId);
  }
  to.updatedAt = Date.now();

  saveStore(folders);
  return true;
}

// Get total run count across all folders
export function getTotalFolderRuns(): number {
  return getStore().reduce((sum, f) => sum + f.runIds.length, 0);
}
/**
 * Bulk import folders. System folders preserved.
 * Returns count of imported folders.
 */

/**
 * Reorder folders by moving a folder to a new index.
 * Only reorders custom folders; system folders stay fixed at the top.
 * Returns true if the reorder was applied.
 */
export function reorderFolders(folderId: string, toIndex: number): boolean {
  const folders = getStore();
  const systemFolders = folders.filter((f) => f.isSystem);
  const customFolders = folders.filter((f) => !f.isSystem);

  const fromIdx = customFolders.findIndex((f) => f.id === folderId);
  if (fromIdx < 0) return false;

  const clampedTo = Math.max(0, Math.min(customFolders.length - 1, toIndex));
  if (fromIdx === clampedTo) return true;

  const [moved] = customFolders.splice(fromIdx, 1);
  customFolders.splice(clampedTo, 0, moved);
  moved.updatedAt = Date.now();

  // Clear old positions on custom folders so normalizePositions respects the
  // new array order instead of stale position values.
    // Assign provisional positions in splice order so the user's requested order
  // is preserved even if normalizePositions would otherwise fall back to timestamps.
  const base = systemFolders.length;
  customFolders.forEach((f, i) => { f.position = base + i; });
  saveStore(normalizePositions([...systemFolders, ...customFolders]));
  return true;
}

/**
 * Reorder runs within a folder by moving a run to a new index.
 * Returns true if the reorder was applied.
 */
export function reorderRunsInFolder(folderId: string, runId: string, toIndex: number): boolean {
  const folders = getStore();
  const folder = folders.find((f) => f.id === folderId);
  if (!folder) return false;

  const fromIdx = folder.runIds.indexOf(runId);
  if (fromIdx < 0) return false;

  const clampedTo = Math.max(0, Math.min(folder.runIds.length - 1, toIndex));
  if (fromIdx === clampedTo) return true;

  const [moved] = folder.runIds.splice(fromIdx, 1);
  folder.runIds.splice(clampedTo, 0, moved);
  folder.updatedAt = Date.now();

  saveStore(folders);
  return true;
}

/**
 * Add multiple runs to a folder. Returns number of newly added runs.
 */
export function bulkAddRunsToFolder(folderId: string, runIds: string[]): number {
  const folders = getStore();
  const folder = folders.find((f: ResearchFolder) => f.id === folderId);
  if (!folder) return 0;

  let added = 0;
  for (const runId of runIds) {
    if (!folder.runIds.includes(runId)) {
      folder.runIds.push(runId);
      added++;
    }
  }

  if (added > 0) {
    folder.updatedAt = Date.now();
    saveStore(folders);
  }

  return added;
}

/**
 * Remove multiple runs from a folder. Returns number of removed runs.
 */
export function bulkRemoveRunsFromFolder(folderId: string, runIds: string[]): number {
  const folders = getStore();
  const folder = folders.find((f: ResearchFolder) => f.id === folderId);
  if (!folder) return 0;

  const before = folder.runIds.length;
  folder.runIds = folder.runIds.filter((id: string) => !runIds.includes(id));
  const removed = before - folder.runIds.length;

  if (removed > 0) {
    folder.updatedAt = Date.now();
    saveStore(folders);
  }

  return removed;
}
export function bulkImportFolders(
  folders: ResearchFolder[],
  strategy: "merge" | "overwrite" = "merge",
): number {
  const existing = getFolders();
  if (strategy === "overwrite") {
    const systemFolders = existing.filter((f) => f.isSystem);
    const customFolders = folders.filter((f) => !f.isSystem);
    saveStore([...systemFolders, ...customFolders]);
    return customFolders.length;
  }
  const byId = new Map(existing.map((f) => [f.id, f]));
  let imported = 0;
  for (const f of folders) {
    if (!f?.id || f.isSystem) continue;
    if (!byId.has(f.id)) {
      byId.set(f.id, f);
      imported++;
    } else {
      const ex = byId.get(f.id)!;
      const exTime = ex.updatedAt ?? ex.createdAt ?? 0;
      const inTime = f.updatedAt ?? f.createdAt ?? 0;
      if (inTime > exTime) {
        byId.set(f.id, f);
        imported++;
      }
    }
  }
  saveStore(Array.from(byId.values()));
  return imported;
}

/* ------------------------------------------------------------------ */
/*  Folder statistics                                                  */
/* ------------------------------------------------------------------ */

export interface FolderStats {
  totalFolders: number;
  customFolders: number;
  systemFolders: number;
  totalRunsOrganized: number;
  emptyFolders: number;
  largestFolder: { id: string; name: string; count: number } | null;
}

export function getFolderStats(): FolderStats {
  const folders = getStore();
  const custom = folders.filter((f) => !f.isSystem);
  const system = folders.filter((f) => f.isSystem);
  const totalRuns = folders.reduce((sum, f) => sum + f.runIds.length, 0);
  const emptyCount = folders.filter((f) => f.runIds.length === 0).length;
  let largest: { id: string; name: string; count: number } | null = null;
  for (const f of folders) {
    if (!largest || f.runIds.length > largest.count) {
      largest = { id: f.id, name: f.name, count: f.runIds.length };
    }
  }
  return {
    totalFolders: folders.length,
    customFolders: custom.length,
    systemFolders: system.length,
    totalRunsOrganized: totalRuns,
    emptyFolders: emptyCount,
    largestFolder: largest?.count ? largest : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Search, rename validation, duplicate detection                      */
/* ------------------------------------------------------------------ */

export function findFoldersByName(query: string): ResearchFolder[] {
  if (!query.trim()) return getFolders();
  const q = query.toLowerCase();
  return getFolders().filter((f) => {
    if (f.name.toLowerCase().includes(q)) return true;
    if (f.description?.toLowerCase().includes(q)) return true;
    return false;
  });
}

export function folderExists(name: string, excludeId?: string): boolean {
  const folders = getStore();
  return folders.some((f) => f.name.toLowerCase() === name.toLowerCase() && f.id !== excludeId);
}

export function getEmptyFolders(): ResearchFolder[] {
  return getStore().filter((f) => !f.isSystem && f.runIds.length === 0);
}

export function cleanupEmptyFolders(): number {
  const folders = getStore();
  const kept = folders.filter((f) => f.isSystem || f.runIds.length > 0);
  const removed = folders.length - kept.length;
  if (removed > 0) saveStore(kept);
  return removed;
}

export function duplicateFolder(id: string, newName?: string): ResearchFolder | null {
  const folders = getStore();
  const src = folders.find((f) => f.id === id);
  if (!src) return null;
  const name = newName || (src.name + " (copy)");
  const copy: ResearchFolder = {
    ...src,
    id: "folder-" + Math.random().toString(36).slice(2, 10),
    name,
    isSystem: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    runIds: [...src.runIds],
  };
  copy.position = folders.length;
  folders.push(copy);
  saveStore(normalizePositions(folders));
  return copy;
}

/* ------------------------------------------------------------------ */
/*  Export / reset                                                     */
/* ------------------------------------------------------------------ */

export function exportFolders(): string {
  return JSON.stringify(getFolders(), null, 2);
}

export function resetFolders(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getFoldersByRunCount(): ResearchFolder[] {
  return [...getStore()].sort((a, b) => b.runIds.length - a.runIds.length);
}

/* ------------------------------------------------------------------ */
/*  Extended folder utilities (round 153) — pure helpers              */
/* ------------------------------------------------------------------ */

export interface FolderSummary {
  total: number;
  system: number;
  custom: number;
  empty: number;
  totalRuns: number;
  largest?: { id: string; name: string; runCount: number };
  newest?: { id: string; name: string; updatedAt: number };
}

export function summarizeFolders(folders: ResearchFolder[]): FolderSummary {
  let system = 0, custom = 0, empty = 0, totalRuns = 0;
  let largest: FolderSummary["largest"];
  let newest: FolderSummary["newest"];
  folders.forEach((f) => {
    if (f.isSystem) system++; else custom++;
    const n = f.runIds.length;
    totalRuns += n;
    if (n === 0 && !f.isSystem) empty++;
    if (!largest || n > largest.runCount) largest = { id: f.id, name: f.name, runCount: n };
    if (!newest || (f.updatedAt || 0) > newest.updatedAt) newest = { id: f.id, name: f.name, updatedAt: f.updatedAt || 0 };
  });
  return { total: folders.length, system, custom, empty, totalRuns, largest, newest };
}

/** Flatten folder -> runId membership map, returning runId -> folderId[]. */
export function buildRunFolderIndex(folders: ResearchFolder[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  folders.forEach((f) => {
    f.runIds.forEach((rid) => {
      const arr = idx.get(rid) || [];
      arr.push(f.id);
      idx.set(rid, arr);
    });
  });
  return idx;
}

/** Return folders that contain every one of the provided runIds. */
export function foldersContainingAll(folders: ResearchFolder[], runIds: string[]): ResearchFolder[] {
  const want = new Set(runIds);
  return folders.filter((f) => {
    const have = new Set(f.runIds);
    for (const r of want) if (!have.has(r)) return false;
    return true;
  });
}

/** Return folders that contain any of the provided runIds. */
export function foldersContainingAny(folders: ResearchFolder[], runIds: string[]): ResearchFolder[] {
  const want = new Set(runIds);
  return folders.filter((f) => f.runIds.some((r) => want.has(r)));
}

/**
 * Produce a unique folder name given a desired base. If "Alpha" exists, returns
 * "Alpha (2)", then "Alpha (3)", etc. Comparisons are case-insensitive.
 */
export function uniqueFolderName(folders: ResearchFolder[], base: string): string {
  const taken = new Set(folders.map((f) => f.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has((base + " (" + n + ")").toLowerCase())) n++;
  return base + " (" + n + ")";
}

/** Produce a flat, sorted path-friendly tree view string for debugging/export. */
export function foldersToPlainList(folders: ResearchFolder[]): Array<{
  id: string; name: string; isSystem: boolean; runCount: number; position: number;
}> {
  return folders.map((f) => ({
    id: f.id,
    name: f.name,
    isSystem: !!f.isSystem,
    runCount: f.runIds.length,
    position: f.position ?? -1,
  }));
}

/** CSV export: id,name,isSystem,color,runCount,createdAt,updatedAt,position */
export function foldersToCsv(folders: ResearchFolder[]): string {
  const rows: string[] = ["id,name,isSystem,color,runCount,createdAt,updatedAt,position"];
  folders.forEach((f) => {
    rows.push([
      f.id,
      JSON.stringify(f.name),
      f.isSystem ? "1" : "0",
      f.color || "",
      String(f.runIds.length),
      String(f.createdAt || 0),
      String(f.updatedAt || 0),
      String(f.position ?? ""),
    ].join(","));
  });
  return rows.join("\n");
}

/** Deep equality for two folder records (ignoring runId ordering). */
export function foldersEqual(a: ResearchFolder, b: ResearchFolder): boolean {
  if (a.id !== b.id) return false;
  if (a.name !== b.name) return false;
  if ((a.description || "") !== (b.description || "")) return false;
  if ((a.color || "") !== (b.color || "")) return false;
  if ((a.icon || "") !== (b.icon || "")) return false;
  if (!!a.isSystem !== !!b.isSystem) return false;
  if ((a.position ?? -1) !== (b.position ?? -1)) return false;
  if (a.runIds.length !== b.runIds.length) return false;
  const sa = new Set(a.runIds), sb = new Set(b.runIds);
  for (const r of sa) if (!sb.has(r)) return false;
  return true;
}

