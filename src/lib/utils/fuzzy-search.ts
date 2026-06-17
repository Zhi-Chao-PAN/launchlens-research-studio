/**
 * Fuzzy search and command scoring utilities.
 *
 * Scoring factors:
 * - Exact prefix match (highest)
 * - Substring match
 * - Subsequence (fuzzy) match
 * - Word boundary matches
 * - Keyword matches
 * - Category boost
 * - Usage frequency boost (from history)
 * - Recency boost (from history)
 */

export interface ScoredCommand {
  id: string;
  label: string;
  description?: string;
  keywords?: string[];
  category?: string;
  icon?: string;
  shortcut?: string;
  score: number;
  matchRanges?: { start: number; end: number }[];
}

export interface CommandHistoryEntry {
  id: string;
  count: number;
  lastUsed: number; // timestamp
}

const SCORE = {
  EXACT: 100,
  PREFIX: 80,
  WORD_START: 60,
  SUBSTRING: 40,
  SUBSEQUENCE: 20,
  KEYWORD: 50,
  DESCRIPTION_MATCH: 25,
  FREQUENCY_BASE: 5,
  RECENCY_BOOST: 15,
} as const;

/**
 * Check if query is a subsequence of text.
 * Returns indices of matched characters or null.
 */
export function subsequenceMatch(
  text: string,
  query: string
): { indices: number[]; score: number } | null {
  if (query.length > text.length) return null;
  if (query.length === 0) return { indices: [], score: 0 };

  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  let ti = 0;
  let qi = 0;
  const indices: number[] = [];

  while (qi < queryLower.length && ti < textLower.length) {
    if (textLower[ti] === queryLower[qi]) {
      indices.push(ti);
      qi++;
    }
    ti++;
  }

  if (qi < queryLower.length) return null;

  // Score based on how compact the match is
  const compactness = queryLower.length / (indices[indices.length - 1] - indices[0] + 1);
  const score = SCORE.SUBSEQUENCE * compactness;

  return { indices, score };
}

/**
 * Find word-start matches (match at start of words).
 * e.g., "kw" matches "KeyWord"
 */
/**
 * Check if query matches word starts OR is an initialism.
 * e.g., "export" matches "Export Markdown" (prefix)
 * e.g., "em" matches "Export Markdown" (initialism)
 * e.g., "hw" matches "HelloWorld" (camelCase initialism)
 */
export function wordStartMatch(text: string, query: string): boolean {
  if (query.length === 0) return false;
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Direct prefix
  if (textLower.startsWith(queryLower)) return true;

  // Find all word start positions (point to first letter of each word)
  const wordStarts: number[] = [0];
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1];
    const curr = text[i];
    let isStart = false;
    if (
      (prev === " " || prev === "-" || prev === "_" || prev === "/" || prev === ":") &&
      /[a-zA-Z]/.test(curr)
    ) {
      isStart = true;
    } else if (
      prev === prev.toLowerCase() &&
      prev !== prev.toUpperCase() && // prev is a letter
      curr === curr.toUpperCase() &&
      curr !== curr.toLowerCase() // curr is an uppercase letter
    ) {
      isStart = true;
    }
    if (isStart) {
      wordStarts.push(i);
    }
  }

  // Check single-word prefix match at any word start
  for (const start of wordStarts) {
    if (textLower.slice(start, start + queryLower.length) === queryLower) {
      return true;
    }
  }

  // Check initialism match (one char per word)
  if (query.length <= wordStarts.length && query.length > 1) {
    let matched = true;
    for (let i = 0; i < queryLower.length; i++) {
      if (textLower[wordStarts[i]] !== queryLower[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }

  return false;
}

/**
 * Score a single command against a query.
 */
export function scoreCommand(
  cmd: {
    id: string;
    label: string;
    description?: string;
    keywords?: string[];
    category?: string;
  },
  query: string,
  history?: CommandHistoryEntry
): number {
  if (!query.trim()) {
    // Empty query: boost by frequency + recency
    let score = 30; // base
    if (history) {
      score += Math.min(history.count * SCORE.FREQUENCY_BASE, 30);
      const hoursSince = (Date.now() - history.lastUsed) / (1000 * 60 * 60);
      if (hoursSince < 1) score += SCORE.RECENCY_BOOST;
      else if (hoursSince < 24) score += SCORE.RECENCY_BOOST * 0.5;
    }
    return score;
  }

  const q = query.toLowerCase().trim();
  const label = cmd.label.toLowerCase();
  let score = 0;

  // Exact match
  if (label === q) {
    score += SCORE.EXACT;
  }
  // Prefix match
  else if (label.startsWith(q)) {
    score += SCORE.PREFIX;
  }
  // Word-start match
  else if (wordStartMatch(cmd.label, query)) {
    score += SCORE.WORD_START;
  }
  // Substring match
  else if (label.includes(q)) {
    score += SCORE.SUBSTRING;
  }
  // Subsequence (fuzzy) match
  else {
    const sub = subsequenceMatch(cmd.label, query);
    if (sub) {
      score += sub.score;
    } else {
      // No match in label at all
      return 0;
    }
  }

  // Keyword bonus
  if (cmd.keywords) {
    for (const kw of cmd.keywords) {
      if (kw.toLowerCase().includes(q)) {
        score += SCORE.KEYWORD;
        break;
      }
    }
  }

  // Description bonus (weaker)
  if (cmd.description?.toLowerCase().includes(q)) {
    score += SCORE.DESCRIPTION_MATCH;
  }

  // History boost
  if (history) {
    score += Math.min(history.count * 2, 10);
    const hoursSince = (Date.now() - history.lastUsed) / (1000 * 60 * 60);
    if (hoursSince < 1) score += 8;
    else if (hoursSince < 24) score += 4;
  }

  // Length penalty: shorter label that matches is better
  score += Math.max(0, 20 - cmd.label.length) * 0.5;

  return Math.round(score);
}

/**
 * Filter and sort commands by relevance.
 */
export function rankCommands<T extends { id: string; label: string; description?: string; keywords?: string[]; category?: string }>(
  commands: T[],
  query: string,
  historyMap?: Map<string, CommandHistoryEntry>
): (T & { score: number })[] {
  const q = query.trim();

  const scored = commands
    .map((cmd) => {
      const history = historyMap?.get(cmd.id);
      const score = scoreCommand(cmd, q, history);
      return { ...cmd, score };
    })
    .filter((c) => c.score > 0);

  // Sort by score descending, then by label
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });

  return scored;
}

// ---- History Management ----

const HISTORY_KEY = "cmd_history";
const MAX_HISTORY = 50;

export function loadCommandHistory(): CommandHistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCommandHistory(history: CommandHistoryEntry[]): void {
  try {
    const sorted = [...history].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sorted));
  } catch {
    // ignore storage errors
  }
}

export function recordCommandUse(id: string): CommandHistoryEntry[] {
  const history = loadCommandHistory();
  const idx = history.findIndex((h) => h.id === id);
  const now = Date.now();

  if (idx >= 0) {
    history[idx].count++;
    history[idx].lastUsed = now;
  } else {
    history.push({ id, count: 1, lastUsed: now });
  }

  saveCommandHistory(history);
  return history;
}

export function historyToMap(history: CommandHistoryEntry[]): Map<string, CommandHistoryEntry> {
  return new Map(history.map((h) => [h.id, h]));
}
