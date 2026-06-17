/**
 * Smart research suggestions based on user history.
 *
 * Analyzes past research queries and keywords to generate
 * relevant follow-up research ideas.
 */

export interface ResearchSuggestion {
  title: string;
  description: string;
  keywords: string[];
  reason: string;
  category: "follow-up" | "related" | "deep-dive" | "trending";
}

interface HistoryRun {
  id: string;
  query: string;
  keywords: string[];
  createdAt: number;
}

// Follow-up question templates ? generated based on past topics
const followUpTemplates = [
  { template: "What are the latest developments in {topic}?", category: "follow-up" as const },
  { template: "How will {topic} evolve in the next 3-5 years?", category: "follow-up" as const },
  { template: "What are the biggest challenges facing {topic} today?", category: "follow-up" as const },
  { template: "Who are the key players and competitors in the {topic} space?", category: "related" as const },
  { template: "What is the market size and growth rate of {topic}?", category: "deep-dive" as const },
  { template: "What are the most promising use cases for {topic}?", category: "related" as const },
  { template: "How does {topic} compare to alternative approaches?", category: "related" as const },
  { template: "What regulatory or ethical considerations surround {topic}?", category: "deep-dive" as const },
];

// General trending/evergreen suggestions (fallback)
const trendingSuggestions: ResearchSuggestion[] = [
  {
    title: "AI Agent ??????",
    description: "Explore the current state of AI agents, frameworks, and real-world applications.",
    keywords: ["AI agents", "autonomous agents", "agent frameworks"],
    reason: "Trending topic in AI research",
    category: "trending",
  },
  {
    title: "Web3 ??????????",
    description: "Analyze the current state of dApps, DeFi, and blockchain technology adoption.",
    keywords: ["Web3", "dApps", "DeFi", "blockchain"],
    reason: "High-interest technology sector",
    category: "trending",
  },
  {
    title: "???????????????",
    description: "Research the lasting effects of remote work on productivity, culture, and real estate.",
    keywords: ["remote work", "productivity", "hybrid work"],
    reason: "Evergreen business topic",
    category: "trending",
  },
  {
    title: "???????????",
    description: "Explore emerging clean energy technologies and investment opportunities.",
    keywords: ["sustainable energy", "clean tech", "renewable energy"],
    reason: "Growing market sector",
    category: "trending",
  },
  {
    title: "SaaS ????????",
    description: "Analyze SaaS business models, unit economics, and growth strategies.",
    keywords: ["SaaS", "business model", "unit economics"],
    reason: "Popular business topic",
    category: "trending",
  },
  {
    title: "?????????",
    description: "Explore the current state of quantum computing and its commercial applications.",
    keywords: ["quantum computing", "quantum technology"],
    reason: "Emerging technology frontier",
    category: "trending",
  },
  {
    title: "??????????",
    description: "Review the latest cybersecurity threats, defenses, and market trends.",
    keywords: ["cybersecurity", "security", "threats"],
    reason: "Critical enterprise concern",
    category: "trending",
  },
  {
    title: "??????????",
    description: "Explore metaverse technologies, spatial computing, and virtual worlds.",
    keywords: ["metaverse", "spatial computing", "VR", "AR"],
    reason: "Next-gen computing platform",
    category: "trending",
  },
];

/**
 * Extract core topics from a history of research runs.
 * Returns ranked topics with frequency and recency scores.
 */
export function extractTopics(runs: HistoryRun[]): { topic: string; score: number; keywords: string[] }[] {
  if (!runs.length) return [];

  const now = Date.now();
  const topicMap = new Map<string, { score: number; keywords: Set<string>; count: number }>();

  for (const run of runs) {
    // Recency factor: newer runs have higher weight (half-life ~ 30 days)
    const ageDays = (now - run.createdAt) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.exp(-ageDays / 30);

    // Extract keywords as topics
    for (const kw of run.keywords) {
      const key = kw.toLowerCase().trim();
      if (key.length < 2) continue;

      if (!topicMap.has(key)) {
        topicMap.set(key, { score: 0, keywords: new Set(), count: 0 });
      }
      const entry = topicMap.get(key)!;
      entry.score += recencyWeight * 2;
      entry.count++;
      entry.keywords.add(kw);
    }

    // Extract significant words from query (3+ chars)
    const words = run.query
      .split(/[^a-zA-Z0-9一-龥]+/)
      .filter((w) => w.length >= 3)
      .slice(0, 5);

    for (const word of words) {
      const key = word.toLowerCase();
      if (!topicMap.has(key)) {
        topicMap.set(key, { score: 0, keywords: new Set(), count: 0 });
      }
      const entry = topicMap.get(key)!;
      entry.score += recencyWeight * 0.5;
      entry.count++;
    }
  }

  // Sort by score
  return Array.from(topicMap.entries())
    .map(([topic, data]) => ({
      topic,
      score: data.score,
      keywords: Array.from(data.keywords).slice(0, 5),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Generate research suggestions based on user history.
 *
 * @param runs User research history
 * @param count Number of suggestions to return
 */
export function generateSuggestions(runs: HistoryRun[], count = 4): ResearchSuggestion[] {
  const suggestions: ResearchSuggestion[] = [];

  // If no history, return trending suggestions
  if (!runs.length) {
    return trendingSuggestions.slice(0, count);
  }

  const topics = extractTopics(runs).slice(0, 8);

  if (topics.length === 0) {
    return trendingSuggestions.slice(0, count);
  }

  // Generate personalized suggestions from top topics
  const usedTemplates = new Set<string>();
  let tplIndex = 0;

  for (let i = 0; i < Math.min(topics.length, Math.ceil(count * 0.75)); i++) {
    const topic = topics[i];

    // Cycle through templates
    let tpl = followUpTemplates[tplIndex % followUpTemplates.length];
    let key = tpl.template + topic.topic;
    while (usedTemplates.has(key) && tplIndex < followUpTemplates.length * 2) {
      tplIndex++;
      tpl = followUpTemplates[tplIndex % followUpTemplates.length];
      key = tpl.template + topic.topic;
    }
    tplIndex++;
    usedTemplates.add(key);

    const title = tpl.template.replace("{topic}", topic.topic);
    const suggestion: ResearchSuggestion = {
      title,
      description: `???????${topic.topic}?????????????????`,
      keywords: topic.keywords.length > 0 ? topic.keywords : [topic.topic],
      reason: `???? ${topic.topic} ?????`,
      category: tpl.category,
    };
    suggestions.push(suggestion);
  }

  // Pad with trending suggestions if needed
  if (suggestions.length < count) {
    const needed = count - suggestions.length;
    suggestions.push(...trendingSuggestions.slice(0, needed));
  }

  return suggestions.slice(0, count);
}

/**
 * Group history runs by theme/topic clusters.
 * Simple keyword-based clustering.
 */
export function clusterHistoryByTopic(
  runs: HistoryRun[],
  maxClusters = 5
): { name: string; runIds: string[]; keywords: string[]; size: number }[] {
  const topics = extractTopics(runs).slice(0, maxClusters);
  const clusters: { name: string; runIds: string[]; keywords: string[]; size: number }[] = [];
  const assigned = new Set<string>();

  for (const topic of topics) {
    const clusterRuns = runs.filter((run) => {
      if (assigned.has(run.id)) return false;
      return run.keywords.some(
        (kw) => kw.toLowerCase() === topic.topic.toLowerCase()
      ) || run.query.toLowerCase().includes(topic.topic.toLowerCase());
    });

    if (clusterRuns.length > 0) {
      clusterRuns.forEach((r) => assigned.add(r.id));
      clusters.push({
        name: topic.topic,
        runIds: clusterRuns.map((r) => r.id),
        keywords: topic.keywords,
        size: clusterRuns.length,
      });
    }
  }

  // Add "Other" cluster for unassigned runs
  const unassigned = runs.filter((r) => !assigned.has(r.id));
  if (unassigned.length > 0) {
    clusters.push({
      name: "Other",
      runIds: unassigned.map((r) => r.id),
      keywords: [],
      size: unassigned.length,
    });
  }

  return clusters.sort((a, b) => b.size - a.size);
}

/**
 * Find research runs similar to a given run based on keyword overlap.
 * Returns runs sorted by Jaccard similarity (highest first).
 */
export function findRelatedRuns(
  targetRun: { id: string; keywords: string[]; query?: string },
  allRuns: Array<{ id: string; keywords: string[]; query: string }>,
  limit = 5,
): Array<{ run: { id: string; keywords: string[]; query: string }; similarity: number; sharedKeywords: string[] }> {
  const targetKeywords = new Set(targetRun.keywords.map((k) => k.toLowerCase()));
  if (targetKeywords.size === 0) return [];

  const results: Array<{ run: typeof allRuns[0]; similarity: number; sharedKeywords: string[] }> = [];

  for (const run of allRuns) {
    if (run.id === targetRun.id) continue;

    const runKeywords = new Set(run.keywords.map((k) => k.toLowerCase()));
    if (runKeywords.size === 0) continue;

    const shared = [...targetKeywords].filter((k) => runKeywords.has(k));
    const union = new Set([...targetKeywords, ...runKeywords]);
    const similarity = union.size === 0 ? 0 : shared.length / union.size;

    if (similarity > 0) {
      results.push({
        run,
        similarity,
        sharedKeywords: shared.slice(0, 3),
      });
    }
  }

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export default {
  extractTopics,
  generateSuggestions,
  clusterHistoryByTopic,
  findRelatedRuns,
};
