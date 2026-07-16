import QRCode from "qrcode";

/**
 * The exported bitmap is twice the logical drawing size. Keeping all layout
 * coordinates in a 540 x 720 space makes typography predictable while the
 * resulting 1080 x 1440 PNG remains sharp on high-density mobile displays.
 */
export const SHARE_POSTER_SCALE = 2;
export const SHARE_POSTER_WIDTH = 1080;
export const SHARE_POSTER_HEIGHT = 1440;
export const SHARE_POSTER_CONTENT_BOTTOM = 519;

export type SharePosterSectionId =
  | "summary"
  | "scores"
  | "insights"
  | "opportunities"
  | "risks"
  | "nextStep"
  | "sources";

export type SharePosterInsightInput =
  | string
  | {
      insight?: string;
      text?: string;
      title?: string;
    };

export type SharePosterFindingInput =
  | string
  | {
      title?: string;
      text?: string;
      description?: string;
      rationale?: string;
      mitigation?: string;
    };

export interface SharePosterSynthesisInput {
  execSummary?: string;
  summary?: string;
  opportunityScore?: number;
  riskScore?: number;
  keyInsights?: readonly SharePosterInsightInput[];
  insights?: readonly SharePosterInsightInput[];
  topThreeOpportunities?: readonly SharePosterFindingInput[];
  opportunities?: readonly SharePosterFindingInput[];
  topThreeRisks?: readonly SharePosterFindingInput[];
  risks?: readonly SharePosterFindingInput[];
  recommendedNextStep?: string;
  nextStep?: string;
  citations?: readonly unknown[];
  sourceCount?: number;
}

export interface SharePosterInput {
  /** Absolute public /share/{token} URL encoded into the QR code. */
  url: string;
  query: string;
  locale?: string;
  sections: readonly SharePosterSectionId[];
  synthesis?: SharePosterSynthesisInput;
  summary?: string;
  opportunityScore?: number;
  riskScore?: number;
  scores?: {
    opportunity?: number;
    risk?: number;
    opportunityScore?: number;
    riskScore?: number;
  };
  insights?: readonly SharePosterInsightInput[];
  opportunities?: readonly SharePosterFindingInput[];
  risks?: readonly SharePosterFindingInput[];
  nextStep?: string;
  sourceCount?: number;
}

export interface SharePosterCopy {
  dossier: string;
  summary: string;
  scores: string;
  opportunity: string;
  risk: string;
  insights: string;
  opportunities: string;
  risks: string;
  nextStep: string;
  sources: string;
  cta: string;
  scan: string;
  untitled: string;
}

export interface SharePosterModel {
  width: typeof SHARE_POSTER_WIDTH;
  height: typeof SHARE_POSTER_HEIGHT;
  scale: typeof SHARE_POSTER_SCALE;
  url: string;
  host: string;
  query: string;
  locale: "zh-CN" | "en";
  sections: SharePosterSectionId[];
  summary: string | null;
  scores: { opportunity: number | null; risk: number | null } | null;
  insights: string[];
  opportunities: string[];
  risks: string[];
  nextStep: string | null;
  sourceCount: number | null;
  copy: SharePosterCopy;
}

export interface WrappedPosterText {
  lines: string[];
  truncated: boolean;
}

export interface SharePosterContentLayout {
  density: "roomy" | "dense" | "compact";
  summaryLines: number;
  insightItems: number;
  insightLines: number;
  findingItems: number;
  findingLines: number;
  nextStepLines: number;
  estimatedBottom: number;
}

type MeasureText = (value: string) => number;

const SECTION_ORDER: readonly SharePosterSectionId[] = [
  "summary",
  "scores",
  "insights",
  "opportunities",
  "risks",
  "nextStep",
  "sources",
];

const INK = "#0D342C";
const INK_RAISED = "#17483D";
const INK_BORDER = "#2B5C51";
const MINT = "#78D8AA";
const MINT_PALE = "#CEE9D9";
const PAPER = "#F3EEE2";
const PAPER_BRIGHT = "#FFFDF7";
const PAPER_MUTED = "#D9E4DC";
const WARM = "#E8B977";
const WHITE_INK = "#F8F5EC";
const MUTED_INK = "#B6CDC4";
const FONT_STACK = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif';

const CONTENT_LAYOUTS: ReadonlyArray<Omit<SharePosterContentLayout, "estimatedBottom">> = [
  {
    density: "roomy",
    summaryLines: 3,
    insightItems: 3,
    insightLines: 2,
    findingItems: 2,
    findingLines: 2,
    nextStepLines: 3,
  },
  {
    density: "dense",
    summaryLines: 2,
    insightItems: 2,
    insightLines: 1,
    findingItems: 1,
    findingLines: 1,
    nextStepLines: 2,
  },
  {
    density: "compact",
    summaryLines: 1,
    insightItems: 1,
    insightLines: 1,
    findingItems: 1,
    findingLines: 1,
    nextStepLines: 1,
  },
];

const COPY: Record<SharePosterModel["locale"], SharePosterCopy> = {
  "zh-CN": {
    dossier: "调研档案 / RESEARCH DOSSIER",
    summary: "核心结论",
    scores: "决策指数",
    opportunity: "机会",
    risk: "风险",
    insights: "值得讨论",
    opportunities: "优先机会",
    risks: "关键风险",
    nextStep: "下一步行动",
    sources: "条来源已核验",
    cta: "把好想法，变成可讨论的证据",
    scan: "扫码查看这份调研报告",
    untitled: "一份值得讨论的市场调研",
  },
  en: {
    dossier: "RESEARCH DOSSIER / SHARE EDITION",
    summary: "EXECUTIVE SIGNAL",
    scores: "DECISION INDEX",
    opportunity: "Opportunity",
    risk: "Risk",
    insights: "WORTH DISCUSSING",
    opportunities: "TOP OPPORTUNITIES",
    risks: "KEY RISKS",
    nextStep: "NEXT MOVE",
    sources: "sources verified",
    cta: "Turn a promising idea into evidence worth discussing",
    scan: "Scan to open this research report",
    untitled: "A market study worth discussing",
  },
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function normalizeLocale(locale?: string): SharePosterModel["locale"] {
  return locale?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function parsePublicUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Share poster URL must be an absolute URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Share poster URL must use http or https.");
  }
  return parsed;
}

function normalizeSections(values: readonly SharePosterSectionId[]): SharePosterSectionId[] {
  const selected = new Set<string>(values);
  return SECTION_ORDER.filter((section) => selected.has(section));
}

function finiteScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function finiteCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function normalizeInsight(value: SharePosterInsightInput): string {
  if (typeof value === "string") return normalizeText(value);
  const title = normalizeText(value.title);
  const body = normalizeText(value.insight ?? value.text);
  if (!body) return "";
  return title ? `${title}: ${body}` : body;
}

function normalizeFinding(value: SharePosterFindingInput): string {
  if (typeof value === "string") return normalizeText(value);
  const title = normalizeText(value.title);
  const body = normalizeText(
    value.description ?? value.text ?? value.rationale ?? value.mitigation,
  );
  if (title && body) return `${title}: ${body}`;
  return title || body;
}

/**
 * Creates the immutable presentation model consumed by both a live preview
 * and the final bitmap. Only explicitly selected sections are copied into the
 * model, so the poster renderer cannot accidentally reveal omitted content.
 */
export function buildSharePosterModel(input: SharePosterInput): SharePosterModel {
  const parsedUrl = parsePublicUrl(input.url);
  const locale = normalizeLocale(input.locale);
  const sections = normalizeSections(input.sections);
  const selected = new Set(sections);
  const synthesis = input.synthesis;

  const summary = selected.has("summary")
    ? normalizeText(input.summary ?? synthesis?.execSummary ?? synthesis?.summary) || null
    : null;

  const opportunity = finiteScore(
    input.opportunityScore
      ?? input.scores?.opportunity
      ?? input.scores?.opportunityScore
      ?? synthesis?.opportunityScore,
  );
  const risk = finiteScore(
    input.riskScore ?? input.scores?.risk ?? input.scores?.riskScore ?? synthesis?.riskScore,
  );
  const scores = selected.has("scores") && (opportunity !== null || risk !== null)
    ? { opportunity, risk }
    : null;

  const insightValues = input.insights ?? synthesis?.keyInsights ?? synthesis?.insights ?? [];
  const insights = selected.has("insights")
    ? insightValues.map(normalizeInsight).filter(Boolean)
    : [];

  const opportunityValues = input.opportunities
    ?? synthesis?.topThreeOpportunities
    ?? synthesis?.opportunities
    ?? [];
  const opportunities = selected.has("opportunities")
    ? opportunityValues.map(normalizeFinding).filter(Boolean)
    : [];

  const riskValues = input.risks ?? synthesis?.topThreeRisks ?? synthesis?.risks ?? [];
  const risks = selected.has("risks")
    ? riskValues.map(normalizeFinding).filter(Boolean)
    : [];

  const nextStep = selected.has("nextStep")
    ? normalizeText(input.nextStep ?? synthesis?.recommendedNextStep ?? synthesis?.nextStep) || null
    : null;

  const inferredSourceCount = input.sourceCount
    ?? synthesis?.sourceCount
    ?? (Array.isArray(synthesis?.citations) ? synthesis.citations.length : undefined);
  const sourceCount = selected.has("sources") ? finiteCount(inferredSourceCount) : null;

  return {
    width: SHARE_POSTER_WIDTH,
    height: SHARE_POSTER_HEIGHT,
    scale: SHARE_POSTER_SCALE,
    url: parsedUrl.toString(),
    host: parsedUrl.host,
    query: normalizeText(input.query),
    locale,
    sections,
    summary,
    scores,
    insights,
    opportunities,
    risks,
    nextStep,
    sourceCount,
    copy: COPY[locale],
  };
}

function splitGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value),
      (part) => part.segment,
    );
  }
  return Array.from(value);
}

function splitWords(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: "word" }).segment(value),
      (part) => part.segment,
    );
  }
  return value.match(/\s+|[^\s]+/gu) ?? [];
}

function ellipsize(value: string, measure: MeasureText, maxWidth: number): string {
  const ellipsis = "…";
  const parts = splitGraphemes(value.trimEnd());
  while (parts.length > 0 && measure(parts.join("") + ellipsis) > maxWidth) {
    parts.pop();
  }
  return parts.join("").trimEnd() + ellipsis;
}

/**
 * Width-driven wrapping with word boundaries for Latin copy and grapheme
 * fallback for CJK or unusually long tokens. A caller-provided measure
 * function keeps this helper deterministic and unit-testable without Canvas.
 */
export function wrapPosterText(
  value: string,
  measure: MeasureText,
  maxWidth: number,
  maxLines: number,
): WrappedPosterText {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || maxLines <= 0) {
    return { lines: [], truncated: normalizeText(value).length > 0 };
  }

  const allLines: string[] = [];
  const paragraphs = value.replace(/\r\n?/gu, "\n").split("\n");

  for (const paragraph of paragraphs) {
    const tokens = splitWords(paragraph);
    let current = "";

    const commit = () => {
      const line = current.trimEnd();
      if (line) allLines.push(line);
      current = "";
    };

    for (const rawToken of tokens) {
      const token = current ? rawToken : rawToken.trimStart();
      if (!token) continue;
      const candidate = current + token;
      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      commit();
      const remainder = token.trimStart();
      if (!remainder) continue;
      if (measure(remainder) <= maxWidth) {
        current = remainder;
        continue;
      }

      for (const grapheme of splitGraphemes(remainder)) {
        const next = current + grapheme;
        if (current && measure(next) > maxWidth) commit();
        current += grapheme;
      }
    }

    commit();
  }

  if (allLines.length <= maxLines) {
    return { lines: allLines, truncated: false };
  }

  const lines = allLines.slice(0, maxLines);
  lines[lines.length - 1] = ellipsize(lines[lines.length - 1], measure, maxWidth);
  return { lines, truncated: true };
}

/** A filesystem-safe PNG filename that preserves meaningful CJK copy. */
export function posterFilename(query: string, locale?: string): string {
  const normalized = normalizeText(query).normalize("NFKC");
  const safe = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001F]/gu, "-")
    .replace(/[\s-]+/gu, "-")
    .replace(/^[.\s-]+|[.\s-]+$/gu, "");
  const shortened = splitGraphemes(safe).slice(0, 48).join("").replace(/[.\s-]+$/gu, "");
  const suffix = normalizeLocale(locale) === "zh-CN" ? "调研海报" : "research-poster";
  return shortened ? `LaunchLens-${shortened}-${suffix}.png` : `LaunchLens-${suffix}.png`;
}

/**
 * Generates a standalone QR preview locally. The public bearer URL never
 * leaves the browser for a third-party QR service.
 */
export async function qrDataUrl(url: string): Promise<string> {
  const parsed = parsePublicUrl(url);
  return QRCode.toDataURL(parsed.toString(), {
    errorCorrectionLevel: "Q",
    margin: 4,
    width: 512,
    color: { dark: `${INK}FF`, light: `${PAPER_BRIGHT}FF` },
  });
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(Math.max(radius, 0), width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
): void {
  roundedRectPath(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const wrapped = wrapPosterText(value, (text) => context.measureText(text).width, maxWidth, maxLines);
  wrapped.lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return wrapped.lines.length * lineHeight;
}

function drawSectionLabel(
  context: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
): void {
  context.font = `700 8px ${FONT_STACK}`;
  context.fillStyle = MINT;
  context.fillText(label, x, y);
}

function drawScoreCard(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  label: string,
  value: number | null,
  accent: string,
): void {
  fillRoundedRect(context, x, y, width, 37, 7, INK_RAISED);
  context.strokeStyle = INK_BORDER;
  context.lineWidth = 0.75;
  roundedRectPath(context, x, y, width, 37, 7);
  context.stroke();
  context.font = `600 8px ${FONT_STACK}`;
  context.fillStyle = MUTED_INK;
  context.fillText(label, x + 11, y + 8);
  context.font = `750 17px ${FONT_STACK}`;
  context.fillStyle = accent;
  context.fillText(value === null ? "—" : String(value), x + 11, y + 17);
  context.font = `600 7px ${FONT_STACK}`;
  context.fillStyle = MUTED_INK;
  context.fillText("/ 100", x + width - 34, y + 23);
}

function drawPosterBackground(context: CanvasRenderingContext2D): void {
  context.fillStyle = PAPER;
  context.fillRect(0, 0, 540, 720);

  context.fillStyle = MINT_PALE;
  context.fillRect(474, 22, 22, 5);
  context.fillRect(501, 22, 9, 5);
  context.fillRect(30, 692, 34, 5);

  context.strokeStyle = "#B8C8BF";
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(29, 28);
  context.lineTo(92, 28);
  context.moveTo(448, 696);
  context.lineTo(511, 696);
  context.stroke();

  context.font = `800 10px ${FONT_STACK}`;
  context.fillStyle = INK;
  context.fillText("LAUNCHLENS", 29, 18);
  context.font = `600 7px ${FONT_STACK}`;
  context.fillStyle = "#5B746A";
  context.fillText("RESEARCH STUDIO", 29, 34);
}

function drawDossierShell(context: CanvasRenderingContext2D): void {
  fillRoundedRect(context, 42, 82, 470, 592, 13, MINT_PALE);
  fillRoundedRect(context, 35, 75, 477, 606, 13, "#275348");
  fillRoundedRect(context, 28, 68, 484, 621, 13, INK);
  fillRoundedRect(context, 55, 51, 206, 34, 8, INK);
  context.fillStyle = MINT;
  context.fillRect(55, 78, 206, 7);

  context.strokeStyle = INK_BORDER;
  context.lineWidth = 0.75;
  roundedRectPath(context, 28, 68, 484, 621, 13);
  context.stroke();
}

function drawHeader(context: CanvasRenderingContext2D, model: SharePosterModel): number {
  const left = 51;
  context.font = `700 8px ${FONT_STACK}`;
  context.fillStyle = MINT;
  context.fillText(model.copy.dossier, left, 96);

  context.font = `750 25px ${FONT_STACK}`;
  context.fillStyle = WHITE_INK;
  const titleHeight = drawWrappedText(
    context,
    model.query || model.copy.untitled,
    left,
    119,
    431,
    31,
    3,
  );
  let y = 119 + titleHeight + 8;

  context.font = `600 8px ${FONT_STACK}`;
  context.fillStyle = MUTED_INK;
  const metadata = model.sourceCount === null
    ? "MULTI-AGENT MARKET INTELLIGENCE"
    : `MULTI-AGENT  ·  ${model.sourceCount} ${model.copy.sources}`;
  context.fillText(metadata, left, y);
  y += 17;

  context.strokeStyle = INK_BORDER;
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(left, y);
  context.lineTo(489, y);
  context.stroke();
  return y + 13;
}

function drawFindingSection(
  context: CanvasRenderingContext2D,
  label: string,
  findings: string[],
  x: number,
  y: number,
  width: number,
  itemLimit: number,
  lineLimit: number,
  accent: string,
): number {
  if (findings.length === 0) return y;
  drawSectionLabel(context, label, x, y);
  y += 14;
  context.font = `600 9.5px ${FONT_STACK}`;
  const limit = Math.min(findings.length, itemLimit);
  for (let index = 0; index < limit; index += 1) {
    context.fillStyle = accent;
    fillRoundedRect(context, x, y + 3, 5, 5, 1.5, accent);
    context.fillStyle = WHITE_INK;
    const used = drawWrappedText(
      context,
      findings[index],
      x + 13,
      y,
      width - 13,
      14,
      lineLimit,
    );
    y += Math.max(used, 14) + 3;
  }
  return y + 5;
}

function estimateContentHeight(
  model: SharePosterModel,
  layout: Omit<SharePosterContentLayout, "estimatedBottom">,
): number {
  let height = 0;
  if (model.scores) height += 62;
  if (model.summary) height += 14 + layout.summaryLines * 16 + 8;
  if (model.insights.length > 0) {
    height += 14
      + Math.min(model.insights.length, layout.insightItems) * (layout.insightLines * 15 + 3)
      + 5;
  }
  const findingHeight = (count: number) => count > 0
    ? 14 + Math.min(count, layout.findingItems) * (layout.findingLines * 14 + 3) + 5
    : 0;
  height += findingHeight(model.opportunities.length);
  height += findingHeight(model.risks.length);
  if (model.nextStep) {
    height += 13 + Math.max(35, layout.nextStepLines * 15 + 17);
  }
  return height;
}

/** Selects the richest content layout that stays above the fixed QR footer. */
export function selectSharePosterContentLayout(
  model: SharePosterModel,
  startY: number,
): SharePosterContentLayout {
  for (const layout of CONTENT_LAYOUTS) {
    const estimatedBottom = startY + estimateContentHeight(model, layout);
    if (estimatedBottom <= SHARE_POSTER_CONTENT_BOTTOM) {
      return { ...layout, estimatedBottom };
    }
  }
  const compact = CONTENT_LAYOUTS[CONTENT_LAYOUTS.length - 1];
  return {
    ...compact,
    estimatedBottom: startY + estimateContentHeight(model, compact),
  };
}

function drawSelectedContent(
  context: CanvasRenderingContext2D,
  model: SharePosterModel,
  startY: number,
): number {
  const left = 51;
  const width = 431;
  const layout = selectSharePosterContentLayout(model, startY);
  let y = startY;

  if (model.scores) {
    drawSectionLabel(context, model.copy.scores, left, y);
    y += 14;
    drawScoreCard(context, left, y, 207, model.copy.opportunity, model.scores.opportunity, MINT);
    drawScoreCard(context, left + 224, y, 207, model.copy.risk, model.scores.risk, WARM);
    y += 48;
  }

  if (model.summary) {
    drawSectionLabel(context, model.copy.summary, left, y);
    y += 14;
    context.font = `500 11px ${FONT_STACK}`;
    context.fillStyle = PAPER_MUTED;
    y += drawWrappedText(context, model.summary, left, y, width, 16, layout.summaryLines) + 8;
  }

  if (model.insights.length > 0) {
    drawSectionLabel(context, model.copy.insights, left, y);
    y += 14;
    context.font = `600 10px ${FONT_STACK}`;
    context.fillStyle = WHITE_INK;
    const insightLimit = Math.min(model.insights.length, layout.insightItems);
    for (let index = 0; index < insightLimit; index += 1) {
      context.fillStyle = MINT;
      context.beginPath();
      context.arc(left + 3, y + 6, 2.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = WHITE_INK;
      const used = drawWrappedText(
        context,
        model.insights[index],
        left + 13,
        y,
        width - 13,
        15,
        layout.insightLines,
      );
      y += Math.max(used, 15) + 3;
    }
    y += 5;
  }

  y = drawFindingSection(
    context,
    model.copy.opportunities,
    model.opportunities,
    left,
    y,
    width,
    layout.findingItems,
    layout.findingLines,
    MINT,
  );
  y = drawFindingSection(
    context,
    model.copy.risks,
    model.risks,
    left,
    y,
    width,
    layout.findingItems,
    layout.findingLines,
    WARM,
  );

  if (model.nextStep) {
    drawSectionLabel(context, model.copy.nextStep, left, y);
    y += 13;
    const maxLines = layout.nextStepLines;
    context.font = `650 10px ${FONT_STACK}`;
    const wrapped = wrapPosterText(
      model.nextStep,
      (text) => context.measureText(text).width,
      width - 24,
      maxLines,
    );
    const cardHeight = Math.max(35, wrapped.lines.length * 15 + 17);
    fillRoundedRect(context, left, y, width, cardHeight, 7, INK_RAISED);
    context.strokeStyle = INK_BORDER;
    context.lineWidth = 0.75;
    roundedRectPath(context, left, y, width, cardHeight, 7);
    context.stroke();
    context.fillStyle = WHITE_INK;
    wrapped.lines.forEach((line, index) => context.fillText(line, left + 12, y + 9 + index * 15));
    y += cardHeight;
  }
  return y;
}

async function drawShareFooter(
  context: CanvasRenderingContext2D,
  model: SharePosterModel,
): Promise<void> {
  const cardX = 43;
  const cardY = 531;
  const cardWidth = 454;
  const cardHeight = 139;
  const qrX = 52;
  const qrY = 541;
  const qrSize = 119;

  fillRoundedRect(context, cardX, cardY, cardWidth, cardHeight, 10, PAPER_BRIGHT);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, model.url, {
    errorCorrectionLevel: "Q",
    margin: 4,
    width: qrSize * SHARE_POSTER_SCALE,
    color: { dark: `${INK}FF`, light: `${PAPER_BRIGHT}FF` },
  });
  context.imageSmoothingEnabled = false;
  context.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
  context.imageSmoothingEnabled = true;

  const copyX = 190;
  context.font = `750 17px ${FONT_STACK}`;
  context.fillStyle = INK;
  const headlineHeight = drawWrappedText(context, model.copy.cta, copyX, 548, 287, 22, 2);
  context.font = `650 10px ${FONT_STACK}`;
  context.fillStyle = "#406258";
  const scanY = 548 + headlineHeight + 8;
  drawWrappedText(context, model.copy.scan, copyX, scanY, 287, 15, 2);

  context.fillStyle = MINT_PALE;
  fillRoundedRect(context, copyX, 633, 287, 22, 11, MINT_PALE);
  context.font = `650 8px ${FONT_STACK}`;
  context.fillStyle = INK;
  const host = wrapPosterText(model.host, (text) => context.measureText(text).width, 265, 1).lines[0] ?? model.host;
  context.fillText(host, copyX + 11, 640);

  context.font = `700 7px ${FONT_STACK}`;
  context.fillStyle = "#6F857C";
  context.fillText("LAUNCHLENS · EVIDENCE BEFORE OPINION", 51, 697);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error("This browser cannot export a Canvas as PNG."));
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser returned an empty poster image."));
    }, "image/png");
  });
}

/**
 * Renders a 1080 x 1440 PNG entirely in the browser. No remote images, fonts,
 * or QR endpoints are used, which keeps the bearer share URL on-device and
 * prevents cross-origin canvas tainting.
 */
export async function renderSharePoster(input: SharePosterInput): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Share posters require a browser Canvas environment.");
  }

  const model = buildSharePosterModel(input);
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_POSTER_WIDTH;
  canvas.height = SHARE_POSTER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Share posters require a browser Canvas 2D context.");
  }

  context.scale(SHARE_POSTER_SCALE, SHARE_POSTER_SCALE);
  context.textBaseline = "top";
  context.lineJoin = "round";
  context.lineCap = "round";

  drawPosterBackground(context);
  drawDossierShell(context);
  const contentY = drawHeader(context, model);
  context.save();
  context.beginPath();
  context.rect(45, contentY - 2, 445, Math.max(0, SHARE_POSTER_CONTENT_BOTTOM - contentY + 2));
  context.clip();
  drawSelectedContent(context, model, contentY);
  context.restore();
  await drawShareFooter(context, model);
  return canvasToPngBlob(canvas);
}
