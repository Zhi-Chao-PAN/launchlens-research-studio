import { describe, beforeEach, it, expect } from "vitest";

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
    // But default templates also exist — find our created ones
    const userTemplates = list.filter((t) => t.id === a.id || t.id === b.id);
    expect(userTemplates.length).toBe(2);
    expect(userTemplates[0].id).toBe(a.id); // A updated most recently
    expect(userTemplates[1].id).toBe(b.id); // B is older
  });
});
