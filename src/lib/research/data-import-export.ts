/**
 * User data import / export.
 *
 * Unified data package format for all user data: research runs, notes,
 * folders, and templates. Supports full backup, cross-device sync via
 * import/export file, and selective merge strategies.
 *
 * Package format (v1):
 * {
 *   version: 1,
 *   exportedAt: number,
 *   source: "launchlens-research-studio",
 *   data: {
 *     runs: ResearchRun[],
 *     notes: ResearchNotes[],
 *     folders: ResearchFolder[],
 *     templates: ResearchTemplate[],
 *   }
 * }
 */

import type { ResearchRun } from "./storage";
import type { ResearchNotes } from "./notes";
import type { ResearchFolder } from "./folders";
import type { ResearchTemplate } from "./templates";

export const DATA_PACKAGE_VERSION = 1;
export const DATA_PACKAGE_SOURCE = "launchlens-research-studio";

export type ImportMergeStrategy = "overwrite" | "merge" | "skip";

export interface DataPackage {
  version: number;
  exportedAt: number;
  source: string;
  data: {
    runs?: ResearchRun[];
    notes?: ResearchNotes[];
    folders?: ResearchFolder[];
    templates?: ResearchTemplate[];
  };
}

export interface ImportResult {
  imported: {
    runs: number;
    notes: number;
    folders: number;
    templates: number;
  };
  skipped: {
    runs: number;
    notes: number;
    folders: number;
    templates: number;
  };
  errors: string[];
  totalRuns: number;
  totalNotes: number;
  totalFolders: number;
  totalTemplates: number;
}

export interface ExportOptions {
  includeRuns?: boolean;
  includeNotes?: boolean;
  includeFolders?: boolean;
  includeTemplates?: boolean;
  maxRuns?: number;
}

export interface ImportOptions {
  strategy?: ImportMergeStrategy;
  includeRuns?: boolean;
  includeNotes?: boolean;
  includeFolders?: boolean;
  includeTemplates?: boolean;
}

const DEFAULT_IMPORT_OPTIONS: Required<ImportOptions> = {
  strategy: "merge",
  includeRuns: true,
  includeNotes: true,
  includeFolders: true,
  includeTemplates: true,
};

/** Validate a data package structure. Returns list of errors. */
export function validateDataPackage(pkg: unknown): string[] {
  const errors: string[] = [];

  if (!pkg || typeof pkg !== "object") {
    return ["Package is not an object"];
  }

  const p = pkg as Record<string, unknown>;

  if (p.source !== DATA_PACKAGE_SOURCE) {
    errors.push(`Unknown source: ${p.source}`);
  }
  if (typeof p.version !== "number" || p.version < 1) {
    errors.push(`Invalid version: ${p.version}`);
  }
  if (typeof p.exportedAt !== "number") {
    errors.push("Missing exportedAt timestamp");
  }
  if (!p.data || typeof p.data !== "object") {
    errors.push("Missing data section");
    return errors;
  }

  const data = p.data as Record<string, unknown>;
  if (data.runs !== undefined && !Array.isArray(data.runs)) {
    errors.push("data.runs is not an array");
  }
  if (data.notes !== undefined && !Array.isArray(data.notes)) {
    errors.push("data.notes is not an array");
  }
  if (data.folders !== undefined && !Array.isArray(data.folders)) {
    errors.push("data.folders is not an array");
  }
  if (data.templates !== undefined && !Array.isArray(data.templates)) {
    errors.push("data.templates is not an array");
  }

  // Validate run objects have required fields
  if (Array.isArray(data.runs)) {
    for (let i = 0; i < data.runs.length; i++) {
      const run = data.runs[i] as Record<string, unknown>;
      if (!run.id || typeof run.id !== "string") {
        errors.push(`runs[${i}]: missing id`);
      }
    }
  }

  return errors;
}

/** Create a data package from provided data collections. */
export function createDataPackage(data: {
  runs?: ResearchRun[];
  notes?: ResearchNotes[];
  folders?: ResearchFolder[];
  templates?: ResearchTemplate[];
}): DataPackage {
  return {
    version: DATA_PACKAGE_VERSION,
    exportedAt: Date.now(),
    source: DATA_PACKAGE_SOURCE,
    data: {
      runs: data.runs ?? [],
      notes: data.notes ?? [],
      folders: data.folders ?? [],
      templates: data.templates ?? [],
    },
  };
}

/**
 * Merge two arrays of objects by key.
 * Returns [mergedArray, importedCount, skippedCount]
 */
function mergeById<T extends object>(
  existing: T[],
  incoming: T[],
  strategy: ImportMergeStrategy,
  getId: (item: T) => string = (item) => (item as { id: string }).id,
): [T[], number, number] {
  const existingById = new Map(existing.map((r) => [getId(r), r]));
  let imported = 0;
  let skipped = 0;

  for (const item of incoming) {
    const itemId = getId(item);
    if (!itemId) {
      skipped++;
      continue;
    }
    const existingItem = existingById.get(itemId);

    if (!existingItem) {
      // New item - always add
      existingById.set(itemId, item);
      imported++;
    } else {
      switch (strategy) {
        case "overwrite":
          existingById.set(itemId, item);
          imported++;
          break;
        case "merge": {
          // Pick the newer one based on updatedAt / createdAt
          const e = existingItem as { updatedAt?: number; createdAt?: number };
          const i = item as { updatedAt?: number; createdAt?: number };
          const existingTime = e.updatedAt ?? e.createdAt ?? 0;
          const incomingTime = i.updatedAt ?? i.createdAt ?? 0;
          if (incomingTime > existingTime) {
            existingById.set(itemId, item);
            imported++;
          } else {
            skipped++;
          }
          break;
        }
        case "skip":
        default:
          skipped++;
          break;
      }
    }
  }

  // Preserve original order of existing items, append new ones at end
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const item of existing) {
    const eid = getId(item);
    if (existingById.has(eid)) {
      merged.push(existingById.get(eid)!);
      seen.add(eid);
    }
  }
  for (const item of incoming) {
    const iid = getId(item);
    if (iid && !seen.has(iid)) {
      merged.push(existingById.get(iid)!);
      seen.add(iid);
    }
  }

  return [merged, imported, skipped];
}

/**
 * Import a data package into existing data collections.
 * Does not persist - caller is responsible for saving the returned data.
 */
export function importDataPackage(
  existing: {
    runs?: ResearchRun[];
    notes?: ResearchNotes[];
    folders?: ResearchFolder[];
    templates?: ResearchTemplate[];
  },
  pkg: DataPackage,
  options: ImportOptions = {},
): {
  runs: ResearchRun[];
  notes: ResearchNotes[];
  folders: ResearchFolder[];
  templates: ResearchTemplate[];
  result: ImportResult;
} {
  const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
  const errors = validateDataPackage(pkg);

  const result: ImportResult = {
    imported: { runs: 0, notes: 0, folders: 0, templates: 0 },
    skipped: { runs: 0, notes: 0, folders: 0, templates: 0 },
    errors,
    totalRuns: existing.runs?.length ?? 0,
    totalNotes: existing.notes?.length ?? 0,
    totalFolders: existing.folders?.length ?? 0,
    totalTemplates: existing.templates?.length ?? 0,
  };

  if (errors.length > 0) {
    return {
      runs: existing.runs ?? [],
      notes: existing.notes ?? [],
      folders: existing.folders ?? [],
      templates: existing.templates ?? [],
      result,
    };
  }

  let runs = existing.runs ?? [];
  let notes = existing.notes ?? [];
  let folders = existing.folders ?? [];
  let templates = existing.templates ?? [];

  if (opts.includeRuns && pkg.data.runs?.length) {
    const [merged, imported, skipped] = mergeById(runs, pkg.data.runs, opts.strategy);
    runs = merged;
    result.imported.runs = imported;
    result.skipped.runs = skipped;
    result.totalRuns = runs.length;
  }

  if (opts.includeNotes && pkg.data.notes?.length) {
    const [merged, imported, skipped] = mergeById(
      notes,
      pkg.data.notes,
      opts.strategy,
      (n) => (n as { runId: string }).runId,
    );
    notes = merged;
    result.imported.notes = imported;
    result.skipped.notes = skipped;
    result.totalNotes = notes.length;
  }

  if (opts.includeFolders && pkg.data.folders?.length) {
    // Don't overwrite system folders in skip/merge mode
    if (opts.strategy === "overwrite") {
      const [merged, imported, skipped] = mergeById(folders, pkg.data.folders, "overwrite");
      folders = merged;
      result.imported.folders = imported;
      result.skipped.folders = skipped;
    } else {
      // Filter out system folders from incoming to protect them
      const nonSystem = pkg.data.folders.filter((f) => !(f as { isSystem?: boolean }).isSystem);
      const [merged, imported, skipped] = mergeById(folders, nonSystem, opts.strategy);
      folders = merged;
      result.imported.folders = imported;
      result.skipped.folders = skipped + (pkg.data.folders.length - nonSystem.length);
    }
    result.totalFolders = folders.length;
  }

  if (opts.includeTemplates && pkg.data.templates?.length) {
    const [merged, imported, skipped] = mergeById(templates, pkg.data.templates, opts.strategy);
    templates = merged;
    result.imported.templates = imported;
    result.skipped.templates = skipped;
    result.totalTemplates = templates.length;
  }

  return { runs, notes, folders, templates, result };
}

/** Estimate file size of a data package (rough, for UI display). */
export function estimatePackageSize(pkg: DataPackage): number {
  // Rough estimate: 2x the JSON string length in bytes
  return JSON.stringify(pkg).length;
}

/**
 * Generate a human-readable filename for the export.
 */
export function getExportFilename(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  return `launchlens-backup-${dateStr}.json`;
}
/**
 * Build a data package containing runs (and their notes) for a single folder.
 *
 * Pure function — does not read from or write to storage. Caller provides
 * the source collections (typically loaded from storage) and the target folder.
 * The folder itself is included so the import restores the folder structure.
 */
export function createFolderPackage(options: {
  folder: ResearchFolder;
  allRuns: ResearchRun[];
  allNotes?: ResearchNotes[];
  includeNotes?: boolean;
}): DataPackage {
  const { folder, allRuns, allNotes = [], includeNotes = true } = options;
  const runIds = new Set(folder.runIds);
  const runs = allRuns.filter((r) => runIds.has(r.id));

  const notes = includeNotes
    ? allNotes.filter((n) => runIds.has(n.runId))
    : [];

  return createDataPackage({
    runs,
    notes,
    folders: [folder],
  });
}

/**
 * Build a data package containing runs and notes for multiple folders.
 *
 * Deduplicates runs across folders (a run in two folders appears once in the
 * exported runs array, but both folder records preserve their runIds lists).
 * All referenced folders are included in the package so import reconstructs
 * the full folder structure.
 */
export function createFoldersBundle(options: {
  folderIds: string[];
  allFolders: ResearchFolder[];
  allRuns: ResearchRun[];
  allNotes?: ResearchNotes[];
  includeNotes?: boolean;
}): DataPackage {
  const { folderIds, allFolders, allRuns, allNotes = [], includeNotes = true } = options;

  const idSet = new Set(folderIds);
  const folders = allFolders.filter((f) => idSet.has(f.id));

  // Collect all unique run IDs referenced by any of the folders
  const runIds = new Set<string>();
  for (const f of folders) {
    for (const rid of f.runIds) {
      runIds.add(rid);
    }
  }

  const runs = allRuns.filter((r) => runIds.has(r.id));
  const notes = includeNotes
    ? allNotes.filter((n) => runIds.has(n.runId))
    : [];

  return createDataPackage({
    runs,
    notes,
    folders,
  });
}

/**
 * Generate a filename for a folder export.
 * Includes folder name (sanitized) and date.
 */
export function getFolderExportFilename(folderName: string): string {
  const sanitized = folderName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");

  const now = new Date();
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  return `launchlens-folder-${sanitized || "export"}-${dateStr}.json`;
}

/**
 * Generate a filename for a multi-folder bundle export.
 */
export function getFoldersBundleFilename(folderCount: number): string {
  const now = new Date();
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  return `launchlens-folders-${folderCount}-${dateStr}.json`;
}

/* ------------------------------------------------------------------ */
/*  Extended data-package utilities (round 149)                       */
/* ------------------------------------------------------------------ */

export interface PackageSummary {
  version: number;
  source: string;
  exportedAt: number;
  exportedAtIso: string;
  ageMs: number;
  counts: { runs: number; notes: number; folders: number; templates: number };
  totalItems: number;
  estimatedBytes: number;
}

export function summarizePackage(pkg: DataPackage, now: number = Date.now()): PackageSummary {
  const counts = {
    runs: pkg.data.runs?.length ?? 0,
    notes: pkg.data.notes?.length ?? 0,
    folders: pkg.data.folders?.length ?? 0,
    templates: pkg.data.templates?.length ?? 0,
  };
  return {
    version: pkg.version,
    source: pkg.source,
    exportedAt: pkg.exportedAt,
    exportedAtIso: new Date(pkg.exportedAt).toISOString(),
    ageMs: Math.max(0, now - pkg.exportedAt),
    counts,
    totalItems: counts.runs + counts.notes + counts.folders + counts.templates,
    estimatedBytes: estimatePackageSize(pkg),
  };
}

export interface CompatibilityCheck {
  compatible: boolean;
  warnings: string[];
  errors: string[];
}

/** Check whether a package can be safely imported into the current schema. */
export function checkPackageCompatibility(pkg: DataPackage): CompatibilityCheck {
  const errors = validateDataPackage(pkg);
  const warnings: string[] = [];
  if (pkg.version > DATA_PACKAGE_VERSION) {
    warnings.push("Package version is newer than current schema; unknown fields may be ignored.");
  }
  if (pkg.version < DATA_PACKAGE_VERSION) {
    warnings.push("Package version is older; forward-migration will be best-effort.");
  }
  if (pkg.source !== DATA_PACKAGE_SOURCE) {
    warnings.push("Package source differs from LaunchLens; import will be attempted anyway.");
  }
  return { compatible: errors.length === 0, warnings, errors };
}

/** Filter a package to only include the requested collection flags. */
export function filterPackage(
  pkg: DataPackage,
  opts: { runs?: boolean; notes?: boolean; folders?: boolean; templates?: boolean },
): DataPackage {
  return {
    version: pkg.version,
    source: pkg.source,
    exportedAt: pkg.exportedAt,
    data: {
      runs: opts.runs ? (pkg.data.runs ?? []) : [],
      notes: opts.notes ? (pkg.data.notes ?? []) : [],
      folders: opts.folders ? (pkg.data.folders ?? []) : [],
      templates: opts.templates ? (pkg.data.templates ?? []) : [],
    },
  };
}

/** Merge two packages (incoming applied on top of base using mergeById semantics). */
export function mergePackages(base: DataPackage, incoming: DataPackage, strategy: ImportMergeStrategy = "merge"): DataPackage {
  const merged = importDataPackage(base.data, incoming, { strategy });
  return {
    version: Math.max(base.version, incoming.version),
    source: DATA_PACKAGE_SOURCE,
    exportedAt: Math.max(base.exportedAt, incoming.exportedAt),
    data: { runs: merged.runs, notes: merged.notes, folders: merged.folders, templates: merged.templates },
  };
}

/** Filename for a single-template export. */
export function getTemplateExportFilename(templateName: string): string {
  const sanitized = templateName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  const now = new Date();
  const d = now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
  return "launchlens-template-" + (sanitized || "export") + "-" + d + ".json";
}

/** Format byte count in human-friendly KB/MB. */
export function formatBytes(n: number): string {
  if (n < 1024) return String(n) + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}

/** Produce a diff summary between two packages (adds per collection). */
export function diffPackages(a: DataPackage, b: DataPackage): {
  runs: { added: number; removed: number };
  notes: { added: number; removed: number };
  folders: { added: number; removed: number };
  templates: { added: number; removed: number };
} {
  const diffKey = (x: string[] | undefined, y: string[] | undefined) => {
    const xs = new Set(x ?? []);
    const ys = new Set(y ?? []);
    let added = 0, removed = 0;
    ys.forEach((k) => { if (!xs.has(k)) added++; });
    xs.forEach((k) => { if (!ys.has(k)) removed++; });
    return { added, removed };
  };
  const idsFor = (arr: Array<{ id?: string }> | undefined): string[] =>
    (arr ?? []).map((r) => r.id).filter((v): v is string => Boolean(v));
  const noteIds = (arr: Array<{ runId?: string }> | undefined): string[] =>
    (arr ?? []).map((r) => r.runId).filter((v): v is string => Boolean(v));
  return {
    runs: diffKey(idsFor(a.data.runs), idsFor(b.data.runs)),
    notes: diffKey(noteIds(a.data.notes), noteIds(b.data.notes)),
    folders: diffKey(idsFor(a.data.folders), idsFor(b.data.folders)),
    templates: diffKey(idsFor(a.data.templates), idsFor(b.data.templates)),
  };
}

/** Export a small CSV preview of runs in a package. */
export function packageRunsToCsv(pkg: DataPackage): string {
  const header = "id,query,provider,model,status,createdAt,durationMs";
  const lines: string[] = [header];
  (pkg.data.runs ?? []).forEach((r) => {
    lines.push([
      JSON.stringify(r.id),
      JSON.stringify(r.query),
      r.provider || "",
      r.model || "",
      r.status || "",
      String(r.createdAt ?? ""),
      String(r.durationMs ?? ""),
    ].join(","));
  });
  return lines.join("\n");
}

