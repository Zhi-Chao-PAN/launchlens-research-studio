// Locale dictionaries. Keep keys flat and stable so future translation
// passes can diff against this canonical English source.
export type Locale = "en" | "zh-CN" | "ja";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh-CN", "ja"] as const;
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  "en": "English",
  "zh-CN": "中文",
  "ja": "日本語",
};

export type DictionaryKey =
  | "header.subtitle"
  | "header.researchComplete"
  | "header.share"
  | "header.newResearch"
  | "hero.title"
  | "hero.subtitle"
  | "errors.startFailed"
  | "errors.dismiss"
  | "errors.dismissShort"
  | "errors.retry"
  | "errors.sessionExpired"
  | "errors.retryInSeconds"
  | "errors.retryNow"
  | "errors.network"
  | "errors.serverError"
  | "errors.genericStart"
  | "errors.correctAndRetry"
  | "errors.rateLimitHint"
  | "status.loading"
  | "status.running"
  | "status.completed"
  | "status.error"
  | "status.idle"
  | "status.label.complete"
  | "status.label.running"
  | "status.label.error"
  | "status.label.idle"
  | "language.label"
  | "agent.market-sizer.name"
  | "agent.market-sizer.description"
  | "agent.competitor-analyst.name"
  | "agent.competitor-analyst.description"
  | "agent.pain-detective.name"
  | "agent.pain-detective.description"
  | "agent.pricing-scout.name"
  | "agent.pricing-scout.description"
  | "agent.channel-scout.name"
  | "agent.channel-scout.description"
  | "agent.synthesis.name"
  | "agent.synthesis.description"
  | "agent.status.idle"
  | "agent.status.running"
  | "agent.status.done"
  | "agent.status.error"
  | "studio.researchAgents"
  | "studio.controls"
  | "studio.agentsProgress"
  | "studio.poweredBy"
  | "studio.tipStart"
  | "studio.tipReset"
  | "studio.help.title"
  | "studio.help.start"
  | "studio.help.reset"
  | "studio.help.shortcuts"
  | "footer.tagline"
  | "provider.mock"
  | "provider.breakerOpen"
  | "provider.streaming"
  | "crash.title"
  | "crash.body"
  | "crash.tryAgain"
  | "crash.goHome"
  | "crash.copyTrace"
  | "crash.copied"
  | "notFound.title"
  | "notFound.body"
  | "notFound.backHome"
  | "confidence.high"
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
  | "actions.copyMarkdown"
  | "actions.copyJson"
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
  | "common.item"
  | "query.requiredHint"
  | "query.counter"
  | "query.errorMinLength"
  | "query.errorMaxLength"
  | "query.errorMaxKeywords"
  | "query.errorKeywordTooLong"
  | "query.moreKeywords"
  | "query.keywordsOptionalHelp"
  | "query.keywordPlaceholder"
  | "actions.export.title"
  | "actions.export.description"
  | "actions.export.csvSpreadsheet"
  | "actions.export.copyHeader"
  | "actions.export.error.copy"
  | "actions.export.error.markdown"
  | "actions.export.error.json"
  | "actions.export.error.csv"
  | "actions.export.error.noCsvData"
  | "actions.export.error.noSynthesis"
  | "actions.export.agentsComplete"
  | "report.market.sectionTitle"
  | "report.market.methodology"
  | "report.competitor.sectionTitle"
  | "report.competitor.nameColumn"
  | "report.competitor.positioningColumn"
  | "report.competitor.pricingColumn"
  | "report.competitor.differentiatorColumn"
  | "report.pain.sectionTitle"
  | "report.pricing.sectionTitle"
  | "report.pricing.tierColumn"
  | "report.pricing.priceColumn"
  | "report.channels.sectionTitle"
  | "report.synthesis.sectionTitle"
  | "report.synthesis.execSummary"
  | "report.synthesis.metric.opportunity"
  | "report.synthesis.metric.risk"
  | "report.synthesis.metric.score"
  | "report.synthesis.briefLabel"
  | "agent.failed"
  | "agent.cancelled"
  | "common.more"
  | "market.tamLabel"
  | "market.samLabel"
  | "market.somLabel"
  | "market.trend.accelerating"
  | "market.trend.declining"
  | "market.trend.steady"
  | "market.sizeEstimate"
  | "pain.topPainPoints"
  | "pain.affects"
  | "pain.severity.mild"
  | "pain.frequency.rare"
  | "pain.whyUnmet"
  | "pain.opportunity"
  | "competitor.marketShare"
  | "competitor.visit"
  | "competitor.opportunityLabel"
  | "pricing.typicalLabel"
  | "pricing.legend"
  | "pricing.prevalence"
  | "pricing.examples"
  | "pricing.wtpSegment"
  | "channels.competition"
  | "synthesis.netScore"
  | "synthesis.opportunityMinusRisk"
  | "synthesis.basedOnInsights"
  | "synthesis.top3Opportunities"
  | "synthesis.top3Risks"
  | "synthesis.whyThisWorks"
  | "synthesis.mitigation"
  | "synthesis.crossValidated"
  | "synthesis.supportedBy"
  | "synthesis.briefReady"
  | "synthesis.copyBrief"
  | "synthesis.opportunityStrong"
  | "synthesis.opportunityPromising"
  | "synthesis.opportunityModerate"
  | "synthesis.opportunityChallenging"
  | "synthesis.opportunityHighRisk"
  | "competitor.positioning.premium"
  | "competitor.positioning.mid-market"
  | "competitor.positioning.budget"
  | "competitor.positioning.niche"
  | "channels.volume.high"
  | "channels.volume.medium"
  | "channels.volume.low"
  | "market.tamLabel"
  | "market.samLabel"
  | "market.somLabel"
  | "market.trend.accelerating"
  | "market.trend.declining"
  | "market.trend.steady"
  | "market.sizeEstimate"
  | "pain.topPainPoints"
  | "pain.affects"
  | "pain.severity.mild"
  | "pain.frequency.rare"
  | "pain.whyUnmet"
  | "competitor.marketShare"
  | "competitor.visit"
  | "competitor.opportunityLabel"
  | "pricing.typicalLabel"
  | "pricing.legend"
  | "pricing.prevalence"
  | "pricing.examples"
  | "pricing.wtpSegment"
  | "channels.landscape"
  | "channels.effectiveness"
  | "channels.reach"
  | "channels.costEfficiency"
  | "channels.searchVolume"
  | "channels.competition"
  | "synthesis.netScore"
  | "synthesis.opportunityMinusRisk"
  | "synthesis.basedOnInsights"
  | "synthesis.top3Opportunities"
  | "synthesis.top3Risks"
  | "synthesis.whyThisWorks"
  | "synthesis.mitigation"
  | "synthesis.crossValidated"
  | "synthesis.supportedBy"
  | "synthesis.briefReady"
  | "synthesis.copyBrief"
  | "actions.export.title"
  | "actions.export.description"
  | "actions.export.csvSpreadsheet"
  | "actions.export.copyHeader"
  | "actions.export.error.copy"
  | "actions.export.error.markdown"
  | "actions.export.error.json"
  | "actions.export.error.csv"
  | "actions.export.error.noCsvData"
  | "actions.export.error.noSynthesis"
  | "actions.export.agentsComplete"
  | "query.requiredHint"
  | "query.counter"
  | "query.errorMinLength"
  | "query.errorMaxLength"
  | "query.errorMaxKeywords"
  | "query.errorKeywordTooLong"
  | "query.moreKeywords"
  | "query.keywordsOptionalHelp"
  | "query.keywordPlaceholder"
  | "report.market.sectionTitle"
  | "report.market.methodology"
  | "report.competitor.sectionTitle"
  | "report.competitor.nameColumn"
  | "report.competitor.positioningColumn"
  | "report.competitor.pricingColumn"
  | "report.competitor.differentiatorColumn"
  | "report.pain.sectionTitle"
  | "report.pricing.sectionTitle"
  | "report.pricing.tierColumn"
  | "report.pricing.priceColumn"
  | "report.channels.sectionTitle"
  | "report.synthesis.sectionTitle"
  | "report.synthesis.execSummary"
  | "report.synthesis.metric.opportunity"
  | "report.synthesis.metric.risk"
  | "report.synthesis.metric.score"
  | "report.synthesis.briefLabel"
  | "time.justNow"
  | "time.minuteAgo"
  | "time.minutesAgo"
  | "time.hourAgo"
  | "time.hoursAgo"
  | "time.dayAgo"
  | "time.daysAgo"
  | "time.never"
  | "studio.help.toggleLanguage"
  | "studio.help.focus"
  | "api.rateLimitExceeded"
  | "api.invalidJson"
  | "api.invalidBody"
  | "api.queryRequired"
  | "api.queryTooShort"
  | "api.queryTooLong"
  | "api.keywordsMustBeArray"
  | "api.keywordsTooMany"
  | "api.keywordInvalid"
  | "api.keywordTooLong"
  | "api.methodNotAllowed"
  | "api.sessionNotFound"
  | "api.invalidSessionId"
  | "api.gotNCharacters"
  | "step.waiting"
  | "step.streaming"
  | "step.validating"
  | "step.complete"
  | "step.skipped"
  | "step.error"
  | "step.loadingContext"
  | "step.synthesizingFindings"
  | "step.compilingCitations"
  | "step.market.boundaries"
  | "step.market.tamData"
  | "step.market.samSom"
  | "step.market.growthTrends"
  | "step.market.crossReference"
  | "step.market.estimates"
  | "step.competitors.identifying"
  | "step.competitors.positioning"
  | "step.competitors.featureMatrix"
  | "step.competitors.strengthsWeaknesses"
  | "step.competitors.gaps"
  | "step.competitors.validatingFindings"
  | "step.pain.scanningForums"
  | "step.pain.collectingReviews"
  | "step.pain.clustering"
  | "step.pain.quotes"
  | "step.pain.unmetNeeds"
  | "step.pain.personas"
  | "step.pricing.collecting"
  | "step.pricing.bands"
  | "step.pricing.monetization"
  | "step.pricing.willingnessToPay"
  | "step.pricing.benchmarking"
  | "step.pricing.recommendations"
  | "step.channels.mappingLandscape"
  | "step.channels.scanningHubs"
  | "step.channels.searchVolume"
  | "step.channels.paidCompetitiveness"
  | "step.channels.costEffectiveness"
  | "step.channels.prioritizingRoi"
  | "step.synthesis.collecting"
  | "step.synthesis.crossValidating"
  | "step.synthesis.confidence"
  | "step.synthesis.scores"
  | "step.synthesis.executiveSummary"
  | "step.synthesis.launchBrief"
  | "common.yes"
  | "common.no"
  | "common.ok"
  | "common.unknown"
  | "error.unauthorized"
  | "diagnostics.title"
  | "diagnostics.intro"
  | "diagnostics.provider"
  | "diagnostics.telemetry"
  | "diagnostics.requests"
  | "diagnostics.generations"
  | "diagnostics.success"
  | "diagnostics.avg"
  | "diagnostics.recent"
  | "diagnostics.breakdown"
  | "diagnostics.noGenerations"
  | "diagnostics.breakers"
  | "diagnostics.noBreakers"
  | "diagnostics.recentRequests"
  | "diagnostics.noRequests"
  | "diagnostics.recentGen"
  | "diagnostics.noTelemetry"
  | "diagnostics.col.key"
  | "diagnostics.col.failures"
  | "diagnostics.col.open"
  | "diagnostics.col.opened"
  | "diagnostics.col.when"
  | "diagnostics.col.route"
  | "diagnostics.col.status"
  | "diagnostics.col.latency"
  | "diagnostics.col.agent"
  | "diagnostics.failures"
  | "diagnostics.col.provider"
  | "diagnostics.col.total"
  | "diagnostics.col.cancelled"
  | "diagnostics.col.succeeded"
  | "diagnostics.cancelled"
  | "diagnostics.succeeded"
  | "diagnostics.authHint"
  | "diagnostics.mock"
  | "diagnostics.realLlm"
  | "diagnostics.streaming"
  | "diagnostics.nonStreaming"
  | "connection.reconnecting"
  | "connection.polling"
  | "connection.connecting"
  | "connection.connected";

type Dict = Record<DictionaryKey, string>;

const en: Dict = {
  "header.subtitle": "Multi-agent market intelligence for your product idea",
  "header.researchComplete": "Research complete",
  "header.share": "Share",
  "header.newResearch": "New Research",
  "hero.title": "Research any market in minutes",
  "hero.subtitle": "6 specialized AI agents work in parallel to give you a complete market intelligence report. No API keys required.",
  "errors.startFailed": "Research failed to start",
  "errors.dismiss": "Dismiss",
  "errors.dismissShort": "×",
  "errors.retry": "Retry",
  "errors.sessionExpired": "Session expired. Please start a new research.",
  "errors.retryInSeconds": "Retry in {n}s",
  "errors.retryNow": "You can retry now",
  "errors.network": "Network error — please check your connection and try again.",
  "errors.serverError": "The server encountered an error. Please try again shortly.",
  "errors.genericStart": "Failed to start research. Please try again.",
  "errors.correctAndRetry": "Please correct the highlighted fields and retry.",
  "errors.rateLimitHint": "Too many requests. Slow down a moment — your patience keeps the agents sharp.",
  "status.loading": "Starting research session",
  "status.running": "Research agents are running",
  "status.completed": "Research complete",
  "status.error": "Research failed",
  "status.idle": "Idle",
  "status.label.complete": "Complete",
  "status.label.running": "Running",
  "status.label.error": "Error",
  "status.label.idle": "Idle",
  "language.label": "Language",
  "agent.market-sizer.name": "Market Sizer",
  "agent.market-sizer.description": "TAM/SAM/SOM estimates, growth trends, market segments",
  "agent.competitor-analyst.name": "Competitor Analyst",
  "agent.competitor-analyst.description": "Competitive landscape, gaps, positioning matrix",
  "agent.pain-detective.name": "Pain Detective",
  "agent.pain-detective.description": "User pain points, unmet needs, real voice-of-customer",
  "agent.pricing-scout.name": "Pricing Scout",
  "agent.pricing-scout.description": "Price bands, monetization models, willingness to pay",
  "agent.channel-scout.name": "Channel Scout",
  "agent.channel-scout.description": "Acquisition channels, community hubs, content topics",
  "agent.synthesis.name": "Synthesis",
  "agent.synthesis.description": "Cross-agent validation, executive summary, importable brief",
  "agent.status.idle": "Waiting",
  "agent.status.running": "Researching",
  "agent.status.done": "Complete",
  "agent.status.error": "Error",
  "studio.researchAgents": "Research Agents",
  "studio.controls": "Research controls",
  "studio.agentsProgress": "{done}/{total} agents",
  "studio.poweredBy": "Powered by 6 research agents:",
  "studio.tipStart": "to start",
  "studio.tipReset": "to reset",
  "studio.help.title": "Keyboard shortcuts",
  "studio.help.start": "Start research (from query input)",
  "studio.help.reset": "Reset to landing page (from studio)",
  "studio.help.shortcuts": "Show this help",
  "footer.tagline": "LaunchLens Research Studio — Companion to launchlens-ai",
  "provider.mock": "Mock provider",
  "provider.breakerOpen": "Provider breaker open",
  "provider.streaming": "stream",
  "crash.title": "Something went wrong",
  "crash.body": "An unexpected error occurred. Your work hasn't been lost.",
  "crash.tryAgain": "Try again",
  "crash.goHome": "Go home",
  "crash.copyTrace": "Copy error details",
  "crash.copied": "Copied",
  "notFound.title": "Page not found",
  "notFound.body": "The page you're looking for doesn't exist or has moved.",
  "notFound.backHome": "Back to Research Studio",
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
  "actions.copyMarkdown": "Copy Markdown",
  "actions.copyJson": "Copy JSON",
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
  "query.requiredHint": "required",
  "query.counter": "{current}/{max}",
  "query.errorMinLength": "Minimum {min} characters",
  "query.errorMaxLength": "Maximum {max} characters",
  "query.errorMaxKeywords": "Maximum {max} keywords",
  "query.errorKeywordTooLong": "\"{keyword}\" is too long",
  "query.moreKeywords": "+{count} more",
  "query.keywordsOptionalHelp": "(optional, comma-separated)",
  "query.keywordPlaceholder": "e.g., SaaS, AI, productivity, remote work",
  "actions.export.title": "Export & Actions",
  "actions.export.description": "Download the report, or copy a version to paste into other tools.",
  "actions.export.csvSpreadsheet": "Download CSVs (spreadsheet)",
  "actions.export.copyHeader": "Copy to clipboard",
  "actions.export.error.copy": "Copy failed. Please try downloading instead.",
  "actions.export.error.markdown": "Markdown export failed.",
  "actions.export.error.json": "JSON export failed.",
  "actions.export.error.csv": "CSV export failed.",
  "actions.export.error.noCsvData": "No data available to export as CSV.",
  "actions.export.error.noSynthesis": "Synthesis report is not yet available.",
  "actions.export.agentsComplete": "{completed}/6",
  "report.market.sectionTitle": "Market Size & Segments",
  "report.market.methodology": "Methodology",
  "report.competitor.sectionTitle": "Competitive Landscape",
  "report.competitor.nameColumn": "Competitor",
  "report.competitor.positioningColumn": "Positioning",
  "report.competitor.pricingColumn": "Pricing",
  "report.competitor.differentiatorColumn": "Differentiator",
  "report.pain.sectionTitle": "Pain Points & User Needs",
  "report.pricing.sectionTitle": "Pricing & Monetization",
  "report.pricing.tierColumn": "Tier",
  "report.pricing.priceColumn": "Price",
  "report.channels.sectionTitle": "Acquisition Channels",
  "report.synthesis.sectionTitle": "Synthesis & Recommendation",
  "report.synthesis.execSummary": "Executive Summary",
  "report.synthesis.metric.opportunity": "Opportunity",
  "report.synthesis.metric.risk": "Risk",
  "report.synthesis.metric.score": "Overall Score",
  "report.synthesis.briefLabel": "LaunchLens Import Brief",
  "agent.failed": "Error",
  "agent.cancelled": "Cancelled",
  "common.more": "more",
  "time.justNow": "just now",
  "time.minuteAgo": "{n}m ago",
  "time.minutesAgo": "{n}m ago",
  "time.hourAgo": "{n}h ago",
  "time.hoursAgo": "{n}h ago",
  "time.dayAgo": "{n}d ago",
  "time.daysAgo": "{n}d ago",
  "time.never": "never",
  "studio.help.toggleLanguage": "Toggle language",
  "studio.help.focus": "Focus query input",
  "api.rateLimitExceeded": "Rate limit exceeded. Please retry shortly.",
  "api.invalidJson": "Request body must be valid JSON.",
  "api.invalidBody": "Request body must be a JSON object.",
  "api.queryRequired": "Field 'query' is required and must be a string.",
  "api.queryTooShort": "Query must be at least {min} characters long.",
  "api.queryTooLong": "Query must be at most {max} characters long.",
  "api.keywordsMustBeArray": "Field 'keywords' must be an array of strings.",
  "api.keywordsTooMany": "At most {max} keywords are allowed.",
  "api.keywordInvalid": "Keyword at index {index} must be a string.",
  "api.keywordTooLong": "Keyword exceeds {max} characters.",
  "api.methodNotAllowed": "Use POST to create a research session.",
  "api.sessionNotFound": "Session not found.",
  "api.invalidSessionId": "Invalid session id format.",
  "api.gotNCharacters": "Got {count} characters.",
  "step.waiting": "Waiting to start...",
  "step.streaming": "Streaming response",
  "step.validating": "Validating output",
  "step.complete": "Complete",
  "step.skipped": "Skipped: too many upstream agent failures",
  "step.error": "Error",
  "step.loadingContext": "Loading research context",
  "step.synthesizingFindings": "Synthesizing findings",
  "step.compilingCitations": "Compiling citations",
  // market-sizer
  "step.market.boundaries": "Defining market boundaries and scope...",
  "step.market.tamData": "Gathering TAM data from industry reports...",
  "step.market.samSom": "Calculating SAM and SOM with segmentation...",
  "step.market.growthTrends": "Analyzing growth trends and market velocity...",
  "step.market.crossReference": "Cross-referencing data sources for confidence...",
  "step.market.estimates": "Synthesizing market size estimates...",
  // competitor-analyst
  "step.competitors.identifying": "Identifying direct and indirect competitors...",
  "step.competitors.positioning": "Scraping competitor positioning and pricing...",
  "step.competitors.featureMatrix": "Building competitive feature matrix...",
  "step.competitors.strengthsWeaknesses": "Analyzing strengths and weaknesses...",
  "step.competitors.gaps": "Mapping market gaps and white space...",
  "step.competitors.validatingFindings": "Validating findings across sources...",
  // pain-detective
  "step.pain.scanningForums": "Scanning forums and communities for discussions...",
  "step.pain.collectingReviews": "Collecting user reviews and comments...",
  "step.pain.clustering": "Clustering pain points by frequency and severity...",
  "step.pain.quotes": "Extracting representative quotes...",
  "step.pain.unmetNeeds": "Identifying unmet needs and opportunity areas...",
  "step.pain.personas": "Building user personas from pain point patterns...",
  // pricing-scout
  "step.pricing.collecting": "Collecting competitor pricing pages...",
  "step.pricing.bands": "Mapping price bands and tier structures...",
  "step.pricing.monetization": "Analyzing monetization model prevalence...",
  "step.pricing.willingnessToPay": "Estimating willingness to pay by segment...",
  "step.pricing.benchmarking": "Benchmarking against category norms...",
  "step.pricing.recommendations": "Formulating pricing recommendations...",
  // channel-scout
  "step.channels.mappingLandscape": "Mapping acquisition channel landscape...",
  "step.channels.scanningHubs": "Scanning community hubs and forums...",
  "step.channels.searchVolume": "Analyzing content topic search volume...",
  "step.channels.paidCompetitiveness": "Evaluating paid channel competitiveness...",
  "step.channels.costEffectiveness": "Assessing channel cost and effectiveness...",
  "step.channels.prioritizingRoi": "Prioritizing channels by expected ROI...",
  // synthesis
  "step.synthesis.collecting": "Collecting outputs from all research agents...",
  "step.synthesis.crossValidating": "Cross-validating findings across agents...",
  "step.synthesis.confidence": "Identifying highest-confidence insights...",
  "step.synthesis.scores": "Assessing opportunity and risk scores...",
  "step.synthesis.executiveSummary": "Synthesizing executive summary...",
  "step.synthesis.launchBrief": "Generating importable launch brief...",
  "common.yes": "yes",
  "common.no": "no",
  "common.ok": "ok",
  "common.unknown": "unknown",
  "error.unauthorized": "Unauthorized",
  "diagnostics.title": "Diagnostics",
  "diagnostics.intro": "Runtime observability for {name} (v{version}).",
  "diagnostics.provider": "Provider",
  "diagnostics.telemetry": "Telemetry",
  "diagnostics.requests": "Requests",
  "diagnostics.generations": "generations",
  "diagnostics.success": "success",
  "diagnostics.avg": "avg",
  "diagnostics.recent": "recent",
  "diagnostics.breakdown": "Provider breakdown",
  "diagnostics.noGenerations": "No agent generations recorded yet.",
  "diagnostics.breakers": "Circuit breakers",
  "diagnostics.noBreakers": "No breakers tripped.",
  "diagnostics.recentRequests": "Recent requests",
  "diagnostics.noRequests": "No requests yet.",
  "diagnostics.recentGen": "Recent agent generations",
  "diagnostics.noTelemetry": "No telemetry yet.",
  "diagnostics.col.key": "Key",
  "diagnostics.col.failures": "Failures",
  "diagnostics.col.open": "Open",
  "diagnostics.col.opened": "Opened",
  "diagnostics.col.when": "When",
  "diagnostics.col.route": "Route",
  "diagnostics.col.status": "Status",
  "diagnostics.col.latency": "Latency",
  "diagnostics.col.agent": "Agent",
  "diagnostics.col.provider": "Provider",
  "diagnostics.col.total": "Total",
  "diagnostics.col.cancelled": "Cancelled",
  "diagnostics.col.succeeded": "OK",
  "diagnostics.cancelled": "cancelled",
  "diagnostics.succeeded": "succeeded",
  "diagnostics.failures": "failed",
  "diagnostics.authHint": "Diagnostics access is restricted. Provide a valid token.",
  "diagnostics.mock": "Mock",
  "diagnostics.realLlm": "Real LLM",
  "diagnostics.streaming": "streaming",
  "diagnostics.nonStreaming": "non-streaming",
  "connection.reconnecting": "Reconnecting to research stream...",
  "connection.polling": "Stream disconnected — using polling fallback",
  "connection.connecting": "Connecting...",
  "connection.connected": "Connected",
  "market.tamLabel": "Total addressable market",
  "market.samLabel": "Serviceable addressable market",
  "market.somLabel": "3-year obtainable market",
  "market.trend.accelerating": "accelerating",
  "market.trend.declining": "declining",
  "market.trend.steady": "steady",
  "market.sizeEstimate": "Market Size Estimate",
  "pain.topPainPoints": "Top Pain Points",
  "pain.affects": "Affects",
  "pain.severity.mild": "Mild",
  "pain.frequency.rare": "Rare",
  "pain.whyUnmet": "Why unmet",
  "pain.opportunity": "Opportunity",
  "competitor.marketShare": "market share",
  "competitor.visit": "Visit",
  "competitor.opportunityLabel": "Opportunity",
  "pricing.typicalLabel": "Typical",
  "pricing.legend": "← Min | → Max | Vertical mark = typical price",
  "pricing.prevalence": "prevalence",
  "pricing.examples": "Examples",
  "pricing.wtpSegment": "Willingness to Pay by Segment",
  "channels.landscape": "Channel Landscape",
  "channels.effectiveness": "Effectiveness",
  "channels.reach": "Reach",
  "channels.costEfficiency": "Cost-efficiency",
  "channels.searchVolume": "Search volume",
  "channels.competition": "comp",
  "synthesis.netScore": "Net score",
  "synthesis.opportunityMinusRisk": "Opportunity − Risk",
  "synthesis.basedOnInsights": "Based on cross-agent validation across {count} insights",
  "synthesis.top3Opportunities": "Top 3 Opportunities",
  "synthesis.top3Risks": "Top 3 Risks",
  "synthesis.whyThisWorks": "Why this works",
  "synthesis.mitigation": "Mitigation",
  "synthesis.crossValidated": "Cross-Validated Insights",
  "synthesis.supportedBy": "Supported by",
  "synthesis.briefReady": "Ready to paste into launchlens-ai for GTM strategy generation",
  "synthesis.copyBrief": "Copy brief",
  "synthesis.opportunityStrong": "Strong opportunity",
  "synthesis.opportunityPromising": "Promising",
  "synthesis.opportunityModerate": "Moderate",
  "synthesis.opportunityChallenging": "Challenging",
  "synthesis.opportunityHighRisk": "High risk",
  "competitor.positioning.premium": "Premium",
  "competitor.positioning.mid-market": "Mid-market",
  "competitor.positioning.budget": "Budget",
  "competitor.positioning.niche": "Niche",
  "channels.volume.high": "High",
  "channels.volume.medium": "Medium",
  "channels.volume.low": "Low",
};

const zhCN: Dict = {
  "header.subtitle": "为你的产品创意提供多智能体市场洞察",
  "header.researchComplete": "调研完成",
  "header.share": "分享",
  "header.newResearch": "新建调研",
  "hero.title": "几分钟内完成任意市场调研",
  "hero.subtitle": "6 个专业 AI 智能体并行工作，为你输出一份完整的市场情报报告，无需任何 API 密钥。",
  "errors.startFailed": "调研启动失败",
  "errors.dismiss": "关闭",
  "errors.dismissShort": "×",
  "errors.retry": "重试",
  "errors.sessionExpired": "会话已过期，请重新发起调研。",
  "errors.retryInSeconds": "{n} 秒后可重试",
  "errors.retryNow": "现在可以重试了",
  "errors.network": "网络异常，请检查网络连接后重试。",
  "errors.serverError": "服务器遇到错误，请稍后再试。",
  "errors.genericStart": "启动调研失败，请重试。",
  "errors.correctAndRetry": "请修正标红字段后重试。",
  "errors.rateLimitHint": "请求过于频繁，请稍候片刻再试。",
  "status.loading": "正在启动调研会话",
  "status.running": "调研智能体运行中",
  "status.completed": "调研完成",
  "status.error": "调研失败",
  "status.idle": "空闲",
  "status.label.complete": "已完成",
  "status.label.running": "运行中",
  "status.label.error": "错误",
  "status.label.idle": "空闲",
  "language.label": "语言",
  "agent.market-sizer.name": "市场规模分析师",
  "agent.market-sizer.description": "TAM/SAM/SOM 估算、增长趋势、市场细分",
  "agent.competitor-analyst.name": "竞争分析师",
  "agent.competitor-analyst.description": "竞争格局、市场缺口、定位矩阵",
  "agent.pain-detective.name": "痛点侦探",
  "agent.pain-detective.description": "用户痛点、未满足需求、真实用户声音",
  "agent.pricing-scout.name": "价格侦察兵",
  "agent.pricing-scout.description": "价格区间、变现模式、付费意愿",
  "agent.channel-scout.name": "渠道侦察兵",
  "agent.channel-scout.description": "获客渠道、社群中心、内容选题",
  "agent.synthesis.name": "综合分析",
  "agent.synthesis.description": "跨智能体校验、执行摘要、可分享简报",
  "agent.status.idle": "等待中",
  "agent.status.running": "调研中",
  "agent.status.done": "已完成",
  "agent.status.error": "出错",
  "studio.researchAgents": "调研智能体",
  "studio.controls": "调研控制台",
  "studio.agentsProgress": "{done}/{total} 个智能体",
  "studio.poweredBy": "由 6 个调研智能体驱动：",
  "studio.tipStart": "开始调研",
  "studio.tipReset": "重置",
  "studio.help.title": "键盘快捷键",
  "studio.help.start": "开始调研（在输入框中）",
  "studio.help.reset": "重置返回首页（在工作台中）",
  "studio.help.shortcuts": "显示此帮助",
  "footer.tagline": "LaunchLens Research Studio — launchlens-ai 的伴侣项目",
  "provider.mock": "模拟模型",
  "provider.breakerOpen": "提供方熔断已开启",
  "provider.streaming": "流式",
  "crash.title": "出错了",
  "crash.body": "发生了意外错误。你的工作并未丢失。",
  "crash.tryAgain": "重试",
  "crash.goHome": "返回首页",
  "crash.copyTrace": "复制错误详情",
  "crash.copied": "已复制",
  "notFound.title": "页面未找到",
  "notFound.body": "您要查找的页面不存在或已移动。",
  "notFound.backHome": "返回调研工作台",
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
  "actions.copyMarkdown": "复制 Markdown",
  "actions.copyJson": "复制 JSON",
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
  "query.requiredHint": "必填",
  "query.counter": "{current}/{max}",
  "query.errorMinLength": "至少需要 {min} 个字符",
  "query.errorMaxLength": "最多 {max} 个字符",
  "query.errorMaxKeywords": "关键词最多 {max} 个",
  "query.errorKeywordTooLong": "\"{keyword}\"过长",
  "query.moreKeywords": "还有 {count} 个",
  "query.keywordsOptionalHelp": "（可选，使用英文逗号分隔）",
  "query.keywordPlaceholder": "例如：SaaS、AI、效率工具、远程办公",
  "actions.export.title": "导出与操作",
  "actions.export.description": "下载报告，或复制版本粘贴到其他工具。",
  "actions.export.csvSpreadsheet": "下载 CSV（电子表格）",
  "actions.export.copyHeader": "复制到剪贴板",
  "actions.export.error.copy": "复制失败，请尝试下载。",
  "actions.export.error.markdown": "Markdown 导出失败。",
  "actions.export.error.json": "JSON 导出失败。",
  "actions.export.error.csv": "CSV 导出失败。",
  "actions.export.error.noCsvData": "暂无可导出为 CSV 的数据。",
  "actions.export.error.noSynthesis": "综合报告尚未生成。",
  "actions.export.agentsComplete": "{completed}/6",
  "report.market.sectionTitle": "市场规模与细分",
  "report.market.methodology": "研究方法",
  "report.competitor.sectionTitle": "竞争格局",
  "report.competitor.nameColumn": "竞品",
  "report.competitor.positioningColumn": "定位",
  "report.competitor.pricingColumn": "定价",
  "report.competitor.differentiatorColumn": "差异化",
  "report.pain.sectionTitle": "用户痛点与需求",
  "report.pricing.sectionTitle": "定价与变现",
  "report.pricing.tierColumn": "套餐",
  "report.pricing.priceColumn": "价格",
  "report.channels.sectionTitle": "获客渠道",
  "report.synthesis.sectionTitle": "综合研判与建议",
  "report.synthesis.execSummary": "执行摘要",
  "report.synthesis.metric.opportunity": "机会",
  "report.synthesis.metric.risk": "风险",
  "report.synthesis.metric.score": "综合评分",
  "report.synthesis.briefLabel": "LaunchLens 导入简报",
  "agent.failed": "错误",
  "agent.cancelled": "已取消",
  "common.more": "更多",
  "time.justNow": "刚刚",
  "time.minuteAgo": "{n}分钟前",
  "time.minutesAgo": "{n}分钟前",
  "time.hourAgo": "{n}小时前",
  "time.hoursAgo": "{n}小时前",
  "time.dayAgo": "{n}天前",
  "time.daysAgo": "{n}天前",
  "time.never": "从未",
  "studio.help.toggleLanguage": "切换语言",
  "studio.help.focus": "聚焦查询输入框",
  "api.rateLimitExceeded": "请求频率超限，请稍后重试。",
  "api.invalidJson": "请求体必须是有效的 JSON。",
  "api.invalidBody": "请求体必须是 JSON 对象。",
  "api.queryRequired": "'query' 字段为必填项且必须是字符串。",
  "api.queryTooShort": "查询内容至少需要 {min} 个字符。",
  "api.queryTooLong": "查询内容最多 {max} 个字符。",
  "api.keywordsMustBeArray": "'keywords' 字段必须是字符串数组。",
  "api.keywordsTooMany": "关键词最多 {max} 个。",
  "api.keywordInvalid": "第 {index} 个关键词必须是字符串。",
  "api.keywordTooLong": "关键词超过 {max} 个字符。",
  "api.methodNotAllowed": "请使用 POST 创建调研会话。",
  "api.sessionNotFound": "会话不存在。",
  "api.invalidSessionId": "会话 ID 格式无效。",
  "api.gotNCharacters": "当前为 {count} 个字符。",
  "step.waiting": "等待开始...",
  "step.streaming": "正在接收响应",
  "step.validating": "正在验证输出",
  "step.complete": "完成",
  "step.skipped": "已跳过：上游智能体失败过多",
  "step.error": "错误",
  "step.loadingContext": "正在加载研究上下文",
  "step.synthesizingFindings": "正在综合调研发现",
  "step.compilingCitations": "正在汇总引用",
  // market-sizer
  "step.market.boundaries": "正在界定市场边界与范围...",
  "step.market.tamData": "正在收集行业报告中的 TAM 数据...",
  "step.market.samSom": "正在通过细分计算 SAM 与 SOM...",
  "step.market.growthTrends": "正在分析增长趋势与市场速度...",
  "step.market.crossReference": "正在交叉核对多源数据以确认置信度...",
  "step.market.estimates": "正在综合市场规模估算...",
  // competitor-analyst
  "step.competitors.identifying": "正在识别直接与间接竞争对手...",
  "step.competitors.positioning": "正在抓取竞品定位与定价信息...",
  "step.competitors.featureMatrix": "正在构建竞品功能矩阵...",
  "step.competitors.strengthsWeaknesses": "正在分析优势与劣势...",
  "step.competitors.gaps": "正在绘制市场空白与蓝海空间...",
  "step.competitors.validatingFindings": "正在跨来源交叉验证发现...",
  // pain-detective
  "step.pain.scanningForums": "正在扫描论坛与社区讨论...",
  "step.pain.collectingReviews": "正在收集用户评价与评论...",
  "step.pain.clustering": "正在按频率与严重度聚类痛点...",
  "step.pain.quotes": "正在提取代表性原话...",
  "step.pain.unmetNeeds": "正在识别未被满足的需求与机会领域...",
  "step.pain.personas": "正在根据痛点模式构建用户画像...",
  // pricing-scout
  "step.pricing.collecting": "正在收集竞品定价页...",
  "step.pricing.bands": "正在梳理价格带与套餐结构...",
  "step.pricing.monetization": "正在分析盈利模式分布...",
  "step.pricing.willingnessToPay": "正在估算各细分人群付费意愿...",
  "step.pricing.benchmarking": "正在对标品类基准...",
  "step.pricing.recommendations": "正在形成定价建议...",
  // channel-scout
  "step.channels.mappingLandscape": "正在绘制获客渠道全景...",
  "step.channels.scanningHubs": "正在扫描社区聚集地与论坛...",
  "step.channels.searchVolume": "正在分析内容话题搜索量...",
  "step.channels.paidCompetitiveness": "正在评估付费渠道竞争度...",
  "step.channels.costEffectiveness": "正在评估渠道成本与效果...",
  "step.channels.prioritizingRoi": "正在按预期 ROI 排序渠道优先级...",
  // synthesis
  "step.synthesis.collecting": "正在汇集所有研究智能体输出...",
  "step.synthesis.crossValidating": "正在跨智能体交叉验证结论...",
  "step.synthesis.confidence": "正在识别最高置信度洞察...",
  "step.synthesis.scores": "正在评估机会与风险评分...",
  "step.synthesis.executiveSummary": "正在综合执行摘要...",
  "step.synthesis.launchBrief": "正在生成可导入的启动简报...",
  "common.yes": "是",
  "common.no": "否",
  "common.ok": "正常",
  "common.unknown": "未知",
  "error.unauthorized": "未授权",
  "diagnostics.title": "诊断",
  "diagnostics.intro": "{name} (v{version}) 的运行时可观测性。",
  "diagnostics.provider": "供应商",
  "diagnostics.telemetry": "遥测",
  "diagnostics.requests": "请求",
  "diagnostics.generations": "次生成",
  "diagnostics.success": "成功",
  "diagnostics.avg": "平均",
  "diagnostics.recent": "最近",
  "diagnostics.breakdown": "供应商明细",
  "diagnostics.noGenerations": "尚未记录任何智能体生成。",
  "diagnostics.breakers": "断路器",
  "diagnostics.noBreakers": "无断路器跳闸。",
  "diagnostics.recentRequests": "最近请求",
  "diagnostics.noRequests": "暂无请求。",
  "diagnostics.recentGen": "最近智能体生成",
  "diagnostics.noTelemetry": "暂无遥测数据。",
  "diagnostics.col.key": "键",
  "diagnostics.col.failures": "失败次数",
  "diagnostics.col.open": "断开",
  "diagnostics.col.opened": "断开时间",
  "diagnostics.col.when": "时间",
  "diagnostics.col.route": "路由",
  "diagnostics.col.status": "状态",
  "diagnostics.col.latency": "延迟",
  "diagnostics.col.agent": "智能体",
  "diagnostics.col.provider": "供应商",
  "diagnostics.col.total": "总数",
  "diagnostics.col.cancelled": "已取消",
  "diagnostics.col.succeeded": "成功",
  "diagnostics.cancelled": "已取消",
  "diagnostics.succeeded": "成功",
  "diagnostics.failures": "失败",
  "diagnostics.authHint": "诊断页面访问受限，请提供有效的令牌。",
  "diagnostics.mock": "模拟",
  "diagnostics.realLlm": "真实 LLM",
  "diagnostics.streaming": "流式",
  "diagnostics.nonStreaming": "非流式",
  "connection.reconnecting": "正在重新连接调研流...",
  "connection.polling": "流连接已断开，使用轮询回退",
  "connection.connecting": "连接中...",
  "connection.connected": "已连接",
  "market.tamLabel": "总体可触达市场",
  "market.samLabel": "可服务市场",
  "market.somLabel": "三年可获得市场",
  "market.trend.accelerating": "加速",
  "market.trend.declining": "下滑",
  "market.trend.steady": "平稳",
  "market.sizeEstimate": "市场规模估算",
  "pain.topPainPoints": "主要痛点",
  "pain.affects": "影响",
  "pain.severity.mild": "轻微",
  "pain.frequency.rare": "罕见",
  "pain.whyUnmet": "未满足原因",
  "pain.opportunity": "机会",
  "competitor.marketShare": "市场份额",
  "competitor.visit": "访问",
  "competitor.opportunityLabel": "机会",
  "pricing.typicalLabel": "典型价格",
  "pricing.legend": "← 最低 | → 最高 | 竖线 = 典型价格",
  "pricing.prevalence": "普及度",
  "pricing.examples": "示例",
  "pricing.wtpSegment": "各细分市场付费意愿",
  "channels.landscape": "渠道全景",
  "channels.effectiveness": "效果",
  "channels.reach": "覆盖范围",
  "channels.costEfficiency": "成本效益",
  "channels.searchVolume": "搜索量",
  "channels.competition": "竞品",
  "synthesis.netScore": "净值分",
  "synthesis.opportunityMinusRisk": "机会 − 风险",
  "synthesis.basedOnInsights": "基于跨智能体校验的 {count} 条洞察",
  "synthesis.top3Opportunities": "三大机会",
  "synthesis.top3Risks": "三大风险",
  "synthesis.whyThisWorks": "为什么可行",
  "synthesis.mitigation": "缓解方案",
  "synthesis.crossValidated": "交叉验证洞察",
  "synthesis.supportedBy": "支持方：",
  "synthesis.briefReady": "可直接粘贴到 launchlens-ai 生成 GTM 策略",
  "synthesis.copyBrief": "复制简报",
  "synthesis.opportunityStrong": "绝佳机会",
  "synthesis.opportunityPromising": "前景良好",
  "synthesis.opportunityModerate": "中等",
  "synthesis.opportunityChallenging": "有挑战",
  "synthesis.opportunityHighRisk": "高风险",
  "competitor.positioning.premium": "高端",
  "competitor.positioning.mid-market": "中端市场",
  "competitor.positioning.budget": "平价",
  "competitor.positioning.niche": "细分",
  "channels.volume.high": "高",
  "channels.volume.medium": "中",
  "channels.volume.low": "低",
};

const ja: Dict = {
  "header.subtitle": "プロダクトアイデアのためのマルチエージェント市場インテリジェンス",
  "header.researchComplete": "リサーチ完了",
  "header.share": "共有",
  "header.newResearch": "新しいリサーチ",
  "hero.title": "あらゆる市場を数分でリサーチ",
  "hero.subtitle": "6 つの専門 AI エージェントが並列で動作し、完全な市場インテリジェンスレポートを生成します。API キーは不要です。",
  "errors.startFailed": "リサーチを開始できませんでした",
  "errors.dismiss": "閉じる",
  "errors.dismissShort": "×",
  "errors.retry": "再試行",
  "errors.sessionExpired": "セッションが期限切れです。新しいリサーチを開始してください。",
  "errors.retryInSeconds": "{n} 秒後に再試行できます",
  "errors.retryNow": "今すぐ再試行できます",
  "errors.network": "ネットワークエラーです。接続を確認してもう一度お試しください。",
  "errors.serverError": "サーバーエラーが発生しました。しばらくしてからもう一度お試しください。",
  "errors.genericStart": "リサーチの開始に失敗しました。もう一度お試しください。",
  "errors.correctAndRetry": "強調表示された項目を修正して再試行してください。",
  "errors.rateLimitHint": "リクエストが多すぎます。しばらくお待ちください。",
  "status.loading": "リサーチセッションを開始しています",
  "status.running": "リサーチエージェントが実行中です",
  "status.completed": "リサーチ完了",
  "status.error": "リサーチに失敗しました",
  "status.idle": "待機",
  "status.label.complete": "完了",
  "status.label.running": "実行中",
  "status.label.error": "エラー",
  "status.label.idle": "待機",
  "language.label": "言語",
  "agent.market-sizer.name": "マーケットサイザー",
  "agent.market-sizer.description": "TAM/SAM/SOM 推計、成長トレンド、市場セグメント",
  "agent.competitor-analyst.name": "コンペティターアナリスト",
  "agent.competitor-analyst.description": "競合環境、ギャップ、ポジショニング",
  "agent.pain-detective.name": "ペインディテクティブ",
  "agent.pain-detective.description": "ユーザーペイン、満たされないニーズ、生の声",
  "agent.pricing-scout.name": "プライシングスカウト",
  "agent.pricing-scout.description": "価格帯、収益モデル、支払意欲",
  "agent.channel-scout.name": "チャネルスカウト",
  "agent.channel-scout.description": "獲得チャネル、コミュニティ、コンテンツテーマ",
  "agent.synthesis.name": "シンセシス",
  "agent.synthesis.description": "エージェント横断検証、エグゼクティブサマリー、共有可能なブリーフ",
  "agent.status.idle": "待機中",
  "agent.status.running": "リサーチ中",
  "agent.status.done": "完了",
  "agent.status.error": "エラー",
  "studio.researchAgents": "リサーチエージェント",
  "studio.controls": "リサーチコントロール",
  "studio.agentsProgress": "{done}/{total} エージェント",
  "studio.poweredBy": "6 つのリサーチエージェントで動作:",
  "studio.tipStart": "開始",
  "studio.tipReset": "リセット",
  "studio.help.title": "キーボードショートカット",
  "studio.help.start": "リサーチ開始（クエリ入力時）",
  "studio.help.reset": "ランディングページにリセット（スタジオ時）",
  "studio.help.shortcuts": "このヘルプを表示",
  "footer.tagline": "LaunchLens Research Studio — launchlens-ai のコンパニオン",
  "provider.mock": "モックプロバイダ",
  "provider.breakerOpen": "プロバイダ遮断中",
  "provider.streaming": "ストリーム",
  "crash.title": "エラーが発生しました",
  "crash.body": "予期しないエラーが発生しました。作業は失われていません。",
  "crash.tryAgain": "再試行",
  "crash.goHome": "ホームへ戻る",
  "crash.copyTrace": "エラー詳細をコピー",
  "crash.copied": "コピーしました",
  "notFound.title": "ページが見つかりません",
  "notFound.body": "お探しのページは存在しないか、移動された可能性があります。",
  "notFound.backHome": "リサーチスタジオに戻る",
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
  "actions.copyMarkdown": "Markdown をコピー",
  "actions.copyJson": "JSON をコピー",
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
  "query.requiredHint": "必須",
  "query.counter": "{current}/{max}",
  "query.errorMinLength": "最低 {min} 文字",
  "query.errorMaxLength": "最大 {max} 文字",
  "query.errorMaxKeywords": "キーワードは最大 {max} 個",
  "query.errorKeywordTooLong": "「{keyword}」が長すぎます",
  "query.moreKeywords": "他 {count} 件",
  "query.keywordsOptionalHelp": "（任意、カンマ区切り）",
  "query.keywordPlaceholder": "例：SaaS、AI、生産性、リモートワーク",
  "actions.export.title": "エクスポートと操作",
  "actions.export.description": "レポートをダウンロードするか、コピーして他のツールに貼り付けできます。",
  "actions.export.csvSpreadsheet": "CSV をダウンロード（スプレッドシート）",
  "actions.export.copyHeader": "クリップボードにコピー",
  "actions.export.error.copy": "コピーに失敗しました。ダウンロードをお試しください。",
  "actions.export.error.markdown": "Markdown エクスポートに失敗しました。",
  "actions.export.error.json": "JSON エクスポートに失敗しました。",
  "actions.export.error.csv": "CSV エクスポートに失敗しました。",
  "actions.export.error.noCsvData": "CSV として書き出せるデータがありません。",
  "actions.export.error.noSynthesis": "シンセシスレポートは未生成です。",
  "actions.export.agentsComplete": "{completed}/6",
  "report.market.sectionTitle": "市場規模とセグメント",
  "report.market.methodology": "手法",
  "report.competitor.sectionTitle": "競合環境",
  "report.competitor.nameColumn": "競合",
  "report.competitor.positioningColumn": "ポジショニング",
  "report.competitor.pricingColumn": "価格",
  "report.competitor.differentiatorColumn": "差別化要因",
  "report.pain.sectionTitle": "ペインポイントとユーザーニーズ",
  "report.pricing.sectionTitle": "価格設定と収益化",
  "report.pricing.tierColumn": "プラン",
  "report.pricing.priceColumn": "価格",
  "report.channels.sectionTitle": "獲得チャネル",
  "report.synthesis.sectionTitle": "シンセシスと推奨",
  "report.synthesis.execSummary": "エグゼクティブサマリー",
  "report.synthesis.metric.opportunity": "機会",
  "report.synthesis.metric.risk": "リスク",
  "report.synthesis.metric.score": "総合スコア",
  "report.synthesis.briefLabel": "LaunchLens インポートブリーフ",
  "agent.failed": "エラー",
  "agent.cancelled": "キャンセル済み",
  "common.more": "その他",
  "time.justNow": "たった今",
  "time.minuteAgo": "{n}分前",
  "time.minutesAgo": "{n}分前",
  "time.hourAgo": "{n}時間前",
  "time.hoursAgo": "{n}時間前",
  "time.dayAgo": "{n}日前",
  "time.daysAgo": "{n}日前",
  "time.never": "なし",
  "studio.help.toggleLanguage": "言語を切り替え",
  "studio.help.focus": "クエリ入力欄にフォーカス",
  "api.rateLimitExceeded": "レート制限を超えました。しばらくしてから再試行してください。",
  "api.invalidJson": "リクエストボディは有効な JSON である必要があります。",
  "api.invalidBody": "リクエストボディは JSON オブジェクトである必要があります。",
  "api.queryRequired": "'query' フィールドは必須で、文字列である必要があります。",
  "api.queryTooShort": "クエリは最低 {min} 文字必要です。",
  "api.queryTooLong": "クエリは最大 {max} 文字までです。",
  "api.keywordsMustBeArray": "'keywords' フィールドは文字列の配列である必要があります。",
  "api.keywordsTooMany": "キーワードは最大 {max} 個までです。",
  "api.keywordInvalid": "インデックス {index} のキーワードは文字列である必要があります。",
  "api.keywordTooLong": "キーワードが {max} 文字を超えています。",
  "api.methodNotAllowed": "POST でリサーチセッションを作成してください。",
  "api.sessionNotFound": "セッションが見つかりません。",
  "api.invalidSessionId": "セッション ID の形式が無効です。",
  "api.gotNCharacters": "{count} 文字入力されています。",
  "step.waiting": "開始待ち...",
  "step.streaming": "レスポンスを受信中",
  "step.validating": "出力を検証中",
  "step.complete": "完了",
  "step.skipped": "スキップ：上位エージェントの失敗が多すぎます",
  "step.error": "エラー",
  "step.loadingContext": "リサーチコンテキストを読み込み中",
  "step.synthesizingFindings": "知見を統合中",
  "step.compilingCitations": "引用を整理中",
  // market-sizer
  "step.market.boundaries": "市場の境界と範囲を定義中...",
  "step.market.tamData": "業界レポートから TAM データを収集中...",
  "step.market.samSom": "セグメンテーションで SAM と SOM を計算中...",
  "step.market.growthTrends": "成長トレンドと市場の勢いを分析中...",
  "step.market.crossReference": "信頼度のため複数ソースを相互参照中...",
  "step.market.estimates": "市場規模の推定値を統合中...",
  // competitor-analyst
  "step.competitors.identifying": "直接・間接の競合を特定中...",
  "step.competitors.positioning": "競合のポジショニングと価格をスクレイピング中...",
  "step.competitors.featureMatrix": "競合機能マトリックスを構築中...",
  "step.competitors.strengthsWeaknesses": "強みと弱みを分析中...",
  "step.competitors.gaps": "市場のギャップと空白地帯をマッピング中...",
  "step.competitors.validatingFindings": "複数ソースで知見を検証中...",
  // pain-detective
  "step.pain.scanningForums": "フォーラムやコミュニティの議論をスキャン中...",
  "step.pain.collectingReviews": "ユーザーレビューとコメントを収集中...",
  "step.pain.clustering": "頻度と重大度でペインポイントをクラスタリング中...",
  "step.pain.quotes": "代表的な引用を抽出中...",
  "step.pain.unmetNeeds": "満たされていないニーズと機会領域を特定中...",
  "step.pain.personas": "ペインポイントのパターンからペルソナを構築中...",
  // pricing-scout
  "step.pricing.collecting": "競合の価格ページを収集中...",
  "step.pricing.bands": "価格帯と階層構造をマッピング中...",
  "step.pricing.monetization": "収益化モデルの普及度を分析中...",
  "step.pricing.willingnessToPay": "セグメント別の支払意思額を推定中...",
  "step.pricing.benchmarking": "カテゴリ基準とベンチマーク中...",
  "step.pricing.recommendations": "価格推奨を策定中...",
  // channel-scout
  "step.channels.mappingLandscape": "獲得チャネルの全体像をマッピング中...",
  "step.channels.scanningHubs": "コミュニティハブとフォーラムをスキャン中...",
  "step.channels.searchVolume": "コンテンツトピックの検索ボリュームを分析中...",
  "step.channels.paidCompetitiveness": "有料チャネルの競合度を評価中...",
  "step.channels.costEffectiveness": "チャネルのコストと効果を評価中...",
  "step.channels.prioritizingRoi": "期待 ROI でチャネルを優先順位付け中...",
  // synthesis
  "step.synthesis.collecting": "すべてのリサーチエージェントの出力を収集中...",
  "step.synthesis.crossValidating": "エージェント間で知見を相互検証中...",
  "step.synthesis.confidence": "最も確信度の高い洞察を特定中...",
  "step.synthesis.scores": "機会とリスクのスコアを評価中...",
  "step.synthesis.executiveSummary": "エグゼクティブサマリーを統合中...",
  "step.synthesis.launchBrief": "インポート可能なローンチブリーフを生成中...",
  "common.yes": "はい",
  "common.no": "いいえ",
  "common.ok": "OK",
  "common.unknown": "不明",
  "error.unauthorized": "未認証",
  "diagnostics.title": "診断",
  "diagnostics.intro": "{name} (v{version}) のランタイム可観測性。",
  "diagnostics.provider": "プロバイダー",
  "diagnostics.telemetry": "テレメトリー",
  "diagnostics.requests": "リクエスト",
  "diagnostics.generations": "回生成",
  "diagnostics.success": "成功",
  "diagnostics.avg": "平均",
  "diagnostics.recent": "最近",
  "diagnostics.breakdown": "プロバイダー内訳",
  "diagnostics.noGenerations": "エージェント生成はまだ記録されていません。",
  "diagnostics.breakers": "サーキットブレーカー",
  "diagnostics.noBreakers": "作動中のブレーカーはありません。",
  "diagnostics.recentRequests": "最近のリクエスト",
  "diagnostics.noRequests": "リクエストはまだありません。",
  "diagnostics.recentGen": "最近のエージェント生成",
  "diagnostics.noTelemetry": "テレメトリーはまだありません。",
  "diagnostics.col.key": "キー",
  "diagnostics.col.failures": "失敗数",
  "diagnostics.col.open": "遮断中",
  "diagnostics.col.opened": "遮断時刻",
  "diagnostics.col.when": "時刻",
  "diagnostics.col.route": "ルート",
  "diagnostics.col.status": "ステータス",
  "diagnostics.col.latency": "レイテンシ",
  "diagnostics.col.agent": "エージェント",
  "diagnostics.col.provider": "プロバイダー",
  "diagnostics.col.total": "合計",
  "diagnostics.col.cancelled": "キャンセル済",
  "diagnostics.col.succeeded": "成功",
  "diagnostics.cancelled": "キャンセル",
  "diagnostics.succeeded": "成功",
  "diagnostics.failures": "失敗",
  "diagnostics.authHint": "診断ページへのアクセスは制限されています。有効なトークンを指定してください。",
  "diagnostics.mock": "モック",
  "diagnostics.realLlm": "実 LLM",
  "diagnostics.streaming": "ストリーミング",
  "diagnostics.nonStreaming": "非ストリーミング",
  "connection.reconnecting": "リサーチストリームに再接続中...",
  "connection.polling": "ストリーム切断 — ポーリングにフォールバック",
  "connection.connecting": "接続中...",
  "connection.connected": "接続済み",
  "market.tamLabel": "総市場規模",
  "market.samLabel": "サービス提供可能市場",
  "market.somLabel": "3 年で獲得可能な市場",
  "market.trend.accelerating": "加速中",
  "market.trend.declining": "減少中",
  "market.trend.steady": "安定",
  "market.sizeEstimate": "市場規模見積もり",
  "pain.topPainPoints": "主な課題点",
  "pain.affects": "影響を受ける",
  "pain.severity.mild": "軽度",
  "pain.frequency.rare": "稀",
  "pain.whyUnmet": "未充足の理由",
  "pain.opportunity": "機会",
  "competitor.marketShare": "市場シェア",
  "competitor.visit": "訪問",
  "competitor.opportunityLabel": "機会",
  "pricing.typicalLabel": "代表的な価格",
  "pricing.legend": "← 最小 | → 最大 | 縦線 = 代表的な価格",
  "pricing.prevalence": "普及度",
  "pricing.examples": "例",
  "pricing.wtpSegment": "セグメント別支払意欲",
  "channels.landscape": "チャネル状況",
  "channels.effectiveness": "効果",
  "channels.reach": "リーチ",
  "channels.costEfficiency": "費用対効果",
  "channels.searchVolume": "検索ボリューム",
  "channels.competition": "競合",
  "synthesis.netScore": "ネットスコア",
  "synthesis.opportunityMinusRisk": "機会 − リスク",
  "synthesis.basedOnInsights": "{count} 件の洞察に基づくエージェント横断検証",
  "synthesis.top3Opportunities": "上位 3 つの機会",
  "synthesis.top3Risks": "上位 3 つのリスク",
  "synthesis.whyThisWorks": "なぜ効果的か",
  "synthesis.mitigation": "緩和策",
  "synthesis.crossValidated": "横断検証済み洞察",
  "synthesis.supportedBy": "サポート：",
  "synthesis.briefReady": "launchlens-ai に貼り付けて GTM 戦略を生成できます",
  "synthesis.copyBrief": "ブリーフをコピー",
  "synthesis.opportunityStrong": "強い機会",
  "synthesis.opportunityPromising": "有望",
  "synthesis.opportunityModerate": "中程度",
  "synthesis.opportunityChallenging": "課題あり",
  "synthesis.opportunityHighRisk": "高リスク",
  "competitor.positioning.premium": "プレミアム",
  "competitor.positioning.mid-market": "ミッドマーケット",
  "competitor.positioning.budget": "低価格",
  "competitor.positioning.niche": "ニッチ",
  "channels.volume.high": "高",
  "channels.volume.medium": "中",
  "channels.volume.low": "低",
};

export const DICTIONARIES: Record<Locale, Dict> = {
  "en": en,
  "zh-CN": zhCN,
  "ja": ja,
};

export function translate(locale: Locale, key: DictionaryKey | string, fallback?: string): string {
  const dict = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
  const k = key as DictionaryKey;
  return dict[k] || DICTIONARIES[DEFAULT_LOCALE][k] || fallback || (typeof key === "string" ? key : "");
}

/** Interpolate {placeholders} in a translated string. */
export function format(locale: Locale, key: DictionaryKey | string, vars: Record<string, string | number>, fallback?: string): string {
  let s = translate(locale, key, fallback);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return s;
}
