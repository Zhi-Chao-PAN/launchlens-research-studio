"use client";

import { useCallback, useId, useState } from "react";
import {
  ShareStudioDialog,
  type ShareReportPreview,
} from "@/components/share/ShareStudioDialog";

interface ShareButtonProps {
  sessionId: string;
  report?: ShareReportPreview;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "plain";
  label?: string;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ShareIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  );
}

export function ShareButton({
  sessionId,
  report,
  size = "md",
  variant = "secondary",
  label = "Share",
  className,
  open,
  onOpenChange,
}: ShareButtonProps) {
  const dialogId = useId();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;

  const setOpen = useCallback((next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  }, [isControlled, onOpenChange]);

  const sizeClass = size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3.5 py-2";
  const variantClass = variant === "primary"
    ? "bg-emerald-800 text-white hover:bg-emerald-900 border border-emerald-800"
    : variant === "plain"
      ? ""
      : "bg-white hover:bg-emerald-50 text-emerald-950 border border-slate-200 hover:border-emerald-300";
  const defaultClass = `${sizeClass} ${variantClass} font-medium rounded-lg transition-colors inline-flex items-center gap-1.5 share-btn-main`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className || defaultClass}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={dialogId}
      >
        <ShareIcon />
        <span>{label}</span>
      </button>
      <ShareStudioDialog
        id={dialogId}
        sessionId={sessionId}
        report={report}
        open={isOpen}
        onOpenChange={setOpen}
      />
    </>
  );
}
