const fs = require('fs');
let c = fs.readFileSync('src/lib/i18n/dictionaries.ts', 'utf-8');

// 1. Expand DictionaryKey type - find the last key before the closing of the type
const typeEnd = '  | "notFound.backHome";';
const typeAdditions = `  | "confidence.high"
  | "confidence.medium"
  | "confidence.low"
  | "citations.sources"
  | "citations.accessed"
  | "actions.copySection"
  | "actions.copied"
  | "actions.print"
  | "actions.markdown"
  | "actions.json"
  | "actions.csv"
  | "actions.brief"
  | "actions.copy"
  | "actions.share"
  | "report.tabs.summary"
  | "report.tabs.market"
  | "report.tabs.competition"
  | "report.tabs.pain"
  | "report.tabs.pricing"
  | "report.tabs.channels"
  | "report.tabs.synthesis"
  | "report.empty.title"
  | "report.empty.description"
  | "report.empty.start"
  | "report.empty.stats"
  | "report.loading"
  | "market.tamSamSom"
  | "market.growth"
  | "market.trends"
  | "market.segments"
  | "market.unit.users"
  | "market.unit.revenue"
  | "market.unit.businesses"
  | "competitor.landscape"
  | "competitor.matrix"
  | "competitor.gaps"
  | "competitor.strengths"
  | "competitor.weaknesses"
  | "competitor.pricing"
  | "pain.points"
  | "pain.unmet"
  | "pain.personas"
  | "pain.goals"
  | "pain.frustrations"
  | "pain.severity.critical"
  | "pain.severity.significant"
  | "pain.severity.moderate"
  | "pain.frequency.common"
  | "pain.frequency.occasional"
  | "pricing.bands"
  | "pricing.recommendations"
  | "pricing.models"
  | "pricing.wtp"
  | "pricing.typical"
  | "channels.list"
  | "channels.community"
  | "channels.content"
  | "channels.recommended"
  | "channels.platforms"
  | "channels.priority.high"
  | "channels.priority.medium"
  | "channels.priority.low"
  | "synthesis.score"
  | "synthesis.opportunity"
  | "synthesis.risk"
  | "synthesis.keyInsights"
  | "synthesis.opportunities"
  | "synthesis.risks"
  | "synthesis.nextStep"
  | "synthesis.brief"
  | "synthesis.brief.expand"
  | "synthesis.brief.collapse"
  | "share.copied"
  | "share.title"
  | "share.prompt"
  | "history.recent"
  | "history.clear"
  | "history.remove"
  | "cache.title"
  | "cache.agents"
  | "cache.citations"
  | "cache.delete"
  | "query.title"
  | "query.label"
  | "query.placeholder"
  | "query.keywordsLabel"
  | "query.keywordsHelp"
  | "query.submit"
  | "query.submitting"
  | "query.examples"
  | "query.examples.item1"
  | "query.examples.item2"
  | "query.examples.item3"
  | "loading.message"
  | "error.errorId"
  | "common.items"
  | "common.item";`;

c = c.replace(typeEnd, typeAdditions);

const en = `  "notFound.backHome": "Back to Research Studio",
  "confidence.high": "High confidence",
  "confidence.medium": "Medium confidence",
  "confidence.low": "Low confidence",
  "citations.sources": "Sources",
  "citations.accessed": "Accessed",
  "actions.copySection": "Copy section",
  "actions.copied": "Copied",
  "actions.print": "Print / Save as PDF",
  "actions.markdown": "Download Markdown",
  "actions.json": "Download JSON",
  "actions.csv": "Download CSV",
  "actions.brief": "Copy LaunchLens brief",
  "actions.copy": "Copy",
  "actions.share": "Share",
  "report.tabs.summary": "Summary",
  "report.tabs.market": "Market Size",
  "report.tabs.competition": "Competitors",
  "report.tabs.pain": "Pain Points",
  "report.tabs.pricing": "Pricing",
  "report.tabs.channels": "Channels",
  "report.tabs.synthesis": "Synthesis",
  "report.empty.title": "Agent is gathering data...",
  "report.empty.description": "Research is still running. Results will appear here.",
  "report.empty.start": "Start a research session to see results",
  "report.empty.stats": "{completed} of {total} agents completed · {citations} citations",
  "report.loading": "Loading report section...",
  "market.tamSamSom": "TAM / SAM / SOM",
  "market.growth": "Growth",
  "market.trends": "Key Trends",
  "market.segments": "Target Segments",
  "market.unit.users": "users",
  "market.unit.revenue": "revenue",
  "market.unit.businesses": "businesses",
  "competitor.landscape": "Competitive Landscape",
  "competitor.matrix": "Competitive Matrix",
  "competitor.gaps": "Market Gaps",
  "competitor.strengths": "Strengths",
  "competitor.weaknesses": "Weaknesses",
  "competitor.pricing": "Competitor Pricing",
  "pain.points": "Pain Points",
  "pain.unmet": "Unmet Needs",
  "pain.personas": "User Personas",
  "pain.goals": "Goals",
  "pain.frustrations": "Frustrations",
  "pain.severity.critical": "Critical",
  "pain.severity.significant": "Significant",
  "pain.severity.moderate": "Moderate",
  "pain.frequency.common": "Common",
  "pain.frequency.occasional": "Occasional",
  "pricing.bands": "Price Bands",
  "pricing.recommendations": "Recommended Pricing Tiers",
  "pricing.models": "Monetization Models",
  "pricing.wtp": "Willingness to Pay",
  "pricing.typical": "typical",
  "channels.list": "Channels",
  "channels.community": "Community Hubs",
  "channels.content": "Content Topics",
  "channels.recommended": "Recommended Channels",
  "channels.platforms": "Platforms",
  "channels.priority.high": "high priority",
  "channels.priority.medium": "medium priority",
  "channels.priority.low": "low priority",
  "synthesis.score": "Score",
  "synthesis.opportunity": "Opportunity",
  "synthesis.risk": "Risk",
  "synthesis.keyInsights": "Key Insights",
  "synthesis.opportunities": "Top Opportunities",
  "synthesis.risks": "Top Risks",
  "synthesis.nextStep": "Recommended Next Step",
  "synthesis.brief": "LaunchLens Import Brief",
  "synthesis.brief.expand": "Show full brief",
  "synthesis.brief.collapse": "Hide brief",
  "share.copied": "Link copied!",
  "share.title": "Research report",
  "share.prompt": "Copy this URL to share:",
  "history.recent": "Recent research",
  "history.clear": "Clear",
  "history.remove": "Remove from history",
  "cache.title": "Past research",
  "cache.agents": "agents",
  "cache.citations": "citations",
  "cache.delete": "Delete cached session",
  "query.title": "Start a Research Session",
  "query.label": "Product idea",
  "query.placeholder": "e.g. AI-powered code review tool for solo developers",
  "query.keywordsLabel": "Keywords (optional)",
  "query.keywordsHelp": "Press Enter to add",
  "query.submit": "Start Research",
  "query.submitting": "Starting research...",
  "query.examples": "Or try an example",
  "query.examples.item1": "AI project management tool",
  "query.examples.item2": "SaaS for freelance designers",
  "query.examples.item3": "Mobile meditation app",
  "loading.message": "Warming up the research agents...",
  "error.errorId": "Error ID",
  "common.items": "items",
  "common.item": "item",
};`;

// Replace in English dict
const enOld = '  "notFound.backHome": "Back to Research Studio",\n};';
c = c.replace(enOld, en);

const zh = `  "notFound.backHome": "返回调研工作台",
  "confidence.high": "高可信度",
  "confidence.medium": "中可信度",
  "confidence.low": "低可信度",
  "citations.sources": "来源",
  "citations.accessed": "访问于",
  "actions.copySection": "复制段落",
  "actions.copied": "已复制",
  "actions.print": "打印 / 另存为 PDF",
  "actions.markdown": "下载 Markdown",
  "actions.json": "下载 JSON",
  "actions.csv": "下载 CSV",
  "actions.brief": "复制 LaunchLens 简报",
  "actions.copy": "复制",
  "actions.share": "分享",
  "report.tabs.summary": "摘要",
  "report.tabs.market": "市场规模",
  "report.tabs.competition": "竞品分析",
  "report.tabs.pain": "用户痛点",
  "report.tabs.pricing": "定价分析",
  "report.tabs.channels": "渠道分析",
  "report.tabs.synthesis": "综合研判",
  "report.empty.title": "智能体正在收集数据...",
  "report.empty.description": "调研仍在进行中，结果将在此处显示。",
  "report.empty.start": "开始一场调研以查看结果",
  "report.empty.stats": "{total} 个智能体中已完成 {completed} 个 · {citations} 条引用",
  "report.loading": "正在加载报告段落...",
  "market.tamSamSom": "TAM / SAM / SOM",
  "market.growth": "增长率",
  "market.trends": "关键趋势",
  "market.segments": "目标细分市场",
  "market.unit.users": "用户数",
  "market.unit.revenue": "营收",
  "market.unit.businesses": "企业数",
  "competitor.landscape": "竞争格局",
  "competitor.matrix": "竞争矩阵",
  "competitor.gaps": "市场缺口",
  "competitor.strengths": "优势",
  "competitor.weaknesses": "劣势",
  "competitor.pricing": "竞品定价",
  "pain.points": "用户痛点",
  "pain.unmet": "未满足需求",
  "pain.personas": "用户画像",
  "pain.goals": "目标",
  "pain.frustrations": "沮丧点",
  "pain.severity.critical": "严重",
  "pain.severity.significant": "显著",
  "pain.severity.moderate": "中等",
  "pain.frequency.common": "常见",
  "pain.frequency.occasional": "偶尔",
  "pricing.bands": "价格区间",
  "pricing.recommendations": "推荐定价层级",
  "pricing.models": "变现模式",
  "pricing.wtp": "付费意愿",
  "pricing.typical": "典型价格",
  "channels.list": "获客渠道",
  "channels.community": "社区中心",
  "channels.content": "内容选题",
  "channels.recommended": "推荐渠道",
  "channels.platforms": "平台",
  "channels.priority.high": "高优先级",
  "channels.priority.medium": "中优先级",
  "channels.priority.low": "低优先级",
  "synthesis.score": "评分",
  "synthesis.opportunity": "机会",
  "synthesis.risk": "风险",
  "synthesis.keyInsights": "核心洞察",
  "synthesis.opportunities": "三大机会",
  "synthesis.risks": "三大风险",
  "synthesis.nextStep": "建议下一步",
  "synthesis.brief": "LaunchLens 导入简报",
  "synthesis.brief.expand": "显示完整简报",
  "synthesis.brief.collapse": "收起简报",
  "share.copied": "链接已复制！",
  "share.title": "调研报告",
  "share.prompt": "复制此链接分享：",
  "history.recent": "最近调研",
  "history.clear": "清空",
  "history.remove": "从历史记录中移除",
  "cache.title": "历史调研",
  "cache.agents": "个智能体",
  "cache.citations": "条引用",
  "cache.delete": "删除缓存会话",
  "query.title": "开始一场调研",
  "query.label": "产品想法",
  "query.placeholder": "例如：面向独立开发者的 AI 代码审查工具",
  "query.keywordsLabel": "关键词（可选）",
  "query.keywordsHelp": "按回车添加",
  "query.submit": "开始调研",
  "query.submitting": "正在启动调研...",
  "query.examples": "或者试试这些例子",
  "query.examples.item1": "AI 项目管理工具",
  "query.examples.item2": "面向自由设计师的 SaaS",
  "query.examples.item3": "手机冥想应用",
  "loading.message": "正在预热调研智能体...",
  "error.errorId": "错误编号",
  "common.items": "项",
  "common.item": "项",
};`;

const zhOld = '  "notFound.backHome": "返回调研工作台",\n};';
c = c.replace(zhOld, zh);

const ja = `  "notFound.backHome": "リサーチスタジオに戻る",
  "confidence.high": "高い確度",
  "confidence.medium": "中程度の確度",
  "confidence.low": "低い確度",
  "citations.sources": "出典",
  "citations.accessed": "アクセス日",
  "actions.copySection": "セクションをコピー",
  "actions.copied": "コピーしました",
  "actions.print": "印刷 / PDF で保存",
  "actions.markdown": "Markdown をダウンロード",
  "actions.json": "JSON をダウンロード",
  "actions.csv": "CSV をダウンロード",
  "actions.brief": "LaunchLens ブリーフをコピー",
  "actions.copy": "コピー",
  "actions.share": "共有",
  "report.tabs.summary": "サマリー",
  "report.tabs.market": "市場規模",
  "report.tabs.competition": "競合分析",
  "report.tabs.pain": "課題点",
  "report.tabs.pricing": "価格設定",
  "report.tabs.channels": "チャネル",
  "report.tabs.synthesis": "統合分析",
  "report.empty.title": "エージェントがデータを収集中...",
  "report.empty.description": "リサーチは実行中です。結果はここに表示されます。",
  "report.empty.start": "リサーチを開始して結果を表示しましょう",
  "report.empty.stats": "{total} エージェント中 {completed} 完了 · {citations} 件の引用",
  "report.loading": "レポートセクションを読み込み中...",
  "market.tamSamSom": "TAM / SAM / SOM",
  "market.growth": "成長率",
  "market.trends": "主要トレンド",
  "market.segments": "対象セグメント",
  "market.unit.users": "ユーザー数",
  "market.unit.revenue": "売上高",
  "market.unit.businesses": "企業数",
  "competitor.landscape": "競合環境",
  "competitor.matrix": "競合マトリックス",
  "competitor.gaps": "市場のギャップ",
  "competitor.strengths": "強み",
  "competitor.weaknesses": "弱み",
  "competitor.pricing": "競合価格",
  "pain.points": "ユーザーの課題",
  "pain.unmet": "未充足ニーズ",
  "pain.personas": "ユーザーペルソナ",
  "pain.goals": "目標",
  "pain.frustrations": "不満点",
  "pain.severity.critical": "重大",
  "pain.severity.significant": "顕著",
  "pain.severity.moderate": "中程度",
  "pain.frequency.common": "一般的",
  "pain.frequency.occasional": "時折",
  "pricing.bands": "価格帯",
  "pricing.recommendations": "推奨料金プラン",
  "pricing.models": "収益化モデル",
  "pricing.wtp": "支払意欲",
  "pricing.typical": "代表的な価格",
  "channels.list": "チャネル",
  "channels.community": "コミュニティ",
  "channels.content": "コンテンツテーマ",
  "channels.recommended": "推奨チャネル",
  "channels.platforms": "プラットフォーム",
  "channels.priority.high": "高優先度",
  "channels.priority.medium": "中優先度",
  "channels.priority.low": "低優先度",
  "synthesis.score": "スコア",
  "synthesis.opportunity": "機会",
  "synthesis.risk": "リスク",
  "synthesis.keyInsights": "主要な洞察",
  "synthesis.opportunities": "上位 3 つの機会",
  "synthesis.risks": "上位 3 つのリスク",
  "synthesis.nextStep": "推奨される次の一手",
  "synthesis.brief": "LaunchLens インポートブリーフ",
  "synthesis.brief.expand": "ブリーフ全体を表示",
  "synthesis.brief.collapse": "ブリーフを折りたたむ",
  "share.copied": "リンクをコピーしました！",
  "share.title": "リサーチレポート",
  "share.prompt": "共有用 URL：",
  "history.recent": "最近のリサーチ",
  "history.clear": "クリア",
  "history.remove": "履歴から削除",
  "cache.title": "過去のリサーチ",
  "cache.agents": "エージェント",
  "cache.citations": "件の引用",
  "cache.delete": "キャッシュを削除",
  "query.title": "リサーチを開始",
  "query.label": "プロダクトアイデア",
  "query.placeholder": "例：個人開発者向け AI コードレビューツール",
  "query.keywordsLabel": "キーワード（任意）",
  "query.keywordsHelp": "Enter で追加",
  "query.submit": "リサーチ開始",
  "query.submitting": "開始中...",
  "query.examples": "例から始める",
  "query.examples.item1": "AI プロジェクト管理ツール",
  "query.examples.item2": "フリーランスデザイナー向け SaaS",
  "query.examples.item3": "モバイル瞑想アプリ",
  "loading.message": "リサーチエージェントを準備中...",
  "error.errorId": "エラー ID",
  "common.items": "件",
  "common.item": "件",
};`;

const jaOld = '  "notFound.backHome": "リサーチスタジオに戻る",\n};';
c = c.replace(jaOld, ja);

fs.writeFileSync('src/lib/i18n/dictionaries.ts', c);
console.log('OK - added 100+ i18n keys to en, zh-CN, ja');
