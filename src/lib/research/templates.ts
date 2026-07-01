/**
 * Research templates ? saved query configurations for reuse.
 * Stored in localStorage (browser) for persistence across sessions.
 */

export interface ResearchTemplate {
  id: string;
  name: string;
  description?: string;
  query: string;
  keywords: string[];
  agents?: string[];
  model?: string;
  category?: string;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
  useCount: number;
}

const STORAGE_KEY = "launchlens:templates";
const DEFAULT_CATEGORIES = [
  "Market Analysis",
  "Competitive Intel",
  "Product Strategy",
  "Growth & Marketing",
  "Startup & Investing",
  "Custom",
];

function readTemplates(): ResearchTemplate[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultTemplates();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return getDefaultTemplates();
    // Defensively drop entries that don't match the ResearchTemplate shape
    // before backfilling, so a single corrupt entry can't poison the rest
    // (e.g. by sneaking a non-number useCount into a Math.max downstream).
    const valid = parsed.filter(isValidTemplate);
    if (valid.length === 0) return getDefaultTemplates();
    return valid.map((t) => ({
      ...t,
      category: t.category || "Custom",
      isDefault: t.isDefault ?? false,
    }));
  } catch {
    return getDefaultTemplates();
  }
}

function isValidTemplate(v: unknown): v is ResearchTemplate {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  if (typeof t.id !== "string" || !t.id) return false;
  if (typeof t.name !== "string") return false;
  if (typeof t.query !== "string") return false;
  if (!Array.isArray(t.keywords) || !t.keywords.every((k) => typeof k === "string")) return false;
  if (typeof t.createdAt !== "number" || !Number.isFinite(t.createdAt)) return false;
  if (typeof t.updatedAt !== "number" || !Number.isFinite(t.updatedAt)) return false;
  if (typeof t.useCount !== "number" || !Number.isFinite(t.useCount)) return false;
  if (t.description !== undefined && typeof t.description !== "string") return false;
  if (t.category !== undefined && typeof t.category !== "string") return false;
  if (t.isDefault !== undefined && typeof t.isDefault !== "boolean") return false;
  if (t.agents !== undefined && (!Array.isArray(t.agents) || !t.agents.every((a) => typeof a === "string"))) return false;
  if (t.model !== undefined && typeof t.model !== "string") return false;
  return true;
}

function writeTemplates(templates: ResearchTemplate[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Storage full or disabled
  }
}

function getDefaultTemplates(): ResearchTemplate[] {
  const now = Date.now();
  return [
    {
      id: "tpl-market-entry",
      name: "Market Entry Analysis",
      description: "Quickly assess the feasibility of a new product or service entering a market.",
      query: "",
      keywords: ["market size", "competitive landscape", "entry barriers", "regulatory"],
      category: "Market Analysis",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-market-size",
      name: "Market Sizing & TAM",
      description: "Calculate total addressable market, serviceable market, and obtainable market.",
      query: "",
      keywords: ["TAM", "SAM", "SOM", "market size", "growth rate"],
      category: "Market Analysis",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-competitive-intel",
      name: "Deep Competitive Intelligence",
      description: "Comprehensive analysis of competitor strengths, weaknesses, and strategic moves.",
      query: "",
      keywords: ["competitors", "product comparison", "pricing", "user reviews", "market share"],
      category: "Competitive Intel",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-competitive-landscape",
      name: "Competitive Landscape Map",
      description: "Map the full competitive ecosystem including direct, indirect, and substitute players.",
      query: "",
      keywords: ["competitive landscape", "market players", "positioning", "disruption"],
      category: "Competitive Intel",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-product-market-fit",
      name: "Product-Market Fit Assessment",
      description: "Evaluate whether a product has achieved product-market fit and identify gaps.",
      query: "",
      keywords: ["product-market fit", "user satisfaction", "retention", "value proposition"],
      category: "Product Strategy",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-feature-prioritization",
      name: "Feature Prioritization Research",
      description: "Research-backed framework for deciding which features to build next.",
      query: "",
      keywords: ["feature prioritization", "user needs", "RICE", "opportunity scoring"],
      category: "Product Strategy",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-gtm-strategy",
      name: "Go-To-Market Strategy",
      description: "Plan go-to-market approach including channels, messaging, and customer acquisition.",
      query: "",
      keywords: ["go-to-market", "channels", "customer acquisition", "messaging", "ICP"],
      category: "Growth & Marketing",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-pricing-research",
      name: "Pricing Strategy Research",
      description: "Research competitive pricing, willingness to pay, and optimal price points.",
      query: "",
      keywords: ["pricing strategy", "competitive pricing", "willingness to pay", "price sensitivity"],
      category: "Growth & Marketing",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-startup-dd",
      name: "Startup Due Diligence",
      description: "Market-level due diligence on early-stage startup opportunities.",
      query: "",
      keywords: ["market opportunity", "growth trends", "team background", "funding", "traction"],
      category: "Startup & Investing",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-trend-spotter",
      name: "Trend Spotter",
      description: "Scan for emerging industry trends, signals, and opportunity patterns.",
      query: "",
      keywords: ["trends", "emerging", "signals", "industry shifts", "innovation"],
      category: "Market Analysis",
      isDefault: true,
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
  ];
}

/**
 * List all templates, optionally filtered.
 */
export function listTemplates(options?: {
  category?: string;
  search?: string;
}): ResearchTemplate[] {
  let templates = readTemplates();

  if (options?.category && options.category !== "All") {
    templates = templates.filter((t) => t.category === options.category);
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    templates = templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }

  // Sort: default first (by name), then custom (by useCount desc, then updatedAt desc)
  return templates.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isDefault) return a.name.localeCompare(b.name);
    if (b.useCount !== a.useCount) return b.useCount - a.useCount;
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * Get a single template by ID.
 */
export function getTemplate(id: string): ResearchTemplate | null {
  return readTemplates().find((t) => t.id === id) || null;
}

/**
 * Create a new custom template.
 */
export function createTemplate(
  template: Omit<ResearchTemplate, "id" | "createdAt" | "updatedAt" | "useCount" | "isDefault"> & {
    id?: string;
  }
): ResearchTemplate {
  const templates = readTemplates();
  const now = Date.now();
  const newTpl: ResearchTemplate = {
    id: template.id || "tpl-" + now.toString(36) + "-" + Math.random().toString(36).slice(2, 6),
    name: template.name,
    description: template.description || "",
    query: template.query || "",
    keywords: template.keywords || [],
    agents: template.agents,
    model: template.model,
    category: template.category || "Custom",
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  };

  templates.push(newTpl);
  writeTemplates(templates);
  return newTpl;
}

/**
 * Update an existing template.
 */
export function updateTemplate(
  id: string,
  updates: Partial<Omit<ResearchTemplate, "id" | "createdAt" | "isDefault">>
): ResearchTemplate | null {
  const templates = readTemplates();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const updated: ResearchTemplate = {
    ...templates[idx],
    ...updates,
    updatedAt: Date.now(),
  };

  templates[idx] = updated;
  writeTemplates(templates);
  return updated;
}

/**
 * Delete a template.
 */
export function deleteTemplate(id: string): boolean {
  const templates = readTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return false;
  writeTemplates(filtered);
  return true;
}

/**
 * Increment use count for a template.
 */
export function incrementTemplateUse(id: string): void {
  const templates = readTemplates();
  const tpl = templates.find((t) => t.id === id);
  if (tpl) {
    tpl.useCount += 1;
    tpl.updatedAt = Date.now();
    writeTemplates(templates);
  }
}

/**
 * Get all unique categories from templates.
 */
export function getTemplateCategories(): string[] {
  const templates = readTemplates();
  const cats = new Set<string>();
  templates.forEach((t) => {
    if (t.category) cats.add(t.category);
  });
  return DEFAULT_CATEGORIES.filter((c) => cats.has(c)).concat(
    Array.from(cats).filter((c) => !DEFAULT_CATEGORIES.includes(c))
  );
}

/**
 * Get default category list (for filter UI).
 */
export function getDefaultCategories(): string[] {
  return [...DEFAULT_CATEGORIES];
}

/**
 * Reset templates to defaults.
 */
export function resetTemplatesToDefault(): ResearchTemplate[] {
  const defaults = getDefaultTemplates();
  writeTemplates(defaults);
  return defaults;
}

/**
 * Bulk import templates (merges by name, skips duplicates).
 * Returns number of templates imported.
 */
export function bulkImportTemplates(
  imported: ResearchTemplate[],
  strategy: "merge" | "overwrite" | "skip" = "merge"
): number {
  const existing = readTemplates();
  const existingByName = new Map(existing.map((t) => [t.name.toLowerCase(), t]));

  let countImported = 0;

  for (const tpl of imported) {
    if (!tpl.name || !Array.isArray(tpl.keywords)) {
      continue;
    }

    const key = tpl.name.toLowerCase();

    if (existingByName.has(key)) {
      if (strategy === "skip") {
        continue;
      }
      if (strategy === "overwrite") {
        const existingTpl = existingByName.get(key)!;
        existingTpl.description = tpl.description || existingTpl.description;
        existingTpl.query = tpl.query || existingTpl.query;
        existingTpl.keywords = tpl.keywords;
        existingTpl.category = tpl.category || existingTpl.category;
        existingTpl.updatedAt = Date.now();
        countImported++;
        continue;
      }
      // merge: take newer fields
      const existingTpl = existingByName.get(key)!;
      if ((tpl.updatedAt || 0) > (existingTpl.updatedAt || 0)) {
        existingTpl.description = tpl.description || existingTpl.description;
        existingTpl.query = tpl.query || existingTpl.query;
        existingTpl.keywords = tpl.keywords;
        existingTpl.category = tpl.category || existingTpl.category;
        existingTpl.updatedAt = Date.now();
      }
      countImported++;
    } else {
      createTemplate({
        name: tpl.name,
        description: tpl.description,
        query: tpl.query,
        keywords: tpl.keywords,
        category: tpl.category,
        agents: tpl.agents,
        model: tpl.model,
      });
      countImported++;
    }
  }

  return countImported;
}

/**
 * Save a research run as a custom template.
 */
export function saveAsTemplate(
  name: string,
  query: string,
  keywords: string[],
  description?: string
): ResearchTemplate {
  return createTemplate({
    name: name || (query ? query.slice(0, 60) + (query.length > 60 ? "..." : "") : "Untitled template"),
    description: description || "Created from research run",
    query,
    keywords,
    category: "Custom",
  });
}


// ============================================================
// Template export / import
// ============================================================

export interface TemplateExportPackage {
  version: 1;
  exportedAt: number;
  source: string;
  templates: ResearchTemplate[];
}

const TEMPLATE_EXPORT_VERSION = 1;
const TEMPLATE_EXPORT_SOURCE = "launchlens-templates";

/**
 * Export templates as a JSON-serializable package.
 * By default exports only custom templates; set includeDefaults to true to include default ones.
 */
export function exportTemplates(options: {
  includeDefaults?: boolean;
  category?: string;
} = {}): TemplateExportPackage {
  const templates = readTemplates();
  let filtered = templates;

  if (!options.includeDefaults) {
    filtered = filtered.filter((t) => !t.isDefault);
  }

  if (options.category) {
    filtered = filtered.filter((t) => t.category === options.category);
  }

  // Strip internal ids so import creates fresh ones
  const cleaned = filtered.map((t) => ({
    ...t,
    id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    useCount: 0,
  }));

  return {
    version: TEMPLATE_EXPORT_VERSION,
    exportedAt: Date.now(),
    source: TEMPLATE_EXPORT_SOURCE,
    templates: cleaned as unknown as ResearchTemplate[],
  };
}

/**
 * Validate a template export package.
 * Returns list of error messages, empty if valid.
 */
export function validateTemplatePackage(pkg: unknown): string[] {
  const errors: string[] = [];

  if (!pkg || typeof pkg !== "object") {
    return ["Package is not an object"];
  }

  const p = pkg as Record<string, unknown>;

  if (p.source !== TEMPLATE_EXPORT_SOURCE) {
    errors.push("Unknown source: " + p.source);
  }
  if (typeof p.version !== "number" || p.version < 1) {
    errors.push("Invalid version: " + p.version);
  }
  if (!Array.isArray(p.templates)) {
    errors.push("templates is not an array");
    return errors;
  }

  const templates = p.templates as unknown[];
  for (let i = 0; i < templates.length; i++) {
    const t = templates[i] as Record<string, unknown>;
    if (!t.name || typeof t.name !== "string") {
      errors.push("templates[" + i + "]: missing name");
    }
    if (!Array.isArray(t.keywords)) {
      errors.push("templates[" + i + "]: keywords is not an array");
    }
  }

  return errors;
}

/**
 * Import templates from a package.
 * Returns count of imported templates.
 */
export function importTemplates(
  pkg: TemplateExportPackage,
  strategy: "merge" | "overwrite" | "skip" = "merge",
): number {
  const errors = validateTemplatePackage(pkg);
  if (errors.length > 0) return 0;

  return bulkImportTemplates(pkg.templates, strategy);
}

/**
 * Generate filename for template export.
 */
export function getTemplateExportFilename(): string {
  const now = new Date();
  const dateStr =
    now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  return "launchlens-templates-" + dateStr + ".json";
}

// ============================================================
// Template duplication
// ============================================================

/**
 * Duplicate a template with a new name.
 * Returns the new template.
 */
export function duplicateTemplate(id: string, newName?: string): ResearchTemplate | null {
  const original = getTemplate(id);
  if (!original) return null;

  const name = newName || original.name + " (Copy)";

  return createTemplate({
    name,
    description: original.description,
    query: original.query,
    keywords: [...original.keywords],
    category: original.category,
    agents: original.agents,
    model: original.model,
  });
}

// ============================================================
// Custom categories
// ============================================================

const CUSTOM_CATEGORIES_KEY = "launchlens:template-categories";

/**
 * Get all custom categories added by the user.
 */
export function getCustomCategories(): string[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c: unknown) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

function saveCustomCategories(categories: string[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // ignore
  }
}

/**
 * Add a custom category. Returns true if added (false if already exists).
 */
export function addCustomCategory(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const all = getAllCategories();
  if (all.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return false;

  const custom = getCustomCategories();
  custom.push(trimmed);
  saveCustomCategories(custom);
  return true;
}

/**
 * Remove a custom category. Templates in this category are moved to "Custom".
 * Returns true if removed.
 */
export function removeCustomCategory(name: string): boolean {
  const custom = getCustomCategories();
  const idx = custom.findIndex((c) => c === name);
  if (idx === -1) return false;

  custom.splice(idx, 1);
  saveCustomCategories(custom);

  // Move templates from this category to "Custom"
  const templates = readTemplates();
  let changed = false;
  for (const t of templates) {
    if (t.category === name && !t.isDefault) {
      t.category = "Custom";
      t.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) writeTemplates(templates);

  return true;
}

/**
 * Rename a custom category. All templates in the category get the new name.
 * Returns true if renamed.
 */
export function renameCustomCategory(oldName: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed || oldName === trimmed) return false;

  const custom = getCustomCategories();
  const idx = custom.findIndex((c) => c === oldName);
  if (idx === -1) return false;

  // Check for conflict
  const all = getAllCategories();
  if (all.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return false;

  custom[idx] = trimmed;
  saveCustomCategories(custom);

  // Update templates
  const templates = readTemplates();
  let changed = false;
  for (const t of templates) {
    if (t.category === oldName && !t.isDefault) {
      t.category = trimmed;
      t.updatedAt = Date.now();
      changed = true;
    }
  }
  if (changed) writeTemplates(templates);

  return true;
}

/**
 * Get all categories: default + custom, sorted.
 * Default categories in their original order, then custom alphabetically.
 */
export function getAllCategories(): string[] {
  const defaults = getDefaultCategories();
  const custom = getCustomCategories();
  // Filter out any custom categories that duplicate defaults
  const defaultSet = new Set(defaults.map((d) => d.toLowerCase()));
  const uniqueCustom = custom.filter((c) => !defaultSet.has(c.toLowerCase()));
  return [...defaults, ...uniqueCustom.sort()];
}

// ============================================================
// Template stats
// ============================================================

export interface TemplateStats {
  total: number;
  defaultCount: number;
  customCount: number;
  categories: number;
  totalUses: number;
  mostUsed: { name: string; useCount: number } | null;
}

/**
 * Get summary statistics about the template library.
 */
export function getTemplateStats(): TemplateStats {
  const templates = readTemplates();
  const defaults = templates.filter((t) => t.isDefault);
  const custom = templates.filter((t) => !t.isDefault);
  const totalUses = templates.reduce((sum, t) => sum + t.useCount, 0);

  let mostUsed: { name: string; useCount: number } | null = null;
  for (const t of templates) {
    if (!mostUsed || t.useCount > mostUsed.useCount) {
      mostUsed = { name: t.name, useCount: t.useCount };
    }
  }

  return {
    total: templates.length,
    defaultCount: defaults.length,
    customCount: custom.length,
    categories: getTemplateCategories().length,
    totalUses,
    mostUsed: mostUsed?.useCount ? mostUsed : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Extended template utilities (round 146)                            */
/* ------------------------------------------------------------------ */

export interface TemplateCoverage {
  templatesWithKeywords: number;
  templatesWithQuery: number;
  templatesWithDescription: number;
  averageKeywordsPerTemplate: number;
  unusedTemplates: number;
}

export function analyzeTemplateCoverage(templates: ResearchTemplate[]): TemplateCoverage {
  const total = templates.length;
  if (total === 0) {
    return { templatesWithKeywords: 0, templatesWithQuery: 0, templatesWithDescription: 0, averageKeywordsPerTemplate: 0, unusedTemplates: 0 };
  }
  let withKw = 0, withQuery = 0, withDesc = 0, totalKw = 0, unused = 0;
  templates.forEach(t => {
    if (t.keywords.length > 0) withKw++;
    if (t.query && t.query.trim()) withQuery++;
    if (t.description && t.description.trim()) withDesc++;
    totalKw += t.keywords.length;
    if (t.useCount === 0) unused++;
  });
  return {
    templatesWithKeywords: withKw,
    templatesWithQuery: withQuery,
    templatesWithDescription: withDesc,
    averageKeywordsPerTemplate: Math.round((totalKw / total) * 10) / 10,
    unusedTemplates: unused,
  };
}

export interface TagCloudItem { tag: string; count: number; }

export function buildKeywordCloud(templates: ResearchTemplate[], limit = 20): TagCloudItem[] {
  const counts = new Map<string, number>();
  templates.forEach(t => t.keywords.forEach(k => counts.set(k.toLowerCase(), (counts.get(k.toLowerCase()) || 0) + 1)));
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function templatesToMarkdown(templates: ResearchTemplate[]): string {
  const lines = ["# Research Templates", ""];
  templates.forEach(t => {
    lines.push("## " + t.name, "");
    if (t.description) lines.push("> " + t.description, "");
    lines.push("- **Category:** " + (t.category || "Custom"));
    lines.push("- **Used:** " + t.useCount + " times");
    if (t.keywords.length) lines.push("- **Keywords:** " + t.keywords.join(", "));
    if (t.query) lines.push("- **Query:** " + t.query);
    lines.push("");
  });
  return lines.join("\n");
}

export function applyTemplateFields(template: ResearchTemplate, overrides: { query?: string; extraKeywords?: string[] } = {}): { query: string; keywords: string[] } {
  const query = overrides.query ?? template.query;
  const extra = overrides.extraKeywords || [];
  const seen = new Set<string>();
  const keywords: string[] = [];
  template.keywords.forEach(k => {
    const kk = k.toLowerCase();
    if (!seen.has(kk)) { seen.add(kk); keywords.push(k); }
  });
  extra.forEach(k => {
    const kk = k.toLowerCase();
    if (!seen.has(kk)) { seen.add(kk); keywords.push(k); }
  });
  return { query, keywords };
}

export function findTemplatesMissingFields(templates: ResearchTemplate[]): Array<{ id: string; name: string; missing: string[] }> {
  return templates
    .map(t => {
      const missing: string[] = [];
      if (!t.description || !t.description.trim()) missing.push("description");
      if (!t.query || !t.query.trim()) missing.push("query");
      if (!t.keywords || t.keywords.length === 0) missing.push("keywords");
      return { id: t.id, name: t.name, missing };
    })
    .filter(x => x.missing.length > 0);
}

export function suggestKeywordsFromTemplates(templates: ResearchTemplate[], query: string, limit = 5): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = new Map<string, number>();
  templates.forEach(t => {
    const matchesQuery = t.query.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
    t.keywords.forEach(k => {
      const kk = k.toLowerCase();
      let score = scored.get(kk) || 0;
      if (matchesQuery) score += 2;
      if (kk.includes(q)) score += 1;
      scored.set(kk, score);
    });
  });
  return Array.from(scored.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}
