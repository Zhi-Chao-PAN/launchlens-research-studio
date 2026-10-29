"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

export function TrialGuide() {
  const { locale } = useLocale();
  const chinese = locale === "zh-CN";
  const steps = chinese ? [
    "先用一个不敏感的研究问题或页面上的示例。检查服务商与模式标识；点击开始可能调用当前部署配置的真实模型。",
    "完成后逐项检查来源与日期。Demo 或降级部分仅供演示；Standard 不保证引用网址已经核验。Deep Research 是否可用，以模式选择器为准。",
    "导出报告和结构化简述，保留可追溯的来源。带到 LaunchLens 时检查导入后的五个字段；研究报告仍是完整上下文。",
    "记录原本想解决的问题、实际完成的步骤、卡点和是否愿意再用。通过邀请人的联系方式分享脱敏反馈，不要发送密钥或保密材料。",
  ] : [
    "Start with a non-sensitive research question or a sample below. Check the provider and mode labels: starting a run may call the real model configured for this deployment.",
    "Review sources and dates after the run. Demo and fallback sections are illustrative. Standard does not guarantee verified citation URLs; Deep Research availability is shown in the mode selector.",
    "Export the report and structured brief. When moving to LaunchLens, review the five imported fields; the research report retains the full context and sources.",
    "Note your intended task, what you completed, where you got stuck and whether you would return. Send redacted feedback to your inviter; do not include keys or confidential material.",
  ];
  return (
    <details className="mb-5 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-600">
        {chinese ? "首次试用：完成一个研究问题" : "First trial: complete one research question"}
      </summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 leading-6">
        {steps.map(step => <li key={step}>{step}</li>)}
      </ol>
      <p className="mt-3 leading-6">
        {chinese ? "浏览器缓存可能被清除。需要保留的报告请导出；恢复已有记录不等于重新运行。公开分享前检查内容。" : "Browser caches can be cleared. Export reports you need; restoring a saved record is different from running it again. Review content before public sharing."}
      </p>
    </details>
  );
}
