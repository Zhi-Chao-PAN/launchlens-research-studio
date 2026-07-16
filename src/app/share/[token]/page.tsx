"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SVGProps } from "react";

import { SafeExternalLink } from "@/components/report/primitives/SafeExternalLink";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/dictionaries";
import type {
  PublicShareReportV1,
  ShareSectionId,
} from "@/lib/research/share-manifest";

import styles from "./page.module.css";

interface SharedReportResponse {
  report: PublicShareReportV1;
  share: {
    views: number;
    maxViews: number | null;
    expiresAt: number | null;
    sections?: ShareSectionId[];
    // Kept as a temporary compatibility bridge while the share projection
    // contract rolls out. No manifest value is rendered directly.
    manifest?: { sections?: ShareSectionId[] } | null;
  };
}

type LoadError = "unavailable" | "network" | null;
type CopyState = "idle" | "copied" | "failed";

const COPY = {
  en: {
    brandDescriptor: "Research Studio",
    sharedBadge: "Shared research",
    copyLink: "Copy link",
    copied: "Link copied",
    copyFailed: "Copy failed",
    language: "Language",
    dossierEyebrow: "LaunchLens research dossier",
    preparedOn: "Prepared",
    selectedSections: "selected sections",
    viewCount: "views",
    viewLimit: "view limit",
    expires: "Expires",
    neverExpires: "No expiry",
    summary: "Executive summary",
    scores: "Decision signals",
    opportunity: "Opportunity",
    risk: "Risk",
    insights: "Key insights",
    opportunities: "Top opportunities",
    risks: "Key risks",
    nextStep: "Recommended next step",
    sources: "Evidence sources",
    evidence: "Evidence",
    mitigation: "Mitigation",
    supportedBy: "Supported by",
    confidence: {
      high: "High confidence",
      medium: "Medium confidence",
      low: "Low confidence",
    },
    emptyTitle: "A focused research share",
    emptyBody:
      "The author shared the research topic without additional report sections.",
    ctaEyebrow: "From idea to evidence",
    ctaTitle: "Have an idea worth testing?",
    ctaBody:
      "LaunchLens coordinates specialist research agents to turn early product ideas into decision-ready evidence.",
    ctaButton: "Research your idea",
    publicNote: "This page shows only the sections selected by its author.",
    loading: "Opening the shared research dossier",
    loadingHint: "Preparing the selected findings and evidence.",
    unavailableEyebrow: "Share unavailable",
    unavailableTitle: "This research link is no longer available.",
    unavailableBody:
      "It may have expired, reached its view limit, or been withdrawn by its author.",
    networkEyebrow: "Connection interrupted",
    networkTitle: "We could not open this research share.",
    networkBody: "Check your connection and try again.",
    retry: "Try again",
    explore: "Explore LaunchLens",
  },
  zh: {
    brandDescriptor: "研究工作台",
    sharedBadge: "公开调研分享",
    copyLink: "复制链接",
    copied: "链接已复制",
    copyFailed: "复制失败",
    language: "语言",
    dossierEyebrow: "LaunchLens 调研档案",
    preparedOn: "生成于",
    selectedSections: "个精选章节",
    viewCount: "次查看",
    viewLimit: "查看上限",
    expires: "有效期至",
    neverExpires: "长期有效",
    summary: "执行摘要",
    scores: "决策信号",
    opportunity: "机会指数",
    risk: "风险指数",
    insights: "关键洞察",
    opportunities: "优先机会",
    risks: "核心风险",
    nextStep: "建议下一步",
    sources: "证据来源",
    evidence: "支持依据",
    mitigation: "应对建议",
    supportedBy: "分析视角",
    confidence: {
      high: "高置信度",
      medium: "中等置信度",
      low: "低置信度",
    },
    emptyTitle: "一份聚焦的调研分享",
    emptyBody: "分享者仅公开了调研主题，没有附加更多报告章节。",
    ctaEyebrow: "让想法经得起验证",
    ctaTitle: "你也有一个值得讨论的想法？",
    ctaBody:
      "LaunchLens 协调多位专业调研智能体，把早期产品想法转化为可用于决策的证据。",
    ctaButton: "开始调研我的想法",
    publicNote: "本页面仅展示分享者主动选择公开的内容。",
    loading: "正在打开调研档案",
    loadingHint: "正在整理分享者选中的结论与证据。",
    unavailableEyebrow: "分享已失效",
    unavailableTitle: "这份调研暂时无法访问",
    unavailableBody: "链接可能已过期、达到查看上限，或已被分享者撤回。",
    networkEyebrow: "连接中断",
    networkTitle: "暂时无法打开这份调研",
    networkBody: "请检查网络连接后重试。",
    retry: "重新加载",
    explore: "了解 LaunchLens",
  },
} as const;

const SHARE_LOCALE_OPTIONS = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "中文" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSharedReportResponse(value: unknown): value is SharedReportResponse {
  if (!isRecord(value) || !isRecord(value.report) || !isRecord(value.share)) {
    return false;
  }

  return (
    typeof value.report.query === "string" &&
    Number.isFinite(value.report.createdAt) &&
    isRecord(value.report.sections) &&
    Number.isFinite(value.share.views)
  );
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 40 40"
      fill="none"
    >
      <rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" />
      <circle cx="20" cy="20" r="10" stroke="white" strokeWidth="2" />
      <circle cx="20" cy="20" r="4" fill="#A7F3D0" />
      <path d="M20 6v4M34 20h-4M20 34v-4M6 20h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="m5 12 4.2 4.2L19 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M3 12s3.4-5.5 9-5.5S21 12 21 12s-3.4 5.5-9 5.5S3 12 3 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3.2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M6 18 18 6M9 6h9v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5 7.5h14v11H5zM4 4.5h16v3H4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9.5 11h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SectionHeading({
  index,
  title,
}: {
  index: number;
  title: string;
}) {
  return (
    <div className={styles.sectionHeading}>
      <span className={styles.sectionIndex}>{String(index).padStart(2, "0")}</span>
      <h2>{title}</h2>
      <span className={styles.sectionRule} aria-hidden="true" />
    </div>
  );
}

function ScoreCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "caution";
}) {
  const score = clampScore(value);
  return (
    <div className={`${styles.scoreCard} ${styles[tone]}`}>
      <div className={styles.scoreTopline}>
        <span>{label}</span>
        <span className={styles.scoreScale}>/ 100</span>
      </div>
      <strong className={styles.scoreValue}>{score}</strong>
      <div
        className={styles.scoreTrack}
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
      >
        <span className={styles.scoreFill} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { locale, setLocale } = useLocale();
  const shareLocale = locale === "zh-CN" ? "zh-CN" : "en";
  const copy = shareLocale === "zh-CN" ? COPY.zh : COPY.en;
  const dateLocale = shareLocale === "zh-CN" ? "zh-CN" : "en-US";
  const [data, setData] = useState<SharedReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadShare() {
      setLoading(true);
      setLoadError(null);

      try {
        const { token } = await params;
        const response = await fetch(
          `/api/research/share/${encodeURIComponent(token)}`,
          { signal: controller.signal, cache: "no-store" },
        );

        if (!active) return;
        if (!response.ok) {
          setLoadError(
            response.status === 404 || response.status === 410
              ? "unavailable"
              : "network",
          );
          return;
        }

        const payload: unknown = await response.json();
        if (!isSharedReportResponse(payload)) {
          setLoadError("network");
          return;
        }

        setData(payload);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setLoadError("network");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadShare();
    return () => {
      active = false;
      controller.abort();
    };
  }, [params]);

  useEffect(() => {
    if (data?.report.query) {
      document.title = `${data.report.query} · LaunchLens`;
    } else if (loadError) {
      document.title = `${copy.unavailableEyebrow} · LaunchLens`;
    } else {
      document.title = `${copy.sharedBadge} · LaunchLens`;
    }
  }, [copy.sharedBadge, copy.unavailableEyebrow, data?.report.query, loadError]);

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    const url = window.location.href;
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        const activeElement = document.activeElement as HTMLElement | null;
        let textarea: HTMLTextAreaElement | null = null;
        try {
          textarea = document.createElement("textarea");
          textarea.value = url;
          textarea.readOnly = true;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          copied = document.execCommand("copy");
        } finally {
          textarea?.remove();
          if (activeElement?.isConnected) activeElement.focus({ preventScroll: true });
        }
      }

      if (!copied) throw new Error("copy_failed");
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopyState("idle"), 2400);
  }, []);

  const formattedCreatedAt =
    data && Number.isFinite(data.report.createdAt)
      ? new Intl.DateTimeFormat(dateLocale, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }).format(new Date(data.report.createdAt))
      : "";

  const formattedExpiry =
    data?.share.expiresAt && Number.isFinite(data.share.expiresAt)
      ? new Intl.DateTimeFormat(dateLocale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(data.share.expiresAt))
      : copy.neverExpires;

  const renderHeader = () => (
    <header className={styles.siteHeader}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand} aria-label="LaunchLens">
          <BrandMark className={styles.brandMark} />
          <span className={styles.brandWordmark}>LaunchLens</span>
          <span className={styles.brandDescriptor}>{copy.brandDescriptor}</span>
        </Link>

        <div className={styles.headerActions}>
          <span className={styles.sharedBadge}>
            <ArchiveIcon className={styles.smallIcon} />
            <span>{copy.sharedBadge}</span>
          </span>
          <label className={styles.localeControl}>
            <span className={styles.visuallyHidden}>{copy.language}</span>
            <select
              aria-label={copy.language}
              value={shareLocale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {SHARE_LOCALE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {data ? (
            <button
              type="button"
              className={styles.copyButton}
              onClick={handleCopy}
              aria-live="polite"
            >
              {copyState === "copied" ? (
                <CheckIcon className={styles.smallIcon} />
              ) : (
                <CopyIcon className={styles.smallIcon} />
              )}
              <span>
                {copyState === "copied"
                  ? copy.copied
                  : copyState === "failed"
                    ? copy.copyFailed
                    : copy.copyLink}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className={styles.page}>
        {renderHeader()}
        <main id="main-content" className={styles.stateMain} aria-busy="true">
          <div className={styles.loadingArchive} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className={styles.stateEyebrow}>{copy.dossierEyebrow}</p>
          <h1 className={styles.stateTitle}>{copy.loading}</h1>
          <p className={styles.stateBody}>{copy.loadingHint}</p>
        </main>
      </div>
    );
  }

  if (loadError || !data) {
    const isUnavailable = loadError === "unavailable";
    return (
      <div className={styles.page}>
        {renderHeader()}
        <main id="main-content" className={styles.stateMain}>
          <div className={styles.errorMark} aria-hidden="true">
            <ArchiveIcon />
          </div>
          <p className={styles.stateEyebrow}>
            {isUnavailable ? copy.unavailableEyebrow : copy.networkEyebrow}
          </p>
          <h1 className={styles.stateTitle}>
            {isUnavailable ? copy.unavailableTitle : copy.networkTitle}
          </h1>
          <p className={styles.stateBody}>
            {isUnavailable ? copy.unavailableBody : copy.networkBody}
          </p>
          <div className={styles.stateActions}>
            {!isUnavailable ? (
              <button type="button" onClick={() => window.location.reload()}>
                {copy.retry}
              </button>
            ) : null}
            <Link href="/">
              {copy.explore}
              <ArrowIcon className={styles.smallIcon} />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { report, share } = data;
  const { sections } = report;
  const insights = Array.isArray(sections.insights) ? sections.insights : [];
  const opportunities = Array.isArray(sections.opportunities)
    ? sections.opportunities
    : [];
  const risks = Array.isArray(sections.risks) ? sections.risks : [];
  const sources = Array.isArray(sections.sources) ? sections.sources : [];
  const visibleSectionCount = [
    Boolean(sections.summary),
    Boolean(sections.scores),
    insights.length > 0,
    opportunities.length > 0,
    risks.length > 0,
    Boolean(sections.nextStep),
    sources.length > 0,
  ].filter(Boolean).length;
  const hasAnySection = visibleSectionCount > 0;
  let sectionNumber = 0;

  return (
    <div className={styles.page}>
      {renderHeader()}

      <main id="main-content" className={styles.main}>
        <article className={styles.dossier}>
          <header className={styles.hero}>
            <div className={styles.heroLens} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className={styles.heroContent}>
              <div className={styles.heroTopline}>
                <span>{copy.dossierEyebrow}</span>
                <span className={styles.archiveCode}>PUBLIC / 01</span>
              </div>
              <h1>{report.query}</h1>
              <div className={styles.heroMeta}>
                <span>
                  <ClockIcon className={styles.metaIcon} />
                  {copy.preparedOn} {formattedCreatedAt}
                </span>
                <span>
                  <ArchiveIcon className={styles.metaIcon} />
                  {visibleSectionCount} {copy.selectedSections}
                </span>
              </div>
            </div>
          </header>

          <aside className={styles.accessStrip} aria-label={copy.sharedBadge}>
            <div>
              <EyeIcon className={styles.accessIcon} />
              <span>
                <strong>{share.views}</strong> {copy.viewCount}
                {share.maxViews !== null
                  ? ` / ${share.maxViews} ${copy.viewLimit}`
                  : ""}
              </span>
            </div>
            <div>
              <ClockIcon className={styles.accessIcon} />
              <span>
                {share.expiresAt ? `${copy.expires} ${formattedExpiry}` : formattedExpiry}
              </span>
            </div>
            <p>{copy.publicNote}</p>
          </aside>

          {!hasAnySection ? (
            <section className={styles.emptySelection}>
              <ArchiveIcon aria-hidden="true" />
              <div>
                <h2>{copy.emptyTitle}</h2>
                <p>{copy.emptyBody}</p>
              </div>
            </section>
          ) : null}

          {sections.summary ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.summary} />
              <p className={styles.summary}>{sections.summary}</p>
            </section>
          ) : null}

          {sections.scores ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.scores} />
              <div className={styles.scoreGrid}>
                <ScoreCard
                  label={copy.opportunity}
                  value={sections.scores.opportunityScore}
                  tone="positive"
                />
                <ScoreCard
                  label={copy.risk}
                  value={sections.scores.riskScore}
                  tone="caution"
                />
              </div>
            </section>
          ) : null}

          {insights.length > 0 ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.insights} />
              <ol className={styles.insightList}>
                {insights.map((insight, index) => (
                  <li key={`${insight.insight}-${index}`}>
                    <div className={styles.insightNumber}>{String(index + 1).padStart(2, "0")}</div>
                    <div className={styles.insightBody}>
                      <span className={`${styles.confidence} ${styles[insight.confidence]}`}>
                        {copy.confidence[insight.confidence]}
                      </span>
                      <p>{insight.insight}</p>
                      {insight.supportingAgents?.length > 0 ? (
                        <div className={styles.supportingAgents}>
                          <span>{copy.supportedBy}</span>
                          {insight.supportingAgents.map((agent) => (
                            <span key={agent}>{agent}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {opportunities.length > 0 ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.opportunities} />
              <div className={styles.cardGrid}>
                {opportunities.map((opportunity, index) => (
                  <article className={styles.findingCard} key={`${opportunity.title}-${index}`}>
                    <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{opportunity.title}</h3>
                    <p>{opportunity.description}</p>
                    {opportunity.rationale ? (
                      <div className={styles.cardEvidence}>
                        <span>{copy.evidence}</span>
                        <p>{opportunity.rationale}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {risks.length > 0 ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.risks} />
              <div className={styles.cardGrid}>
                {risks.map((risk, index) => (
                  <article className={`${styles.findingCard} ${styles.riskCard}`} key={`${risk.title}-${index}`}>
                    <span className={styles.cardIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{risk.title}</h3>
                    <p>{risk.description}</p>
                    {risk.mitigation ? (
                      <div className={styles.cardEvidence}>
                        <span>{copy.mitigation}</span>
                        <p>{risk.mitigation}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {sections.nextStep ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.nextStep} />
              <div className={styles.nextStep}>
                <span className={styles.nextStepMark} aria-hidden="true">
                  <ArrowIcon />
                </span>
                <p>{sections.nextStep}</p>
              </div>
            </section>
          ) : null}

          {sources.length > 0 ? (
            <section className={styles.reportSection}>
              <SectionHeading index={++sectionNumber} title={copy.sources} />
              <ol className={styles.sourceList}>
                {sources.map((source, index) => (
                  <li key={`${source.url}-${index}`}>
                    <span className={styles.sourceIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <SafeExternalLink href={source.url} className={styles.sourceLink}>
                        {source.title}
                        <ArrowIcon className={styles.sourceArrow} />
                      </SafeExternalLink>
                      {source.snippet ? <p>{source.snippet}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>

        <section className={styles.cta}>
          <div className={styles.ctaMark} aria-hidden="true">
            <BrandMark />
          </div>
          <div className={styles.ctaCopy}>
            <p>{copy.ctaEyebrow}</p>
            <h2>{copy.ctaTitle}</h2>
            <span>{copy.ctaBody}</span>
          </div>
          <Link
            className={styles.ctaButton}
            href="/?utm_source=shared_report&utm_medium=public_share&utm_campaign=research_dossier"
          >
            {copy.ctaButton}
            <ArrowIcon />
          </Link>
        </section>
      </main>

      <footer className={styles.footer}>
        <div>
          <BrandMark className={styles.footerMark} />
          <span>LaunchLens Research Studio</span>
        </div>
        <span>{copy.publicNote}</span>
      </footer>
    </div>
  );
}
