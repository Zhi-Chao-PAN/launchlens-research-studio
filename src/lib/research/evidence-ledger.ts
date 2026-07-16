import type { RetrievedSource } from "@/lib/providers/retrieval.types";
import { filterCitationsAgainstRetrieved } from "@/lib/providers/retrieval-validate";
import {
  detectQueryLanguage,
  type OutputLanguage,
} from "@/lib/providers/query-language";
import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";
import {
  RESEARCH_AGENTS,
  type AgentEvidenceLedgerEntry,
  type AgentId,
  type AgentOutput,
  type EvidenceAllowlistStats,
  type EvidenceLedger,
  type ResearchSession,
  type SourceCitation,
} from "@/lib/schema/research-schema";

const ALL_AGENTS: readonly AgentId[] = [...RESEARCH_AGENTS, "synthesis"];
const FOCUSED_QUERY_MAX_CHARS = 280;
const DEEP_QUERY_MAX_CHARS = 120;
const DEEP_QUERY_ANCHOR_MAX_CHARS = 64;
const MAX_DEEP_QUERY_QUALIFIERS = 3;
const DEEP_CATEGORY_KEYWORD_MIN_SCORE = 2;
const DEEP_CATEGORY_TERM_PATTERN = /\b(?:analytics?|app(?:lication)?s?|assistant|database|engine|marketplace|platform|product|research|service|software|solution|suite|system|tool(?:ing)?|workspace)\b/giu;
const DEEP_CATEGORY_CJK_PATTERN = /(?:产品|助手|工具|平台|市场研究|应用|引擎|服务|系统|研究|软件)/gu;
const SAAS_DEEP_CONTEXT_PATTERN = /\b(?:saas|software[\s-]+as[\s-]+a[\s-]+service)\b/iu;
const DEEP_SUBJECT_ACTION_PATTERN = /(?:\b(?:build|create|develop|launch|make|open|operate|offer|provide|sell|serve|start)\b|摆摊|售卖|销售|卖|开设|开办|经营|提供|打造|开发|販売|売る|開業|開く|始める|出店|運営|提供|開発|판매|팔다|개업|열다|시작|운영|제공|개발)/iu;
const DEEP_RESEARCH_DIMENSION_PATTERN = /^(?:market(?: demand| size| opportunity)?|demand|compliance|regulation|unit economics|pricing|price|competition|competitive landscape|competitors?|customer acquisition|acquisition channels?|channels?|risks?|costs?|margins?|profitability|市场需求|市场规模|市场机会|需求|合规(?:约束)?|监管|单位经济性|定价|价格|竞争(?:格局|对手)?|获客(?:渠道)?|渠道|风险|成本|毛利|盈利能力|市場需要|市場規模|需要|コンプライアンス|規制|ユニットエコノミクス|価格(?:設定)?|競争(?:環境)?|顧客獲得|獲得チャネル|チャネル|リスク|コスト|粗利|収益性|시장 수요|시장 규모|수요|컴플라이언스|규제|단위 경제성|가격(?: 책정)?|경쟁(?: 구도)?|고객 획득|획득 채널|채널|위험|비용|마진|수익성)$/iu;
const DEEP_SUBJECT_STOP_WORDS = new Set([
  "about", "and", "for", "from", "including", "into", "near", "outside",
  "the", "this", "with", "一个", "这个", "关于", "以及", "包括", "进行",
]);

type SpecialistAgentId = Exclude<AgentId, "synthesis">;
type DeepPrimaryIntentCatalog = Record<
  SpecialistAgentId,
  readonly [string, string, string]
>;
type DeepRescueIntentCatalog = Record<
  SpecialistAgentId,
  readonly [string, string]
>;

const AGENT_RETRIEVAL_FOCUS: Record<SpecialistAgentId, string> = {
  "market-sizer": "market size TAM SAM SOM CAGR forecasts industry reports",
  "competitor-analyst": "competitors alternatives product features positioning market share",
  "pain-detective": "user reviews complaints forum discussions unmet needs",
  "pricing-scout": "pricing pages plans tiers willingness to pay benchmarks",
  "channel-scout": "customer acquisition channels communities SEO paid media partnerships",
};

const SOFTWARE_DEEP_RETRIEVAL_INTENTS: DeepPrimaryIntentCatalog = {
  "market-sizer": [
    "market size CAGR and regional forecasts",
    "customer counts and spending for TAM SAM SOM",
    "adjacent market sizing benchmarks",
  ],
  "competitor-analyst": [
    "direct alternatives features and positioning",
    "competitor official pricing pages and plans",
    "independent comparisons reviews and coverage gaps",
  ],
  "pain-detective": [
    "complaints from Reddit, Indie Hackers, G2, and product reviews",
    "manual workflow trust citation and data-quality pain",
    "cross-border bilingual user needs and unmet needs",
  ],
  "pricing-scout": [
    "software official pricing pages and plans",
    "SaaS pricing and packaging benchmarks",
    "customer reviews and price sensitivity",
  ],
  "channel-scout": [
    "founder communities directories events and partnerships",
    "B2B SaaS acquisition benchmarks content paid and outbound",
    "search demand content topics and cross-border channels",
  ],
};

const SOFTWARE_DEEP_RETRIEVAL_RESCUE_INTENTS: DeepRescueIntentCatalog = {
  "market-sizer": ["industry revenue forecasts", "customer and spending benchmarks"],
  "competitor-analyst": ["software alternatives comparison", "product reviews and feature gaps"],
  "pain-detective": ["user complaints and unmet needs", "workflow reviews and forum discussions"],
  "pricing-scout": ["software pricing comparison", "buyer budget benchmarks"],
  "channel-scout": ["customer acquisition benchmarks", "founder communities and partnerships"],
};

const GENERAL_DEEP_RETRIEVAL_INTENTS: Record<
  OutputLanguage,
  DeepPrimaryIntentCatalog
> = {
  en: {
    "market-sizer": [
      "market size demand customer counts and regional growth data",
      "customer frequency spending and serviceable market estimates",
      "adjacent category benchmarks industry reports and official statistics",
    ],
    "competitor-analyst": [
      "direct competitors substitutes features and positioning",
      "competitor official prices menus packages and offers",
      "independent comparisons customer reviews and market gaps",
    ],
    "pain-detective": [
      "customer reviews complaints forum discussions and pain points",
      "purchase barriers usage occasions trust quality and convenience problems",
      "target customer unmet needs and adoption barriers",
    ],
    "pricing-scout": [
      "competitor official prices menus packages and offers",
      "cost margins average order value and category pricing benchmarks",
      "customer willingness to pay price sensitivity and reviews",
    ],
    "channel-scout": [
      "customer acquisition channels local communities directories events and partnerships",
      "online offline promotion conversion cost and industry benchmarks",
      "search demand content topics platforms and regional channels",
    ],
  },
  "zh-CN": {
    "market-sizer": [
      "市场规模 需求量 客群数量 区域增长 数据",
      "消费频次 支出水平 可服务市场 估算",
      "相邻品类 行业基准 研究报告 官方统计",
    ],
    "competitor-analyst": [
      "直接竞争者 替代方案 产品服务特色 市场定位",
      "竞品官方价格 菜单 套餐 收费方案",
      "独立对比 消费者评价 市场空白",
    ],
    "pain-detective": [
      "消费者评价 投诉 论坛讨论 使用痛点",
      "购买障碍 使用场景 便利性 信任 质量问题",
      "目标客群 未满足需求 采用障碍",
    ],
    "pricing-scout": [
      "竞品官方价格 菜单 套餐 收费方案",
      "成本 毛利 客单价 定价区间 行业基准",
      "消费者支付意愿 价格敏感度 用户评价",
    ],
    "channel-scout": [
      "目标客户 获客渠道 本地社群 目录 活动 合作",
      "线上线下推广 转化成本 行业基准",
      "搜索需求 内容主题 平台流量 地区渠道",
    ],
  },
  ja: {
    "market-sizer": [
      "市場規模 需要 顧客数 地域別成長 データ",
      "利用頻度 支出水準 獲得可能市場 推計",
      "隣接市場 業界ベンチマーク 調査報告 公的統計",
    ],
    "competitor-analyst": [
      "直接競合 代替手段 特徴 ポジショニング",
      "競合の公式価格 メニュー パッケージ",
      "第三者比較 顧客レビュー 市場ギャップ",
    ],
    "pain-detective": [
      "顧客レビュー 苦情 掲示板 課題",
      "購入障壁 利用場面 利便性 信頼 品質問題",
      "対象顧客 未充足ニーズ 導入障壁",
    ],
    "pricing-scout": [
      "競合の公式価格 メニュー パッケージ",
      "原価 粗利 客単価 価格帯 業界基準",
      "支払意思 価格感度 顧客レビュー",
    ],
    "channel-scout": [
      "顧客獲得チャネル 地域コミュニティ イベント 提携",
      "オンライン オフライン販促 獲得コスト 業界基準",
      "検索需要 コンテンツ プラットフォーム 地域チャネル",
    ],
  },
  ko: {
    "market-sizer": [
      "시장 규모 수요 고객 수 지역 성장 데이터",
      "이용 빈도 지출 수준 서비스 가능 시장 추정",
      "인접 시장 업계 벤치마크 조사 보고서 공공 통계",
    ],
    "competitor-analyst": [
      "직접 경쟁 대안 특징 포지셔닝",
      "경쟁사 공식 가격 메뉴 패키지",
      "독립 비교 고객 리뷰 시장 공백",
    ],
    "pain-detective": [
      "고객 리뷰 불만 커뮤니티 토론 문제점",
      "구매 장벽 사용 상황 편의성 신뢰 품질 문제",
      "목표 고객 미충족 수요 도입 장벽",
    ],
    "pricing-scout": [
      "경쟁사 공식 가격 메뉴 패키지",
      "원가 마진 객단가 가격대 업계 기준",
      "지불 의사 가격 민감도 고객 리뷰",
    ],
    "channel-scout": [
      "고객 획득 채널 지역 커뮤니티 행사 제휴",
      "온라인 오프라인 홍보 전환 비용 업계 기준",
      "검색 수요 콘텐츠 플랫폼 지역 채널",
    ],
  },
};

const GENERAL_DEEP_RETRIEVAL_RESCUE_INTENTS: Record<
  OutputLanguage,
  DeepRescueIntentCatalog
> = {
  en: {
    "market-sizer": ["official demand statistics", "customer and spending benchmarks"],
    "competitor-analyst": ["competitor and substitute comparison", "customer reviews and market gaps"],
    "pain-detective": ["customer complaints and unmet needs", "reviews forums and purchase barriers"],
    "pricing-scout": ["competitor prices and packages", "customer budget and margin benchmarks"],
    "channel-scout": ["customer acquisition benchmarks", "local communities events and partnerships"],
  },
  "zh-CN": {
    "market-sizer": ["官方需求统计 行业数据", "客群数量 消费支出 基准"],
    "competitor-analyst": ["竞争者 替代方案 对比", "消费者评价 市场空白"],
    "pain-detective": ["消费者投诉 未满足需求", "用户评价 论坛 购买障碍"],
    "pricing-scout": ["竞品价格 套餐 对比", "消费者预算 成本 毛利 基准"],
    "channel-scout": ["获客渠道 成本 基准", "本地社群 活动 合作"],
  },
  ja: {
    "market-sizer": ["公的需要統計 業界データ", "顧客数 消費支出 ベンチマーク"],
    "competitor-analyst": ["競合 代替手段 比較", "顧客レビュー 市場ギャップ"],
    "pain-detective": ["顧客の苦情 未充足ニーズ", "レビュー 掲示板 購入障壁"],
    "pricing-scout": ["競合価格 パッケージ 比較", "顧客予算 原価 粗利 基準"],
    "channel-scout": ["顧客獲得チャネル コスト 基準", "地域コミュニティ イベント 提携"],
  },
  ko: {
    "market-sizer": ["공식 수요 통계 업계 데이터", "고객 수 소비 지출 벤치마크"],
    "competitor-analyst": ["경쟁사 대안 비교", "고객 리뷰 시장 공백"],
    "pain-detective": ["고객 불만 미충족 수요", "리뷰 커뮤니티 구매 장벽"],
    "pricing-scout": ["경쟁사 가격 패키지 비교", "고객 예산 원가 마진 기준"],
    "channel-scout": ["고객 획득 채널 비용 기준", "지역 커뮤니티 행사 제휴"],
  },
};

export function createEvidenceLedger(now: string = new Date().toISOString()): EvidenceLedger {
  const agents: EvidenceLedger["agents"] = {};
  for (const agentId of ALL_AGENTS) {
    agents[agentId] = createAgentEvidenceEntry(agentId, now);
  }
  return { version: 1, agents };
}

export function ensureEvidenceLedger(session: ResearchSession): EvidenceLedger {
  if (!session.evidence || session.evidence.version !== 1) {
    session.evidence = createEvidenceLedger(session.updatedAt || new Date().toISOString());
    return session.evidence;
  }

  for (const agentId of ALL_AGENTS) {
    if (!session.evidence.agents[agentId]) {
      session.evidence.agents[agentId] = createAgentEvidenceEntry(
        agentId,
        session.updatedAt || new Date().toISOString(),
      );
    }
  }
  return session.evidence;
}

export function createAgentEvidenceEntry(
  agentId: AgentId,
  now: string = new Date().toISOString(),
): AgentEvidenceLedgerEntry {
  return {
    agentId,
    retrieval: {
      status: "not_requested",
      sourceOrigin: "none",
      sourceCount: 0,
      sources: [],
    },
    allowlist: emptyAllowlistStats(),
    grounding: "ungrounded",
    updatedAt: now,
  };
}

export function emptyAllowlistStats(): EvidenceAllowlistStats {
  return {
    policy: "compatible",
    total: 0,
    matched: 0,
    rejected: 0,
    missingUrl: 0,
    retained: 0,
  };
}

/** Build a focused search query without changing the user's original query. */
export function buildFocusedRetrievalQuery(
  query: string,
  agentId: Exclude<AgentId, "synthesis">,
): string {
  const focus = AGENT_RETRIEVAL_FOCUS[agentId];
  const base = query.replace(/\s+/g, " ").trim();
  if (!base) return focus;

  // Search providers expect a concise query, not the user's full research
  // brief. Put the specialist intent first so truncation cannot discard it.
  return truncateAtWordBoundary(
    `${focus}. Product context: ${base}`,
    FOCUSED_QUERY_MAX_CHARS,
  );
}

/**
 * Deep mode fans retrieval across complementary evidence intents instead of
 * asking one overloaded search query to cover an entire specialist schema.
 */
export function buildDeepRetrievalQueries(
  query: string,
  agentId: SpecialistAgentId,
  keywords: readonly string[] = [],
): string[] {
  const plan = buildDeepQueryPlan(query, keywords, agentId);
  const intents = selectDeepPrimaryIntents(query, keywords, agentId);
  return intents.map((intent, index) =>
    composeDeepRetrievalQuery(plan.anchor, intent, plan.qualifiers[index]),
  );
}

/**
 * Bounded rescue queries for Deep runs whose initial fan-out is too narrow.
 * The caller executes them sequentially and excludes all publishers admitted
 * so far. The query itself stays content-focused; publisher diversity belongs
 * in the structured `excludeDomains` control rather than search prose.
 */
export function buildDeepRetrievalRescueQueries(
  query: string,
  agentId: SpecialistAgentId,
  keywords: readonly string[] = [],
): string[] {
  const plan = buildDeepQueryPlan(query, keywords, agentId);
  const intents = selectDeepRescueIntents(query, keywords, agentId);
  return intents.map((intent) =>
    truncateAtWordBoundary(
      `${plan.anchor} ${intent}`,
      DEEP_QUERY_MAX_CHARS,
    ),
  );
}

/**
 * Curated English software-review publishers are useful for SaaS research,
 * but become a topicality bug for local businesses and non-English markets.
 */
export function shouldRestrictDeepVocDomains(
  query: string,
  keywords: readonly string[] = [],
): boolean {
  const context = deepQueryContext(query, keywords);
  return deepIntentLanguage(query, keywords) === "en" && isSaasDeepContext(context);
}

function selectDeepPrimaryIntents(
  query: string,
  keywords: readonly string[],
  agentId: SpecialistAgentId,
): DeepPrimaryIntentCatalog[SpecialistAgentId] {
  const context = deepQueryContext(query, keywords);
  const language = deepIntentLanguage(query, keywords);
  if (language === "en" && isSaasDeepContext(context)) {
    return SOFTWARE_DEEP_RETRIEVAL_INTENTS[agentId];
  }
  return GENERAL_DEEP_RETRIEVAL_INTENTS[language][agentId];
}

function selectDeepRescueIntents(
  query: string,
  keywords: readonly string[],
  agentId: SpecialistAgentId,
): DeepRescueIntentCatalog[SpecialistAgentId] {
  const context = deepQueryContext(query, keywords);
  const language = deepIntentLanguage(query, keywords);
  if (language === "en" && isSaasDeepContext(context)) {
    return SOFTWARE_DEEP_RETRIEVAL_RESCUE_INTENTS[agentId];
  }
  return GENERAL_DEEP_RETRIEVAL_RESCUE_INTENTS[language][agentId];
}

function deepQueryContext(query: string, keywords: readonly string[]): string {
  return [query, ...keywords].filter(Boolean).join(" ").trim();
}

function deepIntentLanguage(
  query: string,
  keywords: readonly string[],
): OutputLanguage {
  const primary = query.trim();
  const context = primary || keywords.join(" ");
  return detectQueryLanguage(context);
}

function isSaasDeepContext(context: string): boolean {
  // Preserve the established specialist fallback for an empty operator query,
  // while requiring explicit SaaS evidence for real product contexts.
  return !context || SAAS_DEEP_CONTEXT_PATTERN.test(context);
}

function composeDeepRetrievalQuery(
  anchor: string,
  intent: string,
  qualifier?: string,
): string {
  if (!qualifier) {
    return truncateAtWordBoundary(`${anchor} ${intent}`, DEEP_QUERY_MAX_CHARS);
  }
  const qualifierSuffix = ` ${qualifier}`;
  const baseBudget = Math.max(1, DEEP_QUERY_MAX_CHARS - qualifierSuffix.length);
  const base = truncateAtWordBoundary(`${anchor} ${intent}`, baseBudget);
  return `${base}${qualifierSuffix}`.trim();
}

function buildDeepQueryPlan(
  query: string,
  keywords: readonly string[],
  agentId: SpecialistAgentId,
): { anchor: string; qualifiers: string[] } {
  const sanitizedKeywords: string[] = [];
  const seen = new Set<string>();
  for (const value of keywords) {
    const normalized = normalizeDeepQueryFragment(value, 40);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    sanitizedKeywords.push(normalized);
  }

  const querySubject = extractDeepQuerySubject(query, sanitizedKeywords);
  const categoryKeywordIndex = findDeepCategoryKeywordIndex(sanitizedKeywords);
  const categoryKeyword = sanitizedKeywords[categoryKeywordIndex];
  const keywordFallback = sanitizedKeywords.slice(0, 2).join(" ");
  const anchor = truncateAtWordBoundary(
    categoryKeyword || querySubject || keywordFallback || AGENT_RETRIEVAL_FOCUS[agentId],
    DEEP_QUERY_ANCHOR_MAX_CHARS,
  );
  const normalizedAnchor = normalizeDeepQueryComparison(anchor);
  const qualifiers = sanitizedKeywords
    .filter((keyword, index) =>
      index !== categoryKeywordIndex &&
      !normalizedAnchor.includes(normalizeDeepQueryComparison(keyword)),
    )
    .slice(0, MAX_DEEP_QUERY_QUALIFIERS);
  return { anchor, qualifiers };
}

function findDeepCategoryKeywordIndex(keywords: readonly string[]): number {
  let bestIndex = -1;
  let bestScore = DEEP_CATEGORY_KEYWORD_MIN_SCORE - 1;
  keywords.forEach((keyword, index) => {
    const normalized = normalizeDeepQueryComparison(keyword);
    const englishTerms = normalized.match(DEEP_CATEGORY_TERM_PATTERN)?.length ?? 0;
    const cjkTerms = normalized.match(DEEP_CATEGORY_CJK_PATTERN)?.length ?? 0;
    const marketResearchBonus =
      (/\bmarket\s+research\b/iu.test(normalized) ? 2 : 0) +
      (/市场研究/u.test(normalized) ? 2 : 0);
    const score = englishTerms + cjkTerms + marketResearchBonus;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

function extractDeepQuerySubject(
  query: string,
  keywords: readonly string[],
): string {
  const base = normalizeDeepQueryFragment(query, 400)
    .replace(
      /^(?:please\s+)?(?:evaluate|assess|analy[sz]e|research|investigate|explore|estimate)\s+(?:the\s+)?(?:market\s+opportunity\s+for\s+)?/i,
      "",
    )
    .replace(/^(?:the\s+)?market\s+opportunity\s+for\s+/i, "")
    .replace(/^(?:an?|the)\s+/i, "")
    .replace(/^(?:请)?(?:评估|分析|研究|调查|探索|估算)(?:一下)?(?:关于)?/, "")
    .replace(/^(?:i|we)\s+(?:have|am\s+considering|are\s+considering)\s+(?:(?:a|an)\s+)?(?:ai\s+)?(?:startup|business|product)\s+idea\s*[,：:-]?\s*/i, "")
    .replace(/^(?:(?:a|an)\s+)?(?:ai\s+)?(?:startup|business|product)\s+idea\s*[:：-]\s*/i, "")
    .replace(/^(?:我|我们)(?:有|正在考虑)?(?:一个)?(?:创业|商业|产品)?想法(?:是)?\s*[,，:：-]?\s*/u, "")
    .replace(/^(?:一个|这(?:个)?|我的)?(?:创业|商业|产品)?想法\s*[:：]\s*/u, "");
  const clauses = base
    .split(/[,;，；。!?！？]|\.(?=\s+[\p{Lu}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|$)/u)
    .map((value) => value.trim().replace(/[.．]+$/u, ""))
    .filter(Boolean);
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  clauses.forEach((clause, index) => {
    const score = scoreDeepSubjectClause(clause, keywords);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  const selected = clauses[bestIndex] ?? clauses[0] ?? "";
  let locationIndex = -1;
  for (let distance = 1; distance < clauses.length && locationIndex < 0; distance += 1) {
    for (const index of [bestIndex - distance, bestIndex + distance]) {
      if (
        index >= 0 &&
        index < clauses.length &&
        !isWeakDeepSubjectClause(clauses[index]!) &&
        isLocationOnlyDeepClause(clauses[index]!)
      ) {
        locationIndex = index;
        break;
      }
    }
  }
  const subject = locationIndex >= 0
    ? combineDeepLocationAndSubject(clauses[locationIndex]!, selected)
    : selected;
  return subject
    .replace(/的?市场机会(?:如何)?$/, "")
    .trim();
}

function scoreDeepSubjectClause(
  clause: string,
  keywords: readonly string[],
): number {
  if (isWeakDeepSubjectClause(clause)) return Number.NEGATIVE_INFINITY;
  const normalized = normalizeDeepQueryComparison(clause);
  if (isDeepDimensionOnlyClause(normalized)) {
    // Research dimensions refine the subject; they must not replace it. Keep
    // a finite fallback for truly dimension-only operator queries.
    return -80 + Math.min(Array.from(normalized).length, 80) / 20;
  }
  if (isLocationOnlyDeepClause(clause)) {
    // Location clauses are useful context, never the product subject. Keep a
    // finite score so an otherwise empty location-only query still degrades
    // predictably, while any real noun/action subject wins and can absorb it.
    return -100 + Math.min(Array.from(normalized).length, 80) / 20;
  }
  const clauseUnits = deepSemanticUnits(normalized);
  let score = Math.min(Array.from(normalized).length, 80) / 20;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeDeepQueryComparison(keyword);
    if (!normalizedKeyword || isDeepDimensionOnlyClause(normalizedKeyword)) continue;
    if (normalized.includes(normalizedKeyword)) {
      score += 8;
      continue;
    }
    const keywordUnits = deepSemanticUnits(normalizedKeyword);
    const overlap = [...keywordUnits].filter((unit) => clauseUnits.has(unit)).length;
    score += Math.min(6, overlap * 2);
  }
  if (DEEP_SUBJECT_ACTION_PATTERN.test(normalized)) score += 6;
  return score;
}

function isDeepDimensionOnlyClause(clause: string): boolean {
  const normalized = normalizeDeepQueryComparison(clause);
  if (!normalized || DEEP_SUBJECT_ACTION_PATTERN.test(normalized)) return false;
  const dimensionList = normalized
    .replace(/\s+(?:(?:is|are|remains?)\s+(?:both\s+)?(?:critical|important|key|essential|a priority|high priority)|matters?|needs?\s+(?:validation|analysis)|requires?\s+(?:validation|analysis))$/iu, "")
    .replace(/(?:都)?(?:至关重要|(?:很|非常|十分|最)?(?:重要|关键)|关键性强|需要(?:验证|分析)|需(?:验证|分析)|待验证|必须(?:验证|分析)|值得关注)$/u, "")
    .replace(/(?:が|は|を)?(?:重要|不可欠|検証が必要|分析が必要|検証する|分析する)$/u, "")
    .replace(/(?:이|가|은|는|을|를)?\s*(?:중요하다|중요합니다|핵심이다|검증이 필요하다|분석이 필요하다|검증한다|분석한다)$/u, "")
    .trim();
  const dimensions = dimensionList
    .split(/\s*(?:,|&|\/|\band\b|、|和|与|及|以及|と|および|및|와|과)\s*/iu)
    .filter(Boolean);
  return dimensions.length > 0 && dimensions.every(isDeepResearchDimension);
}

function isDeepResearchDimension(value: string): boolean {
  return DEEP_RESEARCH_DIMENSION_PATTERN.test(normalizeDeepQueryComparison(value));
}

function deepSemanticUnits(value: string): Set<string> {
  const normalized = normalizeDeepQueryComparison(value);
  const units = new Set<string>();
  for (const word of normalized.match(/[\p{Script=Latin}\p{N}][\p{Script=Latin}\p{N}+'-]*/gu) ?? []) {
    if (word.length >= 3 && !DEEP_SUBJECT_STOP_WORDS.has(word)) units.add(word);
  }
  for (const sequence of normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu) ?? []) {
    const characters = Array.from(sequence);
    if (characters.length >= 2 && characters.length <= 12) units.add(sequence);
    for (let index = 0; index < characters.length - 1; index += 1) {
      units.add(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return units;
}

function isLocationOnlyDeepClause(clause: string): boolean {
  const normalized = normalizeDeepQueryComparison(clause);
  if (!normalized || DEEP_SUBJECT_ACTION_PATTERN.test(normalized)) return false;
  if (/^(?:at|in|near|outside)\s+[\p{L}\p{N} .'-]{2,48}$/iu.test(normalized)) return true;
  if (/^(?:在|位于|靠近|于)[\p{Script=Han}\p{N}A-Za-z·-]{1,24}$/u.test(normalized)) return true;
  if (/^(?:東京|大阪)(?:都|府|市|区|駅|駅前|周辺|近郊|[\p{Script=Han}]{1,8}(?:区|市|駅|駅前))?$/u.test(normalized)) return true;
  return /^(?:서울|부산|제주|도쿄|오사카)(?:시|도|구|역|역앞|주변|근교|[\p{Script=Hangul}]{1,8}(?:구|시|역|역앞))?$/u.test(normalized);
}

function combineDeepLocationAndSubject(location: string, subject: string): string {
  const language = deepIntentLanguage(`${location} ${subject}`, []);
  if (language === "zh-CN") {
    const locationCore = location.replace(/^(?:位于|靠近|在|于)/u, "");
    const subjectCore = subject.replace(/^(?:位于|靠近|在|于)/u, "");
    return `在${locationCore}${subjectCore}`;
  }
  return `${location} ${subject}`.replace(/\s+/g, " ").trim();
}

function isWeakDeepSubjectClause(clause: string): boolean {
  const normalized = normalizeDeepQueryComparison(clause);
  return (
    /^(?:(?:during|in|for)\s+)?(?:(?:the\s+)?(?:summer|winter|spring|autumn|fall|holiday)|(?:this|next|last)\s+(?:year|quarter|january|february|march|april|may|june|july|august|september|october|november|december)|q[1-4]|20\d{2})(?:\b|$)/iu.test(normalized) ||
    /^(?:target\s+(?:users?|customers?|audience)|please|validate|verify|focus\s+on|including)\b/iu.test(normalized) ||
    /^(?:在)?(?:暑假|寒假|春季|夏季|秋季|冬季|今年|明年|本月|未来|七八月|20\d{2}年|第?[一二三四1-4]季度|\d{1,2}(?:\s*(?:-|至|到)\s*\d{1,2})?月)/u.test(normalized) ||
    /^(?:目标用户|目标客户|受众|请|需要|希望|重点|主要验证|请验证)/u.test(normalized) ||
    /^(?:夏休み|冬休み|今年|来年|対象顧客|検証|調査)/u.test(normalized) ||
    /^(?:여름|겨울|올해|내년|대상 고객|검증|조사)/u.test(normalized)
  );
}

function normalizeDeepQueryComparison(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeDeepQueryFragment(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return truncateAtWordBoundary(normalized, maxChars);
}

/**
 * Build a targeted gap-fill query for a single claim that failed its first
 * entailment pass. The query is intentionally different from the initial
 * deep fan-out and from the independent corroboration query: it asks the
 * provider for a primary source that *states* the bounded claim, rather
 * than for general category context or for independent corroboration.
 *
 * The claim text is included verbatim so the search engine can match the
 * exact figure the reviewer found unsourced. The product context is
 * appended at the end so truncation cannot drop the claim itself.
 */
export function buildGapFillQuery(
  query: string,
  agentId: Exclude<AgentId, "synthesis">,
  claimText: string,
): string {
  const focus = AGENT_RETRIEVAL_FOCUS[agentId];
  const base = query.replace(/\s+/g, " ").trim();
  const productContext = base
    ? truncateAtWordBoundary(base, 140)
    : focus;
  const boundedClaim = claimText.replace(/\s+/g, " ").trim().slice(0, 220);
  return truncateAtWordBoundary(
    `Primary source stating: ${boundedClaim}. Product context: ${productContext}`,
    FOCUSED_QUERY_MAX_CHARS,
  );
}

function truncateAtWordBoundary(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const clipped = value.slice(0, maxChars);
  const boundary = clipped.lastIndexOf(" ");
  return (boundary >= Math.floor(maxChars * 0.75) ? clipped.slice(0, boundary) : clipped).trim();
}

/**
 * Treat retrieval output as untrusted boundary data, retain only usable
 * HTTP(S) sources, and assign a URL-derived canonical id shared by agents.
 */
export function canonicalizeRetrievedSources(
  input: readonly RetrievedSource[],
  agentId: Exclude<AgentId, "synthesis">,
  now: string = new Date().toISOString(),
): RetrievedSource[] {
  const output: RetrievedSource[] = [];
  const seenUrls = new Set<string>();

  for (const candidate of input) {
    if (!candidate || typeof candidate !== "object") continue;
    const rawUrl = typeof candidate.url === "string" ? candidate.url.trim() : "";
    const normalizedUrl = canonicalizeSafeExternalUrl(rawUrl);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;

    const title = typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim().slice(0, 300)
      : new URL(normalizedUrl).hostname;
    const snippet = typeof candidate.snippet === "string"
      ? candidate.snippet.trim().slice(0, 1200)
      : "";
    if (!snippet) continue;
    seenUrls.add(normalizedUrl);
    const accessedAt = isIsoLike(candidate.accessedAt) ? candidate.accessedAt : now;
    const retrievedAt = isIsoLike(candidate.retrievedAt) ? candidate.retrievedAt : accessedAt;
    const confidence =
      candidate.confidence === "low" ||
      candidate.confidence === "medium" ||
      candidate.confidence === "high"
        ? candidate.confidence
        : "medium";
    const score = typeof candidate.score === "number" && Number.isFinite(candidate.score)
      ? Math.max(0, Math.min(1, candidate.score))
      : undefined;

    output.push({
      id: canonicalSourceId(normalizedUrl),
      title,
      url: normalizedUrl,
      snippet,
      accessedAt,
      confidence,
      agent: agentId,
      retrievedAt,
      ...(score === undefined ? {} : { score }),
    });
  }

  return output;
}

/** Dedupe only sources retained by specialists' strict citation allowlists. */
export function specialistAllowlistedSourceUnion(session: ResearchSession): RetrievedSource[] {
  const output: RetrievedSource[] = [];
  const seen = new Set<string>();

  for (const agentId of RESEARCH_AGENTS) {
    const entry = session.evidence?.agents[agentId];
    const agentOutput = session.agents[agentId]?.output;
    if (
      !entry ||
      entry.retrieval.status !== "retrieved" ||
      entry.allowlist.policy !== "strict" ||
      entry.grounding !== "grounded" ||
      session.agents[agentId]?.degraded === true ||
      !agentOutput
    ) {
      continue;
    }

    const allowlistedIds = new Set(agentOutput.citations.map((citation) => citation.id));

    for (const source of entry.retrieval.sources) {
      if (!allowlistedIds.has(source.id)) continue;
      const normalizedUrl = canonicalizeSafeExternalUrl(source.url);
      if (!normalizedUrl || seen.has(normalizedUrl)) continue;
      seen.add(normalizedUrl);
      output.push({
        ...source,
        id: canonicalSourceId(normalizedUrl),
        url: normalizedUrl,
        retrievedAt: source.retrievedAt || source.accessedAt,
      });
    }
  }

  return output;
}

export function allowlistAgentOutput(
  output: AgentOutput,
  retrievedSources: readonly RetrievedSource[],
  policy: "compatible" | "strict",
): { output: AgentOutput; stats: EvidenceAllowlistStats } {
  const result = filterCitationsAgainstRetrieved(output.citations, retrievedSources, { policy });
  const agentId = output.agent;

  if (policy === "strict") {
    const citations = result.citations.map((citation) => ({ ...citation, agent: agentId }));
    const rewritten = rewriteCitationReferences(output, citations, result.idRemap, true);
    return {
      output: sanitizeNestedExternalUrls(rewritten, retrievedSources, true),
      stats: {
        policy,
        total: result.total,
        matched: result.accepted,
        rejected: result.rejected,
        missingUrl: result.missingUrl,
        retained: citations.length,
      },
    };
  }

  const idRemap = createIdRemap();
  const citations = result.citations.map((citation) => {
    const namespacedId = compatibleCitationId(agentId, citation);
    if (!(citation.id in idRemap)) idRemap[citation.id] = namespacedId;
    return { ...citation, id: namespacedId, agent: agentId };
  });

  return {
    output: sanitizeNestedExternalUrls(
      rewriteCitationReferences(output, citations, idRemap, false),
      retrievedSources,
      false,
    ),
    stats: {
      policy,
      total: result.total,
      matched: 0,
      rejected: 0,
      missingUrl: result.missingUrl,
      retained: citations.length,
    },
  };
}

function rewriteCitationReferences(
  output: AgentOutput,
  citations: SourceCitation[],
  idRemap: Record<string, string>,
  dropUnmatched: boolean,
): AgentOutput {
  const remap = (ids: string[]): string[] => {
    const mapped: string[] = [];
    for (const id of ids) {
      const next = idRemap[id];
      if (next) mapped.push(next);
      else if (!dropUnmatched) mapped.push(id);
    }
    return [...new Set(mapped)];
  };

  switch (output.agent) {
    case "market-sizer":
      return {
        ...output,
        marketSize: { ...output.marketSize, sources: remap(output.marketSize.sources) },
        citations,
      };
    case "competitor-analyst":
      return {
        ...output,
        competitors: output.competitors.map((competitor) => ({
          ...competitor,
          citations: remap(competitor.citations),
        })),
        citations,
      };
    case "pain-detective":
      return {
        ...output,
        painPoints: output.painPoints.map((painPoint) => ({
          ...painPoint,
          citations: remap(painPoint.citations),
        })),
        citations,
      };
    default:
      return { ...output, citations };
  }
}

function compatibleCitationId(agentId: AgentId, citation: SourceCitation): string {
  const normalizedUrl = canonicalizeSafeExternalUrl(citation.url);
  return `citation_${agentId}_${stableHash(normalizedUrl || citation.id)}`;
}

function canonicalSourceId(normalizedUrl: string): string {
  return `source_${stableHash(normalizedUrl)}`;
}

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return first.toString(36).padStart(7, "0") + second.toString(36).padStart(7, "0");
}

function sanitizeNestedExternalUrls(
  output: AgentOutput,
  retrievedSources: readonly RetrievedSource[],
  requireAllowlist: boolean,
): AgentOutput {
  const allowlistedUrls = new Set(
    retrievedSources
      .map((source) => canonicalizeSafeExternalUrl(source.url))
      .filter((url): url is string => Boolean(url)),
  );
  const sanitizeUrl = (rawUrl: unknown): string | undefined => {
    const canonicalUrl = canonicalizeSafeExternalUrl(rawUrl);
    if (!canonicalUrl) return undefined;
    if (requireAllowlist && !allowlistedUrls.has(canonicalUrl)) return undefined;
    return canonicalUrl;
  };

  switch (output.agent) {
    case "competitor-analyst":
      return {
        ...output,
        competitors: output.competitors.map((competitor) =>
          withOptionalSafeUrl(competitor, sanitizeUrl(competitor.url))),
      };
    case "channel-scout":
      return {
        ...output,
        communityHubs: output.communityHubs.map((hub) =>
          withOptionalSafeUrl(hub, sanitizeUrl(hub.url))),
      };
    default:
      return output;
  }
}

function withOptionalSafeUrl<T extends { url?: string }>(
  value: T,
  safeUrl: string | undefined,
): T {
  const copy = { ...value };
  delete copy.url;
  if (safeUrl) copy.url = safeUrl;
  return copy;
}

function isIsoLike(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function createIdRemap(): Record<string, string> {
  return Object.create(null) as Record<string, string>;
}
