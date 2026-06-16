"use client";

import { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "warning" | "info";
}

const TONE_BG: Record<NonNullable<EmptyStateProps["tone"]>, string> = {
  neutral: "border-slate-200 bg-slate-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-indigo-200 bg-indigo-50",
};

export function EmptyState({ icon = "✨", title, description, action, tone = "neutral" }: EmptyStateProps) {
  return (
    <div className={`rounded-xl border-2 border-dashed p-8 text-center ${TONE_BG[tone]}`}>
      <div className="text-4xl mb-2" aria-hidden>
        {icon}
      </div>
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {description && <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
