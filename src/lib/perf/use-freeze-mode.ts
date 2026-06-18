// Freeze mode hook — reads ?freeze=1 from the URL and disables all
// CSS animations and transitions for deterministic visual testing.
// Designed for visual regression harnesses where even small animation
// frame differences would cause false-positive diffs.
//
// Usage:
//   useFreezeMode() at the root of your app; it reads window.location
//   and toggles a "freeze" class on <html>.

"use client";

import { useEffect } from "react";

const FREEZE_CLASS = "freeze-mode";

export function hasFreezeParam(search: string = typeof window !== "undefined" ? window.location.search : ""): boolean {
  try {
    const params = new URLSearchParams(search);
    return params.get("freeze") === "1";
  } catch {
    return false;
  }
}

export function useFreezeMode(): boolean {
  useEffect(() => {
    const frozen = hasFreezeParam();
    if (frozen) {
      document.documentElement.classList.add(FREEZE_CLASS);
      // Inject a style block that disables animations and transitions
      // globally. This is stronger than just a class toggle because it
      // catches *-webkit, SVG animations, etc.
      const style = document.createElement("style");
      style.id = "freeze-mode-styles";
      style.textContent = `
        .freeze-mode, .freeze-mode * {
          animation: none !important;
          animation-duration: 0s !important;
          animation-iteration-count: 1 !important;
          transition: none !important;
          transition-duration: 0s !important;
          -webkit-animation: none !important;
          -webkit-transition: none !important;
        }
        .freeze-mode * {
          caret-color: transparent !important;
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      document.documentElement.classList.remove(FREEZE_CLASS);
      const existing = document.getElementById("freeze-mode-styles");
      if (existing) existing.remove();
    };
  }, []);

  return hasFreezeParam();
}
