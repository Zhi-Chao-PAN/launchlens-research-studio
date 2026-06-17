"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ReportSearchBarProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Highlights all matches of `query` inside `root` with <mark> elements.
 * Returns the total count of matches found.
 */
function highlightMatches(root: HTMLElement, query: string): number {
  // Remove existing highlights first by unwrapping <mark> elements
  const existing = root.querySelectorAll("mark[data-search-highlight]");
  existing.forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize();
    }
  });

  if (!query.trim()) return 0;

  const lowerQuery = query.toLowerCase();
  let count = 0;

  // Walk all text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip <script>, <style>, and already-inside-mark nodes
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.tagName === "SCRIPT" || parent.tagName === "STYLE") return NodeFilter.FILTER_REJECT;
      if (parent.closest("mark[data-search-highlight]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  // Process each text node — split around matches
  for (const textNode of textNodes) {
    const text = textNode.nodeValue || "";
    const lowerText = text.toLowerCase();

    if (!lowerText.includes(lowerQuery)) continue;

    const parent = textNode.parentNode;
    if (!parent) continue;

    const fragments: (string | Element)[] = [];
    let lastIndex = 0;
    let idx = lowerText.indexOf(lowerQuery);

    while (idx !== -1) {
      // Text before match
      if (idx > lastIndex) {
        fragments.push(text.slice(lastIndex, idx));
      }
      // The match wrapped in <mark>
      const matchText = text.slice(idx, idx + query.length);
      const mark = document.createElement("mark");
      mark.setAttribute("data-search-highlight", "true");
      mark.className =
        "bg-amber-200 text-amber-900 rounded px-0.5 font-medium search-match";
      mark.textContent = matchText;
      fragments.push(mark);
      count++;

      lastIndex = idx + query.length;
      idx = lowerText.indexOf(lowerQuery, lastIndex);
    }

    // Remaining text after last match
    if (lastIndex < text.length) {
      fragments.push(text.slice(lastIndex));
    }

    // Replace the original text node with the fragments
    const frag = document.createDocumentFragment();
    for (const f of fragments) {
      if (typeof f === "string") {
        frag.appendChild(document.createTextNode(f));
      } else {
        frag.appendChild(f);
      }
    }
    parent.replaceChild(frag, textNode);
  }

  return count;
}

function scrollToMatch(index: number, total: number, container: HTMLElement): void {
  const matches = container.querySelectorAll<HTMLElement>("mark[data-search-highlight]");
  if (matches.length === 0) return;

  const clamped = ((index % total) + total) % total;
  const target = matches[clamped];

  // Remove active class from all
  matches.forEach((m) => {
    m.classList.remove("search-match-active");
    m.style.backgroundColor = "";
  });

  // Add active class
  target.classList.add("search-match-active");
  target.style.backgroundColor = "#f59e0b"; // amber-500

  // Scroll into view (guard for environments without it, e.g. jsdom)
  if (target.scrollIntoView) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function ReportSearchBar({ containerRef }: ReportSearchBarProps) {
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const performSearch = useCallback(
    (searchQuery: string) => {
      const container = containerRef.current;
      if (!container) return;

      const count = highlightMatches(container, searchQuery);
      setMatchCount(count);

      if (count > 0 && searchQuery.trim()) {
        setCurrentIndex(0);
        scrollToMatch(0, count, container);
      } else {
        setCurrentIndex(0);
      }
    },
    [containerRef]
  );

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const goToPrev = useCallback(() => {
    const container = containerRef.current;
    if (!container || matchCount === 0) return;
    const next = currentIndex - 1;
    setCurrentIndex(next);
    scrollToMatch(next, matchCount, container);
  }, [containerRef, currentIndex, matchCount]);

  const goToNext = useCallback(() => {
    const container = containerRef.current;
    if (!container || matchCount === 0) return;
    const next = currentIndex + 1;
    setCurrentIndex(next);
    scrollToMatch(next, matchCount, container);
  }, [containerRef, currentIndex, matchCount]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          goToPrev();
        } else {
          goToNext();
        }
      } else if (e.key === "Escape") {
        setQuery("");
        inputRef.current?.blur();
      }
    },
    [goToNext, goToPrev]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search in report..."
          className="w-full pl-8 pr-20 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-shadow"
          aria-label="Search in report"
        />
        <span
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"
          aria-hidden
        >
          🔍
        </span>
        {query && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] text-slate-500">
            <span className="tabular-nums">
              {matchCount > 0 ? `${((currentIndex % matchCount) + matchCount) % matchCount + 1}/${matchCount}` : "0/0"}
            </span>
            <button
              onClick={clearSearch}
              className="text-slate-400 hover:text-slate-600 ml-1"
              aria-label="Clear search"
              title="Clear (Esc)"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={goToPrev}
          disabled={matchCount === 0}
          className="px-2 py-1 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous match"
          title="Previous (Shift+Enter)"
        >
          ↑
        </button>
        <button
          onClick={goToNext}
          disabled={matchCount === 0}
          className="px-2 py-1 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next match"
          title="Next (Enter)"
        >
          ↓
        </button>
      </div>
    </div>
  );
}
