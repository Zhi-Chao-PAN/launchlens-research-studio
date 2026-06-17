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
    name: "�ղؼ�",
    icon: "?",
    color: "#fbbf24",
    runIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isSystem: true,
  },
  {
    id: "folder-archived",
    name: "�鵵",
    icon: "??",
    color: "#666688",
    runIds: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isSystem: true,
  },
];

function getStore(): ResearchFolder[] {
  if (typeof localStorage === "undefined") return [...DEFAULT_FOLDERS];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_FOLDERS];
    const folders = JSON.parse(raw) as ResearchFolder[];
    // Ensure system folders always exist
    const systemIds = new Set(folders.filter((f) => f.isSystem).map((f) => f.id));
    const missingSystem = DEFAULT_FOLDERS.filter((f) => !systemIds.has(f.id));
    return [...missingSystem, ...folders];
  } catch {
    return [...DEFAULT_FOLDERS];
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
  const customFolders = folders.filter((f) => !f.isSystem);
  const systemFolders = folders.filter((f) => f.isSystem);

  const fromIdx = customFolders.findIndex((f) => f.id === folderId);
  if (fromIdx < 0) return false;

  const clampedTo = Math.max(0, Math.min(customFolders.length - 1, toIndex));
  if (fromIdx === clampedTo) return true;

  const [moved] = customFolders.splice(fromIdx, 1);
  customFolders.splice(clampedTo, 0, moved);
  moved.updatedAt = Date.now();

  saveStore([...systemFolders, ...customFolders]);
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
