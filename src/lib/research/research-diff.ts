/**
 * Research result diff tool — compares two synthesis outputs.
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
