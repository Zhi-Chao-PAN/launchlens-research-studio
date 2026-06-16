// Deterministic, query-aware utilities for the mock provider.
// Lets outputs feel personalized to the query/keywords without giving up
// determinism (same query = same output every time, on purpose).

/**
 * Fast 32-bit FNV-1a hash. Returns an unsigned 32-bit integer.
 * Used to seed deterministic per-query variants.
 */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * Combine query and keywords into a single seed string.
 * Sorted keywords so permuting keywords (e.g. ["ai", "x"] vs ["x", "ai"])
 * does not change the output.
 */
export function buildSeed(query: string, keywords: string[] = []): string {
  const cleanedQuery = (query || "").trim().toLowerCase();
  const cleanedKeywords = [...keywords].map((k) => k.trim().toLowerCase()).filter(Boolean).sort();
  return [cleanedQuery, ...cleanedKeywords].join("|");
}

/**
 * Pick a stable variant from a list using a hash-derived index.
 * `offset` lets multiple picks from the same seed differ (use index 0, 1, 2...).
 */
export function pickVariant<T>(seed: string, items: readonly T[], offset: number = 0): T {
  if (items.length === 0) {
    throw new Error("pickVariant: items must not be empty");
  }
  const h = hash32(seed + ":" + offset);
  return items[h % items.length];
}

/**
 * Pick a stable numeric value in [min, max] from a hash-derived integer.
 * The value is deterministic for a given seed and offset.
 */
export function pickNumber(seed: string, min: number, max: number, offset: number = 0): number {
  if (max < min) throw new Error("pickNumber: max must be >= min");
  const range = max - min;
  if (range === 0) return min;
  const h = hash32(seed + ":n:" + offset);
  return min + (h % (range + 1));
}

/**
 * Pick a stable decimal in [min, max) with the given precision (decimals).
 */
export function pickDecimal(seed: string, min: number, max: number, decimals: number, offset: number = 0): number {
  const raw = pickNumber(seed, min * 10 ** decimals, max * 10 ** decimals, offset);
  return raw / 10 ** decimals;
}

/**
 * Pick `count` stable items from `items` without replacement, ordered
 * by a hash-derived permutation. Same seed always yields same selection.
 */
export function pickMany<T>(seed: string, items: readonly T[], count: number): T[] {
  if (count >= items.length) return [...items];
  const indexed = items.map((item, i) => ({ item, idx: i, h: hash32(seed + ":m:" + i) }));
  indexed.sort((a, b) => a.h - b.h);
  return indexed.slice(0, count).map((x) => x.item);
}

/**
 * Deterministic boolean from a seed — 50/50 weighted but stable per seed.
 */
export function pickBool(seed: string, offset: number = 0): boolean {
  return (hash32(seed + ":b:" + offset) & 1) === 0;
}
