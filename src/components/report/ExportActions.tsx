/* eslint-disable @typescript-eslint/no-explicit-any */
﻿"use client";

import { useState, useCallback } from "react";
import type { AgentId, AgentOutput, SynthesisOutput } from "@/lib/schema/research-schema";
import { generateMarkdownReport, generateBriefOnly } from "@/lib/export/markdown-formatter";
import { buildResearchExport, serializeJSON } from "@/lib/export/json-formatter";
import { generateCSVBundle } from "@/lib/export/csv-formatter";
import { getNotes } from "@/lib/research/notes";

interface ExportActionsProps {
  sessionId: string;
  query: string;
  keywords: string[];
  outputs: Record<AgentId, AgentOutput | null>;
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

type CopyKind = "brief" | "full-md" | "json" | null;

export function ExportActions({ sessionId, query, keywords, outputs }: ExportActionsProps) {
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
      alert("Copy failed. Please try downloading instead.");
    }
  }, [flashCopied]);

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
      alert("Markdown export failed.");
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, query, keywords, outputs]);

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
      alert("JSON export failed.");
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, query, keywords, outputs]);

  const handleExportCSV = useCallback(() => {
    setIsExporting(true);
    try {
      const bundle = generateCSVBundle({ outputs });
      const fileCount = Object.keys(bundle).length;
      if (fileCount === 0) {
        alert("No data available to export as CSV.");
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
      alert("CSV export failed.");
    } finally {
      setIsExporting(false);
    }
  }, [sessionId, query, outputs]);

  const handlePrint = useCallback(() => { window.print(); }, []);

  const handleCopyBrief = useCallback(() => {
    const synth = outputs["synthesis"] as SynthesisOutput | null;
    if (!synth) {
      alert("Synthesis report is not yet available.");
      return;
    }
    const brief = generateBriefOnly(outputs);
    copyToClipboard(brief, "brief");
  }, [outputs, copyToClipboard]);

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
      </div>
    </div>
  );
}
