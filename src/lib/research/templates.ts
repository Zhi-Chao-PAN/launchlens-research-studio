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
    // Backfill category for old templates
    return parsed.map((t) => ({
      ...t,
      category: t.category || "Custom",
      isDefault: t.isDefault ?? false,
    }));
  } catch {
    return getDefaultTemplates();
  }
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
