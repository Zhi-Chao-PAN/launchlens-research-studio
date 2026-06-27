"use client";

/* eslint-disable */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { SynthesisOutput, Source, KeyInsight, Opportunity, Risk } from "@/lib/research/synthesis-parser";
import { parseSynthesis } from "@/lib/research/synthesis-parser";
import { isRunStarred, toggleStar } from "@/lib/research/starred";
import { listTemplates, createTemplate } from "@/lib/research/templates";
import { DetailHeaderSkeleton, CardSkeleton } from "@/components/skeleton/Skeleton";
import { RelatedRuns } from "@/components/related/RelatedRuns";
import { useCommandPalette } from "@/components/command-palette/CommandPaletteContext";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { TagList } from "@/components/tags/TagList";
import dynamic from "next/dynamic";

// R220: split the 1500-line detail page. Heavy visual primitives
// (ScoreGauge is a 50-line inline SVG; SourceChart builds a domain
// bar chart) are dynamic-imported with ssr: false so the initial
// JS bundle skips their code. Identical server- and client-side,
// so the SSR-disable is purely a bundle-size optimization.
const ScoreGauge = dynamic(
  () => import("@/components/report/primitives/ScoreGauge").then((m) => m.ScoreGauge),
  { ssr: false, loading: () => <div className="score-gauge-skeleton" /> },
);
const SourceChart = dynamic(
  () => import("@/components/report/primitives/SourceChart").then((m) => m.SourceChart),
  { ssr: false, loading: () => <div className="source-chart-skeleton" /> },
);
const KeywordCloud = dynamic(
  () => import("@/components/report/primitives/KeywordCloud").then((m) => m.KeywordCloud),
  { ssr: false, loading: () => <div className="keyword-cloud-skeleton" /> },
);

interface ResearchRun {
  id: string;
  query: string;
  keywords: string[];
  result: string;
  sources?: Source[];
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  status: "completed" | "failed";
  error?: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + "s";
  return Math.floor(ms / 60000) + "m " + Math.floor((ms % 60000) / 1000) + "s";
}



function ConfidenceBadge({ level }: { level: string }) {
  const cls = `confidence-badge confidence-${level}`;
  return <span className={cls}>{level} confidence</span>;
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="score-bar">
      <div className="score-bar-header">
        <span className="score-bar-label">{label}</span>
        <span className="score-bar-value" style={{ color }}>{value}/100</span>
      </div>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * Renders text with [n] citation markers turned into clickable links.
 */
function CitationText({ text, onCitationClick }: { text: string; onCitationClick: (index: number) => void }) {
  // Split by [n] patterns
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  const regex = /\[(\d+)\]/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const num = parseInt(match[1], 10);
    parts.push(
      <button
        key={match.index}
        className="citation-link"
        onClick={() => onCitationClick(num - 1)}
        title="View source"
      >
        [{num}]
      </button>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? <>{parts}</> : <>{text}</>;
}

// Calculate which sections cite which sources (for reverse lookup)
function computeSourceCitationMap(
  synthesis: SynthesisOutput
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const sections: { name: string; text: string }[] = [
    { name: "Executive Summary", text: synthesis.execSummary || "" },
    { name: "Key Insights", text: (synthesis.keyInsights || []).map((k) => k.insight).join(" ") },
    { name: "Opportunities", text: (synthesis.topThreeOpportunities || []).map((o) => o.description + " " + o.rationale).join(" ") },
    { name: "Risks", text: (synthesis.topThreeRisks || []).map((r) => r.description + " " + r.mitigation).join(" ") },
    { name: "Next Step", text: synthesis.recommendedNextStep || "" },
  ];

  for (const section of sections) {
    const cited = new Set<number>();
    const regex = /\[(\d+)\]/g;
    let match;
    while ((match = regex.exec(section.text)) !== null) {
      cited.add(parseInt(match[1], 10) - 1);
    }
    for (const idx of cited) {
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx)!.push(section.name);
    }
  }

  return map;
}

// Word cloud component ? renders keywords in varying sizes — moved to
// src/components/report/primitives/KeywordCloud.tsx (R220) and
// dynamic-imported above.


export default function ResearchDetailPage({ params }: { params: { id: string } }) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<string>("");
  const [readingProgress, setReadingProgress] = useState(0);
  const [showToc, setShowToc] = useState(true);
  const [highlightedSource, setHighlightedSource] = useState<number | null>(null);
  const sourceRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [compareCount, setCompareCount] = useState(0);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(false);
  const queryId = params.id;

  // Handle add to compare
  const handleAddToCompare = useCallback(() => {
    if (!run) return;
    try {
      const existing = JSON.parse(localStorage.getItem("launchlens:compare") || "[]");
      const updated = [...existing.filter((id: string) => id !== run.id), run.id].slice(-2);
      localStorage.setItem("launchlens:compare", JSON.stringify(updated));
      if (updated.length === 2) {
        router.push(`/compare?a=${updated[0]}&b=${updated[1]}`);
      }
    } catch {
      // ignore storage errors
    }
  }, [run, router]);

  const { registerCommands } = useCommandPalette();

async function loadRun() {
    try {
      const res = await fetch(`/api/research/runs/${params.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Research run not found. It may have expired or been deleted.");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setRun(data);
      const parsed = parseSynthesis(data.result);
      setSynthesis(parsed);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      // Check star status after load
      setIsStarred(isRunStarred(params.id));
    }
  }

  useEffect(() => {
    loadRun();
  }, [params.id]);

  

  // Generate a clean filename from query + timestamp
  function generateFilename(ext: string): string {
    if (!run) return "research." + ext;
    const safeQuery = run.query
      .toLowerCase()
      .replace(/[^a-z0-9一-龥]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    const date = new Date(run.createdAt);
    const ts = date.getFullYear().toString() +
      String(date.getMonth() + 1).padStart(2, "0") +
      String(date.getDate()).padStart(2, "0");
    return `${safeQuery || "research"}-${ts}.${ext}`;
  }

  // Download file helper
  function downloadFile(data: string | Blob, filename: string, mimeType: string) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  async function handleExport(format: "md" | "json" | "txt" | "pdf") {
    if (!run) return;

    if (format === "pdf") {
      window.print();
      setShowExportMenu(false);
      return;
    }

    let content = "";
    let mimeType = "";

    switch (format) {
      case "md":
        content = buildMarkdown(run, synthesis);
        mimeType = "text/markdown";
        break;
      case "json":
        const exportData = synthesis
          ? { query: run.query, keywords: run?.keywords ?? [], synthesis, sources: run.sources, provider: run.provider, model: run.model, createdAt: run.createdAt, durationMs: run.durationMs }
          : run;
        content = JSON.stringify(exportData, null, 2);
        mimeType = "application/json";
        break;
      case "txt":
        content = buildPlainText(run, synthesis);
        mimeType = "text/plain";
        break;
    }

    const filename = generateFilename(format);
    downloadFile(content, filename, mimeType);
    setShowExportMenu(false);
    showToast("Exported " + format.toUpperCase());
  }

  function buildPlainText(r: ResearchRun, s: SynthesisOutput | null): string {
    const lines: string[] = [];
    lines.push(r.query);
    lines.push("=".repeat(Math.min(r.query.length, 60)));
    lines.push("");
    lines.push("Generated by LaunchLens Research Studio");
    lines.push("Model: " + r.provider + " / " + r.model);
    lines.push("Date: " + formatTime(r.createdAt));
    lines.push("Duration: " + formatDuration(r.durationMs));
    lines.push("");

    if (r.keywords?.length) {
      lines.push("Keywords: " + r.keywords.join(", "));
      lines.push("");
    }

    if (s) {
      lines.push("OVERVIEW");
      lines.push("-".repeat(40));
      lines.push("Opportunity Score: " + s.opportunityScore + "/100");
      lines.push("Risk Score: " + s.riskScore + "/100");
      lines.push("");

      lines.push("EXECUTIVE SUMMARY");
      lines.push("-".repeat(40));
      lines.push(s.execSummary);
      lines.push("");

      if (s.keyInsights?.length) {
        lines.push("KEY INSIGHTS");
        lines.push("-".repeat(40));
        s.keyInsights.forEach((insight, i) => {
          lines.push((i + 1) + ". " + insight.insight);
          lines.push("   Confidence: " + insight.confidence);
          if (insight.supportingAgents?.length) {
            lines.push("   Agents: " + insight.supportingAgents.join(", "));
          }
          lines.push("");
        });
      }

      if (s.topThreeOpportunities?.length) {
        lines.push("TOP OPPORTUNITIES");
        lines.push("-".repeat(40));
        s.topThreeOpportunities.forEach((opp, i) => {
          lines.push((i + 1) + ". " + opp.title);
          lines.push("   " + opp.description);
          lines.push("   Rationale: " + opp.rationale);
          lines.push("");
        });
      }

      if (s.topThreeRisks?.length) {
        lines.push("TOP RISKS");
        lines.push("-".repeat(40));
        s.topThreeRisks.forEach((risk, i) => {
          lines.push((i + 1) + ". " + risk.title);
          lines.push("   " + risk.description);
          lines.push("   Mitigation: " + risk.mitigation);
          lines.push("");
        });
      }

      if (s.recommendedNextStep) {
        lines.push("RECOMMENDED NEXT STEP");
        lines.push("-".repeat(40));
        lines.push(s.recommendedNextStep);
        lines.push("");
      }

      if (s.citations?.length) {
        lines.push("SOURCES");
        lines.push("-".repeat(40));
        s.citations.forEach((c, i) => {
          lines.push((i + 1) + ". " + c.title);
          lines.push("   " + c.url);
        });
      }
    } else {
      lines.push("RESULT");
      lines.push("-".repeat(40));
      lines.push(r.result || "No result");
    }

    return lines.join("\n");
  }

  function buildMarkdown(r: ResearchRun, s: SynthesisOutput | null): string {
    const lines: string[] = [];
    const date = formatTime(r.createdAt);
    const duration = formatDuration(r.durationMs);

    // Header
    lines.push("# " + r.query);
    lines.push("");
    lines.push("> **Generated by LaunchLens Research Studio**");
    lines.push("> ");
    lines.push("> - **Model:** " + r.provider + " / " + r.model);
    lines.push("> - **Date:** " + date);
    lines.push("> - **Duration:** " + duration);
    if (r.status) {
      lines.push("> - **Status:** " + r.status);
    }
    lines.push("");

    // Keywords
    if (r.keywords?.length) {
      lines.push("## Keywords");
      lines.push("");
      lines.push(r.keywords.map((k) => `\`${k}\``).join(" "));
      lines.push("");
    }

    if (s) {
      // Scores as badges / table
      lines.push("## Overview");
      lines.push("");
      lines.push("| Metric | Score |");
      lines.push("|--------|-------|");
      lines.push("| Opportunity Score | `" + s.opportunityScore + "/100` |");
      lines.push("| Risk Score | `" + s.riskScore + "/100` |");
      lines.push("");

      // Executive Summary
      lines.push("## Executive Summary");
      lines.push("");
      lines.push(s.execSummary);
      lines.push("");

      // Key Insights
      if (s.keyInsights?.length) {
        lines.push("## Key Insights (" + s.keyInsights.length + ")");
        lines.push("");
        s.keyInsights.forEach((insight, i) => {
          const confEmoji = insight.confidence === "high" ? "\u{1F7E2}" : insight.confidence === "medium" ? "\u{1F7E1}" : "\u{1F534}";
          lines.push("### " + (i + 1) + ". " + insight.insight);
          lines.push("");
          lines.push("> *Confidence: " + insight.confidence + "* " + confEmoji);
          if (insight.supportingAgents?.length) {
            lines.push("");
            lines.push("*Agents: " + insight.supportingAgents.join(", ") + "*");
          }
          lines.push("");
        });
      }

      // Opportunities
      if (s.topThreeOpportunities?.length) {
        lines.push("## Top Opportunities");
        lines.push("");
        s.topThreeOpportunities.forEach((opp, i) => {
          lines.push("### " + (i + 1) + ". " + opp.title);
          lines.push("");
          lines.push(opp.description);
          lines.push("");
          lines.push("**Rationale:** " + opp.rationale);
          lines.push("");
        });
      }

      // Risks
      if (s.topThreeRisks?.length) {
        lines.push("## Top Risks");
        lines.push("");
        s.topThreeRisks.forEach((risk, i) => {
          lines.push("### " + (i + 1) + ". " + risk.title);
          lines.push("");
          lines.push(risk.description);
          lines.push("");
          lines.push("**Mitigation:** " + risk.mitigation);
          lines.push("");
        });
      }

      // Recommended Next Step
      if (s.recommendedNextStep) {
        lines.push("## Recommended Next Step");
        lines.push("");
        lines.push(s.recommendedNextStep);
        lines.push("");
      }

      // Sources
      if (s.citations?.length) {
        lines.push("## Sources (" + s.citations.length + ")");
        lines.push("");
        s.citations.forEach((c, i) => {
          lines.push((i + 1) + ". **[" + c.title + "](" + c.url + ")**");
          if (c.snippet) {
            lines.push("   ");
            lines.push("   > " + c.snippet.slice(0, 200) + (c.snippet.length > 200 ? "..." : ""));
          }
        });
        lines.push("");
      }
    } else {
      // Plain result
      lines.push("## Result");
      lines.push("");
      lines.push(r.result || "*No result*");
      lines.push("");
    }

    // Footer
    lines.push("---");
    lines.push("");
    lines.push("*Generated by LaunchLens Research Studio*");

    return lines.join("\n");
  }

  const handleToggleStar = useCallback(() => {
    const newState = toggleStar(params.id);
    setIsStarred(newState);
  }, [params.id]);

  const handleRerun = useCallback(() => {
    if (!run) return;
    // Navigate to home with prefilled query + keywords
    const params = new URLSearchParams();
    params.set("q", run.query);
    if (run.keywords?.length) {
      params.set("keywords", run.keywords.join(", "));
    }
    window.location.href = `/?${params.toString()}`;
  }, [run]);

  const handleSaveAsTemplate = useCallback(() => {
    if (!run) return;
    setTemplateName(run.query);
    setTemplateSaved(false);
    setShowTemplateDialog(true);
  }, [run]);

  const showToast = useCallback((msg: string) => {
    setCopySuccess(msg);
    setTimeout(() => setCopySuccess(null), 2000);
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    if (!run) return;
    const md = buildMarkdown(run, synthesis);
    try {
      await navigator.clipboard.writeText(md);
      showToast("Report copied to clipboard");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = md;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast("Report copied to clipboard");
    }
  }, [run, synthesis, showToast]);

  const handleCopyLink = useCallback(async () => {
    if (!run) return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Failed to copy link");
    }
  }, [run, showToast]);

  const handleGenerateShare = useCallback(async () => {
    if (!run) return;
    setShareLoading(true);
    setShareError(null);
    const { createShareAndCopyUrl, buildShareUrl } = await import("@/lib/research/share-api");
    const r = await createShareAndCopyUrl(run.id);
    setShareLoading(false);
    if (!r.ok) { setShareError(r.error || "Failed to create share link"); return; }
    setShareToken(r.token || null);
    if (r.copied) showToast("Share link copied to clipboard");
    else showToast("Share link created: " + buildShareUrl(r.token || ""));
  }, [run, showToast]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/share/${shareToken}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Share link copied");
    } catch {
      showToast("Failed to copy");
    }
  }, [shareToken, showToast]);

  const confirmSaveAsTemplate = useCallback(() => {
    if (!run || !templateName.trim()) return;
    createTemplate({
      name: templateName.trim(),
      description: `Generated from research: ${run.query}`,
      query: run.query,
      keywords: (run?.keywords ?? []) || [],
      category: "Custom",
    });
    setTemplateSaved(true);
    setTimeout(() => {
      setShowTemplateDialog(false);
      setTemplateSaved(false);
    }, 1200);
  }, [run, templateName]);

  // Build table of contents from available sections
  const tocItems = useMemo(() => {
    const items: { id: string; label: string }[] = [];
    if (synthesis) {
      items.push({ id: "exec-summary", label: "Executive Summary" });
      items.push({ id: "scores", label: "Scores" });
      if (synthesis.keyInsights?.length) {
        items.push({ id: "key-insights", label: `Key Insights (${synthesis.keyInsights.length})` });
      }
      items.push({ id: "opportunities", label: "Top Opportunities" });
      items.push({ id: "risks", label: "Top Risks" });
      items.push({ id: "next-step", label: "Recommended Next Step" });
      if (synthesis.citations?.length) {
        items.push({ id: "sources", label: `Sources (${synthesis.citations.length})` });
      }
    } else if (run?.result) {
      items.push({ id: "result", label: "Result" });
    }
    items.push({ id: "raw-output", label: "Raw Output" });
    return items;
  }, [synthesis, run]);

  const toggleSection = useCallback((id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Update URL hash without scroll jump
    if (typeof window !== "undefined" && history.replaceState) {
      history.replaceState(null, "", "#" + id);
    }
  }, []);

  // Handle citation click ? scroll to source and highlight
  const handleCitationClick = useCallback((sourceIndex: number) => {
    setHighlightedSource(sourceIndex);
    // Scroll to sources section first
    const sourcesSection = document.getElementById("sources");
    if (sourcesSection) {
      sourcesSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Then scroll to the specific source item after a short delay
    setTimeout(() => {
      const el = sourceRefs.current[sourceIndex];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 400);
    // Clear highlight after a while
    setTimeout(() => {
      setHighlightedSource((prev) => (prev === sourceIndex ? null : prev));
    }, 3000);
  }, []);

  // Register detail page commands
  useEffect(() => {
    if (!run) return;

    const unregister = registerCommands([
      {
        id: "detail:star",
        label: "Toggle Star",
        description: "Star or unstar this research",
        icon: "?",
        shortcut: "s",
        category: "action",
        keywords: ["star", "favorite", "bookmark"],
        action: handleToggleStar,
      },
      {
        id: "detail:rerun",
        label: "Rerun Research",
        description: "Run this research again with current settings",
        icon: "??",
        shortcut: "r",
        category: "action",
        keywords: ["rerun", "restart", "retry"],
        action: handleRerun,
      },
      {
        id: "detail:export",
        label: "Export Report",
        description: "Download this report as Markdown",
        icon: "??",
        shortcut: "e",
        category: "action",
        keywords: ["export", "download", "markdown"],
        action: () => handleExport("md"),
      },
      {
        id: "detail:copy",
        label: "Copy Report",
        description: "Copy report to clipboard",
        icon: "??",
        shortcut: "c",
        category: "action",
        keywords: ["copy", "clipboard"],
        action: handleCopyMarkdown,
      },
      {
        id: "detail:share",
        label: "Share",
        description: "Generate a share link for this research",
        icon: "??",
        category: "action",
        keywords: ["share", "link", "public"],
        action: () => setShowShareDialog(true),
      },
      {
        id: "detail:save-template",
        label: "Save as Template",
        description: "Save this query as a reusable template",
        icon: "??",
        category: "action",
        keywords: ["template", "save", "preset"],
        action: handleSaveAsTemplate,
      },
      {
        id: "nav:back",
        label: "Back to History",
        description: "Return to research history page",
        icon: "?",
        shortcut: "b",
        category: "navigation",
        keywords: ["back", "history", "list"],
        action: () => router.push("/research"),
      },
    ]);

    return unregister;
  }, [run, registerCommands, router, handleToggleStar, handleRerun, handleExport, handleCopyMarkdown, handleSaveAsTemplate]);

  // Keyboard shortcuts for detail page
  useHotkeys("s", handleToggleStar, { ignoreInputs: true, scope: "detail", enabled: !!run });
  useHotkeys("r", handleRerun, { ignoreInputs: true, scope: "detail", enabled: !!run && !isRunning });
  useHotkeys("e", () => handleExport("md"), { ignoreInputs: true, scope: "detail", enabled: !!run });
  useHotkeys("c", handleCopyMarkdown, { ignoreInputs: true, scope: "detail", enabled: !!run });
  useHotkeys("b", () => router.push("/research"), { ignoreInputs: true, scope: "detail" });

  // Compute reverse citation map
  const sourceCitationMap = useMemo(() => {
    if (!synthesis) return new Map<number, string[]>();
    return computeSourceCitationMap(synthesis);
  }, [synthesis]);

  // Track active section on scroll
  useEffect(() => {
    if (!synthesis && !run?.result) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry that is most visible
        let best: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!best || entry.intersectionRatio > best.intersectionRatio) {
              best = entry;
            }
          }
        }
        if (best) {
          setActiveSection(best.target.id);
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 0.25, 0.5, 1] }
    );

    for (const item of tocItems) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [synthesis, run, tocItems]);

  // Scroll to hash section on initial load
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (hash) {
      const timer = setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "auto", block: "start" });
          setActiveSection(hash);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [synthesis, run]);

  // Calculate reading progress
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleScroll = () => {
      const main = document.querySelector(".research-detail-main") as HTMLElement | null;
      if (!main) return;
      const rect = main.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const total = rect.height - viewportH;
      const scrolled = Math.min(Math.max(0, -rect.top), total);
      const progress = total > 0 ? (scrolled / total) * 100 : 0;
      setReadingProgress(Math.round(progress));
    };

    window.addEventListener("scroll", handleScroll, { passive: true } as AddEventListenerOptions);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [synthesis, run]);

  // Keyboard navigation: j/k to jump between sections, t/b for top/bottom
  useEffect(() => {
    if (typeof window === "undefined" || !tocItems.length) return;

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      const currentIdx = tocItems.findIndex((item) => item.id === activeSection);
      if (e.key === "j") {
        e.preventDefault();
        const nextIdx = Math.min(currentIdx + 1, tocItems.length - 1);
        if (nextIdx !== currentIdx && nextIdx >= 0) scrollToSection(tocItems[nextIdx].id);
      } else if (e.key === "k") {
        e.preventDefault();
        const prevIdx = Math.max(currentIdx - 1, 0);
        if (prevIdx !== currentIdx) scrollToSection(tocItems[prevIdx].id);
      } else if (e.key === "t") {
        e.preventDefault();
        scrollToSection(tocItems[0].id);
      } else if (e.key === "b") {
        e.preventDefault();
        scrollToSection(tocItems[tocItems.length - 1].id);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [tocItems, activeSection, scrollToSection]);

  if (loading) {
    return (
      <div className="research-detail">
        <div className="research-detail-inner">
          <DetailHeaderSkeleton />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginTop: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <CardSkeleton lines={6} />
              <CardSkeleton lines={4} />
              <CardSkeleton lines={5} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <CardSkeleton lines={3} />
              <CardSkeleton lines={4} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !run) {
    return (
      <div className="research-detail">
        <div className="research-detail-inner">
          <div className="error-banner">{error}</div>
          <p><Link href="/history">← Back to history</Link></p>
          <p><Link href="/">← Back to studio</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="research-detail">
      <header className="research-detail-header">
        <div className="research-detail-header-inner">
          <Link href="/history" className="research-back-link">← History</Link>
          <h1 className="research-detail-title">{run?.query}</h1>
    <div className="research-detail-tags">
            <TagList runId={queryId} />
          </div>
          <div className="research-detail-meta">
            <span className={`research-status research-status-${run?.status}`}>
              {run?.status}
            </span>
            <span className="research-provider">{run?.provider} / {run?.model}</span>
            <span className="research-time">{run ? formatTime(run.createdAt) : ""}</span>
            <span className="research-duration">{run ? formatDuration(run.durationMs) : ""}</span>
            <button
              onClick={handleToggleStar}
              className={`research-star-btn ${isStarred ? "starred" : ""}`}
              aria-label={isStarred ? "Unstar" : "Star"}
            >
              {isStarred ? "★" : "☆"} {isStarred ? "Starred" : "Star"}
            </button>
            <button onClick={handleRerun} className="research-action-btn">
              🔄 Rerun
            </button>
            <button onClick={handleSaveAsTemplate} className="research-action-btn">
              📑 Save as template
            </button>
            <button onClick={() => setShowShareDialog(true)} className="research-action-btn">
              🔗 Share
            </button>
            <button onClick={handleCopyMarkdown} className="research-action-btn">
              📋 Copy
            </button>
            <button onClick={handleAddToCompare} className="research-action-btn">
              ⚖️ Compare
              {compareCount > 0 && <span className="research-action-badge">{compareCount}</span>}
            </button>
            <div className="research-export-menu" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                className="research-export-btn research-export-toggle"
              >
                <span>Export</span>
                <span className="research-export-caret">{showExportMenu ? "▲" : "▼"}</span>
              </button>
              {showExportMenu && (
                <div className="research-export-dropdown">
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("md")}
                  >
                    <span className="research-export-item-icon">📝</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">Markdown</div>
                      <div className="research-export-item-desc">.md file with formatting</div>
                    </div>
                    <kbd className="research-export-shortcut">E</kbd>
                  </button>
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("pdf")}
                  >
                    <span className="research-export-item-icon">📄</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">PDF</div>
                      <div className="research-export-item-desc">Print / Save as PDF</div>
                    </div>
                  </button>
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("json")}
                  >
                    <span className="research-export-item-icon">📋</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">JSON</div>
                      <div className="research-export-item-desc">Structured data</div>
                    </div>
                  </button>
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("txt")}
                  >
                    <span className="research-export-item-icon">📃</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">Plain Text</div>
                      <div className="research-export-item-desc">.txt file</div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
          {run?.keywords.length ? (
            <div className="research-keywords">
              {run.keywords.map((kw) => (
                <span key={kw} className="research-keyword">{kw}</span>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <div className="research-progress-bar">
              <div className="research-progress-fill" style={{ width: `${readingProgress}%` }} />
            </div>
            <div className={`research-detail-layout ${showToc ? "with-toc" : ""}`}>
        {/* Table of Contents sidebar */}
        {synthesis && (
          <aside className="research-toc">
            <div className="research-toc-header">
              <span className="research-toc-title">Table of Contents</span>
              <button
                className="research-toc-toggle"
                onClick={() => setShowToc(!showToc)}
                aria-label="Toggle table of contents"
              >
                {showToc ? "‹" : "›"}
              </button>
            </div>
            {showToc && (
             <>
              <nav className="research-toc-list">
                {tocItems.map((item) => (
                  <button
                    key={item.id}
                    className={`research-toc-item ${activeSection === item.id ? "active" : ""}`}
                    onClick={() => scrollToSection(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>

              <div className="research-toc-progress">
                <span>{readingProgress}% read</span>
                <div className="research-toc-progress-bar">
                  <div className="research-toc-progress-fill" style={{ width: `${readingProgress}%` }} />
                </div>
              </div>

              <div className="research-toc-kbd-hint">
                <kbd>j</kbd><kbd>k</kbd> nav &middot; <kbd>t</kbd> top &middot; <kbd>b</kbd> bottom
              </div>

             {run && (
               <RelatedRuns
                 runId={run.id}
                 keywords={run.keywords || []}
                 limit={5}
               />
             )}
             </>
            )}
          </aside>
        )}

        <main className="research-detail-main">
        {run?.status === "failed" && run.error && (
          <div className="research-error">
            <strong>Error:</strong> {run.error}
          </div>
        )}

        {synthesis && (
          <>
            <section className="research-section" id="exec-summary">
              <h2
                className="research-section-title collapsible"
                onClick={() => toggleSection("exec-summary")}
              >
                <span className="research-section-collapse-icon">
                  {collapsedSections.has("exec-summary") ? "▸" : "▾"}
                </span>
                Executive Summary
              </h2>
              {!collapsedSections.has("exec-summary") && (
                <>
                  <p className="research-exec-summary"><CitationText text={synthesis.execSummary} onCitationClick={handleCitationClick} /></p>
                  {(run?.keywords?.length ?? 0) > 0 && (
                    <div className="research-kw-cloud-section">
                      <h4 className="research-subsection-title">Keyword Analysis</h4>
                      <KeywordCloud keywords={run?.keywords ?? []} />
                    </div>
                  )}
                </>
              )}
            </section>

            <section className="research-section research-scores-section" id="scores">
              <h2
                className="research-section-title collapsible"
                onClick={() => toggleSection("scores")}
              >
                <span className="research-section-collapse-icon">
                  {collapsedSections.has("scores") ? "▸" : "▾"}
                </span>
                Scores
              </h2>
              {!collapsedSections.has("scores") && (
                <div className="research-scores-visual">
                  <div className="research-gauges">
                    <ScoreGauge value={synthesis.opportunityScore} label="Opportunity" color="#4ade80" />
                    <ScoreGauge value={synthesis.riskScore} label="Risk" color="#f87171" />
                  </div>
                  {synthesis.citations?.length > 0 && (
                    <SourceChart sources={synthesis.citations} />
                  )}
                </div>
              )}
            </section>

            <section className="research-section" id="key-insights">
              <h2
                className="research-section-title collapsible"
                onClick={() => toggleSection("key-insights")}
              >
                <span className="research-section-collapse-icon">
                  {collapsedSections.has("key-insights") ? "▸" : "▾"}
                </span>
                Key Insights ({synthesis.keyInsights.length})
              </h2>
              {!collapsedSections.has("key-insights") && (
              <div className="research-insights">
                {synthesis.keyInsights.map((insight, i) => (
                  <div key={i} className="research-insight-item">
                    <div className="research-insight-header">
                      <span className="research-insight-number">{i + 1}</span>
                      <ConfidenceBadge level={insight.confidence} />
                    </div>
                    <p className="research-insight-text"><CitationText text={insight.insight} onCitationClick={handleCitationClick} /></p>
                    {insight.supportingAgents.length > 0 && (
                      <div className="research-insight-agents">
                        Agents: {insight.supportingAgents.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </section>

            <section className="research-section" id="opportunities">
              <h2
                className="research-section-title collapsible"
                onClick={() => toggleSection("opportunities")}
              >
                <span className="research-section-collapse-icon">
                  {collapsedSections.has("opportunities") ? "▸" : "▾"}
                </span>
                Top Opportunities
              </h2>
              {!collapsedSections.has("opportunities") && (
              <div className="research-cards">
                {synthesis.topThreeOpportunities.map((opp, i) => (
                  <div key={i} className="research-card research-card-opportunity">
                    <div className="research-card-header">
                      <span className="research-card-number">{i + 1}</span>
                      <h3 className="research-card-title">{opp.title}</h3>
                    </div>
                    <p className="research-card-desc"><CitationText text={opp.description} onCitationClick={handleCitationClick} /></p>
                    <div className="research-card-rationale">
                      <strong>Rationale:</strong> <CitationText text={opp.rationale} onCitationClick={handleCitationClick} />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            <section className="research-section" id="risks">
              <h2
                className="research-section-title collapsible"
                onClick={() => toggleSection("risks")}
              >
                <span className="research-section-collapse-icon">
                  {collapsedSections.has("risks") ? "▸" : "▾"}
                </span>
                Top Risks
              </h2>
              {!collapsedSections.has("risks") && (
              <div className="research-cards">
                {synthesis.topThreeRisks.map((risk, i) => (
                  <div key={i} className="research-card research-card-risk">
                    <div className="research-card-header">
                      <span className="research-card-number">{i + 1}</span>
                      <h3 className="research-card-title">{risk.title}</h3>
                    </div>
                    <p className="research-card-desc"><CitationText text={risk.description} onCitationClick={handleCitationClick} /></p>
                    <div className="research-card-mitigation">
                      <strong>Mitigation:</strong> <CitationText text={risk.mitigation} onCitationClick={handleCitationClick} />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            <section className="research-section" id="next-step">
              <h2
                className="research-section-title collapsible"
                onClick={() => toggleSection("next-step")}
              >
                <span className="research-section-collapse-icon">
                  {collapsedSections.has("next-step") ? "▸" : "▾"}
                </span>
                Recommended Next Step
              </h2>
              {!collapsedSections.has("next-step") && (
              <div className="research-next-step">
                {synthesis.recommendedNextStep}
              </div>
              )}
            </section>

            {synthesis.citations && synthesis.citations.length > 0 && (
              <section className="research-section" id="sources">
                <h2
                  className="research-section-title collapsible"
                  onClick={() => toggleSection("sources")}
                >
                  <span className="research-section-collapse-icon">
                    {collapsedSections.has("sources") ? "▸" : "▾"}
                  </span>
                  Sources ({synthesis.citations.length})
                </h2>
                {!collapsedSections.has("sources") && (
                <ul className="research-sources">
                  {synthesis.citations.map((s, i) => (
                    <li key={i}
                    ref={(el) => { sourceRefs.current[i] = el; }}
                    className={`research-source-item ${highlightedSource === i ? "highlighted" : ""}`}
                  >
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="research-source-title">
                        {s.title}
                      </a>
                      {s.snippet && <p className="research-source-snippet">{s.snippet}</p>}
                      {sourceCitationMap.has(i) && (
                        <div className="research-source-cited-in">
                          <span className="cited-in-label">Cited in:</span>
                          {sourceCitationMap.get(i)!.map((section, si) => (
                            <span key={si} className="cited-in-tag">{section}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              </section>
            )}
          </>
        )}

        {!synthesis && run?.result && (
          <section className="research-section" id="result">
            <h2
              className="research-section-title collapsible"
              onClick={() => toggleSection("result")}
            >
              <span className="research-section-collapse-icon">
                {collapsedSections.has("result") ? "▸" : "▾"}
              </span>
              Result
            </h2>
            {!collapsedSections.has("result") && (
            <div className="research-result">
              <pre className="research-result-text">{run.result}</pre>
            </div>
            )}
          </section>
        )}

        <section className="research-section" id="raw-output">
          <button onClick={() => setShowRaw(!showRaw)} className="research-toggle-btn">
            {showRaw ? "Hide" : "Show"} raw output
          </button>
          {showRaw && (
            <div className="research-raw-output">
              <pre>{run?.result}</pre>
            </div>
          )}
        </section>
      </main>
      </div>

      {/* Share dialog */}
      {showShareDialog && (
        <div className="research-modal-overlay" onClick={() => setShowShareDialog(false)}>
          <div className="research-modal research-modal-share" onClick={(e) => e.stopPropagation()}>
            <h3>Share Research</h3>
            {!shareToken ? (
              <>
                <p className="research-modal-desc">
                  Generate a public share link for this research report.
                </p>
                {shareError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg px-3 py-2 mb-2" role="alert">
                    {shareError}
                  </div>
                )}
                <div className="research-modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowShareDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateShare}
                    disabled={shareLoading}
                  >
                    {shareLoading ? "Generating..." : "Generate link"}
                  </button>
                </div>
                <div className="research-share-alt">
                  <span className="research-share-alt-label">Or copy current page link:</span>
                  <button
                    className="btn btn-sm btn-secondary research-copy-link-btn"
                    onClick={handleCopyLink}
                  >
                    📋 Copy link
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="research-share-success">
                  <div className="research-share-success-icon">✓</div>
                  <p>Share link generated!</p>
                </div>
                <div className="research-share-url">
                  <code>{typeof window !== "undefined" ? window.location.origin : ""}/share/{shareToken}</code>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleCopyShareLink}
                  >
                    Copy
                  </button>
                </div>
                <div className="research-modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowShareDialog(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {copySuccess && (
        <div className="research-toast">
          ✓ {copySuccess}
        </div>
      )}

      {/* Save as template dialog */}
      {showTemplateDialog && (
        <div className="research-modal-overlay" onClick={() => setShowTemplateDialog(false)}>
          <div className="research-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Save as Template</h3>
            {templateSaved ? (
              <div className="research-modal-success">
                ✓ Template saved successfully
              </div>
            ) : (
              <>
                <label className="research-modal-label">Template name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="research-modal-input"
                  autoFocus
                />
                <div className="research-modal-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowTemplateDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={confirmSaveAsTemplate}
                    disabled={!templateName.trim()}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
