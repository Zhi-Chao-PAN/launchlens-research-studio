"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "warning" | "info";
}

const TONE_BG: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  neutral: "border-slate-200 bg-slate-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-sky-200 bg-sky-50",
};

export function EmptyState({ title, description, action, tone = "neutral" }: EmptyStateProps) {
  return (
    <div role="status" className={`rounded-md border px-5 py-7 text-center ${TONE_BG[tone]}`}>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
