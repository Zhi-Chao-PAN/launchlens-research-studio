"use client";

import { useMemo, useRef, useEffect } from "react";
import { getAutocompleteSuggestions, getEmptyQuerySuggestions } from "@/lib/research/autocomplete";
import type { AutocompleteItem } from "@/lib/research/autocomplete";

interface AutocompleteDropdownProps {
  query: string;
  history: Array<{
    id: string;
    query: string;
    keywords: string[];
    createdAt: number;
  }>;
  onSelect: (text: string, keywords: string[]) => void;
  isOpen: boolean;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  maxItems?: number;
}

const typeLabels = {
  history: { icon: "🕐", bg: "bg-slate-50", hoverBg: "bg-slate-100" },
  keyword: { icon: "🔤", bg: "bg-indigo-50", hoverBg: "bg-indigo-100" },
  template: { icon: "💡", bg: "bg-amber-50", hoverBg: "bg-amber-100" },
};

export function AutocompleteDropdown({
  query,
  history,
  onSelect,
  isOpen,
  highlightedIndex,
  onHighlight,
  maxItems = 6,
}: AutocompleteDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const suggestions: AutocompleteItem[] = useMemo(() => {
    if (query.trim().length === 0) {
      return getEmptyQuerySuggestions(history, maxItems);
    }
    return getAutocompleteSuggestions(query, history, maxItems);
  }, [query, history, maxItems]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-autocomplete-item]");
    const el = items[highlightedIndex] as HTMLElement | undefined;
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isOpen]);

  if (!isOpen || suggestions.length === 0) return null;

  const isEmpty = query.trim().length === 0;

  return (
    <div
      ref={listRef}
      className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto"
      role="listbox"
      data-autocomplete-list
    >
      {isEmpty && (
        <div className="px-3 py-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wide border-b border-slate-100">
          Suggestions
        </div>
      )}

      {suggestions.map((item, index) => {
        const meta = typeLabels[item.type];
        const isHighlighted = index === highlightedIndex;

        return (
          <button
            key={`${item.type}-${item.text}`}
            type="button"
            data-autocomplete-item
            role="option"
            aria-selected={isHighlighted}
            onMouseEnter={() => onHighlight(index)}
            onClick={() => onSelect(item.text, item.keywords || [])}
            className={`w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2.5 ${
              isHighlighted ? meta.hoverBg : "hover:bg-slate-50"
            }`}
          >
            <span
              className="text-sm mt-0.5 flex-shrink-0"
              aria-hidden
            >
              {meta.icon}
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">
                {item.text}
              </p>
              {item.keywords && item.keywords.length > 0 && (
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {item.keywords.slice(0, 3).map((kw, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {item.hint && (
              <span className="text-[9px] text-slate-400 uppercase font-medium tracking-wide flex-shrink-0 mt-0.5">
                {item.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { getAutocompleteSuggestions, getEmptyQuerySuggestions };
export type { AutocompleteItem };
