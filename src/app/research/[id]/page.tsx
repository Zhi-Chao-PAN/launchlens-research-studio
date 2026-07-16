"use client";

/* eslint-disable */

import { use, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { SynthesisOutput, Source, KeyInsight, Opportunity, Risk } from "@/lib/research/synthesis-parser";
import { isRunStarred, toggleStar } from "@/lib/research/starred";
import { listTemplates, createTemplate } from "@/lib/research/templates";
import { DetailHeaderSkeleton, CardSkeleton } from "@/components/skeleton/Skeleton";
import { ActionableError } from "@/components/ui/ActionableError";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { RelatedRuns } from "@/components/related/RelatedRuns";
import { useCommandPalette, type Command } from "@/components/command-palette/CommandPaletteContext";
import { useHotkeys } from "@/lib/hooks/use-hotkeys";
import { TagList } from "@/components/tags/TagList";
import {
  HistoricalDossierPanel,
  resolveHistoricalSynthesis,
} from "@/components/studio/HistoricalDossierPanel";
import { CollapsibleSectionTitle } from "@/components/report/primitives/CollapsibleSectionTitle";
import { SafeExternalLink } from "@/components/report/primitives/SafeExternalLink";
import { ShareButton } from "@/components/report/ShareButton";
import type { ResearchModeId } from "@/lib/research/research-modes";
import type { ResearchDossier } from "@/lib/research/storage";
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
  mode?: ResearchModeId;
  result: string;
  sources?: Source[];
  provider: string;
  model: string;
  createdAt: number;
  durationMs: number;
  status: "completed" | "failed" | "cancelled";
  error?: string;
  dossier?: ResearchDossier;
}

type OutputProfile = "idea" | "founder" | "analyst";
type ExplanationKey =
  | "output-profile"
  | "opportunity-score"
  | "risk-score"
  | "evidence-sources"
  | "citations"
  | "confidence"
  | "agents"
  | "scores"
  | "keywords"
  | "opportunities"
  | "risks"
  | "next-step"
  | "raw-output";

const OUTPUT_PROFILE_STORAGE_KEY = "launchlens:research-output-profile";

const OUTPUT_PROFILES: Array<{
  id: OutputProfile;
  label: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "idea",
    label: "Idea",
    eyebrow: "Plain-language validation",
    description: "For individual builders who need the answer, the risk, and the next move without analyst-heavy detail.",
  },
  {
    id: "founder",
    label: "Founder",
    eyebrow: "Execution-ready brief",
    description: "For early teams that need enough evidence to decide, prioritize, and hand off into GTM execution.",
  },
  {
    id: "analyst",
    label: "Analyst",
    eyebrow: "Full evidence mode",
    description: "For expert reviewers who want scores, citation trails, raw evidence, and all intermediate detail.",
  },
];

function isOutputProfile(value: string | null): value is OutputProfile {
  return value === "idea" || value === "founder" || value === "analyst";
}

const EXPLANATION_COPY: Record<ExplanationKey, { title: string; summary: string; guidance: string }> = {
  "output-profile": {
    title: "Output profile",
    summary: "This changes the report's information density without deleting the underlying evidence.",
    guidance: "Use Idea when you want plain-language validation, Founder when you are preparing execution, and Analyst when you need to audit scores, citations, and assumptions.",
  },
  "opportunity-score": {
    title: "Opportunity signal",
    summary: "A quick read on whether the market, pain, willingness to pay, and channel signals point toward a usable opportunity.",
    guidance: "Treat it as a prioritization aid, not a verdict. A high score still needs interviews, pricing proof, and channel tests before you commit.",
  },
  "risk-score": {
    title: "Risk signal",
    summary: "A compact view of competitive, adoption, pricing, channel, and execution risk visible in the current evidence.",
    guidance: "High risk is not automatically bad. It tells you what must be de-risked first before spending more build time.",
  },
  "evidence-sources": {
    title: "Evidence sources",
    summary: "Sources are the references used to ground the report instead of relying only on model intuition.",
    guidance: "Prefer recent, primary, or domain-specific sources. If sources are weak, use the report as a hypothesis list rather than a decision memo.",
  },
  citations: {
    title: "Citation marker",
    summary: "Citation markers connect a sentence back to a source in the evidence trail.",
    guidance: "Click a citation to jump to the source. If the marker feels important but the source is weak, downgrade your confidence.",
  },
  confidence: {
    title: "Confidence",
    summary: "Confidence describes how strongly the report believes a specific insight is supported by the available evidence.",
    guidance: "Low confidence can still be useful: it often points to the exact question you should validate next.",
  },
  agents: {
    title: "Supporting agents",
    summary: "Agents are specialized analysis passes such as market sizing, competitors, pains, pricing, channels, and synthesis.",
    guidance: "When several agents support the same conclusion, the insight is usually more robust than a single-agent observation.",
  },
  scores: {
    title: "Scores",
    summary: "Scores compress several signals into a quick comparison view.",
    guidance: "Use scores to compare ideas or decide where to dig deeper. Do not present them as precise financial truth.",
  },
  keywords: {
    title: "Keyword analysis",
    summary: "Keywords show the themes the report associated with this research run.",
    guidance: "For non-analyst readers, keywords are usually secondary. For analysts, they help inspect whether the report is focusing on the right market language.",
  },
  opportunities: {
    title: "Top opportunities",
    summary: "These are the most promising product, positioning, or go-to-market openings found in the research.",
    guidance: "In Idea mode, look for one simple next experiment. In Analyst mode, compare each opportunity against evidence and risk.",
  },
  risks: {
    title: "Top risks",
    summary: "These are the failure modes most likely to invalidate the idea or slow execution.",
    guidance: "A good next step usually targets the sharpest risk, not the easiest feature to build.",
  },
  "next-step": {
    title: "Recommended next step",
    summary: "The next step converts the report into one concrete action.",
    guidance: "If the next step is vague, rewrite it as a testable action: who to contact, what to ask, what evidence would change the decision.",
  },
  "raw-output": {
    title: "Raw output",
    summary: "Raw output is the unpolished model/report text before the product UI turns it into sections.",
    guidance: "Keep this for Analyst mode. It is useful for auditing parser mistakes, but too noisy for most readers.",
  },
};

function scoreBand(score: number | null | undefined, positive: boolean): string {
  if (typeof score !== "number" || !Number.isFinite(score)) return "Not enough signal yet";
  if (positive) {
    if (score >= 75) return "Strong signal";
    if (score >= 55) return "Promising but needs proof";
    return "Weak or early signal";
  }
  if (score >= 70) return "High risk";
  if (score >= 45) return "Manageable risk";
  return "Low visible risk";
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
  const { t } = useLocale();
  const cls = `confidence-badge confidence-${level}`;
  const label = level === "high" ? t("report.confidence.high")
    : level === "medium" ? t("report.confidence.medium")
    : t("report.confidence.low");
  return <span className={cls}>{label}</span>;
}

function AnalysisCompanion({
  entry,
  profileLabel,
}: {
  entry: { title: string; summary: string; guidance: string };
  profileLabel: string;
}) {
  const { t } = useLocale();
  return (
    <section
      className="mt-4 rounded-2xl border border-stone-200 bg-[#fbfaf6] p-4 text-left shadow-[0_18px_55px_-48px_rgba(15,23,42,0.5)]"
      aria-live="polite"
      aria-label={t("report.analysisCompanion")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          {t("report.analysisCompanion")}
        </p>
        <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-600">
          {profileLabel}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold tracking-[-0.01em] text-slate-950">
        {entry.title}
      </h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">{entry.summary}</p>
      <p className="mt-3 rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-2 text-xs leading-5 text-teal-950">
        {entry.guidance}
      </p>
    </section>
  );
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
function CitationText({
  text,
  onCitationClick,
  onCitationHover,
}: {
  text: string;
  onCitationClick: (index: number) => void;
  onCitationHover?: () => void;
}) {
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
        onMouseEnter={onCitationHover}
        onFocus={onCitationHover}
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


export default function ResearchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: queryId } = use(params);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [synthesis, setSynthesis] = useState<SynthesisOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [outputProfile, setOutputProfile] = useState<OutputProfile>("founder");
  const [activeExplanationKey, setActiveExplanationKey] = useState<ExplanationKey>("output-profile");
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
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const router = useRouter();
  const { t } = useLocale();
  const [isRunning, setIsRunning] = useState(false);

  const showToast = useCallback((msg: string) => {
    setCopySuccess(msg);
    setTimeout(() => setCopySuccess(null), 2000);
  }, []);

  const activeOutputProfile = OUTPUT_PROFILES.find((profile) => profile.id === outputProfile) ?? OUTPUT_PROFILES[1];
  const activeExplanation = EXPLANATION_COPY[activeExplanationKey];
  const isIdeaProfile = outputProfile === "idea";
  const isAnalystProfile = outputProfile === "analyst";
  const canDistributeReport = run?.status === "completed";

  // Handle add to compare
  const handleAddToCompare = useCallback(() => {
    if (!run || run.status !== "completed") return;
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
      const res = await fetch(`/api/research/runs/${queryId}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Research run not found. It may have expired or been deleted.");
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json() as ResearchRun;
      setRun(data);
      setSynthesis(resolveHistoricalSynthesis(data.dossier, data.result));
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
      // Check star status after load
      setIsStarred(isRunStarred(queryId));
    }
  }

  useEffect(() => {
    loadRun();
  }, [queryId]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OUTPUT_PROFILE_STORAGE_KEY);
      if (isOutputProfile(saved)) {
        setOutputProfile(saved);
      }
    } catch {
      // Ignore storage failures; founder mode is the safe middle default.
    }
  }, []);

  const handleOutputProfileChange = useCallback((profile: OutputProfile) => {
    setOutputProfile(profile);
    setActiveExplanationKey("output-profile");
    if (profile !== "analyst") {
      setShowRaw(false);
    }
    try {
      localStorage.setItem(OUTPUT_PROFILE_STORAGE_KEY, profile);
    } catch {
      // Non-critical preference persistence.
    }
  }, []);

  const activateExplanation = useCallback((key: ExplanationKey) => {
    setActiveExplanationKey(key);
  }, []);

  

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

  const handleExport = useCallback(async (format: "md" | "json" | "txt" | "pdf") => {
    if (!run || run.status !== "completed") return;

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
    showToast(t("report.exportedToast", { format: format.toUpperCase() }));
  }, [run, showToast, synthesis, t]);

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
    const newState = toggleStar(queryId);
    setIsStarred(newState);
  }, [queryId]);

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

  const handleCopyMarkdown = useCallback(async () => {
    if (!run || run.status !== "completed") return;
    const md = buildMarkdown(run, synthesis);
    try {
      await navigator.clipboard.writeText(md);
      showToast(t("report.reportCopied"));
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = md;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      showToast(t("report.reportCopied"));
    }
  }, [run, synthesis, showToast, t]);

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

  const visibleInsights = useMemo(() => {
    if (!synthesis?.keyInsights) return [];
    return isIdeaProfile ? synthesis.keyInsights.slice(0, 3) : synthesis.keyInsights;
  }, [isIdeaProfile, synthesis]);

  const visibleOpportunities = useMemo(() => {
    if (!synthesis?.topThreeOpportunities) return [];
    return isIdeaProfile ? synthesis.topThreeOpportunities.slice(0, 2) : synthesis.topThreeOpportunities;
  }, [isIdeaProfile, synthesis]);

  const visibleRisks = useMemo(() => {
    if (!synthesis?.topThreeRisks) return [];
    return isIdeaProfile ? synthesis.topThreeRisks.slice(0, 2) : synthesis.topThreeRisks;
  }, [isIdeaProfile, synthesis]);

  const visibleCitations = useMemo(() => {
    if (!synthesis?.citations) return [];
    return isAnalystProfile ? synthesis.citations : synthesis.citations.slice(0, 6);
  }, [isAnalystProfile, synthesis]);

  // Build table of contents from available sections
  const tocItems = useMemo(() => {
    const items: { id: string; label: string }[] = [];
    if (synthesis) {
      items.push({ id: "exec-summary", label: t("report.tocExecSummary") });
      if (!isIdeaProfile) {
        items.push({ id: "scores", label: t("report.tocScores") });
      }
      if (visibleInsights.length) {
        items.push({ id: "key-insights", label: t("report.tocKeyInsights", { n: visibleInsights.length }) });
      }
      items.push({ id: "opportunities", label: t("report.tocOpportunities") });
      items.push({ id: "risks", label: t("report.tocRisks") });
      items.push({ id: "next-step", label: t("report.tocNextStep") });
      if (synthesis.citations?.length) {
        items.push({ id: "sources", label: t("report.tocSources", { n: visibleCitations.length }) + (isAnalystProfile ? "" : "+") });
      }
    } else if (run?.result) {
      items.push({ id: "result", label: t("report.tocResult") });
    }
    if (isAnalystProfile) {
      items.push({ id: "raw-output", label: t("report.tocRawOutput") });
    }
    return items;
  }, [isAnalystProfile, isIdeaProfile, run, synthesis, t, visibleCitations.length, visibleInsights.length]);

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
    if (!isAnalystProfile && sourceIndex >= visibleCitations.length) {
      handleOutputProfileChange("analyst");
    }
    setCollapsedSections((prev) => {
      if (!prev.has("sources")) return prev;
      const next = new Set(prev);
      next.delete("sources");
      return next;
    });
    // Scroll to sources section first
    window.setTimeout(() => {
      const sourcesSection = document.getElementById("sources");
      if (sourcesSection) {
        sourcesSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 50);
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
  }, [handleOutputProfileChange, isAnalystProfile, visibleCitations.length]);

  // Register detail page commands
  useEffect(() => {
    if (!run) return;

    const commands: Command[] = [
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
        action: () => router.push("/history"),
      },
    ];

    if (canDistributeReport) {
      commands.splice(2, 0,
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
      );
    }

    const unregister = registerCommands(commands);

    return unregister;
  }, [run, canDistributeReport, registerCommands, router, handleToggleStar, handleRerun, handleExport, handleCopyMarkdown, handleSaveAsTemplate]);

  // Keyboard shortcuts for detail page
  useHotkeys("s", handleToggleStar, { ignoreInputs: true, scope: "detail", enabled: !!run });
  useHotkeys("r", handleRerun, { ignoreInputs: true, scope: "detail", enabled: !!run && !isRunning });
  useHotkeys("e", () => handleExport("md"), { ignoreInputs: true, scope: "detail", enabled: canDistributeReport });
  useHotkeys("c", handleCopyMarkdown, { ignoreInputs: true, scope: "detail", enabled: canDistributeReport });
  useHotkeys("b", () => router.push("/history"), { ignoreInputs: true, scope: "detail" });

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
          <ActionableError
            variant="info"
            role="status"
            title={t("errors.notFoundTitle")}
            detail={
              <>
                <p>{error}</p>
                <p className="mt-1 opacity-90">{t("errors.notFoundHint")}</p>
              </>
            }
            actions={[
              { label: t("common.backToHistory"), onClick: () => router.push("/history") },
              { label: t("common.backToStudio"), onClick: () => router.push("/"), variant: "secondary" },
            ]}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="research-detail">
      <header className="research-detail-header">
        <div className="research-detail-header-inner">
          <Link href="/history" className="research-back-link">{t("report.backLink")}</Link>
          <p className="research-detail-kicker">{t("report.kicker")}</p>
          <h1 className="research-detail-title">{run?.query}</h1>
          <p className="research-detail-subtitle">
            {t("report.subtitle")}
          </p>
    <div className="research-detail-tags">
            <TagList runId={queryId} />
          </div>
          <div className="research-detail-meta">
            <span className={`research-status research-status-${run?.status}`}>
              {run?.status === "completed"
                ? t("report.statusCompleted")
                : run?.status === "cancelled"
                  ? t("report.statusCancelled")
                  : t("report.statusFailed")}
            </span>
            <span className="research-provider">{run?.provider} / {run?.model}</span>
            <span className="research-time">{run ? formatTime(run.createdAt) : ""}</span>
            <span className="research-duration">{run ? formatDuration(run.durationMs) : ""}</span>
            <button
              onClick={handleToggleStar}
              className={`research-star-btn ${isStarred ? "starred" : ""}`}
              aria-label={isStarred ? t("report.unstar") : t("report.star")}
            >
              {isStarred ? t("report.starred") : t("report.star")}
            </button>
            <button onClick={handleRerun} className="research-action-btn">
              {t("report.rerun")}
            </button>
            <button onClick={handleSaveAsTemplate} className="research-action-btn">
              {t("report.saveAsTemplate")}
            </button>
            {canDistributeReport && (
              <>
                <ShareButton
                  sessionId={run.id}
                  label={t("report.share")}
                  variant="plain"
                  className="research-action-btn"
                  open={showShareDialog}
                  onOpenChange={setShowShareDialog}
                  report={{
                    query: run.query,
                    keywords: run.keywords,
                    createdAt: run.createdAt,
                    synthesis,
                  }}
                />
                <button onClick={handleCopyMarkdown} className="research-action-btn">
                  {t("report.copyMarkdown")}
                </button>
                <button onClick={handleAddToCompare} className="research-action-btn">
                  {t("report.compare")}
                  {compareCount > 0 && <span className="research-action-badge">{compareCount}</span>}
                </button>
                <div className="research-export-menu" ref={exportMenuRef}>
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                className="research-export-btn research-export-toggle"
              >
                <span>{t("report.export")}</span>
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
                      <div className="research-export-item-title">{t("report.exportMd")}</div>
                      <div className="research-export-item-desc">{t("report.exportMdDesc")}</div>
                    </div>
                    <kbd className="research-export-shortcut">E</kbd>
                  </button>
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("pdf")}
                  >
                    <span className="research-export-item-icon">📄</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">{t("report.exportPdf")}</div>
                      <div className="research-export-item-desc">{t("report.exportPdfDesc")}</div>
                    </div>
                  </button>
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("json")}
                  >
                    <span className="research-export-item-icon">📋</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">{t("report.exportJson")}</div>
                      <div className="research-export-item-desc">{t("report.exportJsonDesc")}</div>
                    </div>
                  </button>
                  <button
                    className="research-export-item"
                    onClick={() => handleExport("txt")}
                  >
                    <span className="research-export-item-icon">📃</span>
                    <div className="research-export-item-body">
                      <div className="research-export-item-title">{t("report.exportTxt")}</div>
                      <div className="research-export-item-desc">{t("report.exportTxtDesc")}</div>
                    </div>
                  </button>
                </div>
              )}
                </div>
              </>
            )}
          </div>
          {run?.keywords.length ? (
            <div className="research-keywords">
              {run.keywords.map((kw) => (
                <span key={kw} className="research-keyword">{kw}</span>
              ))}
            </div>
          ) : null}
          {canDistributeReport && (
          <section
            className="mt-5 rounded-2xl border border-stone-200 bg-[#fbfaf6]/90 p-4 shadow-[0_18px_60px_-52px_rgba(15,23,42,0.45)]"
            aria-label="Report output profile"
            onMouseEnter={() => activateExplanation("output-profile")}
            onFocus={() => activateExplanation("output-profile")}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  {t("report.outputProfileLabel")}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-slate-950">
                  {activeOutputProfile.eyebrow}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {activeOutputProfile.description}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Choose report output profile">
                {OUTPUT_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => handleOutputProfileChange(profile.id)}
                    aria-pressed={outputProfile === profile.id}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                      outputProfile === profile.id
                        ? "bg-slate-950 text-white ring-slate-950 shadow-md shadow-slate-200"
                        : "bg-white/80 text-slate-600 ring-stone-200 hover:text-teal-800 hover:ring-teal-200"
                    }`}
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
            </div>
            {synthesis && (
              <div className="mt-4 grid gap-3 border-t border-stone-200 pt-4 sm:grid-cols-3">
                <div
                  className="rounded-xl border border-stone-200 bg-white/75 p-3"
                  tabIndex={0}
                  onMouseEnter={() => activateExplanation("opportunity-score")}
                  onFocus={() => activateExplanation("opportunity-score")}
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {t("report.opportunityLabel")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {scoreBand(synthesis.opportunityScore, true)}
                  </p>
                </div>
                <div
                  className="rounded-xl border border-stone-200 bg-white/75 p-3"
                  tabIndex={0}
                  onMouseEnter={() => activateExplanation("risk-score")}
                  onFocus={() => activateExplanation("risk-score")}
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {t("report.riskLabel")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {scoreBand(synthesis.riskScore, false)}
                  </p>
                </div>
                <div
                  className="rounded-xl border border-stone-200 bg-white/75 p-3"
                  tabIndex={0}
                  onMouseEnter={() => activateExplanation("evidence-sources")}
                  onFocus={() => activateExplanation("evidence-sources")}
                >
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {t("report.evidenceLabel")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {isAnalystProfile
                      ? `${synthesis.citations.length} ${t("report.sourcesUnit")}`
                      : t("report.sourcesShown", { n: visibleCitations.length })}
                  </p>
                </div>
              </div>
            )}
          </section>
          )}
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
              <span className="research-toc-title">{t("report.tocTitle")}</span>
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
                <span>{t("report.readingProgress", { pct: readingProgress })}</span>
                <div className="research-toc-progress-bar">
                  <div className="research-toc-progress-fill" style={{ width: `${readingProgress}%` }} />
                </div>
              </div>

              <div className="research-toc-kbd-hint">
                {t("report.kbNavHint")}
              </div>

              <AnalysisCompanion
                entry={activeExplanation}
                profileLabel={activeOutputProfile.label}
              />

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
          <ActionableError
            variant="error"
            className="mb-4"
            title={t("errors.failedRunTitle")}
            detail={
              <>
                <p>{run.error}</p>
                <p className="mt-1 opacity-90">{t("errors.failedRunHint")}</p>
              </>
            }
            actions={[
              { label: t("common.retry"), onClick: handleRerun },
              { label: t("common.startNew"), onClick: () => router.push("/"), variant: "secondary" },
            ]}
          />
        )}

        {run?.dossier && (
          <HistoricalDossierPanel
            key={run.id}
            dossier={run.dossier}
            mode={run.mode}
            status={run.status}
            fallbackProvider={run.provider}
          />
        )}

        {synthesis && (
          <>
            <section className="research-section" id="exec-summary">
              <CollapsibleSectionTitle
                controls="exec-summary-content"
                expanded={!collapsedSections.has("exec-summary")}
                onToggle={() => toggleSection("exec-summary")}
                onMouseEnter={() => activateExplanation("output-profile")}
                onFocus={() => activateExplanation("output-profile")}
              >
                {t("report.tocExecSummary")}
              </CollapsibleSectionTitle>
              {!collapsedSections.has("exec-summary") && (
                <div id="exec-summary-content">
                  <p className="research-exec-summary">
                    <CitationText
                      text={synthesis.execSummary}
                      onCitationClick={handleCitationClick}
                      onCitationHover={() => activateExplanation("citations")}
                    />
                  </p>
                  {!isIdeaProfile && (run?.keywords?.length ?? 0) > 0 && (
                    <div className="research-kw-cloud-section">
                      <h4
                        className="research-subsection-title"
                        tabIndex={0}
                        onMouseEnter={() => activateExplanation("keywords")}
                        onFocus={() => activateExplanation("keywords")}
                      >
                        {t("report.keywordAnalysis")}
                      </h4>
                      <KeywordCloud keywords={run?.keywords ?? []} />
                    </div>
                  )}
                </div>
              )}
            </section>

            {!isIdeaProfile && (
            <section className="research-section research-scores-section" id="scores">
                <CollapsibleSectionTitle
                  controls="scores-content"
                  expanded={!collapsedSections.has("scores")}
                  onToggle={() => toggleSection("scores")}
                  onMouseEnter={() => activateExplanation("scores")}
                  onFocus={() => activateExplanation("scores")}
                >
                  {t("report.tocScores")}
                </CollapsibleSectionTitle>
              {!collapsedSections.has("scores") && (
                <div id="scores-content" className="research-scores-visual">
                  <div
                    className="research-gauges"
                    onMouseEnter={() => activateExplanation("scores")}
                    onFocus={() => activateExplanation("scores")}
                  >
                    <ScoreGauge value={synthesis.opportunityScore} label={t("report.opportunityLabel")} color="#4ade80" />
                    <ScoreGauge value={synthesis.riskScore} label={t("report.riskLabel")} color="#f87171" />
                  </div>
                  {isAnalystProfile && synthesis.citations?.length > 0 && (
                    <SourceChart sources={synthesis.citations} />
                  )}
                </div>
              )}
            </section>
            )}

            <section className="research-section" id="key-insights">
              <CollapsibleSectionTitle
                controls="key-insights-content"
                expanded={!collapsedSections.has("key-insights")}
                onToggle={() => toggleSection("key-insights")}
                onMouseEnter={() => activateExplanation("confidence")}
                onFocus={() => activateExplanation("confidence")}
              >
                {t("report.tocKeyInsights", { n: visibleInsights.length })}
              </CollapsibleSectionTitle>
              {!collapsedSections.has("key-insights") && (
              <div id="key-insights-content" className="research-insights">
                {visibleInsights.map((insight, i) => (
                  <div key={i} className="research-insight-item">
                    <div className="research-insight-header">
                      <span className="research-insight-number">{i + 1}</span>
                      {!isIdeaProfile && (
                        <span
                          tabIndex={0}
                          onMouseEnter={() => activateExplanation("confidence")}
                          onFocus={() => activateExplanation("confidence")}
                        >
                          <ConfidenceBadge level={insight.confidence} />
                        </span>
                      )}
                    </div>
                    <p className="research-insight-text">
                      <CitationText
                        text={insight.insight}
                        onCitationClick={handleCitationClick}
                        onCitationHover={() => activateExplanation("citations")}
                      />
                    </p>
                    {!isIdeaProfile && insight.supportingAgents.length > 0 && (
                      <div
                        className="research-insight-agents"
                        tabIndex={0}
                        onMouseEnter={() => activateExplanation("agents")}
                        onFocus={() => activateExplanation("agents")}
                      >
                        Agents: {insight.supportingAgents.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </section>

            <section className="research-section" id="opportunities">
              <CollapsibleSectionTitle
                controls="opportunities-content"
                expanded={!collapsedSections.has("opportunities")}
                onToggle={() => toggleSection("opportunities")}
                onMouseEnter={() => activateExplanation("opportunities")}
                onFocus={() => activateExplanation("opportunities")}
              >
                {t("report.tocOpportunities")}
              </CollapsibleSectionTitle>
              {!collapsedSections.has("opportunities") && (
              <div id="opportunities-content" className="research-cards">
                {visibleOpportunities.map((opp, i) => (
                  <div key={i} className="research-card research-card-opportunity">
                    <div className="research-card-header">
                      <span className="research-card-number">{i + 1}</span>
                      <h3 className="research-card-title">{opp.title}</h3>
                    </div>
                    <p className="research-card-desc">
                      <CitationText
                        text={opp.description}
                        onCitationClick={handleCitationClick}
                        onCitationHover={() => activateExplanation("citations")}
                      />
                    </p>
                    <div className="research-card-rationale">
                      <strong>{t("report.rationale")}</strong>{" "}
                      <CitationText
                        text={opp.rationale}
                        onCitationClick={handleCitationClick}
                        onCitationHover={() => activateExplanation("citations")}
                      />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            <section className="research-section" id="risks">
              <CollapsibleSectionTitle
                controls="risks-content"
                expanded={!collapsedSections.has("risks")}
                onToggle={() => toggleSection("risks")}
                onMouseEnter={() => activateExplanation("risks")}
                onFocus={() => activateExplanation("risks")}
              >
                {t("report.tocRisks")}
              </CollapsibleSectionTitle>
              {!collapsedSections.has("risks") && (
              <div id="risks-content" className="research-cards">
                {visibleRisks.map((risk, i) => (
                  <div key={i} className="research-card research-card-risk">
                    <div className="research-card-header">
                      <span className="research-card-number">{i + 1}</span>
                      <h3 className="research-card-title">{risk.title}</h3>
                    </div>
                    <p className="research-card-desc">
                      <CitationText
                        text={risk.description}
                        onCitationClick={handleCitationClick}
                        onCitationHover={() => activateExplanation("citations")}
                      />
                    </p>
                    <div className="research-card-mitigation">
                      <strong>{t("report.mitigation")}</strong>{" "}
                      <CitationText
                        text={risk.mitigation}
                        onCitationClick={handleCitationClick}
                        onCitationHover={() => activateExplanation("citations")}
                      />
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            <section className="research-section" id="next-step">
              <CollapsibleSectionTitle
                controls="next-step-content"
                expanded={!collapsedSections.has("next-step")}
                onToggle={() => toggleSection("next-step")}
                onMouseEnter={() => activateExplanation("next-step")}
                onFocus={() => activateExplanation("next-step")}
              >
                {t("report.tocNextStep")}
              </CollapsibleSectionTitle>
              {!collapsedSections.has("next-step") && (
              <div id="next-step-content" className="research-next-step">
                {synthesis.recommendedNextStep}
              </div>
              )}
            </section>

            {synthesis.citations && synthesis.citations.length > 0 && (
              <section className="research-section" id="sources">
                <CollapsibleSectionTitle
                  controls="sources-content"
                  expanded={!collapsedSections.has("sources")}
                  onToggle={() => toggleSection("sources")}
                  onMouseEnter={() => activateExplanation("evidence-sources")}
                  onFocus={() => activateExplanation("evidence-sources")}
                >
                  {t("report.tocSources", { n: visibleCitations.length })}{isAnalystProfile ? "" : "+"}
                </CollapsibleSectionTitle>
                {!collapsedSections.has("sources") && (
                <div id="sources-content">
                {!isAnalystProfile && synthesis.citations.length > visibleCitations.length && (
                  <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-700">
                    {t("report.sourcesNoticeFull", { n: visibleCitations.length })}
                  </div>
                )}
                <ul className="research-sources">
                  {visibleCitations.map((s, i) => (
                    <li key={i}
                    ref={(el) => { sourceRefs.current[i] = el; }}
                    className={`research-source-item ${highlightedSource === i ? "highlighted" : ""}`}
                    tabIndex={0}
                    onMouseEnter={() => activateExplanation("evidence-sources")}
                    onFocus={() => activateExplanation("evidence-sources")}
                  >
                      <SafeExternalLink href={s.url} className="research-source-title">
                        {s.title}
                      </SafeExternalLink>
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
                </div>
              )}
              </section>
            )}
          </>
        )}

        {!synthesis && run?.result && (
          <section className="research-section" id="result">
            <CollapsibleSectionTitle
              controls="result-content"
              expanded={!collapsedSections.has("result")}
              onToggle={() => toggleSection("result")}
            >
              {t("report.tocResult")}
            </CollapsibleSectionTitle>
            {!collapsedSections.has("result") && (
            <div id="result-content" className="research-result">
              <pre className="research-result-text">{run.result}</pre>
            </div>
            )}
          </section>
        )}

        {isAnalystProfile && (
          <section
            className="research-section"
            id="raw-output"
            onMouseEnter={() => activateExplanation("raw-output")}
            onFocus={() => activateExplanation("raw-output")}
          >
            <button onClick={() => setShowRaw(!showRaw)} className="research-toggle-btn">
              {showRaw ? t("report.hideRawOutput") : t("report.showRawOutput")}
            </button>
            {showRaw && (
              <div className="research-raw-output">
                <pre>{run?.result}</pre>
              </div>
            )}
          </section>
        )}
      </main>
      </div>

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
            <h3>{t("report.templateTitle")}</h3>
            {templateSaved ? (
              <div className="research-modal-success">
                {t("report.templateSaved")}
              </div>
            ) : (
              <>
                <label className="research-modal-label">{t("report.templateNameLabel")}</label>
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
                    {t("common.cancel")}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={confirmSaveAsTemplate}
                    disabled={!templateName.trim()}
                  >
                    {t("common.save")}
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
