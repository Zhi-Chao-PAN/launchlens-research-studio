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
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return new Map();
    // Defensively drop any entry that doesn't match ResearchNotes so a
    // partial localStorage write cannot crash addAnnotation / addTag /
    // ensureRun, which would otherwise .push onto an invalid value.
    const out = new Map<string, ResearchNotes>();
    for (const [k, v] of Object.entries(obj)) {
      if (isValidResearchNotes(v)) out.set(k, v);
    }
    return out;
  } catch {
    return new Map();
  }
}

function isValidResearchNotes(v: unknown): v is ResearchNotes {
  if (!v || typeof v !== "object") return false;
  const n = v as Record<string, unknown>;
  if (typeof n.runId !== "string" || !n.runId) return false;
  if (!Array.isArray(n.annotations)) return false;
  if (!n.annotations.every(isValidNoteAnnotation)) return false;
  if (typeof n.personalNote !== "string") return false;
  if (typeof n.rating !== "number" || !Number.isFinite(n.rating)) return false;
  if (!Array.isArray(n.tags) || !n.tags.every((t) => typeof t === "string")) return false;
  if (typeof n.isStarred !== "boolean") return false;
  if (typeof n.isArchived !== "boolean") return false;
  if (typeof n.lastOpenedAt !== "number" || !Number.isFinite(n.lastOpenedAt)) return false;
  if (typeof n.updatedAt !== "number" || !Number.isFinite(n.updatedAt)) return false;
  return true;
}

function isValidNoteAnnotation(a: unknown): boolean {
  if (!a || typeof a !== "object") return false;
  const x = a as Record<string, unknown>;
  if (typeof x.id !== "string" || !x.id) return false;
  if (typeof x.type !== "string") return false;
  if (x.content !== undefined && typeof x.content !== "string") return false;
  if (x.target !== undefined && typeof x.target !== "string") return false;
  if (x.color !== undefined && typeof x.color !== "string") return false;
  if (typeof x.createdAt !== "number" || !Number.isFinite(x.createdAt)) return false;
  if (typeof x.updatedAt !== "number" || !Number.isFinite(x.updatedAt)) return false;
  return true;
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


// ============================================================
// Note templates / quick notes
// ============================================================

export interface QuickNoteTemplate {
  id: string;
  name: string;
  content: string;
  icon?: string;
}

const QUICK_NOTES_KEY = "launchlens:quick-notes";

/**
 * Get all quick note templates.
 */
export function getQuickNoteTemplates(): QuickNoteTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUICK_NOTES_KEY);
    if (!raw) return getDefaultQuickNotes();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : getDefaultQuickNotes();
  } catch {
    return getDefaultQuickNotes();
  }
}

function getDefaultQuickNotes(): QuickNoteTemplate[] {
  return [
    { id: "qn-important", name: "Important", content: "**Important:** ", icon: "⭐" },
    { id: "qn-follow-up", name: "Follow up", content: "**Follow up:** Research more about ", icon: "🔍" },
    { id: "qn-question", name: "Question", content: "**Question:** ", icon: "❓" },
    { id: "qn-action", name: "Action item", content: "**Action:** ", icon: "✅" },
    { id: "qn-idea", name: "Idea", content: "**Idea:** ", icon: "💡" },
    { id: "qn-concern", name: "Concern", content: "**Concern:** ", icon: "⚠️" },
  ];
}

function saveQuickNoteTemplates(templates: QuickNoteTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUICK_NOTES_KEY, JSON.stringify(templates));
  } catch {
    // ignore
  }
}

/**
 * Add a custom quick note template.
 */
export function addQuickNoteTemplate(name: string, content: string, icon?: string): QuickNoteTemplate {
  const templates = getQuickNoteTemplates();
  const tpl: QuickNoteTemplate = {
    id: "qn-" + Math.random().toString(36).slice(2, 10),
    name,
    content,
    icon,
  };
  templates.push(tpl);
  saveQuickNoteTemplates(templates);
  return tpl;
}

/**
 * Delete a quick note template.
 */
export function deleteQuickNoteTemplate(id: string): boolean {
  const templates = getQuickNoteTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return false;
  saveQuickNoteTemplates(filtered);
  return true;
}

/**
 * Insert a quick note template into a run's personal note.
 * Returns the updated note content.
 */
export function insertQuickNote(runId: string, templateId: string): string | null {
  const templates = getQuickNoteTemplates();
  const tpl = templates.find((t) => t.id === templateId);
  if (!tpl) return null;

  const store = getStore();
  const notes = ensureRun(store, runId);
  const prefix = notes.personalNote ? notes.personalNote + "\n\n" : "";
  notes.personalNote = prefix + tpl.content;
  notes.updatedAt = Date.now();
  saveStore(store);
  return notes.personalNote;
}

// ============================================================
// Bulk note operations
// ============================================================

export interface BulkNotesResult {
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Bulk add a tag to multiple runs.
 */
export function bulkAddTag(runIds: string[], tag: string): BulkNotesResult {
  const store = getStore();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const runId of runIds) {
    try {
      const notes = ensureRun(store, runId);
      if (!notes.tags.includes(tag)) {
        notes.tags.push(tag);
        notes.updatedAt = Date.now();
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push("Failed to tag " + runId + ": " + String(e));
    }
  }

  saveStore(store);
  return { updated, skipped, errors };
}

/**
 * Bulk remove a tag from multiple runs.
 */
export function bulkRemoveTag(runIds: string[], tag: string): BulkNotesResult {
  const store = getStore();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const runId of runIds) {
    try {
      const notes = store.get(runId);
      if (!notes) {
        skipped++;
        continue;
      }
      const before = notes.tags.length;
      notes.tags = notes.tags.filter((t) => t !== tag);
      if (notes.tags.length !== before) {
        notes.updatedAt = Date.now();
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push("Failed to untag " + runId + ": " + String(e));
    }
  }

  saveStore(store);
  return { updated, skipped, errors };
}

/**
 * Bulk star multiple runs.
 */
export function bulkStarRuns(runIds: string[], starred: boolean = true): BulkNotesResult {
  const store = getStore();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const runId of runIds) {
    try {
      const notes = ensureRun(store, runId);
      if (notes.isStarred !== starred) {
        notes.isStarred = starred;
        notes.updatedAt = Date.now();
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push("Failed to star " + runId + ": " + String(e));
    }
  }

  saveStore(store);
  return { updated, skipped, errors };
}

/**
 * Bulk archive multiple runs.
 */
export function bulkArchiveRuns(runIds: string[], archived: boolean = true): BulkNotesResult {
  const store = getStore();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const runId of runIds) {
    try {
      const notes = ensureRun(store, runId);
      if (notes.isArchived !== archived) {
        notes.isArchived = archived;
        notes.updatedAt = Date.now();
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push("Failed to archive " + runId + ": " + String(e));
    }
  }

  saveStore(store);
  return { updated, skipped, errors };
}

/**
 * Bulk set rating for multiple runs.
 */
export function bulkSetRating(runIds: string[], rating: number): BulkNotesResult {
  const clampedRating = Math.max(0, Math.min(5, rating));
  const store = getStore();
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const runId of runIds) {
    try {
      const notes = ensureRun(store, runId);
      if (notes.rating !== clampedRating) {
        notes.rating = clampedRating;
        notes.updatedAt = Date.now();
        updated++;
      } else {
        skipped++;
      }
    } catch (e) {
      errors.push("Failed to rate " + runId + ": " + String(e));
    }
  }

  saveStore(store);
  return { updated, skipped, errors };
}

// ============================================================
// Notes statistics
// ============================================================

export interface NotesStats {
  totalRuns: number;
  withPersonalNote: number;
  withAnnotations: number;
  starred: number;
  archived: number;
  totalAnnotations: number;
  totalTags: number;
  avgRating: number | null;
  ratedRuns: number;
  tagFrequency: Array<{ tag: string; count: number }>;
}

/**
 * Get statistics about notes and annotations across all runs.
 */
export function getNotesStats(): NotesStats {
  const allNotes = getAllNotes();

  let withPersonalNote = 0;
  let withAnnotations = 0;
  let starred = 0;
  let archived = 0;
  let totalAnnotations = 0;
  let totalRating = 0;
  let ratedRuns = 0;
  const tagCounts = new Map<string, number>();

  for (const n of allNotes) {
    if (n.personalNote && n.personalNote.trim().length > 0) withPersonalNote++;
    if (n.annotations.length > 0) withAnnotations++;
    totalAnnotations += n.annotations.length;
    if (n.isStarred) starred++;
    if (n.isArchived) archived++;
    if (n.rating > 0) {
      totalRating += n.rating;
      ratedRuns++;
    }
    for (const tag of n.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const tagFrequency = Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return {
    totalRuns: allNotes.length,
    withPersonalNote,
    withAnnotations,
    starred,
    archived,
    totalAnnotations,
    totalTags: tagCounts.size,
    avgRating: ratedRuns > 0 ? Math.round((totalRating / ratedRuns) * 10) / 10 : null,
    ratedRuns,
    tagFrequency,
  };
}

// ============================================================
// Annotation enhancements
// ============================================================

/**
 * Update an existing annotation.
 * Returns the updated annotation or null if not found.
 */
export function updateAnnotation(
  runId: string,
  annotationId: string,
  updates: Partial<Omit<NoteAnnotation, "id" | "createdAt">>,
): NoteAnnotation | null {
  const store = getStore();
  const notes = store.get(runId);
  if (!notes) return null;

  const idx = notes.annotations.findIndex((a) => a.id === annotationId);
  if (idx === -1) return null;

  notes.annotations[idx] = {
    ...notes.annotations[idx],
    ...updates,
    updatedAt: Date.now(),
  };

  notes.updatedAt = Date.now();
  saveStore(store);
  return notes.annotations[idx];
}

/**
 * Get annotations filtered by type.
 */
export function getAnnotationsByType(runId: string, type: NoteAnnotation["type"]): NoteAnnotation[] {
  const notes = getNotes(runId);
  if (!notes) return [];
  return notes.annotations.filter((a) => a.type === type);
}

/**
 * Get all annotations across all runs, optionally filtered by type.
 */
export function getAllAnnotations(type?: NoteAnnotation["type"]): Array<{ runId: string; annotation: NoteAnnotation }> {
  const result: Array<{ runId: string; annotation: NoteAnnotation }> = [];
  for (const notes of getAllNotes()) {
    for (const a of notes.annotations) {
      if (!type || a.type === type) {
        result.push({ runId: notes.runId, annotation: a });
      }
    }
  }
  return result.sort((a, b) => b.annotation.createdAt - a.annotation.createdAt);
}

// ============================================================
// Notes export
// ============================================================

/**
 * Export all notes as a structured JSON package.
 */
export function exportNotesPackage(): {
  version: 1;
  exportedAt: number;
  source: string;
  notes: ResearchNotes[];
  quickNoteTemplates: QuickNoteTemplate[];
} {
  return {
    version: 1,
    exportedAt: Date.now(),
    source: "launchlens-notes",
    notes: getAllNotes(),
    quickNoteTemplates: getQuickNoteTemplates(),
  };
}

/**
 * Import notes from a package.
 * Strategy: merge (default) / overwrite / skip.
 */
export function importNotesPackage(
  pkg: { version: number; notes: ResearchNotes[]; quickNoteTemplates?: QuickNoteTemplate[] },
  strategy: "merge" | "overwrite" | "skip" = "merge",
): { imported: number; skipped: number; errors: string[] } {
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  if (!pkg?.version || !Array.isArray(pkg.notes)) {
    return { imported: 0, skipped: 0, errors: ["Invalid notes package"] };
  }

  const store = getStore();

  if (strategy === "overwrite") {
    store.clear();
  }

  for (const n of pkg.notes) {
    if (!n?.runId) {
      errors.push("Skipping note without runId");
      skipped++;
      continue;
    }

    const existing = store.get(n.runId);
    if (existing && strategy === "skip") {
      skipped++;
      continue;
    }

    if (existing && strategy === "merge") {
      // Merge: keep existing annotations, append new ones by id
      const existingAnnoIds = new Set(existing.annotations.map((a) => a.id));
      const newAnnotations = n.annotations.filter((a) => !existingAnnoIds.has(a.id));
      existing.annotations.push(...newAnnotations);

      // Merge tags
      for (const tag of n.tags) {
        if (!existing.tags.includes(tag)) existing.tags.push(tag);
      }

      // Prefer newer personal note
      if ((n.updatedAt || 0) > (existing.updatedAt || 0)) {
        existing.personalNote = n.personalNote;
        existing.rating = n.rating;
        existing.isStarred = n.isStarred;
        existing.isArchived = n.isArchived;
        existing.updatedAt = n.updatedAt;
      }
    } else {
      store.set(n.runId, { ...n });
    }

    imported++;
  }

  // Import quick note templates if present
  if (pkg.quickNoteTemplates?.length) {
    const existing = getQuickNoteTemplates();
    const existingNames = new Set(existing.map((t) => t.name.toLowerCase()));
    const newTpls = pkg.quickNoteTemplates.filter(
      (t) => !existingNames.has(t.name.toLowerCase())
    );
    if (newTpls.length > 0) {
      saveQuickNoteTemplates([...existing, ...newTpls]);
    }
  }

  saveStore(store);
  return { imported, skipped, errors };
}

// ============================================================
// Word count and activity tracking (round 138)
// ============================================================

export function getNoteWordCount(runId: string): number {
  const notes = getNotes(runId);
  if (!notes) return 0;
  let words = 0;
  if (notes.personalNote) {
    words += notes.personalNote.trim().split(/\s+/).filter(Boolean).length;
  }
  for (const a of notes.annotations) {
    if (a.content) words += a.content.trim().split(/\s+/).filter(Boolean).length;
  }
  return words;
}

export interface RecentActivity {
  runId: string;
  action: "edited-note" | "annotated" | "starred" | "rated" | "tagged";
  at: number;
}

export function getRecentlyUpdatedNotes(limit: number = 10): ResearchNotes[] {
  return getAllNotes()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

export function getRecentlyOpenedNotes(limit: number = 10): ResearchNotes[] {
  return getAllNotes()
    .filter((n) => n.lastOpenedAt > 0)
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, limit);
}

export function hasUnsavedNotes(runId: string): boolean {
  const notes = getNotes(runId);
  if (!notes) return false;
  return !!(notes.personalNote?.trim() || notes.annotations.length > 0 || notes.tags.length > 0 || notes.rating > 0);
}

export function getEmptyNotesCount(): number {
  return getAllNotes().filter((n) => !hasUnsavedNotes(n.runId)).length;
}

export function cleanupEmptyNotes(): number {
  const store = getStore();
  let removed = 0;
  for (const [runId, notes] of store) {
    if (!notes.personalNote?.trim() && notes.annotations.length === 0 && notes.tags.length === 0 && notes.rating === 0 && !notes.isStarred && !notes.isArchived) {
      store.delete(runId);
      removed++;
    }
  }
  if (removed > 0) saveStore(store);
  return removed;
}

/* ------------------------------------------------------------------ */
/*  Extended notes utilities (round 151) -- pure, SSR-safe            */
/* ------------------------------------------------------------------ */

export interface NotesSummary {
  total: number;
  withNote: number;
  withAnnotation: number;
  starred: number;
  archived: number;
  totalAnnotations: number;
  totalTags: number;
  uniqueTags: string[];
  avgRating: number | null;
  avgWordCount: number;
  latestUpdate: number | null;
}

export function summarizeNotes(notes: ResearchNotes[]): NotesSummary {
  let withNote = 0, withAnnotation = 0, starred = 0, archived = 0;
  let totalAnnotations = 0, totalWords = 0, ratingSum = 0, rated = 0;
  let latest: number | null = null;
  const tagSet = new Set<string>();
  notes.forEach((n) => {
    if (n.personalNote && n.personalNote.trim()) withNote++;
    if (n.annotations.length > 0) { withAnnotation++; totalAnnotations += n.annotations.length; }
    if (n.isStarred) starred++;
    if (n.isArchived) archived++;
    n.tags.forEach((t) => tagSet.add(t));
    if (n.rating > 0) { ratingSum += n.rating; rated++; }
    let wc = 0;
    if (n.personalNote) wc += n.personalNote.trim().split(/\s+/).filter(Boolean).length;
    n.annotations.forEach((a) => { if (a.content) wc += a.content.trim().split(/\s+/).filter(Boolean).length; });
    totalWords += wc;
    if (latest === null || n.updatedAt > latest) latest = n.updatedAt;
  });
  const uniqueTags = Array.from(tagSet).sort();
  return {
    total: notes.length,
    withNote,
    withAnnotation,
    starred,
    archived,
    totalAnnotations,
    totalTags: uniqueTags.length,
    uniqueTags,
    avgRating: rated > 0 ? Math.round((ratingSum / rated) * 10) / 10 : null,
    avgWordCount: notes.length > 0 ? Math.round(totalWords / notes.length) : 0,
    latestUpdate: latest,
  };
}

export function filterNotesByRating(notes: ResearchNotes[], min: number, max: number = 5): ResearchNotes[] {
  const lo = Math.max(0, Math.min(5, Math.floor(min)));
  const hi = Math.max(lo, Math.min(5, Math.floor(max)));
  return notes.filter((n) => n.rating >= lo && n.rating <= hi);
}

export function filterNotesByTags(notes: ResearchNotes[], tags: string[], matchAll: boolean = false): ResearchNotes[] {
  if (tags.length === 0) return notes.slice();
  const want = new Set(tags.map((t) => t.toLowerCase()));
  return notes.filter((n) => {
    const have = new Set(n.tags.map((t) => t.toLowerCase()));
    if (matchAll) {
      let ok = true;
      want.forEach((t) => { if (!have.has(t)) ok = false; });
      return ok;
    }
    let hit = false;
    have.forEach((t) => { if (want.has(t)) hit = true; });
    return hit;
  });
}

/** Filter by starred / archived flags. A null flag means "do not care". */
export function filterNotesByFlags(notes: ResearchNotes[], opts: {
  starred?: boolean | null;
  archived?: boolean | null;
}): ResearchNotes[] {
  return notes.filter((n) => {
    if (opts.starred === true && !n.isStarred) return false;
    if (opts.starred === false && n.isStarred) return false;
    if (opts.archived === true && !n.isArchived) return false;
    if (opts.archived === false && n.isArchived) return false;
    return true;
  });
}

export function mergeNotes(a: ResearchNotes, b: ResearchNotes): ResearchNotes {
  if (a.runId !== b.runId) throw new Error("mergeNotes requires same runId");
  const useB = (b.updatedAt || 0) >= (a.updatedAt || 0);
  const newer = useB ? b : a;
  const older = useB ? a : b;
  const annoById = new Map<string, NoteAnnotation>();
  [older, newer].forEach((n) => n.annotations.forEach((an) => {
    const ex = annoById.get(an.id);
    if (!ex || (an.updatedAt || 0) >= (ex.updatedAt || 0)) annoById.set(an.id, an);
  }));
  const tagSet = new Set<string>();
  older.tags.forEach((t) => tagSet.add(t));
  newer.tags.forEach((t) => tagSet.add(t));
  return {
    runId: a.runId,
    annotations: Array.from(annoById.values()).sort((x, y) => x.createdAt - y.createdAt),
    personalNote: newer.personalNote,
    rating: newer.rating,
    tags: Array.from(tagSet),
    isStarred: newer.isStarred || older.isStarred,
    isArchived: newer.isArchived,
    lastOpenedAt: Math.max(older.lastOpenedAt || 0, newer.lastOpenedAt || 0),
    updatedAt: Math.max(older.updatedAt || 0, newer.updatedAt || 0),
  };
}

export function dedupeNotes(notes: ResearchNotes[]): ResearchNotes[] {
  const byId = new Map<string, ResearchNotes>();
  notes.forEach((n) => {
    const ex = byId.get(n.runId);
    byId.set(n.runId, ex ? mergeNotes(ex, n) : n);
  });
  return Array.from(byId.values());
}

export function tagCloud(notes: ResearchNotes[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  notes.forEach((n) => n.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function notesToCsv(notes: ResearchNotes[]): string {
  const rows: string[] = ["runId,rating,starred,archived,tags,noteChars,updatedAt"];
  notes.forEach((n) => {
    rows.push([
      JSON.stringify(n.runId),
      String(n.rating),
      n.isStarred ? "1" : "0",
      n.isArchived ? "1" : "0",
      String(n.tags.length),
      String(n.personalNote.length),
      String(n.updatedAt),
    ].join(","));
  });
  return rows.join("\n");
}

export function notesEqual(a: ResearchNotes, b: ResearchNotes): boolean {
  if (a.runId !== b.runId) return false;
  if (a.personalNote !== b.personalNote) return false;
  if (a.rating !== b.rating) return false;
  if (a.isStarred !== b.isStarred) return false;
  if (a.isArchived !== b.isArchived) return false;
  if (a.updatedAt !== b.updatedAt) return false;
  if (a.lastOpenedAt !== b.lastOpenedAt) return false;
  if (a.tags.length !== b.tags.length) return false;
  const ta = new Set(a.tags), tb = new Set(b.tags);
  for (const t of ta) if (!tb.has(t)) return false;
  if (a.annotations.length !== b.annotations.length) return false;
  const aa = new Map(a.annotations.map((x) => [x.id, x]));
  for (const an of b.annotations) {
    const other = aa.get(an.id);
    if (!other) return false;
    if (other.type !== an.type) return false;
    if (other.content !== an.content) return false;
  }
  return true;
}

