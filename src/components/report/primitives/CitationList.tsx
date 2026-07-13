/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useState } from "react";
import type { SourceCitation } from "@/lib/schema/research-schema";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function CitationList({ citations, compact = false }: { citations: SourceCitation[]; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const { t } = useLocale();
  if (!citations || citations.length === 0) return null;
  const sourceCountLabel = t(
    `report.sourceCount.${citations.length === 1 ? "one" : "other"}`,
    { count: citations.length },
  );

  return (
    <section className="mt-5 border-t border-slate-200 pt-3" aria-label={sourceCountLabel}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-9 w-full items-center justify-between gap-3 py-1 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
        aria-expanded={open}
      >
        <span>{sourceCountLabel}</span>
        <span
          aria-hidden
          className={`text-base font-normal text-slate-500 transition-transform ${open ? "rotate-90" : ""}`}
        >
          &rsaquo;
        </span>
      </button>
      {open && (
        <ol className="mt-1 divide-y divide-slate-200 border-y border-slate-200">
          {citations.map((citation, index) => {
            const safeUrl = canonicalizeSafeExternalUrl(citation.url);
            return (
              <li
                id={`cite-${citation.id}`}
                key={citation.id}
                className="flex gap-3 py-3 text-xs text-slate-600"
              >
                <span className="flex-shrink-0 font-mono tabular-nums text-slate-500">[{index + 1}]</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {safeUrl ? (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-700"
                      >
                        {citation.title}
                      </a>
                    ) : (
                      <span className="truncate font-medium text-slate-900">{citation.title}</span>
                    )}
                    <ConfidenceBadge level={citation.confidence} size="xs" />
                  </div>
                  {citation.snippet && (
                    <p className="mt-1 line-clamp-2 border-l border-slate-200 pl-2 leading-5 text-slate-600">
                      &ldquo;{citation.snippet}&rdquo;
                    </p>
                  )}
                  {citation.accessedAt && (() => {
                    const date = new Date(citation.accessedAt);
                    const display = Number.isNaN(date.getTime()) ? citation.accessedAt : date.toLocaleDateString();
                    return (
                      <p className="mt-1 font-mono text-[10px] tabular-nums text-slate-500">
                        {t("report.accessedAt", { date: display })}
                      </p>
                    );
                  })()}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function CitationChips({ citations }: { citations: SourceCitation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {citations.slice(0, 3).map((citation, index) => (
        <a
          key={citation.id}
          href={`#cite-${citation.id}`}
          className="inline-flex h-5 min-w-5 items-center justify-center border border-slate-200 bg-white px-1 font-mono text-[10px] font-semibold text-slate-700 transition-colors hover:border-slate-500 hover:bg-slate-50"
          title={citation.title}
        >
          {index + 1}
        </a>
      ))}
      {citations.length > 3 && (
        <span className="font-mono text-[10px] text-slate-500">+{citations.length - 3}</span>
      )}
    </span>
  );
}

export function useCopyText() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (text: string, key: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  }, []);

  return { copied, copy };
}
