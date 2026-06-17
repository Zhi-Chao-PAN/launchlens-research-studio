/**
 * Query autocomplete suggestions for the research input.
 *
 * Three layers of suggestions, blended by relevance:
 * 1. History prefix match — exact prefix match against past queries
 * 2. Fuzzy keyword match — partial keyword overlap with topic pool
 * 3. Templated completions — "how to X", "best X for Y" style sentence completions
 */

export interface AutocompleteItem {
  text: string;
  type: "history" | "keyword" | "template";
  score: number;
  keywords?: string[];
  hint?: string;
}

interface HistoryRun {
  id: string;
  query: string;
  keywords: string[];
  createdAt: number;
}

// Completion templates that fill in a keyword
const completionTemplates = [
  { prefix: "best ", suffix: " for startups", hint: "for startups" },
  { prefix: "how to build a ", suffix: "", hint: "guide" },
  { prefix: "how to launch a ", suffix: "", hint: "guide" },
  { prefix: "market size of ", suffix: "", hint: "market research" },
  { prefix: "competitors in ", suffix: "", hint: "competitive analysis" },
  { prefix: "trends in ", suffix: " 2026", hint: "trends" },
  { prefix: "challenges of ", suffix: "", hint: "challenges" },
  { prefix: "ai tools for ", suffix: "", hint: "AI tools" },
  { prefix: "pricing strategy for ", suffix: "", hint: "pricing" },
  { prefix: "business model for ", suffix: "", hint: "business model" },
];

// Seed keyword pool for cold-start (no history yet)
const seedKeywords = [
  "AI agents", "SaaS", "startups", "mobile apps", "ecommerce",
  "fintech", "healthtech", "edtech", "proptech", "climatetech",
  "B2B", "B2C", "marketplace", "subscription", "freemium",
  "productivity", "creator economy", "remote work", "cybersecurity",
  "generative AI", "LLMs", "machine learning", "data analytics",
  "developer tools", "API", "open source", "privacy", "sustainability",
];

const MIN_QUERY_LENGTH = 2;

/**
 * Extract all unique keywords from history runs, weighted by frequency and recency.
 */
function extractKeywordPool(runs: HistoryRun[]): Map<string, number> {
  const pool = new Map<string, number>();
  const now = Date.now();

  for (const run of runs) {
    const ageDays = (now - run.createdAt) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.exp(-ageDays / 30); // 30-day half-life

    for (const kw of run.keywords) {
      const key = kw.toLowerCase().trim();
      if (key.length < 2) continue;
      pool.set(key, (pool.get(key) || 0) + 1 + recencyWeight * 0.5);
    }
  }

  return pool;
}

/**
 * Score a prefix match. Exact prefix match = highest score.
 * Position and length of match affect the score.
 */
function prefixScore(query: string, candidate: string): number {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();

  if (c.startsWith(q)) {
    // Exact prefix — shorter candidate wins (closer to query length)
    return 1.0 + (q.length / Math.max(c.length, 1)) * 0.5;
  }

  const idx = c.indexOf(q);
  if (idx !== -1) {
    // Substring match — earlier is better
    return 0.7 - (idx / c.length) * 0.3;
  }

  // Word-level prefix match
  const words = c.split(/\s+/);
  const wordMatch = words.some((w) => w.startsWith(q));
  if (wordMatch) {
    return 0.5;
  }

  return 0;
}

/**
 * Generate autocomplete suggestions for a partial query.
 */
export function getAutocompleteSuggestions(
  query: string,
  history: HistoryRun[] = [],
  limit = 6,
): AutocompleteItem[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return [];

  const results: AutocompleteItem[] = [];
  const seenTexts = new Set<string>();

  // 1. History prefix matches (highest priority)
  const historyMatches = history
    .map((run) => {
      const score = prefixScore(trimmed, run.query);
      return { run, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.run.createdAt - a.run.createdAt)
    .slice(0, Math.ceil(limit * 0.5));

  for (const { run, score } of historyMatches) {
    const text = run.query;
    if (seenTexts.has(text.toLowerCase())) continue;
    seenTexts.add(text.toLowerCase());
    results.push({
      text,
      type: "history",
      score: score * 10,
      keywords: run.keywords,
      hint: "recent",
    });
  }

  // 2. Keyword pool matches
  const keywordPool = extractKeywordPool(history);
  const allKeywords = new Set([...seedKeywords, ...keywordPool.keys()]);
  const keywordMatches: { keyword: string; score: number; fromHistory: boolean }[] = [];

  for (const kw of allKeywords) {
    const score = prefixScore(trimmed, kw);
    if (score > 0) {
      const fromHistory = keywordPool.has(kw);
      const boosted = score * (fromHistory ? (keywordPool.get(kw) || 1) * 0.3 : 0.5);
      keywordMatches.push({ keyword: kw, score: boosted, fromHistory });
    }
  }

  keywordMatches.sort((a, b) => b.score - a.score);

  const keywordSlots = Math.ceil(limit * 0.4);
  for (const { keyword } of keywordMatches.slice(0, keywordSlots)) {
    if (seenTexts.has(keyword.toLowerCase())) continue;
    seenTexts.add(keyword.toLowerCase());
    results.push({
      text: keyword,
      type: "keyword",
      score: keywordMatches.find((k) => k.keyword === keyword)?.score || 0,
      keywords: [keyword],
      hint: "keyword",
    });
  }

  // 3. Template completions using the last word
  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1]?.toLowerCase() || "";

  if (lastWord.length >= 2 && words.length <= 4) {
    for (const tpl of completionTemplates) {
      // Try matching the last word against template prefixes and keyword pool
      for (const kwMatch of keywordMatches.slice(0, 5)) {
        if (results.length >= limit) break;

        // Build completion: last word becomes keyword, template wraps it
        const completed = `${tpl.prefix}${kwMatch.keyword}${tpl.suffix}`.trim();
        if (seenTexts.has(completed.toLowerCase())) continue;
        if (completed.toLowerCase().includes(trimmed.toLowerCase())) {
          seenTexts.add(completed.toLowerCase());
          results.push({
            text: completed,
            type: "template",
            score: 0.3 + kwMatch.score * 0.1,
            keywords: [kwMatch.keyword],
            hint: tpl.hint,
          });
        }
      }
      if (results.length >= limit) break;
    }
  }

  // Sort by final score and cap
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Get search suggestions for an empty query.
 * Shows trending/seed keywords and recent history.
 */
export function getEmptyQuerySuggestions(
  history: HistoryRun[] = [],
  limit = 6,
): AutocompleteItem[] {
  const results: AutocompleteItem[] = [];

  // Recent queries
  const recent = [...history]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.ceil(limit * 0.5));

  for (const run of recent) {
    results.push({
      text: run.query,
      type: "history",
      score: 10,
      keywords: run.keywords,
      hint: "recent",
    });
  }

  // Fill remaining with seed keywords
  const remaining = limit - results.length;
  if (remaining > 0) {
    // Pick a varied subset
    const picks = seedKeywords.slice(0, remaining * 2).filter(
      (_, i) => i % 2 === 0
    ).slice(0, remaining);

    for (const kw of picks) {
      results.push({
        text: kw,
        type: "keyword",
        score: 1,
        keywords: [kw],
        hint: "trending",
      });
    }
  }

  return results;
}

export default {
  getAutocompleteSuggestions,
  getEmptyQuerySuggestions,
};
