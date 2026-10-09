/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useCallback } from "react";
import type { SourceCitation } from "@/lib/schema/research-schema";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function CitationList({ citations, compact = false }: { citations: SourceCitation[]; compact?: boolean }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(!compact);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="border-t border-slate-100 pt-3 mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors"
        aria-expanded={open}
      >
        <span aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        <span>{t("citations.sources", "Sources")} ({citations.length})</span>
      </button>
      {/* We use CSS display:none instead of React conditional rendering so that
          print styles can override and always show the full citation list. */}
      <ol className={`mt-2 space-y-2 ${open ? "" : "hidden print:block"}`}>
          {citations.map((c, i) => (
            <li key={c.id} id={`cite-${c.id}`} className="text-xs text-slate-600 flex gap-2 scroll-mt-24">
              <span className="text-slate-400 font-mono flex-shrink-0">[{i + 1}]</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.url ? (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-indigo-700 hover:underline truncate"
                    >
                      {c.title}
                    </a>
                  ) : (
                    <span className="font-medium text-slate-700 truncate">{c.title}</span>
                  )}
                  <ConfidenceBadge level={c.confidence} size="xs" />
                </div>
                {c.snippet && (
                  <p className="text-slate-500 mt-0.5 italic line-clamp-2">&ldquo;{c.snippet}&rdquo;</p>
                )}
                {c.accessedAt && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {t("citations.accessed", "Accessed")} {new Date(c.accessedAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
    </div>
  );
}

// Inline reference chips (e.g. "[1]", "[2]") linking to the citation list at the bottom.
// Numbered to match the CitationList index; chips are anchor links to scroll to the source.
export function CitationChips({ citations }: { citations: SourceCitation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <span className="inline-flex gap-1 ml-1 align-middle">
      {citations.slice(0, 3).map((c, i) => (
        <a
          key={c.id}
          href={`#cite-${c.id}`}
          className="inline-flex items-center justify-center min-w-5 h-5 px-1 text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors"
          title={c.title}
        >
          {i + 1}
        </a>
      ))}
      {citations.length > 3 && (
        <span className="text-[10px] text-slate-500 font-mono">+{citations.length - 3}</span>
      )}
    </span>
  );
}

// Hook for copy-to-clipboard with a small visual confirmation.
// The legacy textarea fallback is wrapped in try/finally so that the element
// is always removed from the DOM even if execCommand throws.
export function useCopyText() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (text: string, key: string) => {
    let ta: HTMLTextAreaElement | null = null;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
      }
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch (err) {
      console.error("Copy failed:", err);
    } finally {
      if (ta && ta.parentNode) {
        ta.parentNode.removeChild(ta);
      }
    }
  }, []);

  return { copied, copy };
}
