/**
 * Research result diff tool 鈥?compares two synthesis outputs.
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
function compareStringLists(oldList: string[], newList: string[], threshold = 0.3) {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: Array<{ old: string; new: string; similarity: number }> = [];
  
  const usedOld = new Set<number>();
  const usedNew = new Set<number>();
  
  // Find matches
  for (let i = 0; i < oldList.length; i++) {
    const match = findBestMatch(oldList[i], (s) => s, newList);
    if (match.index >= 0 && match.similarity >= threshold && !usedNew.has(match.index)) {
      usedOld.add(i);
      usedNew.add(match.index);
      
      if (match.similarity < 0.95) {
        modified.push({
          old: oldList[i],
          new: newList[match.index],
          similarity: match.similarity,
        });
      }
    }
  }
  
  for (let i = 0; i < oldList.length; i++) {
    if (!usedOld.has(i)) removed.push(oldList[i]);
  }
  
  for (let i = 0; i < newList.length; i++) {
    if (!usedNew.has(i)) added.push(newList[i]);
  }
  
  return { added, removed, modified };
}

function compareLists<T extends { title?: string; description?: string }>(
  oldList: T[],
  newList: T[],
  getText: (item: T) => string,
  threshold = 0.3,
) {
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
  const { totalChanges, added, removed, modified } = diff.summary;

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
