"use client";

import { useState } from "react";
import { buildShareUrl, copyShareUrl, createShareWithOptions } from "@/lib/research/share-api";

interface ShareButtonProps {
  sessionId: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  label?: string;
}

const EXPIRE_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "1 day", value: 24 * 60 * 60 * 1000 },
  { label: "7 days", value: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 days", value: 30 * 24 * 60 * 60 * 1000 },
];

const MAX_VIEW_OPTIONS = [
  { label: "Unlimited", value: 0 },
  { label: "1 view", value: 1 },
  { label: "10 views", value: 10 },
  { label: "100 views", value: 100 },
];

export function ShareButton({ sessionId, size = "md", variant = "secondary", label = "Share" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [expireMs, setExpireMs] = useState(0);
  const [maxViews, setMaxViews] = useState(0);
  const [creating, setCreating] = useState(false);

  const handleQuickShare = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    let ok = false;
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
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
    }
  };

  const handleCreateShare = async () => {
    setCreating(true);
    try {
      const result = await createShareWithOptions(sessionId, {
        expiresInMs: expireMs || undefined,
        maxViews: maxViews || undefined,
      });
      if (result?.token) {
        // Copy the share URL
        const url = buildShareUrl(result.token);
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          // ignore
        }
        setShowPanel(false);
      }
    } catch (e) {
      console.error("Create share failed:", e);
    } finally {
      setCreating(false);
    }
  };

  const sizeClass = size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-2";
  const variantClass = variant === "primary"
    ? "bg-indigo-600 text-white hover:bg-indigo-700"
    : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200";

  return (
    <div className="share-button-wrapper">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={`${sizeClass} ${variantClass} font-medium rounded-lg transition-colors flex items-center gap-1.5 share-btn-main`}
        aria-label={label}
      >
        <span aria-hidden>{copied ? "?" : "??"}</span>
        <span>{copied ? "Link copied!" : label}</span>
      </button>

      {showPanel && (
        <div className="share-panel" role="dialog" aria-label="Share options">
          <div className="share-panel-header">
            <h4 className="share-panel-title">Share Options</h4>
            <button
              className="share-panel-close"
              onClick={() => setShowPanel(false)}
              aria-label="Close"
            >
              ?
            </button>
          </div>

          <div className="share-panel-section">
            <label className="share-panel-label">Expires after</label>
            <div className="share-options-grid">
              {EXPIRE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={"share-option-btn " + (expireMs === opt.value ? "active" : "")}
                  onClick={() => setExpireMs(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="share-panel-section">
            <label className="share-panel-label">Max views</label>
            <div className="share-options-grid">
              {MAX_VIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={"share-option-btn " + (maxViews === opt.value ? "active" : "")}
                  onClick={() => setMaxViews(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="share-panel-actions">
            <button
              className="share-panel-cancel"
              onClick={() => setShowPanel(false)}
            >
              Cancel
            </button>
            <button
              className="share-panel-create"
              onClick={handleCreateShare}
              disabled={creating}
            >
              {creating ? "Creating..." : "Create & Copy Link"}
            </button>
          </div>

          <div className="share-panel-divider" />

          <button
            className="share-panel-quick"
            onClick={handleQuickShare}
          >
            ? Quick share (no restrictions)
          </button>
        </div>
      )}
    </div>
  );
}
