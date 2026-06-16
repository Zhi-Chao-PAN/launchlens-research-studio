"use client";

import { useState } from "react";
import { buildShareUrl, copyShareUrl } from "@/lib/research/share";

interface ShareButtonProps {
  sessionId: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  label?: string;
}

export function ShareButton({ sessionId, size = "md", variant = "secondary", label = "Share" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = buildShareUrl(sessionId);
    let ok = false;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        // Mobile devices: try native share
        await navigator.share({ title: "Research report", url });
        ok = true;
      } else {
        ok = await copyShareUrl(sessionId);
      }
    } catch {
      // ignore
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Fallback: open prompt
      window.prompt("Copy this URL to share:", url);
    }
  };

  const sizeClass = size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-2";
  const variantClass = variant === "primary"
    ? "bg-indigo-600 text-white hover:bg-indigo-700"
    : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200";

  return (
    <button
      onClick={handleShare}
      className={`${sizeClass} ${variantClass} font-medium rounded-lg transition-colors flex items-center gap-1.5`}
      aria-label={label}
    >
      <span aria-hidden>{copied ? "✅" : "🔗"}</span>
      <span>{copied ? "Link copied!" : label}</span>
    </button>
  );
}
