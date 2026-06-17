/**
 * Research templates — saved query configurations for reuse.
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
  createdAt: number;
  updatedAt: number;
  useCount: number;
}

const STORAGE_KEY = "launchlens:templates";

function readTemplates(): ResearchTemplate[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultTemplates();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return getDefaultTemplates();
    return parsed;
  } catch {
    return [];
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
      name: "市场进入分析",
      description: "快速评估一个新产品或服务进入市场的可行性",
      query: "",
      keywords: ["市场规模", "竞争格局", "进入壁垒"],
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-competitive-intel",
      name: "竞品深度侦察",
      description: "全面分析竞争对手的优劣势和战略动向",
      query: "",
      keywords: ["竞争对手", "产品对比", "定价策略", "用户评价"],
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-startup-due-diligence",
      name: "创业项目尽调",
      description: "对早期创业项目进行市场层面的尽职调查",
      query: "",
      keywords: ["市场空间", "增长趋势", "团队背景", "融资情况"],
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
    {
      id: "tpl-trend-spotter",
      name: "趋势雷达",
      description: "扫描行业前沿动态和新兴机会信号",
      query: "",
      keywords: ["新兴趋势", "技术动向", "投资热点"],
      createdAt: now,
      updatedAt: now,
      useCount: 0,
    },
  ];
}

export function listTemplates(): ResearchTemplate[] {
  return readTemplates().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getTemplate(id: string): ResearchTemplate | null {
  const templates = readTemplates();
  return templates.find((t) => t.id === id) || null;
}

export function createTemplate(
  data: Omit<ResearchTemplate, "id" | "createdAt" | "updatedAt" | "useCount">,
): ResearchTemplate {
  const templates = readTemplates();
  const now = Date.now();
  const template: ResearchTemplate = {
    ...data,
    id: "tpl-" + Math.random().toString(36).slice(2, 10),
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  };
  templates.push(template);
  writeTemplates(templates);
  return template;
}

export function updateTemplate(
  id: string,
  updates: Partial<Omit<ResearchTemplate, "id" | "createdAt">>,
): ResearchTemplate | null {
  const templates = readTemplates();
  const idx = templates.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  templates[idx] = {
    ...templates[idx],
    ...updates,
    updatedAt: Date.now(),
  };
  writeTemplates(templates);
  return templates[idx];
}

export function deleteTemplate(id: string): boolean {
  const templates = readTemplates();
  const filtered = templates.filter((t) => t.id !== id);
  if (filtered.length === templates.length) return false;
  writeTemplates(filtered);
  return true;
}

export function incrementTemplateUse(id: string): void {
  const templates = readTemplates();
  const t = templates.find((t) => t.id === id);
  if (t) {
    t.useCount++;
    t.updatedAt = Date.now();
    writeTemplates(templates);
  }
}

export function saveAsTemplate(
  name: string,
  query: string,
  keywords: string[],
  description?: string,
): ResearchTemplate {
  return createTemplate({
    name,
    description,
    query,
    keywords,
  });
}

/**
 * Bulk import templates.
 * Returns count of imported templates.
 */
export function bulkImportTemplates(
  templates: ResearchTemplate[],
  strategy: "merge" | "overwrite" | "skip" = "merge",
): number {
  const existing = readTemplates();
  if (strategy === "overwrite") {
    writeTemplates(templates);
    return templates.length;
  }
  if (strategy === "skip") {
    const existingIds = new Set(existing.map((t) => t.id));
    const newOnes = templates.filter((t) => !existingIds.has(t.id));
    writeTemplates([...existing, ...newOnes]);
    return newOnes.length;
  }
  const byId = new Map(existing.map((t) => [t.id, t]));
  let imported = 0;
  for (const t of templates) {
    if (!t?.id) continue;
    if (!byId.has(t.id)) {
      byId.set(t.id, t);
      imported++;
    } else {
      const ex = byId.get(t.id)!;
      const exTime = ex.updatedAt ?? ex.createdAt ?? 0;
      const inTime = t.updatedAt ?? t.createdAt ?? 0;
      if (inTime > exTime) {
        byId.set(t.id, t);
        imported++;
      }
    }
  }
  writeTemplates(Array.from(byId.values()));
  return imported;
}
