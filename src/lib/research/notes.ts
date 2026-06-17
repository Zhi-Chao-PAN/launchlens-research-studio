/**
 * Research notes & annotations.
 * Allows users to add personal notes, highlights, and tags to research runs.
 * Stored in localStorage (client-side only).
 */

export interface NoteAnnotation {
  id: string;
  type: "note" | "highlight" | "bookmark" | "tag";
  content?: string; // note text
  target?: string; // CSS selector or section reference
  color?: string; // highlight color
  createdAt: number;
  updatedAt: number;
}

export interface ResearchNotes {
  runId: string;
  annotations: NoteAnnotation[];
  personalNote: string; // overall summary note
  rating: number; // 0-5 star rating
  tags: string[];
  isStarred: boolean;
  isArchived: boolean;
  lastOpenedAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "launchlens:notes";
const STARRED_KEY = "launchlens:starred";

function getStore(): Map<string, ResearchNotes> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, ResearchNotes>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveStore(store: Map<string, ResearchNotes>): void {
  if (typeof window === "undefined") return;
  const obj = Object.fromEntries(store);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

function ensureRun(store: Map<string, ResearchNotes>, runId: string): ResearchNotes {
  let notes = store.get(runId);
  if (!notes) {
    notes = {
      runId,
      annotations: [],
      personalNote: "",
      rating: 0,
      tags: [],
      isStarred: false,
      isArchived: false,
      lastOpenedAt: Date.now(),
      updatedAt: Date.now(),
    };
    store.set(runId, notes);
  }
  return notes;
}

export function getNotes(runId: string): ResearchNotes | null {
  return getStore().get(runId) || null;
}

export function savePersonalNote(runId: string, content: string): void {
  const store = getStore();
  const notes = ensureRun(store, runId);
  notes.personalNote = content;
  notes.updatedAt = Date.now();
  saveStore(store);
}

export function addAnnotation(runId: string, annotation: Omit<NoteAnnotation, "id" | "createdAt" | "updatedAt">): NoteAnnotation {
  const store = getStore();
  const notes = ensureRun(store, runId);
  
  const newAnnotation: NoteAnnotation = {
    ...annotation,
    id: "note-" + Math.random().toString(36).slice(2, 10),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  notes.annotations.push(newAnnotation);
  saveStore(store);
  
  return newAnnotation;
}

export function deleteAnnotation(runId: string, annotationId: string): void {
  const store = getStore();
  const notes = store.get(runId);
  if (!notes) return;
  
  notes.annotations = notes.annotations.filter((a) => a.id !== annotationId);
  saveStore(store);
}

export function toggleStar(runId: string): boolean {
  const store = getStore();
  const notes = ensureRun(store, runId);
  notes.isStarred = !notes.isStarred;
  notes.updatedAt = Date.now();
  saveStore(store);
  return notes.isStarred;
}

export function setRating(runId: string, rating: number): void {
  const store = getStore();
  const notes = ensureRun(store, runId);
  notes.rating = Math.max(0, Math.min(5, rating));
  notes.updatedAt = Date.now();
  saveStore(store);
}

export function addTag(runId: string, tag: string): void {
  const store = getStore();
  const notes = ensureRun(store, runId);
  if (!notes.tags.includes(tag)) {
    notes.tags.push(tag);
    notes.updatedAt = Date.now();
    saveStore(store);
  }
}

export function removeTag(runId: string, tag: string): void {
  const store = getStore();
  const notes = store.get(runId);
  if (!notes) return;
  
  notes.tags = notes.tags.filter((t) => t !== tag);
  notes.updatedAt = Date.now();
  saveStore(store);
}

export function toggleArchive(runId: string): boolean {
  const store = getStore();
  const notes = ensureRun(store, runId);
  notes.isArchived = !notes.isArchived;
  notes.updatedAt = Date.now();
  saveStore(store);
  return notes.isArchived;
}

export function markOpened(runId: string): void {
  const store = getStore();
  const notes = ensureRun(store, runId);
  notes.lastOpenedAt = Date.now();
  saveStore(store);
}

// Get all notes for starred/history filtering
export function getAllNotes(): ResearchNotes[] {
  return Array.from(getStore().values());
}

export function getStarredRuns(): string[] {
  return getAllNotes()
    .filter((n) => n.isStarred)
    .map((n) => n.runId);
}

// Get all unique tags
export function getAllTags(): string[] {
  const tags = new Set<string>();
  for (const notes of getAllNotes()) {
    for (const tag of notes.tags) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort();
}

// Search notes
export function searchNotes(query: string): ResearchNotes[] {
  const q = query.toLowerCase();
  return getAllNotes().filter((n) =>
    n.personalNote.toLowerCase().includes(q) ||
    n.tags.some((t) => t.toLowerCase().includes(q)) ||
    n.annotations.some((a) => a.content?.toLowerCase().includes(q))
  );
}

// Migration from old starred key
export function migrateOldStarred(): void {
  if (typeof window === "undefined") return;
  try {
    const oldStarred = localStorage.getItem(STARRED_KEY);
    if (oldStarred) {
      const ids: string[] = JSON.parse(oldStarred);
      const store = getStore();
      for (const id of ids) {
        const notes = ensureRun(store, id);
        notes.isStarred = true;
      }
      saveStore(store);
      localStorage.removeItem(STARRED_KEY);
    }
  } catch {
    // ignore migration errors
  }
}

/**
 * Bulk import notes. Replaces all existing notes.
 * Returns count of imported notes.
 */
export function bulkImportNotes(notes: ResearchNotes[]): number {
  const store = new Map<string, ResearchNotes>();
  for (const n of notes) {
    if (n?.runId) {
      store.set(n.runId, n);
    }
  }
  saveStore(store);
  return store.size;
}
