"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  buildShareUrl,
  createShareWithOptions,
  type CreatedShare,
} from "@/lib/research/share-api";
import {
  DEFAULT_SHARE_SECTIONS,
  type ShareSectionId,
} from "@/lib/research/share-manifest";
import styles from "./ShareStudio.module.css";

export interface ShareReportPreview {
  query: string;
  keywords?: string[];
  createdAt?: number | string;
  synthesis?: {
    execSummary?: string;
    opportunityScore?: number;
    riskScore?: number;
    keyInsights?: Array<{ insight: string; confidence?: string }>;
    topThreeOpportunities?: Array<{ title: string; description?: string; rationale?: string }>;
    topThreeRisks?: Array<{ title: string; description?: string; mitigation?: string }>;
    recommendedNextStep?: string;
    citations?: Array<{ title: string; url?: string; snippet?: string }>;
  } | null;
}

interface ShareStudioDialogProps {
  id?: string;
  sessionId: string;
  report?: ShareReportPreview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ShareMode = "poster" | "link";
type PresetId = "highlights" | "discussion" | "full" | "custom";

const PRESET_SECTIONS: Record<Exclude<PresetId, "custom">, ShareSectionId[]> = {
  highlights: ["summary", "scores", "insights", "nextStep"],
  discussion: ["summary", "insights", "opportunities", "risks", "nextStep"],
  full: [...DEFAULT_SHARE_SECTIONS],
};

const SECTION_ORDER: ShareSectionId[] = [...DEFAULT_SHARE_SECTIONS];

const COPY = {
  en: {
    eyebrow: "SHARE STUDIO",
    title: "Turn this research into a conversation",
    subtitle: "Choose what people can see. The link and QR poster always share the same curated report.",
    posterTab: "Poster",
    linkTab: "Link",
    contentTitle: "Shared content",
    contentHint: "The report title is always included. Select at least one section.",
    highlights: "Highlights",
    highlightsHint: "A concise decision brief",
    discussion: "Discussion",
    discussionHint: "Balanced talking points",
    full: "Full report",
    fullHint: "Every public section",
    custom: "Custom",
    summary: "Executive summary",
    summaryHint: "The core conclusion",
    scores: "Opportunity & risk scores",
    scoresHint: "Two decision signals",
    insights: "Key insights",
    insightsHint: "Evidence-backed findings",
    opportunities: "Top opportunities",
    opportunitiesHint: "Where to place the bet",
    risks: "Key risks",
    risksHint: "What could break the idea",
    nextStep: "Recommended next step",
    nextStepHint: "The most useful action now",
    sources: "Evidence sources",
    sourcesHint: "Links and supporting excerpts",
    access: "Access controls",
    accessHint: "Optional expiry and view limits",
    expires: "Link expiry",
    never: "Never",
    oneDay: "1 day",
    sevenDays: "7 days",
    thirtyDays: "30 days",
    views: "View limit",
    unlimited: "Unlimited",
    tenViews: "10 views",
    hundredViews: "100 views",
    thousandViews: "1,000 views",
    previewLabel: "Live poster preview",
    reportLabel: "RESEARCH NOTE",
    signalLabel: "DECISION SIGNAL",
    opportunity: "Opportunity",
    risk: "Risk",
    topInsight: "Top insight",
    nextMove: "Next move",
    scan: "Scan to read and discuss the curated report",
    promo: "Validate your next idea with LaunchLens",
    qrPending: "QR appears after poster creation",
    createPoster: "Create QR poster",
    creating: "Creating…",
    savePoster: "Save PNG",
    sharePoster: "Share poster",
    posterReady: "Poster ready — the QR opens this curated report.",
    linkIntro: "Create a public report link for messages, communities, or team discussion.",
    createLink: "Create public link",
    copyLink: "Copy link",
    copied: "Copied",
    systemShare: "Share…",
    openReport: "Open report",
    immutableNote: "Changing content or access controls creates a new link; existing links remain unchanged.",
    close: "Close share studio",
    failed: "Could not create the share. Please try again.",
    posterFailed: "Could not render the poster. Please try again.",
    copyFailed: "Clipboard access was blocked. Select and copy the visible URL.",
    selectedCount: (count: number) => `${count} sections selected`,
  },
  "zh-CN": {
    eyebrow: "分享工作台",
    title: "把这份调研，变成一次有价值的讨论",
    subtitle: "自由选择对方可见的内容；链接与二维码海报始终指向同一份精选报告。",
    posterTab: "海报分享",
    linkTab: "链接分享",
    contentTitle: "选择分享内容",
    contentHint: "报告标题会始终保留，至少选择一个内容模块。",
    highlights: "精华版",
    highlightsHint: "适合快速判断与转发",
    discussion: "讨论版",
    discussionHint: "适合朋友或团队交流",
    full: "完整版",
    fullHint: "展示全部公开内容",
    custom: "自定义",
    summary: "执行摘要",
    summaryHint: "这项想法的核心结论",
    scores: "机会与风险分数",
    scoresHint: "两项关键决策信号",
    insights: "关键洞察",
    insightsHint: "有证据支撑的发现",
    opportunities: "优先机会",
    opportunitiesHint: "最值得投入的方向",
    risks: "关键风险",
    risksHint: "可能影响成败的因素",
    nextStep: "建议下一步",
    nextStepHint: "此刻最值得采取的行动",
    sources: "证据来源",
    sourcesHint: "引用链接与相关摘录",
    access: "访问控制",
    accessHint: "可选的有效期与浏览次数",
    expires: "链接有效期",
    never: "永久有效",
    oneDay: "1 天",
    sevenDays: "7 天",
    thirtyDays: "30 天",
    views: "浏览次数",
    unlimited: "不限",
    tenViews: "10 次",
    hundredViews: "100 次",
    thousandViews: "1,000 次",
    previewLabel: "海报实时预览",
    reportLabel: "研究札记",
    signalLabel: "决策信号",
    opportunity: "机会",
    risk: "风险",
    topInsight: "首要洞察",
    nextMove: "建议行动",
    scan: "扫码查看精选调研，并一起参与讨论",
    promo: "用 LaunchLens 验证你的下一个想法",
    qrPending: "生成海报后显示可扫描二维码",
    createPoster: "生成二维码海报",
    creating: "正在生成…",
    savePoster: "保存 PNG",
    sharePoster: "分享海报",
    posterReady: "海报已就绪，二维码将打开这份精选报告。",
    linkIntro: "生成公开报告链接，适合发送给朋友、社群或团队共同讨论。",
    createLink: "生成公开链接",
    copyLink: "复制链接",
    copied: "已复制",
    systemShare: "系统分享",
    openReport: "打开报告",
    immutableNote: "修改内容或访问控制会生成新链接，已分享的旧链接不会被改变。",
    close: "关闭分享工作台",
    failed: "暂时无法创建分享，请稍后重试。",
    posterFailed: "海报生成失败，请重试。",
    copyFailed: "浏览器阻止了剪贴板访问，请手动复制下方链接。",
    selectedCount: (count: number) => `已选择 ${count} 个模块`,
  },
} as const;

type ShareCopy = (typeof COPY)[keyof typeof COPY];

function copyForLocale(locale: Locale): ShareCopy {
  return locale === "zh-CN" ? COPY["zh-CN"] : COPY.en;
}

function Icon({ name }: { name: "close" | "poster" | "link" | "copy" | "share" | "download" | "external" | "check" }) {
  const paths: Record<typeof name, React.ReactNode> = {
    close: <path d="m6 6 12 12M18 6 6 18" />,
    poster: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 15 3-3 2 2 3-4 2 3M8 7h5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.15 1.15" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.15-1.15" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
    share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></>,
    external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function detectedPreset(sections: ShareSectionId[]): PresetId {
  const normalized = [...sections].sort().join("|");
  for (const [id, values] of Object.entries(PRESET_SECTIONS) as Array<[Exclude<PresetId, "custom">, ShareSectionId[]]>) {
    if ([...values].sort().join("|") === normalized) return id;
  }
  return "custom";
}

function reportIdentity(sessionId: string, report?: ShareReportPreview): string {
  const serialized = JSON.stringify([sessionId, report ?? null]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = Math.imul(hash ^ serialized.charCodeAt(index), 0x01000193);
  }
  // This is a UI identity marker, not a security primitive. Including the
  // serialized length alongside FNV-1a keeps the DOM marker compact while
  // invalidating artifacts when any report field used by the poster changes.
  return `${serialized.length}:${(hash >>> 0).toString(36)}`;
}

function accessFingerprint(
  identity: string,
  sections: ShareSectionId[],
  expireMs: number,
  maxViews: number,
): string {
  return JSON.stringify([identity, [...sections].sort(), expireMs, maxViews]);
}

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based browser fallback.
    }
  }
  const previousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea?.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
}

interface OptionalWebShareNavigator {
  share?: (data?: ShareData) => Promise<void>;
  canShare?: (data?: ShareData) => boolean;
}

function webShareNavigator(): OptionalWebShareNavigator {
  return navigator as unknown as OptionalWebShareNavigator;
}

export function ShareStudioDialog({ id, sessionId, report, open, onOpenChange }: ShareStudioDialogProps) {
  const { locale } = useLocale();
  const c = copyForLocale(locale);
  const dialogRef = useRef<HTMLDivElement>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<ShareMode>("poster");
  const [sections, setSections] = useState<ShareSectionId[]>(PRESET_SECTIONS.highlights);
  const [expireMs, setExpireMs] = useState(0);
  const [maxViews, setMaxViews] = useState(0);
  const [accessOpen, setAccessOpen] = useState(false);
  const [created, setCreated] = useState<CreatedShare | null>(null);
  const [createdFor, setCreatedFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [posterBlob, setPosterBlob] = useState<Blob | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [posterFor, setPosterFor] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const operationGenerationRef = useRef(0);
  const posterGenerationRef = useRef(0);
  const posterUrlRef = useRef<string | null>(null);
  const identity = useMemo(() => reportIdentity(sessionId, report), [sessionId, report]);

  const fingerprint = useMemo(
    () => accessFingerprint(identity, sections, expireMs, maxViews),
    [identity, sections, expireMs, maxViews],
  );
  const posterFingerprint = useMemo(
    () => JSON.stringify([fingerprint, locale]),
    [fingerprint, locale],
  );
  const shareUrl = created && createdFor === fingerprint ? buildShareUrl(created.token) : null;
  const activePosterBlob = posterFor === posterFingerprint ? posterBlob : null;
  const activePosterUrl = posterFor === posterFingerprint ? posterUrl : null;
  const activeQrUrl = posterFor === posterFingerprint ? qrUrl : null;
  const preset = detectedPreset(sections);
  const synthesis = report?.synthesis;

  const clearPosterArtifacts = useCallback(() => {
    if (posterUrlRef.current) {
      URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = null;
    }
    setPosterBlob(null);
    setPosterUrl(null);
    setPosterFor(null);
    setQrUrl(null);
  }, []);

  const invalidateConfiguration = useCallback(() => {
    operationGenerationRef.current += 1;
    posterGenerationRef.current += 1;
    setCreating(false);
    setCreated(null);
    setCreatedFor(null);
    setCopied(false);
    setError(null);
    clearPosterArtifacts();
  }, [clearPosterArtifacts]);

  const previousLocaleRef = useRef(locale);
  useEffect(() => {
    if (previousLocaleRef.current === locale) return;
    previousLocaleRef.current = locale;
    posterGenerationRef.current += 1;
    setCreating(false);
    setError(null);
    clearPosterArtifacts();
  }, [locale, clearPosterArtifacts]);

  const previousIdentityRef = useRef(identity);
  useEffect(() => {
    if (previousIdentityRef.current === identity) return;
    previousIdentityRef.current = identity;
    invalidateConfiguration();
  }, [identity, invalidateConfiguration]);

  useEffect(() => {
    if (!open) return;
    priorFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => {
        const style = window.getComputedStyle(element);
        return !element.closest("[hidden], [aria-hidden='true']")
          && style.display !== "none"
          && style.visibility !== "hidden";
      });
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      priorFocusRef.current?.focus();
    };
  }, [open, onOpenChange]);

  useEffect(() => () => {
    if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
  }, []);

  function isCurrentOperation(generation: number, requestedFingerprint: string): boolean {
    return operationGenerationRef.current === generation
      && dialogRef.current?.dataset.shareFingerprint === requestedFingerprint;
  }

  function isCurrentPosterOperation(generation: number, requestedFingerprint: string): boolean {
    return posterGenerationRef.current === generation
      && dialogRef.current?.dataset.posterFingerprint === requestedFingerprint;
  }

  async function ensureShare(): Promise<{
    share: CreatedShare;
    url: string;
    generation: number;
    fingerprint: string;
  } | null> {
    const requestedFingerprint = fingerprint;
    const generation = operationGenerationRef.current;
    if (created && createdFor === fingerprint) {
      return {
        share: created,
        url: buildShareUrl(created.token),
        generation,
        fingerprint: requestedFingerprint,
      };
    }
    setCreating(true);
    setError(null);
    try {
      const next = await createShareWithOptions(sessionId, {
        sections: [...sections],
        expiresInMs: expireMs || undefined,
        maxViews: maxViews || undefined,
      });
      if (!isCurrentOperation(generation, requestedFingerprint)) return null;
      if (!next) {
        setError(c.failed);
        return null;
      }
      setCreated(next);
      setCreatedFor(requestedFingerprint);
      clearPosterArtifacts();
      return {
        share: next,
        url: buildShareUrl(next.token),
        generation,
        fingerprint: requestedFingerprint,
      };
    } catch {
      if (isCurrentOperation(generation, requestedFingerprint)) setError(c.failed);
      return null;
    } finally {
      if (isCurrentOperation(generation, requestedFingerprint)) setCreating(false);
    }
  }

  async function handleCopyLink() {
    const next = await ensureShare();
    if (!next) return;
    const ok = await writeClipboard(next.url);
    if (!isCurrentOperation(next.generation, next.fingerprint)) return;
    setCopied(ok);
    setError(ok ? null : c.copyFailed);
    if (ok) window.setTimeout(() => setCopied(false), 2200);
  }

  async function handleSystemShare() {
    const next = await ensureShare();
    if (!next) return;
    const webShare = webShareNavigator();
    if (!webShare.share) {
      const copiedLink = await writeClipboard(next.url);
      if (!isCurrentOperation(next.generation, next.fingerprint)) return;
      setCopied(copiedLink);
      setError(copiedLink ? null : c.copyFailed);
      return;
    }
    try {
      await webShare.share({ title: report?.query || "LaunchLens research", url: next.url });
    } catch (event) {
      if (event instanceof DOMException && event.name === "AbortError") return;
      const copiedLink = await writeClipboard(next.url);
      if (!isCurrentOperation(next.generation, next.fingerprint)) return;
      setCopied(copiedLink);
      setError(copiedLink ? null : c.copyFailed);
    }
  }

  async function buildPoster(): Promise<Blob | null> {
    const requestedPosterFingerprint = posterFingerprint;
    const posterGeneration = posterGenerationRef.current;
    const posterLocale = locale;
    const next = await ensureShare();
    if (!next) return null;
    const { generation, fingerprint: requestedFingerprint } = next;
    if (!isCurrentPosterOperation(posterGeneration, requestedPosterFingerprint)) return null;
    setCreating(true);
    setError(null);
    try {
      const poster = await import("@/lib/research/share-poster");
      const blob = await poster.renderSharePoster({
        url: next.url,
        query: report?.query || "LaunchLens Research",
        locale: posterLocale,
        sections,
        summary: synthesis?.execSummary,
        opportunityScore: synthesis?.opportunityScore,
        riskScore: synthesis?.riskScore,
        insights: synthesis?.keyInsights?.map((item) => item.insight),
        opportunities: synthesis?.topThreeOpportunities,
        risks: synthesis?.topThreeRisks,
        nextStep: synthesis?.recommendedNextStep,
        sourceCount: synthesis?.citations?.length,
      });
      if (
        !isCurrentOperation(generation, requestedFingerprint) ||
        !isCurrentPosterOperation(posterGeneration, requestedPosterFingerprint)
      ) return null;
      const nextQrUrl = await poster.qrDataUrl(next.url);
      if (
        !isCurrentOperation(generation, requestedFingerprint) ||
        !isCurrentPosterOperation(posterGeneration, requestedPosterFingerprint)
      ) return null;
      const nextPosterUrl = URL.createObjectURL(blob);
      if (
        !isCurrentOperation(generation, requestedFingerprint) ||
        !isCurrentPosterOperation(posterGeneration, requestedPosterFingerprint)
      ) {
        URL.revokeObjectURL(nextPosterUrl);
        return null;
      }
      if (posterUrlRef.current) URL.revokeObjectURL(posterUrlRef.current);
      posterUrlRef.current = nextPosterUrl;
      setPosterBlob(blob);
      setPosterUrl(nextPosterUrl);
      setPosterFor(requestedPosterFingerprint);
      setQrUrl(nextQrUrl);
      return blob;
    } catch {
      if (
        isCurrentOperation(generation, requestedFingerprint) &&
        isCurrentPosterOperation(posterGeneration, requestedPosterFingerprint)
      ) setError(c.posterFailed);
      return null;
    } finally {
      if (
        isCurrentOperation(generation, requestedFingerprint) &&
        isCurrentPosterOperation(posterGeneration, requestedPosterFingerprint)
      ) setCreating(false);
    }
  }

  async function downloadPosterBlob(blob: Blob) {
    const poster = await import("@/lib/research/share-poster");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = poster.posterFilename(report?.query || "launchlens-research", locale);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadPoster() {
    const blob = activePosterBlob || await buildPoster();
    if (blob) await downloadPosterBlob(blob);
  }

  async function sharePoster() {
    const blob = activePosterBlob || await buildPoster();
    if (!blob) return;
    const poster = await import("@/lib/research/share-poster");
    const file = new File([blob], poster.posterFilename(report?.query || "launchlens-research", locale), { type: "image/png" });
    const webShare = webShareNavigator();
    let canShareFile = false;
    try {
      canShareFile = Boolean(webShare.share && webShare.canShare?.({ files: [file] }) === true);
    } catch {
      canShareFile = false;
    }
    if (!canShareFile) {
      await downloadPosterBlob(blob);
      return;
    }
    try {
      await webShare.share?.({ title: report?.query || "LaunchLens research", files: [file] });
    } catch (event) {
      if (event instanceof DOMException && event.name === "AbortError") return;
      await downloadPosterBlob(blob);
    }
  }

  const toggleSection = (section: ShareSectionId) => {
    if (sections.includes(section) && sections.length === 1) return;
    const nextSections = sections.includes(section)
      ? sections.filter((item) => item !== section)
      : SECTION_ORDER.filter((item) => sections.includes(item) || item === section);
    invalidateConfiguration();
    setSections(nextSections);
  };

  const choosePreset = (id: Exclude<PresetId, "custom">) => {
    if (preset === id) return;
    invalidateConfiguration();
    setSections([...PRESET_SECTIONS[id]]);
  };

  const handleTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>, tab: ShareMode) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const next = tab === "poster" ? "link" : "poster";
    setMode(next);
    dialogRef.current?.querySelector<HTMLButtonElement>(`[data-share-tab="${next}"]`)?.focus();
  };

  if (!open || typeof document === "undefined") return null;

  const posterSummary = synthesis?.execSummary || c.linkIntro;
  const posterInsight = synthesis?.keyInsights?.[0]?.insight;
  const posterOpportunity = synthesis?.topThreeOpportunities?.[0];
  const posterRisk = synthesis?.topThreeRisks?.[0];

  return createPortal(
    <div className={styles.backdrop} onMouseDown={(event) => {
      if (event.target === event.currentTarget) onOpenChange(false);
    }}>
      <div
        id={id}
        ref={dialogRef}
        data-share-fingerprint={fingerprint}
        data-poster-fingerprint={posterFingerprint}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-studio-title"
        aria-describedby="share-studio-description"
      >
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>{c.eyebrow}</div>
            <h2 id="share-studio-title">{c.title}</h2>
            <p id="share-studio-description">{c.subtitle}</p>
          </div>
          <button className={styles.close} type="button" onClick={() => onOpenChange(false)} aria-label={c.close}>
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.tabs} role="tablist" aria-label={c.title}>
          {(["poster", "link"] as ShareMode[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              data-share-tab={tab}
              aria-selected={mode === tab}
              tabIndex={mode === tab ? 0 : -1}
              className={mode === tab ? styles.tabActive : styles.tab}
              onClick={() => setMode(tab)}
              onKeyDown={(event) => handleTabKey(event, tab)}
            >
              <Icon name={tab === "poster" ? "poster" : "link"} />
              {tab === "poster" ? c.posterTab : c.linkTab}
            </button>
          ))}
        </div>

        <div className={styles.workspace}>
          <section className={styles.controls} aria-label={c.contentTitle}>
            <div className={styles.sectionHeading}>
              <div>
                <h3>{c.contentTitle}</h3>
                <p>{c.contentHint}</p>
              </div>
              <span>{c.selectedCount(sections.length)}</span>
            </div>

            <div className={styles.presets}>
              {(["highlights", "discussion", "full"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={c[id]}
                  className={preset === id ? styles.presetActive : styles.preset}
                  aria-pressed={preset === id}
                  onClick={() => choosePreset(id)}
                >
                  <strong>{c[id]}</strong>
                  <span>{c[`${id}Hint` as "highlightsHint" | "discussionHint" | "fullHint"]}</span>
                </button>
              ))}
            </div>

            <div className={styles.sectionGrid}>
              {SECTION_ORDER.map((section) => {
                const checked = sections.includes(section);
                return (
                  <label key={section} className={checked ? styles.sectionCardChecked : styles.sectionCard}>
                    <input type="checkbox" checked={checked} onChange={() => toggleSection(section)} />
                    <span className={styles.checkmark}>{checked && <Icon name="check" />}</span>
                    <span>
                      <strong>{c[section]}</strong>
                      <small>{c[`${section}Hint` as keyof ShareCopy] as string}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            <div className={styles.accessPanel}>
              <button
                type="button"
                className={styles.accessToggle}
                aria-expanded={accessOpen}
                onClick={() => setAccessOpen((value) => !value)}
              >
                <span><strong>{c.access}</strong><small>{c.accessHint}</small></span>
                <span aria-hidden="true" className={accessOpen ? styles.chevronOpen : styles.chevron}>⌄</span>
              </button>
              {accessOpen && (
                <div className={styles.accessFields}>
                  <label>
                    <span>{c.expires}</span>
                    <select value={expireMs} onChange={(event) => {
                      invalidateConfiguration();
                      setExpireMs(Number(event.target.value));
                    }}>
                      <option value={0}>{c.never}</option>
                      <option value={86_400_000}>{c.oneDay}</option>
                      <option value={604_800_000}>{c.sevenDays}</option>
                      <option value={2_592_000_000}>{c.thirtyDays}</option>
                    </select>
                  </label>
                  <label>
                    <span>{c.views}</span>
                    <select value={maxViews} onChange={(event) => {
                      invalidateConfiguration();
                      setMaxViews(Number(event.target.value));
                    }}>
                      <option value={0}>{c.unlimited}</option>
                      <option value={10}>{c.tenViews}</option>
                      <option value={100}>{c.hundredViews}</option>
                      <option value={1000}>{c.thousandViews}</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
            <p className={styles.immutableNote}>{c.immutableNote}</p>
          </section>

          <section className={styles.previewPane} role="tabpanel">
            {mode === "poster" ? (
              <>
                <div className={styles.previewLabel}><span />{c.previewLabel}</div>
                <div className={styles.posterFrame}>
                  {activePosterUrl ? (
                    <Image
                      unoptimized
                      className={styles.posterImage}
                      src={activePosterUrl}
                      alt={c.previewLabel}
                      width={1080}
                      height={1440}
                    />
                  ) : (
                    <article className={styles.posterPreview}>
                      <div className={styles.posterOrbits} aria-hidden="true" />
                      <div className={styles.posterTopline}>
                        <span>LAUNCHLENS</span><span>{c.reportLabel} · {new Date().getFullYear()}</span>
                      </div>
                      <div className={styles.posterTitleBlock}>
                        <span>{c.signalLabel}</span>
                        <h3>{report?.query || "LaunchLens Research"}</h3>
                        {sections.includes("summary") && <p>{posterSummary}</p>}
                      </div>
                      {sections.includes("scores") && (
                        <div className={styles.posterScores}>
                          <div><small>{c.opportunity}</small><strong>{synthesis?.opportunityScore ?? "—"}</strong><span>/100</span></div>
                          <div><small>{c.risk}</small><strong>{synthesis?.riskScore ?? "—"}</strong><span>/100</span></div>
                        </div>
                      )}
                      {sections.includes("insights") && posterInsight && (
                        <div className={styles.posterFinding}><small>01 · {c.topInsight}</small><p>{posterInsight}</p></div>
                      )}
                      {sections.includes("opportunities") && posterOpportunity && (
                        <div className={styles.posterFinding}>
                          <small>{c.opportunities}</small>
                          <p>{posterOpportunity.title}{posterOpportunity.description ? ` · ${posterOpportunity.description}` : ""}</p>
                        </div>
                      )}
                      {sections.includes("risks") && posterRisk && (
                        <div className={styles.posterFinding}>
                          <small>{c.risks}</small>
                          <p>{posterRisk.title}{posterRisk.description ? ` · ${posterRisk.description}` : ""}</p>
                        </div>
                      )}
                      {sections.includes("nextStep") && synthesis?.recommendedNextStep && (
                        <div className={styles.posterNext}><small>{c.nextMove}</small><p>{synthesis.recommendedNextStep}</p></div>
                      )}
                      <div className={styles.posterFooter}>
                        <div className={styles.qrCard}>
                          {activeQrUrl ? (
                            <Image unoptimized src={activeQrUrl} alt="QR code" width={256} height={256} />
                          ) : (
                            <div className={styles.qrPending} aria-label={c.qrPending}><span /><span /><span /></div>
                          )}
                        </div>
                        <div><strong>{c.scan}</strong><span>{c.promo}</span></div>
                      </div>
                    </article>
                  )}
                </div>
                <div className={styles.posterActions}>
                  {!activePosterBlob ? (
                    <button type="button" className={styles.primaryAction} onClick={() => void buildPoster()} disabled={creating}>
                      <Icon name="poster" />{creating ? c.creating : c.createPoster}
                    </button>
                  ) : (
                    <>
                      <button type="button" className={styles.primaryAction} onClick={() => void downloadPoster()}>
                        <Icon name="download" />{c.savePoster}
                      </button>
                      <button type="button" className={styles.secondaryAction} onClick={() => void sharePoster()}>
                        <Icon name="share" />{c.sharePoster}
                      </button>
                    </>
                  )}
                </div>
                {activePosterBlob && <p className={styles.readyNote}><Icon name="check" />{c.posterReady}</p>}
              </>
            ) : (
              <div className={styles.linkPanel}>
                <div className={styles.linkIllustration}><Icon name="link" /></div>
                <div>
                  <span className={styles.linkEyebrow}>{c.linkTab}</span>
                  <h3>{report?.query || c.title}</h3>
                  <p>{c.linkIntro}</p>
                </div>
                {shareUrl ? (
                  <>
                    <label className={styles.urlField}>
                      <span className="sr-only">URL</span>
                      <input value={shareUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
                      <button type="button" onClick={() => void handleCopyLink()}>
                        <Icon name={copied ? "check" : "copy"} />{copied ? c.copied : c.copyLink}
                      </button>
                    </label>
                    <div className={styles.linkActions}>
                      <button type="button" className={styles.secondaryAction} onClick={() => void handleSystemShare()}>
                        <Icon name="share" />{c.systemShare}
                      </button>
                      <a className={styles.ghostAction} href={shareUrl} target="_blank" rel="noreferrer">
                        <Icon name="external" />{c.openReport}
                      </a>
                    </div>
                  </>
                ) : (
                  <button type="button" className={styles.primaryAction} onClick={() => void handleCopyLink()} disabled={creating}>
                    <Icon name="link" />{creating ? c.creating : c.createLink}
                  </button>
                )}
              </div>
            )}
            {error && <div className={styles.error} role="alert">{error}</div>}
            <div className="sr-only" aria-live="polite">{copied ? c.copied : activePosterBlob ? c.posterReady : ""}</div>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
