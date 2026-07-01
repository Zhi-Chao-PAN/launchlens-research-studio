/**
 * Research result diff tool -compares two synthesis outputs.
 * Finds added/removed insights, opportunities, risks, and score changes.
 */

import { type SynthesisOutput } from "./synthesis-parser";

export interface DiffChange {
  type: "added" | "removed" | "modified";
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  similarity?: number; // 0-1, for modified items
}

export interface ResearchDiff {
  scoreChanges: {
    opportunityScore: number; // delta
    riskScore: number; // delta
  };
  insights: {
    added: string[];
    removed: string[];
    modified: Array<{ old: string; new: string; similarity: number }>;
  };
  opportunities: {
    added: Array<{ title: string; description: string }>;
    removed: Array<{ title: string; description: string }>;
    modified: Array<{ old: { title: string; description: string }; new: { title: string; description: string } }>;
  };
  risks: {
    added: Array<{ title: string; description: string }>;
    removed: Array<{ title: string; description: string }>;
    modified: Array<{ old: { title: string; description: string }; new: { title: string; description: string } }>;
  };
  nextStepChanged: boolean;
  oldNextStep?: string;
  newNextStep?: string;
  summary: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
  };
}

// Simple similarity score (0-1) based on character n-grams
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  
  const n = 2; // bigrams
  const setA = new Set<string>();
  const setB = new Set<string>();
  
  for (let i = 0; i <= a.length - n; i++) {
    setA.add(a.substring(i, i + n));
  }
  for (let i = 0; i <= b.length - n; i++) {
    setB.add(b.substring(i, i + n));
  }
  
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Find best match for an item in a list, returns [index, similarity]
function findBestMatch<T>(
  item: T,
  getItemText: (item: T) => string,
  list: T[],
): { index: number; similarity: number } {
  const itemText = getItemText(item);
  let best = -1;
  let bestSim = 0;
  
  for (let i = 0; i < list.length; i++) {
    const sim = similarity(itemText, getItemText(list[i]));
    if (sim > bestSim) {
      bestSim = sim;
      best = i;
    }
  }
  
  return { index: best, similarity: bestSim };
}

// Compare two lists and categorize items as added/removed/modified
function compareStringLists(
  oldList: string[],
  newList: string[],
  threshold = 0.3,
): {
  added: string[];
  removed: string[];
  modified: Array<{ old: string; new: string; similarity: number }>;
} {
  // Delegate to the generic list comparator with an identity extractor so
  // the two paths stay in lockstep. If compareLists ever grows new
  // behaviour (e.g. weighted similarity, hooks), the string variant
  // picks it up automatically instead of silently diverging.
  const result = compareLists<string>(oldList, newList, (s) => s, threshold);
  return {
    added: result.added,
    removed: result.removed,
    modified: result.modified.map((m) => ({
      old: m.old,
      new: m.new,
      similarity: m.similarity,
    })),
  };
}

function compareLists<T>(
  oldList: T[],
  newList: T[],
  getText: (item: T) => string,
  threshold = 0.3,
): {
  added: T[];
  removed: T[];
  modified: Array<{ old: T; new: T; similarity: number }>;
} {
  const added: T[] = [];
  const removed: T[] = [];
  const modified: Array<{ old: T; new: T; similarity: number }> = [];
  
  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  
  // First pass: find matches
  for (let i = 0; i < oldList.length; i++) {
    const match = findBestMatch(oldList[i], getText, newList);
    if (match.index >= 0 && match.similarity >= threshold && !usedNew.has(match.index)) {
      usedOld.add(i);
      usedNew.add(match.index);
      
      // Check if modified (not identical)
      if (match.similarity < 0.95) {
        modified.push({
          old: oldList[i],
          new: newList[match.index],
          similarity: match.similarity,
        });
      }
    }
  }
  
  // Second pass: collect removed (from old, not matched)
  for (let i = 0; i < oldList.length; i++) {
    if (!usedOld.has(i)) {
      removed.push(oldList[i]);
    }
  }
  
  // Third pass: collect added (from new, not matched)
  for (let i = 0; i < newList.length; i++) {
    if (!usedNew.has(i)) {
      added.push(newList[i]);
    }
  }
  
  return { added, removed, modified };
}

export function diffResearch(
  oldSyn: SynthesisOutput,
  newSyn: SynthesisOutput,
): ResearchDiff {
  // Score changes
  const scoreChanges = {
    opportunityScore: newSyn.opportunityScore - oldSyn.opportunityScore,
    riskScore: newSyn.riskScore - oldSyn.riskScore,
  };

  // Insights (string arrays) - use simple string comparison
  const oldInsights = oldSyn.keyInsights.map((i) => i.insight);
  const newInsights = newSyn.keyInsights.map((i) => i.insight);
  const { added: addedIns, removed: removedIns, modified: modifiedIns } = compareStringLists(
    oldInsights,
    newInsights,
  );
  
  const insights = {
    added: addedIns,
    removed: removedIns,
    modified: modifiedIns,
  };

  // Opportunities
  const oppDiff = compareLists(
    oldSyn.topThreeOpportunities,
    newSyn.topThreeOpportunities,
    (o) => o.title + " " + o.description,
  );

  // Risks
  const riskDiff = compareLists(
    oldSyn.topThreeRisks,
    newSyn.topThreeRisks,
    (r) => r.title + " " + r.description,
  );

  // Next step
  const nextStepChanged = oldSyn.recommendedNextStep !== newSyn.recommendedNextStep;

  // Summary
  const totalAdded = insights.added.length + oppDiff.added.length + riskDiff.added.length;
  const totalRemoved = insights.removed.length + oppDiff.removed.length + riskDiff.removed.length;
  const totalModified =
    insights.modified.length + oppDiff.modified.length + riskDiff.modified.length +
    (nextStepChanged ? 1 : 0);

  return {
    scoreChanges,
    insights,
    opportunities: {
      added: oppDiff.added,
      removed: oppDiff.removed,
      modified: oppDiff.modified.map((m) => ({ old: m.old, new: m.new })),
    },
    risks: {
      added: riskDiff.added,
      removed: riskDiff.removed,
      modified: riskDiff.modified.map((m) => ({ old: m.old, new: m.new })),
    },
    nextStepChanged,
    oldNextStep: oldSyn.recommendedNextStep,
    newNextStep: newSyn.recommendedNextStep,
    summary: {
      totalChanges: totalAdded + totalRemoved + totalModified,
      added: totalAdded,
      removed: totalRemoved,
      modified: totalModified,
    },
  };
}

// Helper: format delta with sign
export function formatDelta(value: number, suffix = ""): string {
  if (value === 0) return "0" + suffix;
  return (value > 0 ? "+" : "") + value.toFixed(0) + suffix;
}


// ============================================================
// Source comparison
// ============================================================

export interface SourceDiffItem {
  title: string;
  url: string;
}

export interface SourceDiff {
  added: SourceDiffItem[];
  removed: SourceDiffItem[];
  common: SourceDiffItem[];
}

export function diffSources(
  oldSources: Array<{ title: string; url: string }>,
  newSources: Array<{ title: string; url: string }>,
): SourceDiff {
  const oldUrls = new Map(oldSources.map((s) => [s.url.toLowerCase(), s]));
  const newUrls = new Map(newSources.map((s) => [s.url.toLowerCase(), s]));

  const added: SourceDiffItem[] = [];
  const removed: SourceDiffItem[] = [];
  const common: SourceDiffItem[] = [];

  for (const [url, src] of newUrls) {
    if (!oldUrls.has(url)) {
      added.push({ title: src.title, url: src.url });
    } else {
      common.push({ title: src.title, url: src.url });
    }
  }

  for (const [url, src] of oldUrls) {
    if (!newUrls.has(url)) {
      removed.push({ title: src.title, url: src.url });
    }
  }

  return { added, removed, common };
}

// ============================================================
// Insight confidence changes
// ============================================================

export interface InsightConfidenceChange {
  insight: string;
  oldConfidence: string;
  newConfidence: string;
  direction: "up" | "down" | "same";
}

export function diffInsightConfidence(
  oldSyn: { keyInsights: Array<{ insight: string; confidence: string }> },
  newSyn: { keyInsights: Array<{ insight: string; confidence: string }> },
): InsightConfidenceChange[] {
  const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

  const changes: InsightConfidenceChange[] = [];
  const usedNew = new Set<number>();

  for (const oldInsight of oldSyn.keyInsights) {
    // Find best matching new insight by text similarity
    let bestIdx = -1;
    let bestSim = 0;
    for (let i = 0; i < newSyn.keyInsights.length; i++) {
      if (usedNew.has(i)) continue;
      const sim = similarity(oldInsight.insight, newSyn.keyInsights[i].insight);
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= 0.5) {
      usedNew.add(bestIdx);
      const newIns = newSyn.keyInsights[bestIdx];
      const oldRank = CONFIDENCE_RANK[oldInsight.confidence] ?? 1;
      const newRank = CONFIDENCE_RANK[newIns.confidence] ?? 1;
      let direction: "up" | "down" | "same" = "same";
      if (newRank > oldRank) direction = "up";
      else if (newRank < oldRank) direction = "down";

      if (direction !== "same") {
        changes.push({
          insight: newIns.insight,
          oldConfidence: oldInsight.confidence,
          newConfidence: newIns.confidence,
          direction,
        });
      }
    }
  }

  return changes;
}

// ============================================================
// Diff severity rating
// ============================================================

export type DiffSeverity = "minor" | "moderate" | "major";

export function getDiffSeverity(diff: ResearchDiff): DiffSeverity {
  const { added, removed, modified } = diff.summary;

  // Score-based assessment
  let score = 0;

  // Score changes weight heavily
  const oppDelta = Math.abs(diff.scoreChanges.opportunityScore);
  const riskDelta = Math.abs(diff.scoreChanges.riskScore);
  score += (oppDelta + riskDelta) / 10; // 20-point swing = 2 score

  // Structural changes
  score += added * 0.5;
  score += removed * 0.5;
  score += modified * 0.3;

  // Next step change indicates direction shift
  if (diff.nextStepChanged) score += 1;

  if (score >= 5) return "major";
  if (score >= 2) return "moderate";
  return "minor";
}

// ============================================================
// Word-level diff
// ============================================================

export interface WordDiffSegment {
  type: "added" | "removed" | "unchanged";
  text: string;
}

/**
 * Compute a word-level diff between two strings.
 * Returns array of segments marked as added/removed/unchanged.
 */
export function wordDiff(oldStr: string, newStr: string): WordDiffSegment[] {
  if (oldStr === newStr) {
    return [{ type: "unchanged", text: oldStr }];
  }

  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);

  // Simple LCS-based word diff
  const m = oldWords.length;
  const n = newWords.length;

  // Build LCS table
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1).fill(0);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build result
  const result: WordDiffSegment[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ type: "unchanged", text: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: newWords[j - 1] });
      j--;
    } else if (i > 0) {
      result.unshift({ type: "removed", text: oldWords[i - 1] });
      i--;
    }
  }

  // Merge adjacent segments of the same type
  const merged: WordDiffSegment[] = [];
  for (const seg of result) {
    if (merged.length > 0 && merged[merged.length - 1].type === seg.type) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

// ============================================================
// Diff to Markdown export
// ============================================================

export function diffToMarkdown(diff: ResearchDiff, options: {
  oldTitle?: string;
  newTitle?: string;
  includeWordDiff?: boolean;
} = {}): string {
  const lines: string[] = [];

  lines.push("# Research Diff Report");
  lines.push("");

  const severity = getDiffSeverity(diff);
  lines.push("> Severity: **" + severity.toUpperCase() + "**");
  lines.push("");

  if (options.oldTitle || options.newTitle) {
    lines.push("**Comparison:**");
    if (options.oldTitle) lines.push("- Old: " + options.oldTitle);
    if (options.newTitle) lines.push("- New: " + options.newTitle);
    lines.push("");
  }

  // Score changes
  lines.push("## Score Changes");
  lines.push("");
  lines.push("- Opportunity Score: " + formatDelta(diff.scoreChanges.opportunityScore));
  lines.push("- Risk Score: " + formatDelta(diff.scoreChanges.riskScore));
  lines.push("");

  // Summary
  const { totalChanges, added, removed, modified } = diff.summary;
  lines.push("## Summary");
  lines.push("");
  lines.push("- Total changes: **" + totalChanges + "**");
  lines.push("- Added: " + added);
  lines.push("- Removed: " + removed);
  lines.push("- Modified: " + modified);
  lines.push("");

  // Insights
  if (diff.insights.added.length > 0 || diff.insights.removed.length > 0 || diff.insights.modified.length > 0) {
    lines.push("## Insights");
    lines.push("");

    if (diff.insights.added.length > 0) {
      lines.push("### Added");
      lines.push("");
      for (const ins of diff.insights.added) {
        lines.push("- " + ins);
      }
      lines.push("");
    }

    if (diff.insights.removed.length > 0) {
      lines.push("### Removed");
      lines.push("");
      for (const ins of diff.insights.removed) {
        lines.push("- " + ins);
      }
      lines.push("");
    }

    if (diff.insights.modified.length > 0) {
      lines.push("### Modified");
      lines.push("");
      for (const m of diff.insights.modified) {
        lines.push("- **Old:** " + m.old);
        lines.push("  **New:** " + m.new);
        lines.push("  *(similarity: " + Math.round(m.similarity * 100) + "%)*");
        if (options.includeWordDiff) {
          const wd = wordDiff(m.old, m.new);
          let diffStr = "";
          for (const seg of wd) {
            if (seg.type === "added") diffStr += "[+" + seg.text + "]";
            else if (seg.type === "removed") diffStr += "[-" + seg.text + "]";
            else diffStr += seg.text;
          }
          lines.push("  **Word diff:** " + diffStr);
        }
        lines.push("");
      }
    }
  }

  // Opportunities
  if (diff.opportunities.added.length > 0 || diff.opportunities.removed.length > 0 || diff.opportunities.modified.length > 0) {
    lines.push("## Opportunities");
    lines.push("");

    if (diff.opportunities.added.length > 0) {
      lines.push("### Added");
      lines.push("");
      for (const opp of diff.opportunities.added) {
        lines.push("- **" + opp.title + "**: " + opp.description);
      }
      lines.push("");
    }

    if (diff.opportunities.removed.length > 0) {
      lines.push("### Removed");
      lines.push("");
      for (const opp of diff.opportunities.removed) {
        lines.push("- **" + opp.title + "**: " + opp.description);
      }
      lines.push("");
    }

    if (diff.opportunities.modified.length > 0) {
      lines.push("### Modified");
      lines.push("");
      for (const m of diff.opportunities.modified) {
        lines.push("- **" + m.new.title + "**");
        lines.push("  Old: " + m.old.description);
        lines.push("  New: " + m.new.description);
      }
      lines.push("");
    }
  }

  // Risks
  if (diff.risks.added.length > 0 || diff.risks.removed.length > 0 || diff.risks.modified.length > 0) {
    lines.push("## Risks");
    lines.push("");

    if (diff.risks.added.length > 0) {
      lines.push("### Added");
      lines.push("");
      for (const risk of diff.risks.added) {
        lines.push("- **" + risk.title + "**: " + risk.description);
      }
      lines.push("");
    }

    if (diff.risks.removed.length > 0) {
      lines.push("### Removed");
      lines.push("");
      for (const risk of diff.risks.removed) {
        lines.push("- **" + risk.title + "**: " + risk.description);
      }
      lines.push("");
    }

    if (diff.risks.modified.length > 0) {
      lines.push("### Modified");
      lines.push("");
      for (const m of diff.risks.modified) {
        lines.push("- **" + m.new.title + "**");
        lines.push("  Old: " + m.old.description);
        lines.push("  New: " + m.new.description);
      }
      lines.push("");
    }
  }

  // Next step
  if (diff.nextStepChanged) {
    lines.push("## Recommended Next Step");
    lines.push("");
    lines.push("**Old:** " + (diff.oldNextStep || "(none)"));
    lines.push("");
    lines.push("**New:** " + (diff.newNextStep || "(none)"));
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================
// Extended research diff with sources and confidence
// ============================================================

export interface ExtendedResearchDiff extends ResearchDiff {
  sources: SourceDiff;
  confidenceChanges: InsightConfidenceChange[];
  severity: DiffSeverity;
}

export interface SourceItem {
  title: string;
  url: string;
  snippet?: string;
}

export function diffResearchExtended(
  oldSyn: SynthesisOutput & { sources?: SourceItem[] },
  newSyn: SynthesisOutput & { sources?: SourceItem[] },
): ExtendedResearchDiff {
  const baseDiff = diffResearch(oldSyn, newSyn);

  const sources = diffSources(
    oldSyn.sources || [],
    newSyn.sources || [],
  );

  const confidenceChanges = diffInsightConfidence(
    { keyInsights: oldSyn.keyInsights },
    { keyInsights: newSyn.keyInsights },
  );

  const severity = getDiffSeverity(baseDiff);

  return {
    ...baseDiff,
    sources,
    confidenceChanges,
    severity,
  };
}

/* ------------------------------------------------------------------ */
/*  Extended diff utilities (round 141)                               */
/* ------------------------------------------------------------------ */

export interface DiffTimelineEntry {
  id: string;
  timestamp: string;
  label?: string;
  diff: ResearchDiff;
}

export function createTimelineEntry(
  diff: ResearchDiff,
  label?: string,
): DiffTimelineEntry {
  return {
    id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    label,
    diff,
  };
}

export interface DiffTimelineSummary {
  totalEntries: number;
  opportunityTrend: number[];
  riskTrend: number[];
  netChangesOverTime: Array<{ timestamp: string; totalChanges: number; severity: DiffSeverity }>;
  mostChangedField?: string;
}

export function summarizeTimeline(entries: DiffTimelineEntry[]): DiffTimelineSummary {
  const oppTrend: number[] = [];
  const riskTrend: number[] = [];
  const netChanges: Array<{ timestamp: string; totalChanges: number; severity: DiffSeverity }> = [];
  const fieldChanges = new Map<string, number>();
  let oppAcc = 0, riskAcc = 0;

  for (const e of entries) {
    oppAcc += e.diff.scoreChanges.opportunityScore;
    riskAcc += e.diff.scoreChanges.riskScore;
    oppTrend.push(oppAcc);
    riskTrend.push(riskAcc);
    netChanges.push({
      timestamp: e.timestamp,
      totalChanges: e.diff.summary.totalChanges,
      severity: getDiffSeverity(e.diff),
    });
    fieldChanges.set("insights", (fieldChanges.get("insights") || 0) + e.diff.insights.added.length);
    fieldChanges.set("insights", (fieldChanges.get("insights") || 0) + e.diff.insights.removed.length);
    fieldChanges.set("opportunities", (fieldChanges.get("opportunities") || 0) + e.diff.opportunities.added.length);
    fieldChanges.set("opportunities", (fieldChanges.get("opportunities") || 0) + e.diff.opportunities.removed.length);
    fieldChanges.set("risks", (fieldChanges.get("risks") || 0) + e.diff.risks.added.length);
    fieldChanges.set("risks", (fieldChanges.get("risks") || 0) + e.diff.risks.removed.length);
    if (e.diff.nextStepChanged) fieldChanges.set("nextStep", (fieldChanges.get("nextStep") || 0) + 1);
  }

  let mostChangedField: string | undefined;
  let maxCount = 0;
  for (const [f, c] of fieldChanges) {
    if (c > maxCount) { maxCount = c; mostChangedField = f; }
  }

  return {
    totalEntries: entries.length,
    opportunityTrend: oppTrend,
    riskTrend: riskTrend,
    netChangesOverTime: netChanges,
    mostChangedField,
  };
}

export function reverseDiff(diff: ResearchDiff): ResearchDiff {
  return {
    scoreChanges: {
      opportunityScore: -diff.scoreChanges.opportunityScore,
      riskScore: -diff.scoreChanges.riskScore,
    },
    insights: {
      added: diff.insights.removed,
      removed: diff.insights.added,
      modified: diff.insights.modified.map(m => ({ old: m.new, new: m.old, similarity: m.similarity })),
    },
    opportunities: {
      added: diff.opportunities.removed,
      removed: diff.opportunities.added,
      modified: diff.opportunities.modified.map(m => ({ old: m.new, new: m.old })),
    },
    risks: {
      added: diff.risks.removed,
      removed: diff.risks.added,
      modified: diff.risks.modified.map(m => ({ old: m.new, new: m.old })),
    },
    nextStepChanged: diff.nextStepChanged,
    oldNextStep: diff.newNextStep,
    newNextStep: diff.oldNextStep,
    summary: {
      totalChanges: diff.summary.totalChanges,
      added: diff.summary.removed,
      removed: diff.summary.added,
      modified: diff.summary.modified,
    },
  };
}

export function diffToJson(diff: ResearchDiff, meta?: { oldLabel?: string; newLabel?: string }): string {
  return JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    meta: meta || {},
    severity: getDiffSeverity(diff),
    diff,
  }, null, 2);
}

export interface OneLineSummaryOptions {
  includeScores?: boolean;
  maxItems?: number;
}

export function diffToOneLine(diff: ResearchDiff, opts: OneLineSummaryOptions = {}): string {
  const incScores = opts.includeScores !== false;
  const parts: string[] = [];
  const s = diff.summary;
  parts.push(s.added + " added");
  parts.push(s.removed + " removed");
  if (s.modified) parts.push(s.modified + " modified");
  let result = parts.join(", ");
  if (incScores) {
    const od = formatDelta(diff.scoreChanges.opportunityScore);
    const rd = formatDelta(diff.scoreChanges.riskScore);
    result += " (opp:" + od + " risk:" + rd + ")";
  }
  if (diff.nextStepChanged) result += ", next step changed";
  return result;
}

export function applyPatch(base: string, segments: WordDiffSegment[]): string {
  let out = "";
  for (const seg of segments) {
    if (seg.type === "added" || seg.type === "unchanged") out += seg.text;
  }
  return out;
}

export interface ChangeHotspot {
  field: string;
  changeCount: number;
  shareOfTotal: number;
}

export function findChangeHotspots(diff: ResearchDiff): ChangeHotspot[] {
  const counts: Array<{ field: string; count: number }> = [
    { field: "insights", count: diff.insights.added.length + diff.insights.removed.length + diff.insights.modified.length },
    { field: "opportunities", count: diff.opportunities.added.length + diff.opportunities.removed.length + diff.opportunities.modified.length },
    { field: "risks", count: diff.risks.added.length + diff.risks.removed.length + diff.risks.modified.length },
    { field: "nextStep", count: diff.nextStepChanged ? 1 : 0 },
    { field: "scores", count: (diff.scoreChanges.opportunityScore !== 0 || diff.scoreChanges.riskScore !== 0) ? 1 : 0 },
  ];
  const total = counts.reduce((a, c) => a + c.count, 0) || 1;
  return counts
    .filter(c => c.count > 0)
    .map(c => ({ field: c.field, changeCount: c.count, shareOfTotal: Math.round((c.count / total) * 100) }))
    .sort((a, b) => b.changeCount - a.changeCount);
}

export function isEmptyDiff(diff: ResearchDiff): boolean {
  return diff.summary.totalChanges === 0
    && diff.scoreChanges.opportunityScore === 0
    && diff.scoreChanges.riskScore === 0;
}

export function mergeDiffs(diffs: ResearchDiff[]): ResearchDiff {
  const base: ResearchDiff = {
    scoreChanges: { opportunityScore: 0, riskScore: 0 },
    insights: { added: [], removed: [], modified: [] },
    opportunities: { added: [], removed: [], modified: [] },
    risks: { added: [], removed: [], modified: [] },
    nextStepChanged: false,
    summary: { totalChanges: 0, added: 0, removed: 0, modified: 0 },
  };
  let latestNextStep: { old?: string; new?: string } = {};
  for (const d of diffs) {
    base.scoreChanges.opportunityScore += d.scoreChanges.opportunityScore;
    base.scoreChanges.riskScore += d.scoreChanges.riskScore;
    base.insights.added.push(...d.insights.added);
    base.insights.removed.push(...d.insights.removed);
    base.insights.modified.push(...d.insights.modified);
    base.opportunities.added.push(...d.opportunities.added);
    base.opportunities.removed.push(...d.opportunities.removed);
    base.opportunities.modified.push(...d.opportunities.modified);
    base.risks.added.push(...d.risks.added);
    base.risks.removed.push(...d.risks.removed);
    base.risks.modified.push(...d.risks.modified);
    if (d.nextStepChanged) {
      base.nextStepChanged = true;
      latestNextStep = { old: d.oldNextStep, new: d.newNextStep };
    }
    base.summary.totalChanges += d.summary.totalChanges;
    base.summary.added += d.summary.added;
    base.summary.removed += d.summary.removed;
    base.summary.modified += d.summary.modified;
  }
  base.oldNextStep = latestNextStep.old;
  base.newNextStep = latestNextStep.new;
  return base;
}

/* ------------------------------------------------------------------ */
/*  Extended diff helpers (round 154)                                 */
/* ------------------------------------------------------------------ */

export function emptyDiff(): ResearchDiff {
  return {
    scoreChanges: { opportunityScore: 0, riskScore: 0 },
    insights: { added: [], removed: [], modified: [] },
    opportunities: { added: [], removed: [], modified: [] },
    risks: { added: [], removed: [], modified: [] },
    nextStepChanged: false,
    summary: { totalChanges: 0, added: 0, removed: 0, modified: 0 },
  };
}

export function diffsEqual(a: ResearchDiff, b: ResearchDiff): boolean {
  if (a.summary.totalChanges !== b.summary.totalChanges) return false;
  if (a.summary.added !== b.summary.added) return false;
  if (a.summary.removed !== b.summary.removed) return false;
  if (a.summary.modified !== b.summary.modified) return false;
  if (a.scoreChanges.opportunityScore !== b.scoreChanges.opportunityScore) return false;
  if (a.scoreChanges.riskScore !== b.scoreChanges.riskScore) return false;
  if (a.nextStepChanged !== b.nextStepChanged) return false;
  if ((a.oldNextStep || "") !== (b.oldNextStep || "")) return false;
  if ((a.newNextStep || "") !== (b.newNextStep || "")) return false;
  const sameStrings = (x: string[], y: string[]) =>
    x.length === y.length && new Set(x).size === new Set([...x, ...y]).size;
  if (!sameStrings(a.insights.added, b.insights.added)) return false;
  if (!sameStrings(a.insights.removed, b.insights.removed)) return false;
  if (a.insights.modified.length !== b.insights.modified.length) return false;
  const keyOf = (o: unknown) => JSON.stringify(o);
  const sameObj = (x: unknown[], y: unknown[]) => {
    if (x.length !== y.length) return false;
    const sx = new Set(x.map(keyOf));
    for (const o of y) if (!sx.has(keyOf(o))) return false;
    return true;
  };
  if (!sameObj(a.opportunities.added, b.opportunities.added)) return false;
  if (!sameObj(a.opportunities.removed, b.opportunities.removed)) return false;
  if (!sameObj(a.risks.added, b.risks.added)) return false;
  if (!sameObj(a.risks.removed, b.risks.removed)) return false;
  return true;
}

export function diffNetScore(diff: ResearchDiff): number {
  return diff.scoreChanges.opportunityScore - diff.scoreChanges.riskScore;
}

export interface FieldBreakdown {
  field: "insights" | "opportunities" | "risks" | "nextStep";
  added: number;
  removed: number;
  modified: number;
  total: number;
}

export function breakdownByField(diff: ResearchDiff): FieldBreakdown[] {
  return [
    { field: "insights", added: diff.insights.added.length, removed: diff.insights.removed.length, modified: diff.insights.modified.length, total: diff.insights.added.length + diff.insights.removed.length + diff.insights.modified.length },
    { field: "opportunities", added: diff.opportunities.added.length, removed: diff.opportunities.removed.length, modified: diff.opportunities.modified.length, total: diff.opportunities.added.length + diff.opportunities.removed.length + diff.opportunities.modified.length },
    { field: "risks", added: diff.risks.added.length, removed: diff.risks.removed.length, modified: diff.risks.modified.length, total: diff.risks.added.length + diff.risks.removed.length + diff.risks.modified.length },
    { field: "nextStep", added: 0, removed: 0, modified: diff.nextStepChanged ? 1 : 0, total: diff.nextStepChanged ? 1 : 0 },
  ];
}

export function diffBreakdownToCsv(diff: ResearchDiff): string {
  const rows = ["field,added,removed,modified,total"];
  for (const r of breakdownByField(diff)) {
    rows.push([r.field, r.added, r.removed, r.modified, r.total].join(","));
  }
  rows.push(["scores", diff.scoreChanges.opportunityScore, diff.scoreChanges.riskScore, diffNetScore(diff), ""].join(","));
  return rows.join("\n");
}

export function insightsWithSign(diff: ResearchDiff): Array<{ text: string; sign: "+" | "-" | "~" }> {
  const out: Array<{ text: string; sign: "+" | "-" | "~" }> = [];
  diff.insights.added.forEach((t) => out.push({ text: t, sign: "+" }));
  diff.insights.removed.forEach((t) => out.push({ text: t, sign: "-" }));
  diff.insights.modified.forEach((m) => out.push({ text: m.new + " (was: " + m.old + ")", sign: "~" }));
  return out;
}

export function totalChangedOpportunities(diff: ResearchDiff): number {
  return diff.opportunities.added.length + diff.opportunities.removed.length + diff.opportunities.modified.length;
}
export function totalChangedRisks(diff: ResearchDiff): number {
  return diff.risks.added.length + diff.risks.removed.length + diff.risks.modified.length;
}

