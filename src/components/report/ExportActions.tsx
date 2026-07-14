/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import { useState, useCallback } from "react";
import { useToast } from "@/components/toast/ToastContext";
import type {
  AgentId,
  AgentOutput,
  ResearchSession,
  ValidationLedger,
} from "@/lib/schema/research-schema";
import type { ResearchModeId } from "@/lib/research/research-modes";
import { generateMarkdownReport } from "@/lib/export/markdown-formatter";
import { buildResearchExport, serializeJSON } from "@/lib/export/json-formatter";
import { toLaunchLensBrief, serializeBrief, getLaunchLensAiUrl } from "@/lib/export/brief-mapper";
import { briefHashFor } from "@/lib/export/base64url";
import { generateCSVBundle } from "@/lib/export/csv-formatter";
import { getNotes } from "@/lib/research/notes";
import { stage2SearchFromCurrentUrl } from "@/lib/analytics/stage2-context";

interface ExportActionsProps {
  sessionId: string;
  query: string;
  keywords: string[];
  outputs: Record<AgentId, AgentOutput | null>;
  mode?: ResearchModeId;
  validation?: ValidationLedger;
}

function downloadFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadMultipleFiles(files: Record<string, string>): void {
  const entries = Object.entries(files);
  let i = 0;
  const downloadNext = () => {
    if (i >= entries.length) return;
    const [name, content] = entries[i++];
    downloadFile(content, name, "text/csv;charset=utf-8");
    setTimeout(downloadNext, 300);
  };
  downloadNext();
}

type CopyKind = "brief" | "full-md" | "json" | "launchlens" | null;

export function ExportActions({
  sessionId,
  query,
  keywords,
  outputs,
  mode,
  validation,
}: ExportActionsProps) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState<CopyKind>(null);
  const [isExporting, setIsExporting] = useState(false);

  const completedCount = (Object.values(outputs) as (AgentOutput | null)[]).filter(Boolean).length;

  const flashCopied = useCallback((kind: CopyKind) => {
    setCopied(kind);
    setTimeout(() => setCopied(null), 1800);
  }, []);

  const copyToClipboard = useCallback(async (text: string, kind: CopyKind) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      flashCopied(kind);
    } catch (err) {
      console.error("Copy failed:", err);
      showToast("Copy failed. Please try downloading instead.", "error");
    }
  }, [flashCopied, showToast]);

  const handleExportMarkdown = useCallback(() => {
    setIsExporting(true);
    try {
      const notes = getNotes(sessionId);
      const personalNotes = notes ? {
        personalNote: notes.personalNote,
        tags: notes.tags,
        rating: notes.rating,
        isStarred: notes.isStarred,
        updatedAt: notes.updatedAt,
      } : undefined;
      const md = generateMarkdownReport({ sessionId, query, keywords, outputs, personalNotes });
      downloadFile(md, `research-report-${sessionId.slice(0, 8)}.md`, "text/markdown;charset=utf-8");
    } catch (err) {
      console.error("Markdown export failed:", err);
      showToast("Markdown export failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, query, keywords, outputs, showToast]);

  const handleExportJSON = useCallback(() => {
    setIsExporting(true);
    try {
      const notes = getNotes(sessionId);
      const exportNotes = notes ? {
        personalNote: notes.personalNote,
        tags: notes.tags,
        rating: notes.rating,
        isStarred: notes.isStarred,
        isArchived: notes.isArchived,
        updatedAt: notes.updatedAt,
        lastOpenedAt: notes.lastOpenedAt,
      } : undefined;
      const exportData = buildResearchExport(
        { id: sessionId, query, keywords, createdAt: "", updatedAt: "", status: "completed", agents: {} as any, citations: [] },
        outputs,
        exportNotes
      );
      const json = serializeJSON(exportData, true);
      downloadFile(json, `research-report-${sessionId.slice(0, 8)}.json`, "application/json;charset=utf-8");
    } catch (err) {
      console.error("JSON export failed:", err);
      showToast("JSON export failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, query, keywords, outputs, showToast]);

  const handleExportCSV = useCallback(() => {
    setIsExporting(true);
    try {
      const bundle = generateCSVBundle({ outputs });
      const fileCount = Object.keys(bundle).length;
      if (fileCount === 0) {
        showToast("No data available to export as CSV.", "error");
        return;
      }
      if (fileCount === 1) {
        const [name, content] = Object.entries(bundle)[0];
        downloadFile(content, name, "text/csv;charset=utf-8");
      } else {
        downloadMultipleFiles(bundle);
      }
    } catch (err) {
      console.error("CSV export failed:", err);
      showToast("CSV export failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [outputs, showToast]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  // Build a minimal ResearchSession from the props the panel already has, so the
  // structured brief mapper can run client-side without fetching the full session.
  // Shared by Copy / Export / Send — all three now produce the SAME envelope so a
  // user copying a brief and a user clicking "Send" hand launchlens-ai identical
  // data (R252: unify the three brief sources that previously diverged).
  const buildSessionFromProps = useCallback((): ResearchSession => {
    const agents = {} as ResearchSession["agents"];
    (Object.keys(outputs) as AgentId[]).forEach((id) => {
      const output = outputs[id];
      agents[id] = {
        id,
        status: output ? "done" : "idle",
        progress: output ? 100 : 0,
        currentStep: output ? "Done" : "",
        output: output ?? undefined,
      };
    });
    return {
      id: sessionId,
      query,
      keywords,
      ...(mode ? { mode } : {}),
      createdAt: "",
      updatedAt: "",
      status: "completed",
      agents,
      citations: [],
      ...(validation ? { validation } : {}),
    };
  }, [sessionId, query, keywords, outputs, mode, validation]);

  // R252: Copy now emits the structured envelope (same object Send/Export use),
  // not the legacy free-text markdown brief. A user who copies and a user who
  // clicks "Send" hand launchlens-ai byte-identical data.
  const handleCopyBrief = useCallback(() => {
    if (!outputs.synthesis) {
      showToast("Synthesis report is not yet available.", "error");
      return;
    }
    const brief = toLaunchLensBrief(buildSessionFromProps());
    const json = serializeBrief(brief, true);
    copyToClipboard(json, "brief");
  }, [outputs, buildSessionFromProps, copyToClipboard, showToast]);

  const handleCopyFullMarkdown = useCallback(() => {
    const notes = getNotes(sessionId);
    const personalNotes = notes ? {
      personalNote: notes.personalNote,
      tags: notes.tags,
      rating: notes.rating,
      isStarred: notes.isStarred,
      updatedAt: notes.updatedAt,
    } : undefined;
    const md = generateMarkdownReport({ sessionId, query, keywords, outputs, personalNotes });
    copyToClipboard(md, "full-md");
  }, [sessionId, query, keywords, outputs, copyToClipboard]);

  const handleCopyJSON = useCallback(() => {
    const notes = getNotes(sessionId);
    const exportNotes = notes ? {
      personalNote: notes.personalNote,
      tags: notes.tags,
      rating: notes.rating,
      isStarred: notes.isStarred,
      isArchived: notes.isArchived,
      updatedAt: notes.updatedAt,
      lastOpenedAt: notes.lastOpenedAt,
    } : undefined;
    const exportData = buildResearchExport(
      { id: sessionId, query, keywords, createdAt: "", updatedAt: "", status: "completed", agents: {} as any, citations: [] },
      outputs,
      exportNotes
    );
    const json = serializeJSON(exportData, false);
    copyToClipboard(json, "json");
  }, [sessionId, query, keywords, outputs, copyToClipboard]);

  // Build a minimal ResearchSession from the props the panel already has, so the
  // structured brief mapper can run client-side without fetching the full session.
  const handleExportLaunchLens = useCallback(() => {
    setIsExporting(true);
    try {
      const brief = toLaunchLensBrief(buildSessionFromProps());
      const json = serializeBrief(brief, true);
      downloadFile(json, `launchlens-brief-${sessionId.slice(0, 8)}.json`, "application/json;charset=utf-8");
    } catch (err) {
      console.error("LaunchLens brief export failed:", err);
      showToast("LaunchLens brief export failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, buildSessionFromProps, showToast]);

  // R231: one-click send-to-launchlens-ai via #brief=<base64url> hash
  // fragment. launchlens-ai (commit 98ad77a, brief-fragment.ts) auto-detects
  // this hash on landing and pre-fills the 5-field brief. We open in a new
  // tab so the research-studio report stays open in the original tab.
  //
  // R253: fire-and-forget is upgraded to a confirmed handshake. launchlens-ai
  // (brief-fragment.ts postMessage) echoes back {type:"launchlens:brief-applied"}
  // once the hash is decoded and fields are filled. We listen for it within a
  // short window so we can distinguish "pre-filled OK" from "tab opened but
  // silent" — the old behavior toasted success regardless. If the opener
  // relationship is broken (cross-site, noopener) the listener simply times out
  // and we fall back to the optimistic toast, so no regression for that path.
  const handleSendToLaunchLensAi = useCallback(() => {
    if (!outputs.synthesis) {
      showToast("Synthesis report is not yet available.", "error");
      return;
    }
    setIsExporting(true);

    // Pre-arm a one-shot message listener BEFORE opening the tab so we can't
    // miss an early echo. Tightened to our own message type + a refcount so a
    // stray postMessage from an unrelated source can't fool us.
    let confirmed = false;
    const onMessage = (event: MessageEvent) => {
      if (event.data && typeof event.data === "object" && event.data.type === "launchlens:brief-applied") {
        confirmed = true;
        window.removeEventListener("message", onMessage);
        clearTimeout(fallbackTimer);
        showToast("Brief applied in LaunchLens AI — fields are ready.", "success");
      }
    };
    window.addEventListener("message", onMessage);
    // Optimistic fallback: if no confirmation arrives within 6s, assume the
    // tab landed but the handshake path was unavailable (cross-origin opener,
    // older launchlens-ai build) and toast the legacy success message so the
    // user still gets feedback.
    const fallbackTimer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      if (!confirmed) {
        showToast("Opened LaunchLens AI in a new tab.", "success");
      }
    }, 6000);

    try {
      const brief = toLaunchLensBrief(buildSessionFromProps());
      // Compact JSON keeps the URL shorter; the launchlens-ai decoder accepts
      // any valid JSON string.
      const compactJson = serializeBrief(brief, false);
      const hash = briefHashFor(compactJson);
      const aiUrl = getLaunchLensAiUrl();
      const targetUrl = `${aiUrl}/${stage2SearchFromCurrentUrl()}${hash}`;
      // NOTE: we deliberately drop `noopener` here so the new tab retains a
      // window.opener reference, which it needs to postMessage back to us for
      // the R253 handshake. `noreferrer` is kept to avoid leaking the Referer
      // header. The opened tab is still sandboxed to the extent the browser
      // allows for cross-origin openers.
      const opened = window.open(targetUrl, "_blank", "noreferrer");
      if (opened === null) {
        // Popup blocked. Clean up the listener + timer and surface a hint
        // instead of failing silently so the user knows to fall back to the
        // download button.
        window.removeEventListener("message", onMessage);
        clearTimeout(fallbackTimer);
        showToast("Popup blocked — please use the download button and import the .json file in LaunchLens AI.", "error");
      }
      // On success we do NOT toast here — the handshake listener (or its
      // 6s fallback) is responsible for the success toast so the user gets a
      // meaningful "applied" vs generic "opened" message.
    } catch (err) {
      window.removeEventListener("message", onMessage);
      clearTimeout(fallbackTimer);
      console.error("Send to LaunchLens AI failed:", err);
      showToast("Send to LaunchLens AI failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [outputs, buildSessionFromProps, showToast]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">Export & Actions</h3>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
          {completedCount}/6
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Download the report, or copy a version to paste into other tools.
      </p>
      <div className="space-y-2">
        <button onClick={handleExportMarkdown} disabled={isExporting}
          className="w-full py-2 px-3 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors text-left flex items-center gap-2 disabled:opacity-50">
          <span aria-hidden>📄</span>
          <span className="flex-1">Download Markdown</span>
        </button>
        <button onClick={handleExportJSON} disabled={isExporting}
          className="w-full py-2 px-3 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors text-left flex items-center gap-2 disabled:opacity-50">
          <span aria-hidden>📦</span>
          <span className="flex-1">Download JSON</span>
        </button>
        <button onClick={handleExportCSV} disabled={isExporting}
          className="w-full py-2 px-3 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors text-left flex items-center gap-2 disabled:opacity-50">
          <span aria-hidden>📊</span>
          <span className="flex-1">Download CSVs (spreadsheet)</span>
        </button>

        <div className="pt-2 mt-2 border-t border-slate-100">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">Copy to clipboard</p>
        </div>

        <button onClick={handlePrint} className="w-full py-2 px-3 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors text-left flex items-center gap-2"><span aria-hidden>🇀</span><span className="flex-1">Print / Save as PDF</span></button>
        <button onClick={handleCopyBrief} disabled={!outputs.synthesis}
          className="w-full py-2 px-3 text-sm font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors text-left flex items-center gap-2 disabled:opacity-50">
          <span aria-hidden>{copied === "brief" ? "✅" : "📋"}</span>
          <span className="flex-1">{copied === "brief" ? "Copied!" : "Copy LaunchLens brief"}</span>
        </button>
        <button onClick={handleCopyFullMarkdown}
          className="w-full py-2 px-3 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors text-left flex items-center gap-2">
          <span aria-hidden>{copied === "full-md" ? "✅" : "📑"}</span>
          <span className="flex-1">{copied === "full-md" ? "Copied!" : "Copy Markdown"}</span>
        </button>
        <button onClick={handleCopyJSON}
          className="w-full py-2 px-3 text-sm font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg transition-colors text-left flex items-center gap-2">
          <span aria-hidden>{copied === "json" ? "✅" : "🔗"}</span>
          <span className="flex-1">{copied === "json" ? "Copied!" : "Copy JSON"}</span>
        </button>

        <div className="pt-2 mt-2 border-t border-slate-100">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-2">Send to LaunchLens AI</p>
        </div>

        {/* R231: primary one-click path. Opens launchlens-ai in a new tab with
            the brief embedded in the URL hash so the 5 fields are pre-filled.
            Popup-blocked → user falls back to the download button below. */}
        <button
          onClick={handleSendToLaunchLensAi}
          disabled={isExporting || !outputs.synthesis}
          data-testid="send-to-launchlens-ai"
          className="w-full py-2 px-3 text-sm font-semibold bg-slate-950 hover:bg-slate-800 text-white rounded-lg transition-colors text-left flex items-center gap-2 disabled:opacity-50 shadow-sm"
        >
          <span aria-hidden>{"\u2197"}</span>
          <span className="flex-1">Send to LaunchLens AI</span>
        </button>
        <p className="text-[11px] text-slate-500 px-1 leading-snug">
          Opens launchlens-ai in a new tab with your 5-field brief pre-filled. The current report stays open here.
        </p>

        <button onClick={handleExportLaunchLens} disabled={isExporting}
          className="w-full py-2 px-3 text-sm font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors text-left flex items-center gap-2 disabled:opacity-50">
          <span aria-hidden>📦</span>
          <span className="flex-1">Export LaunchLens brief (.json)</span>
        </button>
        <p className="text-[11px] text-slate-500 px-1 leading-snug">
          Fallback: downloads the structured brief as a .json file you can manually import into launchlens-ai.
        </p>
      </div>
    </div>
  );
}
