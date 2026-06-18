/// <reference types="vitest/globals" />
﻿import { describe, beforeEach, it, expect } from "vitest";

// Mock localStorage before importing
const mockStorage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage.get(key) ?? null,
    setItem: (key: string, value: string) => mockStorage.set(key, value),
    removeItem: (key: string) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
    get length() { return mockStorage.size; },
    key: (index: number) => Array.from(mockStorage.keys())[index] ?? null,
  },
  writable: true,
  configurable: true,
});

import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  incrementTemplateUse,
  saveAsTemplate,
  exportTemplates,
  validateTemplatePackage,
  importTemplates,
  getTemplateExportFilename,
  duplicateTemplate,
  addCustomCategory,
  removeCustomCategory,
  renameCustomCategory,
  getAllCategories,
  getTemplateStats,
} from "@/lib/research/templates";

describe("research templates", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("returns default templates when storage is empty", () => {
    const templates = listTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(3);
    expect(templates[0].name).toBeTruthy();
    expect(templates[0].id).toMatch(/^tpl-/);
  });

  it("creates a new template", () => {
    const tpl = createTemplate({
      name: "My Template",
      description: "Test template",
      query: "test query",
      keywords: ["kw1", "kw2"],
    });
    expect(tpl.id).toMatch(/^tpl-/);
    expect(tpl.name).toBe("My Template");
    expect(tpl.keywords).toEqual(["kw1", "kw2"]);
    expect(tpl.useCount).toBe(0);
    expect(tpl.createdAt).toBeGreaterThan(0);
  });

  it("persists templates across reads", () => {
    const tpl = createTemplate({ name: "Persist", query: "p", keywords: [] });
    // Fresh read from storage
    const found = getTemplate(tpl.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Persist");
  });

  it("returns null for non-existent template", () => {
    expect(getTemplate("nope")).toBeNull();
  });

  it("updates a template and persists changes", async () => {
    const created = createTemplate({
      name: "Original",
      query: "q1",
      keywords: ["k1"],
    });
    
    // Wait a tick to ensure updatedAt > createdAt
    await new Promise((r) => setTimeout(r, 2));
    
    const updated = updateTemplate(created.id, { name: "Updated", query: "q2" });
    expect(updated).not.toBeNull();
    expect(updated?.name).toBe("Updated");
    expect(updated?.query).toBe("q2");
    expect(updated?.updatedAt).toBeGreaterThan(updated?.createdAt ?? 0);

    const reloaded = getTemplate(created.id);
    expect(reloaded?.name).toBe("Updated");
    expect(reloaded?.query).toBe("q2");
  });

  it("returns null when updating non-existent template", () => {
    expect(updateTemplate("nope", { name: "x" })).toBeNull();
  });

  it("deletes a template", () => {
    const tpl = createTemplate({ name: "Delete Me", query: "d", keywords: [] });
    expect(deleteTemplate(tpl.id)).toBe(true);
    expect(getTemplate(tpl.id)).toBeNull();
  });

  it("returns false when deleting non-existent template", () => {
    expect(deleteTemplate("nope")).toBe(false);
  });

  it("increments use count", () => {
    const tpl = createTemplate({ name: "Use Me", query: "u", keywords: [] });
    incrementTemplateUse(tpl.id);
    incrementTemplateUse(tpl.id);
    const reloaded = getTemplate(tpl.id);
    expect(reloaded?.useCount).toBe(2);
  });

  it("saves current research as template", () => {
    const tpl = saveAsTemplate(
      "Saved Research",
      "my query",
      ["kw1", "kw2", "kw3"],
      "My custom research",
    );
    expect(tpl.name).toBe("Saved Research");
    expect(tpl.query).toBe("my query");
    expect(tpl.keywords.length).toBe(3);
  });

  it("lists templates sorted by updatedAt (most recent first)", async () => {
    // Use templates we create to avoid default template timestamp collisions
    const a = createTemplate({ name: "A", query: "", keywords: [] });
    
    await new Promise((r) => setTimeout(r, 5));
    const b = createTemplate({ name: "B", query: "", keywords: [] });
    
    await new Promise((r) => setTimeout(r, 5));
    updateTemplate(a.id, { name: "A Updated" });

    const list = listTemplates();
    // A should be first because it was updated most recently
    // But default templates also exist 鈥?find our created ones
    const userTemplates = list.filter((t) => t.id === a.id || t.id === b.id);
    expect(userTemplates.length).toBe(2);
    expect(userTemplates[0].id).toBe(a.id); // A updated most recently
    expect(userTemplates[1].id).toBe(b.id); // B is older
  });
});


describe("template export / import", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("exports custom templates as a valid package", () => {
    createTemplate({ name: "My Template", query: "q", keywords: ["a", "b"] });
    const pkg = exportTemplates();

    expect(pkg.version).toBe(1);
    expect(pkg.source).toBe("launchlens-templates");
    expect(typeof pkg.exportedAt).toBe("number");
    expect(pkg.templates.length).toBeGreaterThanOrEqual(1);
    expect(pkg.templates[0].name).toBe("My Template");
  });

  it("excludes default templates by default", () => {
    const pkg = exportTemplates();
    const defaultNames = pkg.templates.filter((t) => t.isDefault);
    expect(defaultNames.length).toBe(0);
  });

  it("includes defaults when requested", () => {
    const pkg = exportTemplates({ includeDefaults: true });
    expect(pkg.templates.length).toBeGreaterThanOrEqual(10);
  });

  it("filters by category", () => {
    const pkg = exportTemplates({ includeDefaults: true, category: "Market Analysis" });
    expect(pkg.templates.length).toBeGreaterThan(1);
    expect(pkg.templates.every((t) => t.category === "Market Analysis")).toBe(true);
  });

  it("strips internal IDs from exported templates", () => {
    createTemplate({ name: "Strip Test", query: "q", keywords: ["x"] });
    const pkg = exportTemplates();
    const custom = pkg.templates.find((t) => t.name === "Strip Test")!;
    expect(custom.id).toBeUndefined();
    expect(custom.useCount).toBe(0);
  });

  it("validates a valid package", () => {
    const pkg = exportTemplates();
    const errors = validateTemplatePackage(pkg);
    expect(errors.length).toBe(0);
  });

  it("rejects invalid package", () => {
    expect(validateTemplatePackage(null).length).toBeGreaterThan(0);
    expect(validateTemplatePackage({}).length).toBeGreaterThan(0);
    expect(validateTemplatePackage({ version: 1, source: "x", templates: "not-array" } as any).length).toBeGreaterThan(0);
  });

  it("rejects templates without name", () => {
    const badPkg = {
      version: 1,
      source: "launchlens-templates",
      exportedAt: Date.now(),
      templates: [{ keywords: [] }],
    };
    const errors = validateTemplatePackage(badPkg);
    expect(errors.some((e) => e.includes("missing name"))).toBe(true);
  });

  it("imports templates from a package", () => {
    const pkg: any = {
      version: 1,
      source: "launchlens-templates",
      exportedAt: Date.now(),
      templates: [
        { name: "Imported 1", query: "q", keywords: ["k1"] },
        { name: "Imported 2", query: "q", keywords: ["k2"], category: "Growth & Marketing" },
      ],
    };
    const count = importTemplates(pkg);
    expect(count).toBe(2);

    const imported = listTemplates().filter((t) => t.name.startsWith("Imported"));
    expect(imported.length).toBe(2);
  });

  it("import returns 0 for invalid package", () => {
    const count = importTemplates({ version: 0, source: "x", exportedAt: 0, templates: [] } as any);
    expect(count).toBe(0);
  });

  it("generates a proper export filename", () => {
    const name = getTemplateExportFilename();
    expect(name).toMatch(/^launchlens-templates-\d{8}\.json$/);
  });
});

describe("template duplication", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("duplicates a template with (Copy) suffix", () => {
    const original = createTemplate({
      name: "Original Template",
      keywords: ["a", "b"],
      description: "Test description",
      category: "Custom",
    });

    const dup = duplicateTemplate(original.id);
    expect(dup).not.toBeNull();
    expect(dup!.name).toBe("Original Template (Copy)");
    expect(dup!.id).not.toBe(original.id);
    expect(dup!.keywords).toEqual(original.keywords);
    expect(dup!.description).toBe(original.description);
    expect(dup!.category).toBe(original.category);
    expect(dup!.useCount).toBe(0);
  });

  it("duplicates with custom name", () => {
    const original = createTemplate({ name: "Orig", query: "q", keywords: ["x"] });
    const dup = duplicateTemplate(original.id, "My Custom Name");
    expect(dup!.name).toBe("My Custom Name");
  });

  it("returns null for non-existent template", () => {
    expect(duplicateTemplate("nonexistent")).toBeNull();
  });
});

describe("custom categories", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("adds a custom category", () => {
    const added = addCustomCategory("My Category");
    expect(added).toBe(true);
    const all = getAllCategories();
    expect(all).toContain("My Category");
  });

  it("rejects duplicate categories (case-insensitive)", () => {
    addCustomCategory("Unique");
    expect(addCustomCategory("unique")).toBe(false);
  });

  it("rejects empty category name", () => {
    expect(addCustomCategory("")).toBe(false);
    expect(addCustomCategory("   ")).toBe(false);
  });

  it("removes a custom category and moves templates to Custom", () => {
    addCustomCategory("To Delete");
    createTemplate({ name: "T1", query: "q", keywords: [], category: "To Delete" });

    const removed = removeCustomCategory("To Delete");
    expect(removed).toBe(true);

    const tpl = getTemplate(listTemplates().find((t) => t.name === "T1")!.id)!;
    expect(tpl.category).toBe("Custom");
  });

  it("returns false when removing non-existent category", () => {
    expect(removeCustomCategory("Nope")).toBe(false);
  });

  it("renames a custom category", () => {
    addCustomCategory("Old Name");
    createTemplate({ name: "T1", query: "q", keywords: [], category: "Old Name" });

    const result = renameCustomCategory("Old Name", "New Name");
    expect(result).toBe(true);

    const all = getAllCategories();
    expect(all).toContain("New Name");
    expect(all).not.toContain("Old Name");

    const tpl = getTemplate(listTemplates().find((t) => t.name === "T1")!.id)!;
    expect(tpl.category).toBe("New Name");
  });

  it("returns false when renaming to conflicting name", () => {
    addCustomCategory("Cat A");
    addCustomCategory("Cat B");
    expect(renameCustomCategory("Cat A", "Cat B")).toBe(false);
  });

  it("getAllCategories includes defaults + custom", () => {
    addCustomCategory("ZZZ Custom");
    addCustomCategory("AAA Custom");

    const all = getAllCategories();
    // Defaults first in their order, then custom alphabetically
    const idxAAA = all.indexOf("AAA Custom");
    const idxZZZ = all.indexOf("ZZZ Custom");
    const idxMarket = all.indexOf("Market Analysis");

    expect(idxAAA).toBeLessThan(idxZZZ);
    expect(idxMarket).toBeLessThan(idxAAA);
  });
});

describe("template stats", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("returns stats for default templates", () => {
    const stats = getTemplateStats();
    expect(stats.total).toBeGreaterThanOrEqual(10);
    expect(stats.defaultCount).toBeGreaterThanOrEqual(10);
    expect(stats.customCount).toBe(0);
    expect(stats.categories).toBeGreaterThan(3);
    expect(stats.totalUses).toBe(0);
    expect(stats.mostUsed).toBeNull();
  });

  it("tracks custom templates and use counts", () => {
    const t1 = createTemplate({ name: "Custom 1", query: "q", keywords: [] });
    const t2 = createTemplate({ name: "Custom 2", query: "q", keywords: [] });

    incrementTemplateUse(t1.id);
    incrementTemplateUse(t1.id);
    incrementTemplateUse(t2.id);

    const stats = getTemplateStats();
    expect(stats.customCount).toBe(2);
    expect(stats.totalUses).toBe(3);
    expect(stats.mostUsed).not.toBeNull();
    expect(stats.mostUsed!.name).toBe("Custom 1");
    expect(stats.mostUsed!.useCount).toBe(2);
  });
});
import {
  analyzeTemplateCoverage,
  buildKeywordCloud,
  templatesToMarkdown,
  applyTemplateFields,
  findTemplatesMissingFields,
  suggestKeywordsFromTemplates,
} from "./templates";
import type { ResearchTemplate } from "./templates";

function mkT(id: string, overrides: Partial<ResearchTemplate> = {}): ResearchTemplate {
  return {
    id, name: "T " + id, description: "d", query: "q", keywords: ["a", "b"],
    category: "Custom", isDefault: false, createdAt: 0, updatedAt: 0, useCount: 1, ...overrides,
  };
}

describe("extended template utilities (round 146)", () => {
  it("analyzeTemplateCoverage computes ratios", () => {
    const c = analyzeTemplateCoverage([mkT("a"), mkT("b", { description: "", query: "", keywords: [], useCount: 0 })]);
    expect(c.templatesWithKeywords).toBe(1);
    expect(c.templatesWithQuery).toBe(1);
    expect(c.unusedTemplates).toBe(1);
  });
  it("analyzeTemplateCoverage returns zeros for empty", () => {
    expect(analyzeTemplateCoverage([]).templatesWithKeywords).toBe(0);
  });
  it("buildKeywordCloud counts case-insensitively", () => {
    const cloud = buildKeywordCloud([mkT("a", { keywords: ["AI", "ml"] }), mkT("b", { keywords: ["ai", "saas"] })]);
    expect(cloud[0].tag).toBe("ai");
    expect(cloud[0].count).toBe(2);
  });
  it("templatesToMarkdown emits heading per template", () => {
    const md = templatesToMarkdown([mkT("a", { name: "Alpha" })]);
    expect(md).toContain("# Research Templates");
    expect(md).toContain("## Alpha");
  });
  it("applyTemplateFields dedupes and adds extras", () => {
    const r = applyTemplateFields(mkT("a", { keywords: ["A", "a", "B"] }), { extraKeywords: ["B", "C"] });
    expect(r.keywords).toEqual(["A", "B", "C"]);
  });
  it("applyTemplateFields overrides query", () => {
    expect(applyTemplateFields(mkT("a"), { query: "new" }).query).toBe("new");
  });
  it("findTemplatesMissingFields reports blanks", () => {
    const miss = findTemplatesMissingFields([mkT("a", { description: "", keywords: [] })]);
    expect(miss).toHaveLength(1);
    expect(miss[0].missing).toContain("description");
    expect(miss[0].missing).toContain("keywords");
  });
  it("suggestKeywordsFromTemplates suggests from matches", () => {
    const ts = [mkT("a", { name: "AI Market", query: "AI trends", keywords: ["AI", "ML"] }), mkT("b", { name: "Growth", query: "SaaS growth", keywords: ["saas"] })];
    const sug = suggestKeywordsFromTemplates(ts, "AI", 3);
    expect(sug).toContain("ai");
    expect(sug).toContain("ml");
  });
  it("suggestKeywordsFromTemplates empty for empty query", () => {
    expect(suggestKeywordsFromTemplates([mkT("a")], "")).toEqual([]);
  });
});
