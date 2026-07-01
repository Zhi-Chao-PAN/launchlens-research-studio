// Locale dictionaries. Keep keys flat and stable so future translation
// passes can diff against this canonical English source.
export type Locale = "en" | "zh-CN" | "ja" | "ko";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh-CN", "ja", "ko"] as const;
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  "en": "English",
  "zh-CN": "中文",
  "ja": "日本語",
  "ko": "한국어",
};

export type DictionaryKey =
  | "agent.channel-scout.description"
  | "agent.channel-scout.name"
  | "agent.competitor-analyst.description"
  | "agent.competitor-analyst.name"
  | "agent.market-sizer.description"
  | "agent.market-sizer.name"
  | "agent.pain-detective.description"
  | "agent.pain-detective.name"
  | "agent.pricing-scout.description"
  | "agent.pricing-scout.name"
  | "agent.status.done"
  | "agent.status.error"
  | "agent.status.idle"
  | "agent.status.running"
  | "agent.degraded"
  | "batch.status.completed"
  | "batch.status.failed"
  | "batch.status.queued"
  | "batch.status.running"
  | "batch.title"
  | "batch.subtitle"
  | "batch.backHome"
  | "batch.queriesLabel"
  | "batch.queriesPlaceholder"
  | "batch.queryCount"
  | "batch.keywordsLabel"
  | "batch.keywordsPlaceholder"
  | "batch.submit"
  | "batch.submitting"
  | "batch.maxQueries"
  | "batch.progressTitle"
  | "batch.progressDone"
  | "batch.progressSuccess"
  | "batch.progressFailed"
  | "batch.viewRun"
  | "batch.historyTitle"
  | "batch.historyCount"
  | "schedule.title"
  | "schedule.subtitle"
  | "schedule.statTotal"
  | "schedule.statActive"
  | "schedule.statPaused"
  | "schedule.statRuns"
  | "schedule.new"
  | "schedule.nameLabel"
  | "schedule.namePlaceholder"
  | "schedule.queryLabel"
  | "schedule.queryPlaceholder"
  | "schedule.keywordsLabel"
  | "schedule.keywordsPlaceholder"
  | "schedule.frequencyLabel"
  | "schedule.intervalHourly"
  | "schedule.intervalDaily"
  | "schedule.intervalWeekly"
  | "schedule.intervalCustom"
  | "schedule.intervalMinutesLabel"
  | "schedule.hourLabel"
  | "schedule.dayOfWeekLabel"
  | "schedule.cancel"
  | "schedule.create"
  | "schedule.creating"
  | "schedule.untitled"
  | "schedule.empty"
  | "schedule.emptyHint"
  | "schedule.metaFrequency"
  | "schedule.metaNextRun"
  | "schedule.metaLastRun"
  | "schedule.metaTotal"
  | "schedule.runsUnit"
  | "schedule.successSuffix"
  | "schedule.failedSuffix"
  | "schedule.trigger"
  | "schedule.triggerTitle"
  | "schedule.pause"
  | "schedule.resume"
  | "schedule.delete"
  | "schedule.deleteConfirmTitle"
  | "schedule.deleteConfirmBody"
  | "schedule.statusActive"
  | "schedule.statusPaused"
  | "schedule.intervalHourlyShort"
  | "schedule.intervalDailyShort"
  | "schedule.intervalWeeklyShort"
  | "schedule.intervalMinutesShort"
  | "schedule.intervalUnknown"
  | "schedule.daySun"
  | "schedule.dayMon"
  | "schedule.dayTue"
  | "schedule.dayWed"
  | "schedule.dayThu"
  | "schedule.dayFri"
  | "schedule.daySat"
  | "agent.synthesis.description"
  | "agent.synthesis.name"
  | "commandPalette.all"
  | "commandPalette.category.action"
  | "commandPalette.category.navigation"
  | "commandPalette.category.setting"
  | "commandPalette.category.template"
  | "commandPalette.noResults"
  | "commandPalette.placeholder"
  | "commandPalette.tryDifferent"
  | "commandPalette.navigate"
  | "commandPalette.select"
  | "commandPalette.close"
  | "common.back"
  | "common.cancel"
  | "common.close"
  | "common.confirm"
  | "common.copied"
  | "common.copy"
  | "common.delete"
  | "common.edit"
  | "common.error"
  | "common.history"
  | "common.home"
  | "common.loading"
  | "common.retry"
  | "common.save"
  | "common.search"
  | "common.settings"
  | "common.share"
  | "common.templates"
  | "commands.navHome.label"
  | "commands.navHome.description"
  | "commands.navHistory.label"
  | "commands.navHistory.description"
  | "commands.navTemplates.label"
  | "commands.navTemplates.description"
  | "commands.navBatch.label"
  | "commands.navBatch.description"
  | "commands.navCompare.label"
  | "commands.navCompare.description"
  | "commands.navStarred.label"
  | "commands.navStarred.description"
  | "commands.themeToggle.label"
  | "commands.themeToggle.description"
  | "commands.themeDark.label"
  | "commands.themeDark.description"
  | "commands.themeLight.label"
  | "commands.themeLight.description"
  | "commands.paletteOpen.label"
  | "commands.paletteOpen.description"
  | "shortcuts.openPalette"
  | "shortcuts.showShortcuts"
  | "shortcuts.goHome"
  | "shortcuts.goHistory"
  | "shortcuts.goTemplates"
  | "shortcuts.goBatch"
  | "shortcuts.goCompare"
  | "shortcuts.toggleTheme"
  | "shortcuts.closeDialogs"
  | "date.justNow"
  | "date.inFuture"
  | "date.secondsShort"
  | "date.minutesShort"
  | "date.hoursShort"
  | "date.daysShort"
  | "date.weeksShort"
  | "date.monthsShort"
  | "date.yearsShort"
  | "date.minutesLong"
  | "date.hoursLong"
  | "date.daysLong"
  | "date.today"
  | "date.yesterday"
  | "validation.bodyNotObject"
  | "validation.queryRequired"
  | "validation.queryTooShort"
  | "validation.queryTooLong"
  | "validation.keywordsNotArray"
  | "validation.tooManyKeywords"
  | "validation.keywordNotString"
  | "validation.keywordTooLong"
  | "validation.gotChars"
  | "compare.title"
  | "compare.backToHistory"
  | "compare.optionA"
  | "compare.optionB"
  | "compare.loading"
  | "compare.error.selectTwo"
  | "compare.error.loadA"
  | "compare.error.loadB"
  | "compare.error.loadFailed"
  | "compare.error.title"
  | "compare.view.sideBySide"
  | "compare.view.diff"
  | "compare.changesSuffix"
  | "compare.section.scoreCompare"
  | "compare.section.execSummary"
  | "compare.section.diffOverview"
  | "compare.section.keywords"
  | "compare.section.sources"
  | "compare.section.insights"
  | "compare.section.opportunities"
  | "compare.section.risks"
  | "compare.section.nextStep"
  | "compare.score.opportunity"
  | "compare.score.risk"
  | "compare.score.opportunityShort"
  | "compare.score.riskShort"
  | "compare.score.unit"
  | "compare.diff.added"
  | "compare.diff.removed"
  | "compare.diff.modified"
  | "compare.diff.insightsAdded"
  | "compare.diff.insightsRemoved"
  | "compare.diff.insightsModified"
  | "compare.diff.opportunitiesAdded"
  | "compare.diff.opportunitiesRemoved"
  | "compare.diff.opportunitiesModified"
  | "compare.diff.risksAdded"
  | "compare.diff.risksRemoved"
  | "compare.diff.risksModified"
  | "compare.diff.nextStepChanged"
  | "compare.diff.before"
  | "compare.diff.after"
  | "compare.diff.empty"
  | "compare.keywords.shared"
  | "compare.keywords.onlyA"
  | "compare.keywords.onlyB"
  | "compare.sources.similarity"
  | "compare.sources.sourcesA"
  | "compare.sources.shared"
  | "compare.sources.sourcesB"
  | "compare.sources.sharedDomains"
  | "compare.sources.domainsOnlyA"
  | "compare.sources.domainsOnlyB"
  | "compare.insightsCount"
  | "crash.body"
  | "crash.copied"
  | "crash.copyTrace"
  | "crash.goHome"
  | "crash.title"
  | "crash.tryAgain"
  | "errors.dismiss"
  | "errors.startFailed"
  | "errors.rateLimit"
  | "errors.serviceUnavailable"
  | "errors.notFound"
  | "errors.badRequest"
  | "errors.unauthorized"
  | "errors.cronNotConfigured"
  | "errors.sessionExpired"
  | "errors.retryTitle"
  | "errors.retryHint"
  | "errors.notFoundTitle"
  | "errors.notFoundHint"
  | "errors.failedRunTitle"
  | "errors.failedRunHint"
  | "errors.tryAgain"
  | "common.backToHistory"
  | "common.backToStudio"
  | "common.startNew"
  | "export.copied"
  | "export.copy"
  | "export.download"
  | "export.json"
  | "export.markdown"
  | "export.pdf"
  | "export.title"
  | "folder.delete"
  | "folder.dragToReorder"
  | "folder.empty"
  | "folder.new"
  | "folder.rename"
  | "footer.tagline"
  | "header.newResearch"
  | "header.researchComplete"
  | "header.share"
  | "header.subtitle"
  | "hero.subtitle"
  | "hero.title"
  | "history.clearSelection"
  | "history.confirmDelete"
  | "history.deleteSelected"
  | "history.empty"
  | "history.emptyDesc"
  | "history.exportSelected"
  | "history.filterAll"
  | "history.filterCompleted"
  | "history.filterFailed"
  | "history.searchPlaceholder"
  | "history.selectAll"
  | "history.selected"
  | "history.sortNewest"
  | "history.sortOldest"
  | "history.sortQuery"
  | "history.title"
  | "language.label"
  | "notFound.backHome"
  | "notFound.body"
  | "notFound.title"
  | "provider.breakerOpen"
  | "provider.mock"
  | "provider.probe.error"
  | "provider.probe.failed"
  | "provider.probe.mockOk"
  | "provider.probe.ok"
  | "provider.probe.test"
  | "provider.probe.testing"
  | "provider.streaming"
  | "report.degradedBanner.body"
  | "report.degradedBanner.title"
  | "report.common.copied"
  | "report.common.copySection"
  | "report.common.item"
  | "report.common.items"
  | "report.confidence.high"
  | "report.confidence.low"
  | "report.confidence.medium"
  | "report.marketSizer.title"
  | "report.marketSizer.copySection"
  | "report.marketSizer.marketSizeEstimate"
  | "report.marketSizer.tamLabel"
  | "report.marketSizer.samLabel"
  | "report.marketSizer.somLabel"
  | "report.marketSizer.growthRate"
  | "report.marketSizer.growthRateValue"
  | "report.marketSizer.growthLabel"
  | "report.marketSizer.trendPrefix"
  | "report.marketSizer.trendAccelerating"
  | "report.marketSizer.trendStable"
  | "report.marketSizer.trendDeclining"
  | "report.marketSizer.keyTrends"
  | "report.marketSizer.targetSegments"
  | "report.marketSizer.percentOf"
  | "report.competitor.title"
  | "report.competitor.copySection"
  | "report.competitor.competitors"
  | "report.competitor.strengths"
  | "report.competitor.weaknesses"
  | "report.competitor.marketShareSuffix"
  | "report.competitor.visit"
  | "report.competitor.matrix"
  | "report.competitor.gaps"
  | "report.competitor.gapOpportunity"
  | "report.competitor.positioning.premium"
  | "report.competitor.positioning.midMarket"
  | "report.competitor.positioning.budget"
  | "report.competitor.positioning.niche"
  | "report.pain.title"
  | "report.pain.copySection"
  | "report.pain.critical"
  | "report.pain.significant"
  | "report.pain.minor"
  | "report.pain.personas"
  | "report.pain.unmetNeeds"
  | "report.pain.topPainPoints"
  | "report.pain.affectsPrefix"
  | "report.pain.whyUnmet"
  | "report.pain.opportunity"
  | "report.pain.userPersonas"
  | "report.pain.goals"
  | "report.pain.frustrations"
  | "report.pain.frequency.common"
  | "report.pain.frequency.occasional"
  | "report.pain.frequency.rare"
  | "report.pricing.title"
  | "report.pricing.copySection"
  | "report.pricing.priceBands"
  | "report.pricing.typicalMarker"
  | "report.pricing.typicalPrefix"
  | "report.pricing.recommendedTiers"
  | "report.pricing.perUserMonth"
  | "report.pricing.perUserYear"
  | "report.pricing.oneTime"
  | "report.pricing.perUsage"
  | "report.pricing.monetizationModels"
  | "report.pricing.prevalenceSuffix"
  | "report.pricing.examplesPrefix"
  | "report.pricing.willingnessToPay"
  | "report.pricing.perMonth"
  | "report.pricing.band.budget"
  | "report.pricing.band.midMarket"
  | "report.pricing.band.premium"
  | "report.pricing.band.enterprise"
  | "report.channel.title"
  | "report.channel.copySection"
  | "report.channel.recommendedChannels"
  | "report.channel.landscape"
  | "report.channel.effectivenessPrefix"
  | "report.channel.reach"
  | "report.channel.costEfficiency"
  | "report.channel.communityHubs"
  | "report.channel.contentTopics"
  | "report.channel.competitionSuffix"
  | "report.synthesis.title"
  | "report.synthesis.copySection"
  | "report.synthesis.opportunity"
  | "report.synthesis.risk"
  | "report.synthesis.netScore"
  | "report.synthesis.netScoreFormula"
  | "report.synthesis.basedOnInsights"
  | "report.synthesis.topOpportunities"
  | "report.synthesis.whyWorks"
  | "report.synthesis.topRisks"
  | "report.synthesis.mitigation"
  | "report.synthesis.crossValidated"
  | "report.synthesis.supportedBy"
  | "report.synthesis.nextStep"
  | "report.synthesis.importBrief"
  | "report.synthesis.importBriefSubtitle"
  | "report.synthesis.charactersSuffix"
  | "report.synthesis.copyBrief"
  | "report.synthesis.copiedBrief"
  | "report.synthesis.opportunityLabel.strong"
  | "report.synthesis.opportunityLabel.promising"
  | "report.synthesis.opportunityLabel.moderate"
  | "report.synthesis.opportunityLabel.challenging"
  | "report.synthesis.opportunityLabel.highRisk"
  | "search.matchCount"
  | "search.next"
  | "search.noMatches"
  | "search.placeholder"
  | "search.prev"
  | "settings.dark"
  | "settings.language"
  | "settings.light"
  | "settings.system"
  | "settings.theme"
  | "settings.title"
  | "shortcuts.noResults"
  | "shortcuts.searchPlaceholder"
  | "shortcuts.title"
  | "shortcuts.total"
  | "status.completed"
  | "status.error"
  | "status.loading"
  | "status.running"
  | "status.retryingIn"
  | "status.readyToRetry"
  | "status.reconnectingIn"
  | "status.polling"
  | "status.pollingEvery"
  | "status.retryCount"
  | "studio.poweredBy"
  | "studio.researchAgents"
  | "studio.tipReset"
  | "studio.tipStart"
  | "toc.readingProgress"
  | "toc.title"
;

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
  "errors.rateLimit": "Too many requests. Please wait {seconds}s before trying again.",
  "errors.serviceUnavailable": "Service temporarily unavailable. Please try again later.",
  "errors.notFound": "Not found.",
  "errors.badRequest": "Invalid request.",
  "errors.unauthorized": "Unauthorized.",
  "errors.cronNotConfigured": "Scheduled-task endpoint is not configured. Set LAUNCHLENS_CRON_SECRET.",
  "errors.sessionExpired": "Live engine session expired. The completed report is still available in History.",
  "errors.retryTitle": "Research could not run",
  "errors.retryHint": "The research session failed to start or recover. Check your connection and try again.",
  "errors.notFoundTitle": "Research not found",
  "errors.notFoundHint": "This research may have expired or been deleted. Recent completed reports are still in History.",
  "errors.failedRunTitle": "This research failed",
  "errors.failedRunHint": "The run did not complete. Re-run it with the same query, or start a new research.",
  "errors.tryAgain": "Try again",
  "common.backToHistory": "Back to history",
  "common.backToStudio": "Back to studio",
  "common.startNew": "Start new research",
  "status.loading": "Starting research session",
  "status.running": "Research agents are running",
  "status.completed": "Research complete",
  "status.error": "Research failed",
  "status.retryingIn": "Rate limited — please wait {seconds}s before trying again.",
  "status.readyToRetry": "Ready to retry — you can submit again.",
  "status.reconnectingIn": "Connection lost — reconnecting in {seconds}s…",
  "status.polling": "Reconnected via polling — updates may be delayed.",
  "status.pollingEvery": "Polling every {seconds}s — updates may be delayed.",
  "status.retryCount": "Retry attempt #{count}",
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
  "agent.degraded": "demo",
  "batch.status.queued": "Queued",
  "batch.status.running": "Running",
  "batch.status.completed": "Done",
  "batch.status.failed": "Failed",
  "batch.title": "Batch Research",
  "batch.subtitle": "Submit multiple research queries at once; the system processes them in sequence.",
  "batch.backHome": "← Back to home",
  "batch.queriesLabel": "Research queries (one per line, max 10)",
  "batch.queriesPlaceholder": "Analyze the generative AI market opportunity\nResearch AI Agent trends\nAssess AI in education",
  "batch.queryCount": "queries",
  "batch.keywordsLabel": "Shared keywords (comma-separated, optional)",
  "batch.keywordsPlaceholder": "e.g. market size, competitive landscape",
  "batch.submit": "🚀 Start batch research",
  "batch.submitting": "Submitting...",
  "batch.maxQueries": "A maximum of 10 research queries is supported.",
  "batch.progressTitle": "Batch progress",
  "batch.progressDone": "done",
  "batch.progressSuccess": "succeeded",
  "batch.progressFailed": "failed",
  "batch.viewRun": "View →",
  "batch.historyTitle": "Recent batches",
  "batch.historyCount": "studies",
  "schedule.title": "Scheduled research",
  "schedule.subtitle": "Set up recurring automatic research to track changes over time.",
  "schedule.statTotal": "Total",
  "schedule.statActive": "Active",
  "schedule.statPaused": "Paused",
  "schedule.statRuns": "Total runs",
  "schedule.new": "+ New schedule",
  "schedule.nameLabel": "Name",
  "schedule.namePlaceholder": "Daily market scan",
  "schedule.queryLabel": "Research query",
  "schedule.queryPlaceholder": "Latest AI industry trends",
  "schedule.keywordsLabel": "Keywords (comma-separated, optional)",
  "schedule.keywordsPlaceholder": "market trends, competitive landscape",
  "schedule.frequencyLabel": "Frequency",
  "schedule.intervalHourly": "Hourly",
  "schedule.intervalDaily": "Daily",
  "schedule.intervalWeekly": "Weekly",
  "schedule.intervalCustom": "Custom (minutes)",
  "schedule.intervalMinutesLabel": "Interval (minutes)",
  "schedule.hourLabel": "Time (hour)",
  "schedule.dayOfWeekLabel": "Day of week",
  "schedule.cancel": "Cancel",
  "schedule.create": "Create schedule",
  "schedule.creating": "Creating...",
  "schedule.untitled": "Untitled schedule",
  "schedule.empty": "No scheduled research yet",
  "schedule.emptyHint": "Create one and let research run automatically.",
  "schedule.metaFrequency": "Frequency",
  "schedule.metaNextRun": "Next run",
  "schedule.metaLastRun": "Last run",
  "schedule.metaTotal": "Total",
  "schedule.runsUnit": "runs",
  "schedule.successSuffix": "succeeded",
  "schedule.failedSuffix": "failed",
  "schedule.trigger": "▶ Run now",
  "schedule.triggerTitle": "Run once immediately",
  "schedule.pause": "⏸ Pause",
  "schedule.resume": "▶ Resume",
  "schedule.delete": "Delete",
  "schedule.deleteConfirmTitle": "Delete scheduled research?",
  "schedule.deleteConfirmBody": "This schedule will stop running permanently.",
  "schedule.statusActive": "Active",
  "schedule.statusPaused": "Paused",
  "schedule.intervalHourlyShort": "Hourly",
  "schedule.intervalDailyShort": "Daily at {hh}:00",
  "schedule.intervalWeeklyShort": "{day} {hh}:00",
  "schedule.intervalMinutesShort": "Every {minutes} min",
  "schedule.intervalUnknown": "Unknown",
  "schedule.daySun": "Sun",
  "schedule.dayMon": "Mon",
  "schedule.dayTue": "Tue",
  "schedule.dayWed": "Wed",
  "schedule.dayThu": "Thu",
  "schedule.dayFri": "Fri",
  "schedule.daySat": "Sat",
  "studio.researchAgents": "Research Agents",
  "studio.poweredBy": "Powered by 6 research agents:",
  "studio.tipStart": "to start",
  "studio.tipReset": "to reset",
  "footer.tagline": "LaunchLens Research Studio — Companion to launchlens-ai",
  "provider.mock": "Mock provider",
  "provider.breakerOpen": "Provider breaker open",
  "provider.streaming": "stream",
  "provider.probe.test": "Test",
  "provider.probe.testing": "Testing…",
  "provider.probe.ok": "Connected ({ms}ms)",
  "provider.probe.mockOk": "Mock provider — no network needed",
  "provider.probe.failed": "Failed: {reason}",
  "provider.probe.error": "Error: {message}",
  "report.degradedBanner.title": "{count} agent(s) showing demo data",
  "report.degradedBanner.body": "Some agents could not reach the real LLM provider and fell back to illustrative mock data. Check your API key and provider configuration, then re-run for authoritative results.",
  "report.common.copied": "Copied",
  "report.common.copySection": "Copy section",
  "report.common.item": "item",
  "report.common.items": "items",
  "report.confidence.high": "High confidence",
  "report.confidence.low": "Low confidence",
  "report.confidence.medium": "Medium confidence",
  "report.marketSizer.title": "Market Sizer",
  "report.marketSizer.copySection": "Copy market section",
  "report.marketSizer.marketSizeEstimate": "Market Size Estimate",
  "report.marketSizer.tamLabel": "Total addressable market",
  "report.marketSizer.samLabel": "Serviceable addressable market",
  "report.marketSizer.somLabel": "3-year obtainable market",
  "report.marketSizer.growthRate": "growth",
  "report.marketSizer.growthRateValue": "{value}%/yr growth",
  "report.marketSizer.growthLabel": "growth",
  "report.marketSizer.trendPrefix": "trend",
  "report.marketSizer.trendAccelerating": "Accelerating trend",
  "report.marketSizer.trendStable": "Stable trend",
  "report.marketSizer.trendDeclining": "Declining trend",
  "report.marketSizer.keyTrends": "Key Trends",
  "report.marketSizer.targetSegments": "Target Segments",
  "report.marketSizer.percentOf": "% of",
  "report.competitor.title": "Competitor Analyst",
  "report.competitor.copySection": "Copy competitor section",
  "report.competitor.competitors": "Competitors",
  "report.competitor.strengths": "Strengths",
  "report.competitor.weaknesses": "Weaknesses",
  "report.competitor.marketShareSuffix": "market share",
  "report.competitor.visit": "Visit",
  "report.competitor.matrix": "Competitive Matrix",
  "report.competitor.gaps": "Market Gaps & Opportunities",
  "report.competitor.gapOpportunity": "Opportunity:",
  "report.competitor.positioning.premium": "Premium",
  "report.competitor.positioning.midMarket": "Mid-market",
  "report.competitor.positioning.budget": "Budget",
  "report.competitor.positioning.niche": "Niche",
  "report.pain.title": "Pain Detective",
  "report.pain.copySection": "Copy pain section",
  "report.pain.critical": "Critical",
  "report.pain.significant": "Significant",
  "report.pain.minor": "Minor",
  "report.pain.personas": "Personas",
  "report.pain.unmetNeeds": "Unmet needs",
  "report.pain.topPainPoints": "Top Pain Points",
  "report.pain.affectsPrefix": "Affects:",
  "report.pain.whyUnmet": "Why unmet:",
  "report.pain.opportunity": "Opportunity:",
  "report.pain.userPersonas": "User Personas",
  "report.pain.goals": "Goals",
  "report.pain.frustrations": "Frustrations",
  "report.pain.frequency.common": "Common",
  "report.pain.frequency.occasional": "Occasional",
  "report.pain.frequency.rare": "Rare",
  "report.pricing.title": "Pricing Scout",
  "report.pricing.copySection": "Copy pricing section",
  "report.pricing.priceBands": "Price Bands",
  "report.pricing.typicalMarker": "Typical",
  "report.pricing.typicalPrefix": "Typical:",
  "report.pricing.recommendedTiers": "Recommended Pricing Tiers",
  "report.pricing.perUserMonth": "per user / month",
  "report.pricing.perUserYear": "per user / year",
  "report.pricing.oneTime": "one-time",
  "report.pricing.perUsage": "per usage",
  "report.pricing.monetizationModels": "Monetization Models",
  "report.pricing.prevalenceSuffix": "prevalence",
  "report.pricing.examplesPrefix": "Examples:",
  "report.pricing.willingnessToPay": "Willingness to Pay by Segment",
  "report.pricing.perMonth": "/mo",
  "report.pricing.band.budget": "Budget",
  "report.pricing.band.midMarket": "Mid-market",
  "report.pricing.band.premium": "Premium",
  "report.pricing.band.enterprise": "Enterprise",
  "report.channel.title": "Channel Scout",
  "report.channel.copySection": "Copy channel section",
  "report.channel.recommendedChannels": "Recommended Channels",
  "report.channel.landscape": "Channel Landscape",
  "report.channel.effectivenessPrefix": "Effectiveness:",
  "report.channel.reach": "Reach",
  "report.channel.costEfficiency": "Cost-efficiency",
  "report.channel.communityHubs": "Community Hubs",
  "report.channel.contentTopics": "Content Topics",
  "report.channel.competitionSuffix": "comp",
  "report.synthesis.title": "Synthesis",
  "report.synthesis.copySection": "Copy synthesis section",
  "report.synthesis.opportunity": "Opportunity",
  "report.synthesis.risk": "Risk",
  "report.synthesis.netScore": "Net score",
  "report.synthesis.netScoreFormula": "Opportunity − Risk",
  "report.synthesis.basedOnInsights": "Based on cross-agent validation across {count} insights",
  "report.synthesis.topOpportunities": "Top 3 Opportunities",
  "report.synthesis.whyWorks": "Why this works:",
  "report.synthesis.topRisks": "Top 3 Risks",
  "report.synthesis.mitigation": "Mitigation:",
  "report.synthesis.crossValidated": "Cross-Validated Insights",
  "report.synthesis.supportedBy": "Supported by:",
  "report.synthesis.nextStep": "Recommended Next Step",
  "report.synthesis.importBrief": "LaunchLens Import Brief",
  "report.synthesis.importBriefSubtitle": "Ready to paste into launchlens-ai for GTM strategy generation",
  "report.synthesis.charactersSuffix": "characters",
  "report.synthesis.copyBrief": "Copy brief",
  "report.synthesis.copiedBrief": "Copied!",
  "report.synthesis.opportunityLabel.strong": "Strong opportunity",
  "report.synthesis.opportunityLabel.promising": "Promising",
  "report.synthesis.opportunityLabel.moderate": "Moderate",
  "report.synthesis.opportunityLabel.challenging": "Challenging",
  "report.synthesis.opportunityLabel.highRisk": "High risk",
  "crash.title": "Something went wrong",
  "crash.body": "An unexpected error occurred. Your work hasn't been lost.",
  "crash.tryAgain": "Try again",
  "crash.goHome": "Go home",
  "crash.copyTrace": "Copy error details",
  "crash.copied": "Copied",
  "notFound.title": "Page not found",
  "notFound.body": "The page you're looking for doesn't exist or has moved.",
  "notFound.backHome": "Back to Research Studio",
  "commandPalette.placeholder": "Type a command or search...",
  "commandPalette.noResults": "No commands found",
  "commandPalette.tryDifferent": "Try a different search term",
  "commandPalette.navigate": "Navigate",
  "commandPalette.select": "Select",
  "commandPalette.close": "Close",
  "commandPalette.category.navigation": "Navigation",
  "commandPalette.category.action": "Actions",
  "commandPalette.category.setting": "Settings",
  "commandPalette.category.template": "Templates",
  "commandPalette.all": "All",
  "history.title": "Research History",
  "history.empty": "No research yet",
  "history.emptyDesc": "Start your first research to see it here",
  "history.searchPlaceholder": "Search research...",
  "history.filterAll": "All",
  "history.filterCompleted": "Completed",
  "history.filterFailed": "Failed",
  "history.sortNewest": "Newest first",
  "history.sortOldest": "Oldest first",
  "history.sortQuery": "Query A-Z",
  "history.selected": "selected",
  "history.selectAll": "Select all",
  "history.clearSelection": "Clear selection",
  "history.exportSelected": "Export selected",
  "history.deleteSelected": "Delete selected",
  "history.confirmDelete": "Are you sure you want to delete these runs?",
  "export.title": "Export Report",
  "export.markdown": "Markdown",
  "export.json": "JSON",
  "export.pdf": "PDF / Print",
  "export.copy": "Copy",
  "export.copied": "Copied!",
  "export.download": "Download",
  "search.placeholder": "Search in report...",
  "search.noMatches": "No matches",
  "search.prev": "Previous",
  "search.next": "Next",
  "search.matchCount": "of",
  "shortcuts.title": "Keyboard Shortcuts",
  "shortcuts.searchPlaceholder": "Search shortcuts...",
  "shortcuts.noResults": "No shortcuts found",
  "shortcuts.total": "shortcuts",
  "folder.new": "New Folder",
  "folder.rename": "Rename",
  "folder.delete": "Delete Folder",
  "folder.empty": "No folders yet",
  "folder.dragToReorder": "Drag to reorder",
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.light": "Light",
  "settings.dark": "Dark",
  "settings.system": "System",
  "settings.language": "Language",
  "toc.title": "Table of Contents",
  "toc.readingProgress": "read",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.retry": "Retry",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.close": "Close",
  "common.back": "Back",
  "common.share": "Share",
  "common.copy": "Copy",
  "common.copied": "Copied!",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.search": "Search",
  "common.settings": "Settings",
  "common.home": "Home",
  "common.history": "History",
  "commands.navHome.label": "Go to Home",
  "commands.navHome.description": "Return to the research studio home page",
  "commands.navHistory.label": "Go to History",
  "commands.navHistory.description": "View all past research sessions",
  "commands.navTemplates.label": "Go to Templates",
  "commands.navTemplates.description": "Browse and manage research templates",
  "commands.navBatch.label": "Go to Batch Research",
  "commands.navBatch.description": "Run multiple research queries at once",
  "commands.navCompare.label": "Go to Compare",
  "commands.navCompare.description": "Compare two research reports side by side",
  "commands.navStarred.label": "Go to Starred",
  "commands.navStarred.description": "View your starred research",
  "commands.themeToggle.label": "Toggle Theme",
  "commands.themeToggle.description": "Switch between light and dark mode",
  "commands.themeDark.label": "Dark Mode",
  "commands.themeDark.description": "Switch to dark theme",
  "commands.themeLight.label": "Light Mode",
  "commands.themeLight.description": "Switch to light theme",
  "commands.paletteOpen.label": "Command Palette",
  "commands.paletteOpen.description": "Open the command palette",
  "shortcuts.openPalette": "Open command palette",
  "shortcuts.showShortcuts": "Show keyboard shortcuts",
  "shortcuts.goHome": "Go to home",
  "shortcuts.goHistory": "Go to sessions / history",
  "shortcuts.goTemplates": "Go to templates",
  "shortcuts.goBatch": "Go to batch research",
  "shortcuts.goCompare": "Go to compare",
  "shortcuts.toggleTheme": "Toggle theme",
  "shortcuts.closeDialogs": "Close dialogs / modals",
  "common.templates": "Templates",
  "date.justNow": "just now",
  "date.inFuture": "in the future",
  "date.secondsShort": "{n}s ago",
  "date.minutesShort": "{n} min ago",
  "date.hoursShort": "{n} hr ago",
  "date.daysShort": "{n} days ago",
  "date.weeksShort": "{n} wk ago",
  "date.monthsShort": "{n} mo ago",
  "date.yearsShort": "{n} yr ago",
  "date.minutesLong": "{n} minutes ago",
  "date.hoursLong": "{n} hours ago",
  "date.daysLong": "{n} days ago",
  "date.today": "Today",
  "date.yesterday": "Yesterday",
  "validation.bodyNotObject": "Request body must be a JSON object.",
  "validation.queryRequired": "Field 'query' is required and must be a string.",
  "validation.queryTooShort": "Query must be at least {min} characters long.",
  "validation.queryTooLong": "Query must be at most {max} characters long.",
  "validation.keywordsNotArray": "Field 'keywords' must be an array of strings.",
  "validation.tooManyKeywords": "At most {max} keywords are allowed.",
  "validation.keywordNotString": "Keyword at index {index} must be a string.",
  "validation.keywordTooLong": "Keyword \"{preview}...\" exceeds {max} characters.",
  "validation.gotChars": "Got {got} characters.",
  "compare.title": "Research Compare",
  "compare.backToHistory": "← Back to History",
  "compare.optionA": "Option A",
  "compare.optionB": "Option B",
  "compare.loading": "Loading…",
  "compare.error.selectTwo": "Select two research runs to compare.",
  "compare.error.loadA": "Failed to load run A (HTTP {status})",
  "compare.error.loadB": "Failed to load run B (HTTP {status})",
  "compare.error.loadFailed": "Load failed",
  "compare.error.title": "Compare failed",
  "compare.view.sideBySide": "📊 Side-by-side",
  "compare.view.diff": "🔍 Differences",
  "compare.changesSuffix": "changes",
  "compare.section.scoreCompare": "Score comparison",
  "compare.section.execSummary": "Executive summary",
  "compare.section.diffOverview": "Difference overview",
  "compare.section.keywords": "Keyword overlap",
  "compare.section.sources": "Source overlap",
  "compare.section.insights": "Key insights (A: {a} · B: {b})",
  "compare.section.opportunities": "Top opportunities",
  "compare.section.risks": "Top risks",
  "compare.section.nextStep": "Recommended next step",
  "compare.score.opportunity": "Opportunity score",
  "compare.score.risk": "Risk score",
  "compare.score.opportunityShort": "Opp.",
  "compare.score.riskShort": "Risk",
  "compare.score.unit": "pts",
  "compare.diff.added": "added",
  "compare.diff.removed": "removed",
  "compare.diff.modified": "modified",
  "compare.diff.insightsAdded": "Added insights ({count})",
  "compare.diff.insightsRemoved": "Removed insights ({count})",
  "compare.diff.insightsModified": "Modified insights ({count})",
  "compare.diff.opportunitiesAdded": "Added opportunities ({count})",
  "compare.diff.opportunitiesRemoved": "Removed opportunities ({count})",
  "compare.diff.opportunitiesModified": "Modified opportunities ({count})",
  "compare.diff.risksAdded": "Added risks ({count})",
  "compare.diff.risksRemoved": "Removed risks ({count})",
  "compare.diff.risksModified": "Modified risks ({count})",
  "compare.diff.nextStepChanged": "Recommended next step (changed)",
  "compare.diff.before": "Before",
  "compare.diff.after": "After",
  "compare.diff.empty": "✨ The two runs are identical",
  "compare.keywords.shared": "Shared ({count})",
  "compare.keywords.onlyA": "Only A ({count})",
  "compare.keywords.onlyB": "Only B ({count})",
  "compare.sources.similarity": "Similarity {pct}%",
  "compare.sources.sourcesA": "Option A sources",
  "compare.sources.shared": "Shared",
  "compare.sources.sourcesB": "Option B sources",
  "compare.sources.sharedDomains": "Shared domains ({count})",
  "compare.sources.domainsOnlyA": "Domains only in A",
  "compare.sources.domainsOnlyB": "Domains only in B",
  "compare.insightsCount": "Key insights",
  "common.confirm": "Confirm",
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
  "errors.rateLimit": "请求过于频繁，请等待 {seconds} 秒后再试。",
  "errors.serviceUnavailable": "服务暂时不可用，请稍后重试。",
  "errors.notFound": "未找到。",
  "errors.badRequest": "请求无效。",
  "errors.unauthorized": "未授权。",
  "errors.cronNotConfigured": "定时任务端点未配置，请设置 LAUNCHLENS_CRON_SECRET。",
  "errors.sessionExpired": "实时引擎会话已过期，完整报告仍可在历史记录中查看。",
  "errors.retryTitle": "调研无法运行",
  "errors.retryHint": "调研会话启动或恢复失败，请检查网络连接后重试。",
  "errors.notFoundTitle": "未找到该调研",
  "errors.notFoundHint": "该调研可能已过期或被删除，最近完成的报告仍可在历史记录中查看。",
  "errors.failedRunTitle": "该调研失败",
  "errors.failedRunHint": "本次运行未完成，可使用相同查询重新运行，或开始新的调研。",
  "errors.tryAgain": "重试",
  "common.backToHistory": "返回历史记录",
  "common.backToStudio": "返回工作室",
  "common.startNew": "开始新调研",
  "status.loading": "正在启动调研会话",
  "status.running": "调研智能体运行中",
  "status.completed": "调研完成",
  "status.error": "调研失败",
  "status.retryingIn": "触发限流，请等待 {seconds} 秒后再试。",
  "status.readyToRetry": "可以重新提交了。",
  "status.reconnectingIn": "连接中断，{seconds} 秒后尝试重连…",
  "status.polling": "已切换为轮询模式，结果更新可能有延迟。",
  "status.pollingEvery": "已切换为轮询模式，每 {seconds} 秒刷新一次。",
  "status.retryCount": "第 {count} 次重试",
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
  "agent.degraded": "示例",
  "batch.status.queued": "等待中",
  "batch.status.running": "运行中",
  "batch.status.completed": "完成",
  "batch.status.failed": "失败",
  "batch.title": "批量研究",
  "batch.subtitle": "一次提交多个研究问题，系统依次处理",
  "batch.backHome": "← 返回首页",
  "batch.queriesLabel": "研究问题（每行一个，最多 10 个）",
  "batch.queriesPlaceholder": "分析生成式 AI 的市场机会\n研究 AI Agent 的发展趋势\n评估 AI 在教育行业的应用",
  "batch.queryCount": "个问题",
  "batch.keywordsLabel": "共同关键词（用逗号分隔，可选）",
  "batch.keywordsPlaceholder": "例如：市场规模, 竞争格局",
  "batch.submit": "🚀 开始批量研究",
  "batch.submitting": "提交中...",
  "batch.maxQueries": "最多支持 10 个研究问题",
  "batch.progressTitle": "批量研究进度",
  "batch.progressDone": "完成",
  "batch.progressSuccess": "成功",
  "batch.progressFailed": "失败",
  "batch.viewRun": "查看 →",
  "batch.historyTitle": "最近批量研究",
  "batch.historyCount": "个研究",
  "schedule.title": "定时研究",
  "schedule.subtitle": "设置周期性自动研究，持续跟踪变化",
  "schedule.statTotal": "总计",
  "schedule.statActive": "运行中",
  "schedule.statPaused": "已暂停",
  "schedule.statRuns": "累计运行",
  "schedule.new": "+ 新建定时研究",
  "schedule.nameLabel": "名称",
  "schedule.namePlaceholder": "每日市场扫描",
  "schedule.queryLabel": "研究问题",
  "schedule.queryPlaceholder": "AI 行业最新动态",
  "schedule.keywordsLabel": "关键词（逗号分隔，可选）",
  "schedule.keywordsPlaceholder": "市场趋势, 竞争格局",
  "schedule.frequencyLabel": "频率",
  "schedule.intervalHourly": "每小时",
  "schedule.intervalDaily": "每天",
  "schedule.intervalWeekly": "每周",
  "schedule.intervalCustom": "自定义（分钟）",
  "schedule.intervalMinutesLabel": "间隔（分钟）",
  "schedule.hourLabel": "时间（时）",
  "schedule.dayOfWeekLabel": "星期",
  "schedule.cancel": "取消",
  "schedule.create": "创建定时研究",
  "schedule.creating": "创建中...",
  "schedule.untitled": "未命名定时研究",
  "schedule.empty": "还没有定时研究",
  "schedule.emptyHint": "创建一个，让研究自动跑起来",
  "schedule.metaFrequency": "频率",
  "schedule.metaNextRun": "下次运行",
  "schedule.metaLastRun": "上次运行",
  "schedule.metaTotal": "累计",
  "schedule.runsUnit": "次",
  "schedule.successSuffix": "成功",
  "schedule.failedSuffix": "失败",
  "schedule.trigger": "▶ 立即运行",
  "schedule.triggerTitle": "立即运行一次",
  "schedule.pause": "⏸ 暂停",
  "schedule.resume": "▶ 启用",
  "schedule.delete": "删除",
  "schedule.deleteConfirmTitle": "删除定时研究？",
  "schedule.deleteConfirmBody": "该定时研究将永久停止运行。",
  "schedule.statusActive": "运行中",
  "schedule.statusPaused": "已暂停",
  "schedule.intervalHourlyShort": "每小时",
  "schedule.intervalDailyShort": "每天 {hh}:00",
  "schedule.intervalWeeklyShort": "{day} {hh}:00",
  "schedule.intervalMinutesShort": "每 {minutes} 分钟",
  "schedule.intervalUnknown": "未知",
  "schedule.daySun": "周日",
  "schedule.dayMon": "周一",
  "schedule.dayTue": "周二",
  "schedule.dayWed": "周三",
  "schedule.dayThu": "周四",
  "schedule.dayFri": "周五",
  "schedule.daySat": "周六",
  "studio.researchAgents": "调研智能体",
  "studio.poweredBy": "由 6 个调研智能体驱动：",
  "studio.tipStart": "开始调研",
  "studio.tipReset": "重置",
  "footer.tagline": "LaunchLens Research Studio — launchlens-ai 的伴侣项目",
  "provider.mock": "模拟模型",
  "provider.breakerOpen": "提供方熔断已开启",
  "provider.streaming": "流式",
  "provider.probe.test": "测试",
  "provider.probe.testing": "测试中…",
  "provider.probe.ok": "已连接（{ms}ms）",
  "provider.probe.mockOk": "模拟模型 — 无需网络",
  "provider.probe.failed": "失败：{reason}",
  "provider.probe.error": "错误：{message}",
  "report.degradedBanner.title": "{count} 个智能体显示示例数据",
  "report.degradedBanner.body": "部分智能体无法连接真实 LLM 提供方，已回退到示例数据。请检查 API 密钥与提供方配置后重新运行以获取权威结果。",
  "report.common.copied": "已复制",
  "report.common.copySection": "复制本节",
  "report.common.item": "项",
  "report.common.items": "项",
  "report.confidence.high": "高置信度",
  "report.confidence.low": "低置信度",
  "report.confidence.medium": "中置信度",
  "report.marketSizer.title": "市场规模分析师",
  "report.marketSizer.copySection": "复制市场章节",
  "report.marketSizer.marketSizeEstimate": "市场规模估算",
  "report.marketSizer.tamLabel": "潜在市场总规模（TAM）",
  "report.marketSizer.samLabel": "可服务市场（SAM）",
  "report.marketSizer.somLabel": "3 年可获取市场（SOM）",
  "report.marketSizer.growthRate": "增长率",
  "report.marketSizer.growthRateValue": "年增长 {value}%",
  "report.marketSizer.growthLabel": "增长",
  "report.marketSizer.trendPrefix": "趋势",
  "report.marketSizer.trendAccelerating": "加速增长趋势",
  "report.marketSizer.trendStable": "稳定趋势",
  "report.marketSizer.trendDeclining": "下降趋势",
  "report.marketSizer.keyTrends": "关键趋势",
  "report.marketSizer.targetSegments": "目标细分",
  "report.marketSizer.percentOf": "占",
  "report.competitor.title": "竞争分析师",
  "report.competitor.copySection": "复制竞争章节",
  "report.competitor.competitors": "竞争对手",
  "report.competitor.strengths": "优势",
  "report.competitor.weaknesses": "劣势",
  "report.competitor.marketShareSuffix": "市场份额",
  "report.competitor.visit": "访问",
  "report.competitor.matrix": "竞争矩阵",
  "report.competitor.gaps": "市场空白与机会",
  "report.competitor.gapOpportunity": "机会：",
  "report.competitor.positioning.premium": "高端",
  "report.competitor.positioning.midMarket": "中端",
  "report.competitor.positioning.budget": "平价",
  "report.competitor.positioning.niche": "利基",
  "report.pain.title": "痛点侦探",
  "report.pain.copySection": "复制痛点章节",
  "report.pain.critical": "关键",
  "report.pain.significant": "重要",
  "report.pain.minor": "次要",
  "report.pain.personas": "用户画像",
  "report.pain.unmetNeeds": "未满足的需求",
  "report.pain.topPainPoints": "核心痛点",
  "report.pain.affectsPrefix": "影响人群：",
  "report.pain.whyUnmet": "未满足原因：",
  "report.pain.opportunity": "机会：",
  "report.pain.userPersonas": "用户画像",
  "report.pain.goals": "目标",
  "report.pain.frustrations": "痛点",
  "report.pain.frequency.common": "常见",
  "report.pain.frequency.occasional": "偶尔",
  "report.pain.frequency.rare": "罕见",
  "report.pricing.title": "价格侦察兵",
  "report.pricing.copySection": "复制价格章节",
  "report.pricing.priceBands": "价格区间",
  "report.pricing.typicalMarker": "典型",
  "report.pricing.typicalPrefix": "典型：",
  "report.pricing.recommendedTiers": "推荐定价档位",
  "report.pricing.perUserMonth": "每人 / 月",
  "report.pricing.perUserYear": "每人 / 年",
  "report.pricing.oneTime": "一次性",
  "report.pricing.perUsage": "按用量",
  "report.pricing.monetizationModels": "变现模式",
  "report.pricing.prevalenceSuffix": "普及率",
  "report.pricing.examplesPrefix": "示例：",
  "report.pricing.willingnessToPay": "按细分市场的支付意愿",
  "report.pricing.perMonth": "/月",
  "report.pricing.band.budget": "平价",
  "report.pricing.band.midMarket": "中端",
  "report.pricing.band.premium": "高端",
  "report.pricing.band.enterprise": "企业",
  "report.channel.title": "渠道侦察兵",
  "report.channel.copySection": "复制渠道章节",
  "report.channel.recommendedChannels": "推荐渠道",
  "report.channel.landscape": "渠道全景",
  "report.channel.effectivenessPrefix": "效果：",
  "report.channel.reach": "覆盖",
  "report.channel.costEfficiency": "成本效率",
  "report.channel.communityHubs": "社区阵地",
  "report.channel.contentTopics": "内容选题",
  "report.channel.competitionSuffix": "竞争",
  "report.synthesis.title": "综合分析",
  "report.synthesis.copySection": "复制综合章节",
  "report.synthesis.opportunity": "机会",
  "report.synthesis.risk": "风险",
  "report.synthesis.netScore": "净分",
  "report.synthesis.netScoreFormula": "机会 − 风险",
  "report.synthesis.basedOnInsights": "基于跨智能体验证的 {count} 条洞察",
  "report.synthesis.topOpportunities": "Top 3 机会",
  "report.synthesis.whyWorks": "为何有效：",
  "report.synthesis.topRisks": "Top 3 风险",
  "report.synthesis.mitigation": "缓解措施：",
  "report.synthesis.crossValidated": "交叉验证洞察",
  "report.synthesis.supportedBy": "依据：",
  "report.synthesis.nextStep": "推荐下一步",
  "report.synthesis.importBrief": "LaunchLens 导入简报",
  "report.synthesis.importBriefSubtitle": "可粘贴到 launchlens-ai 生成 GTM 策略",
  "report.synthesis.charactersSuffix": "字符",
  "report.synthesis.copyBrief": "复制简报",
  "report.synthesis.copiedBrief": "已复制！",
  "report.synthesis.opportunityLabel.strong": "强机会",
  "report.synthesis.opportunityLabel.promising": "有前景",
  "report.synthesis.opportunityLabel.moderate": "一般",
  "report.synthesis.opportunityLabel.challenging": "有挑战",
  "report.synthesis.opportunityLabel.highRisk": "高风险",
  "crash.title": "出错了",
  "crash.body": "发生了意外错误。你的工作并未丢失。",
  "crash.tryAgain": "重试",
  "crash.goHome": "返回首页",
  "crash.copyTrace": "复制错误详情",
  "crash.copied": "已复制",
  "notFound.title": "页面未找到",
  "notFound.body": "您要查找的页面不存在或已移动。",
  "notFound.backHome": "返回调研工作台",
  "commandPalette.placeholder": "输入命令或搜索...",
  "commandPalette.noResults": "未找到命令",
  "commandPalette.tryDifferent": "试试其他关键词",
  "commandPalette.navigate": "导航",
  "commandPalette.select": "选择",
  "commandPalette.close": "关闭",
  "commandPalette.category.navigation": "导航",
  "commandPalette.category.action": "操作",
  "commandPalette.category.setting": "设置",
  "commandPalette.category.template": "模板",
  "commandPalette.all": "全部",
  "history.title": "调研历史",
  "history.empty": "暂无调研记录",
  "history.emptyDesc": "开始你的第一次调研吧",
  "history.searchPlaceholder": "搜索调研...",
  "history.filterAll": "全部",
  "history.filterCompleted": "已完成",
  "history.filterFailed": "失败",
  "history.sortNewest": "最新优先",
  "history.sortOldest": "最早优先",
  "history.sortQuery": "按查询排序",
  "history.selected": "项已选",
  "history.selectAll": "全选",
  "history.clearSelection": "取消选择",
  "history.exportSelected": "导出所选",
  "history.deleteSelected": "删除所选",
  "history.confirmDelete": "确定要删除这些调研记录吗？",
  "export.title": "导出报告",
  "export.markdown": "Markdown",
  "export.json": "JSON",
  "export.pdf": "PDF / 打印",
  "export.copy": "复制",
  "export.copied": "已复制！",
  "export.download": "下载",
  "search.placeholder": "在报告中搜索...",
  "search.noMatches": "无匹配",
  "search.prev": "上一个",
  "search.next": "下一个",
  "search.matchCount": "/",
  "shortcuts.title": "快捷键",
  "shortcuts.searchPlaceholder": "搜索快捷键...",
  "shortcuts.noResults": "未找到快捷键",
  "shortcuts.total": "个快捷键",
  "folder.new": "新建文件夹",
  "folder.rename": "重命名",
  "folder.delete": "删除文件夹",
  "folder.empty": "暂无文件夹",
  "folder.dragToReorder": "拖拽排序",
  "settings.title": "设置",
  "settings.theme": "主题",
  "settings.light": "浅色",
  "settings.dark": "深色",
  "settings.system": "跟随系统",
  "settings.language": "语言",
  "toc.title": "目录",
  "toc.readingProgress": "已读",
  "common.loading": "加载中...",
  "common.error": "错误",
  "common.retry": "重试",
  "common.cancel": "取消",
  "common.save": "保存",
  "common.close": "关闭",
  "common.back": "返回",
  "common.share": "分享",
  "common.copy": "复制",
  "common.copied": "已复制！",
  "common.delete": "删除",
  "common.edit": "编辑",
  "common.search": "搜索",
  "common.settings": "设置",
  "common.home": "首页",
  "common.history": "历史",
  "commands.navHome.label": "前往首页",
  "commands.navHome.description": "返回研究工作室首页",
  "commands.navHistory.label": "前往历史",
  "commands.navHistory.description": "查看所有过往的研究会话",
  "commands.navTemplates.label": "前往模板",
  "commands.navTemplates.description": "浏览并管理研究模板",
  "commands.navBatch.label": "前往批量研究",
  "commands.navBatch.description": "同时运行多个研究查询",
  "commands.navCompare.label": "前往对比",
  "commands.navCompare.description": "并排对比两份研究报告",
  "commands.navStarred.label": "前往收藏",
  "commands.navStarred.description": "查看你收藏的研究",
  "commands.themeToggle.label": "切换主题",
  "commands.themeToggle.description": "在浅色与深色模式之间切换",
  "commands.themeDark.label": "深色模式",
  "commands.themeDark.description": "切换到深色主题",
  "commands.themeLight.label": "浅色模式",
  "commands.themeLight.description": "切换到浅色主题",
  "commands.paletteOpen.label": "命令面板",
  "commands.paletteOpen.description": "打开命令面板",
  "shortcuts.openPalette": "打开命令面板",
  "shortcuts.showShortcuts": "显示键盘快捷键",
  "shortcuts.goHome": "前往首页",
  "shortcuts.goHistory": "前往会话 / 历史",
  "shortcuts.goTemplates": "前往模板",
  "shortcuts.goBatch": "前往批量研究",
  "shortcuts.goCompare": "前往对比",
  "shortcuts.toggleTheme": "切换主题",
  "shortcuts.closeDialogs": "关闭对话框 / 弹窗",
  "common.templates": "模板",
  "date.justNow": "刚刚",
  "date.inFuture": "将来",
  "date.secondsShort": "{n} 秒前",
  "date.minutesShort": "{n} 分钟前",
  "date.hoursShort": "{n} 小时前",
  "date.daysShort": "{n} 天前",
  "date.weeksShort": "{n} 周前",
  "date.monthsShort": "{n} 个月前",
  "date.yearsShort": "{n} 年前",
  "date.minutesLong": "{n} 分钟前",
  "date.hoursLong": "{n} 小时前",
  "date.daysLong": "{n} 天前",
  "date.today": "今天",
  "date.yesterday": "昨天",
  "validation.bodyNotObject": "请求体必须是 JSON 对象。",
  "validation.queryRequired": "字段 'query' 必填且必须是字符串。",
  "validation.queryTooShort": "query 至少需要 {min} 个字符。",
  "validation.queryTooLong": "query 最多 {max} 个字符。",
  "validation.keywordsNotArray": "字段 'keywords' 必须是字符串数组。",
  "validation.tooManyKeywords": "关键词最多 {max} 个。",
  "validation.keywordNotString": "关键词第 {index} 项必须是字符串。",
  "validation.keywordTooLong": "关键词 \"{preview}...\" 超过 {max} 字符。",
  "validation.gotChars": "实际 {got} 个字符。",
  "compare.title": "研究对比",
  "compare.backToHistory": "← 返回历史",
  "compare.optionA": "方案 A",
  "compare.optionB": "方案 B",
  "compare.loading": "加载中...",
  "compare.error.selectTwo": "请选择两个研究进行对比。",
  "compare.error.loadA": "研究 A 加载失败 (HTTP {status})",
  "compare.error.loadB": "研究 B 加载失败 (HTTP {status})",
  "compare.error.loadFailed": "加载失败",
  "compare.error.title": "对比失败",
  "compare.view.sideBySide": "📊 并排视图",
  "compare.view.diff": "🔍 差异视图",
  "compare.changesSuffix": "处变化",
  "compare.section.scoreCompare": "评分对比",
  "compare.section.execSummary": "执行摘要",
  "compare.section.diffOverview": "差异概览",
  "compare.section.keywords": "关键词重合度",
  "compare.section.sources": "来源重合度",
  "compare.section.insights": "关键洞察 (A: {a} · B: {b})",
  "compare.section.opportunities": "核心机遇",
  "compare.section.risks": "主要风险",
  "compare.section.nextStep": "建议下一步",
  "compare.score.opportunity": "机遇指数",
  "compare.score.risk": "风险指数",
  "compare.score.opportunityShort": "机遇",
  "compare.score.riskShort": "风险",
  "compare.score.unit": "分",
  "compare.diff.added": "新增",
  "compare.diff.removed": "移除",
  "compare.diff.modified": "变更",
  "compare.diff.insightsAdded": "新增洞察 ({count})",
  "compare.diff.insightsRemoved": "移除洞察 ({count})",
  "compare.diff.insightsModified": "修改洞察 ({count})",
  "compare.diff.opportunitiesAdded": "新增机遇 ({count})",
  "compare.diff.opportunitiesRemoved": "移除机遇 ({count})",
  "compare.diff.opportunitiesModified": "修改机遇 ({count})",
  "compare.diff.risksAdded": "新增风险 ({count})",
  "compare.diff.risksRemoved": "移除风险 ({count})",
  "compare.diff.risksModified": "修改风险 ({count})",
  "compare.diff.nextStepChanged": "建议下一步（已变更）",
  "compare.diff.before": "之前",
  "compare.diff.after": "现在",
  "compare.diff.empty": "✨ 两份研究完全相同",
  "compare.keywords.shared": "共有 ({count})",
  "compare.keywords.onlyA": "仅 A ({count})",
  "compare.keywords.onlyB": "仅 B ({count})",
  "compare.sources.similarity": "相似度 {pct}%",
  "compare.sources.sourcesA": "方案 A 来源",
  "compare.sources.shared": "共有",
  "compare.sources.sourcesB": "方案 B 来源",
  "compare.sources.sharedDomains": "共有域名 ({count})",
  "compare.sources.domainsOnlyA": "仅 A 域名",
  "compare.sources.domainsOnlyB": "仅 B 域名",
  "compare.insightsCount": "关键洞察",
  "common.confirm": "确认",
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
  "errors.rateLimit": "リクエストが多すぎます。{seconds}秒後に再試行してください。",
  "errors.serviceUnavailable": "サービスが一時的に利用できません。しばらくしてから再試行してください。",
  "errors.notFound": "見つかりません。",
  "errors.badRequest": "無効なリクエストです。",
  "errors.unauthorized": "認証されていません。",
  "errors.cronNotConfigured": "スケジュールタスクのエンドポイントが設定されていません。LAUNCHLENS_CRON_SECRET を設定してください。",
  "errors.sessionExpired": "ライブエンジンセッションの有効期限が切れました。完成したレポートは履歴から引き続き閲覧できます。",
  "errors.retryTitle": "リサーチを実行できませんでした",
  "errors.retryHint": "リサーチセッションを開始または復元できませんでした。接続を確認して再試行してください。",
  "errors.notFoundTitle": "リサーチが見つかりません",
  "errors.notFoundHint": "このリサーチは期限切れまたは削除された可能性があります。最近の完了レポートは履歴に残っています。",
  "errors.failedRunTitle": "このリサーチは失敗しました",
  "errors.failedRunHint": "実行が完了しませんでした。同じクエリで再実行するか、新しいリサーチを開始してください。",
  "errors.tryAgain": "再試行",
  "common.backToHistory": "履歴に戻る",
  "common.backToStudio": "スタジオに戻る",
  "common.startNew": "新しいリサーチを開始",
  "status.loading": "リサーチセッションを開始しています",
  "status.running": "リサーチエージェントが実行中です",
  "status.completed": "リサーチ完了",
  "status.error": "リサーチに失敗しました",
  "status.retryingIn": "レート制限中です。{seconds}秒後に再試行できます。",
  "status.readyToRetry": "再試行できます。",
  "status.reconnectingIn": "接続が切断されました。{seconds}秒後に再接続します…",
  "status.polling": "ポーリングにフォールバックしました。更新の反映に少し時間がかかることがあります。",
  "status.pollingEvery": "ポーリング中です。{seconds}秒ごとに更新します。",
  "status.retryCount": "再試行 {count} 回目",
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
  "agent.degraded": "デモ",
  "batch.status.queued": "待機中",
  "batch.status.running": "実行中",
  "batch.status.completed": "完了",
  "batch.status.failed": "失敗",
  "batch.title": "バッチリサーチ",
  "batch.subtitle": "複数のリサーチ質問を一度に送信し、システムが順次処理します。",
  "batch.backHome": "← ホームへ戻る",
  "batch.queriesLabel": "リサーチ質問（1行1問、最大10問）",
  "batch.queriesPlaceholder": "生成 AI 市場の機会を分析\nAI エージェントのトレンドを調査\n教育分野の AI 活用を評価",
  "batch.queryCount": "件",
  "batch.keywordsLabel": "共通キーワード（カンマ区切り、任意）",
  "batch.keywordsPlaceholder": "例: 市場規模, 競争環境",
  "batch.submit": "🚀 バッチリサーチを開始",
  "batch.submitting": "送信中...",
  "batch.maxQueries": "最大10件のリサーチ質問に対応しています。",
  "batch.progressTitle": "バッチ進捗",
  "batch.progressDone": "完了",
  "batch.progressSuccess": "成功",
  "batch.progressFailed": "失敗",
  "batch.viewRun": "表示 →",
  "batch.historyTitle": "最近のバッチ",
  "batch.historyCount": "件",
  "schedule.title": "スケジュールリサーチ",
  "schedule.subtitle": "定期自動リサーチを設定し、変化を継続的に追跡します。",
  "schedule.statTotal": "合計",
  "schedule.statActive": "実行中",
  "schedule.statPaused": "一時停止",
  "schedule.statRuns": "累計実行",
  "schedule.new": "+ 新規スケジュール",
  "schedule.nameLabel": "名称",
  "schedule.namePlaceholder": "毎日の市場スキャン",
  "schedule.queryLabel": "リサーチ質問",
  "schedule.queryPlaceholder": "AI 業界の最新動向",
  "schedule.keywordsLabel": "キーワード（カンマ区切り、任意）",
  "schedule.keywordsPlaceholder": "市場動向, 競争環境",
  "schedule.frequencyLabel": "頻度",
  "schedule.intervalHourly": "毎時",
  "schedule.intervalDaily": "毎日",
  "schedule.intervalWeekly": "毎週",
  "schedule.intervalCustom": "カスタム（分）",
  "schedule.intervalMinutesLabel": "間隔（分）",
  "schedule.hourLabel": "時刻（時）",
  "schedule.dayOfWeekLabel": "曜日",
  "schedule.cancel": "キャンセル",
  "schedule.create": "スケジュールを作成",
  "schedule.creating": "作成中...",
  "schedule.untitled": "無題のスケジュール",
  "schedule.empty": "スケジュールリサーチがまだありません",
  "schedule.emptyHint": "作成して、リサーチを自動実行しましょう。",
  "schedule.metaFrequency": "頻度",
  "schedule.metaNextRun": "次回実行",
  "schedule.metaLastRun": "前回実行",
  "schedule.metaTotal": "累計",
  "schedule.runsUnit": "回",
  "schedule.successSuffix": "成功",
  "schedule.failedSuffix": "失敗",
  "schedule.trigger": "▶ 今すぐ実行",
  "schedule.triggerTitle": "今すぐ1回実行",
  "schedule.pause": "⏸ 一時停止",
  "schedule.resume": "▶ 再開",
  "schedule.delete": "削除",
  "schedule.deleteConfirmTitle": "スケジュールリサーチを削除しますか？",
  "schedule.deleteConfirmBody": "このスケジュールは完全に停止します。",
  "schedule.statusActive": "実行中",
  "schedule.statusPaused": "一時停止",
  "schedule.intervalHourlyShort": "毎時",
  "schedule.intervalDailyShort": "毎日 {hh}:00",
  "schedule.intervalWeeklyShort": "{day} {hh}:00",
  "schedule.intervalMinutesShort": "{minutes} 分ごと",
  "schedule.intervalUnknown": "不明",
  "schedule.daySun": "日",
  "schedule.dayMon": "月",
  "schedule.dayTue": "火",
  "schedule.dayWed": "水",
  "schedule.dayThu": "木",
  "schedule.dayFri": "金",
  "schedule.daySat": "土",
  "studio.researchAgents": "リサーチエージェント",
  "studio.poweredBy": "6 つのリサーチエージェントで動作:",
  "studio.tipStart": "開始",
  "studio.tipReset": "リセット",
  "footer.tagline": "LaunchLens Research Studio — launchlens-ai のコンパニオン",
  "provider.mock": "モックプロバイダ",
  "provider.breakerOpen": "プロバイダ遮断中",
  "provider.streaming": "ストリーム",
  "provider.probe.test": "テスト",
  "provider.probe.testing": "テスト中…",
  "provider.probe.ok": "接続済み（{ms}ms）",
  "provider.probe.mockOk": "モックプロバイダ — ネットワーク不要",
  "provider.probe.failed": "失敗：{reason}",
  "provider.probe.error": "エラー：{message}",
  "report.degradedBanner.title": "{count} 個のエージェントがデモデータを表示中",
  "report.degradedBanner.body": "一部のエージェントが実際の LLM プロバイダに接続できず、例示用のモックデータにフォールバックしました。API キーとプロバイダ設定を確認し、信頼できる結果を得るために再実行してください。",
  "report.common.copied": "Copied",
  "report.common.copySection": "Copy section",
  "report.common.item": "item",
  "report.common.items": "items",
  "report.confidence.high": "High confidence",
  "report.confidence.low": "Low confidence",
  "report.confidence.medium": "Medium confidence",
  "report.marketSizer.title": "Market Sizer",
  "report.marketSizer.copySection": "Copy market section",
  "report.marketSizer.marketSizeEstimate": "Market Size Estimate",
  "report.marketSizer.tamLabel": "Total addressable market",
  "report.marketSizer.samLabel": "Serviceable addressable market",
  "report.marketSizer.somLabel": "3-year obtainable market",
  "report.marketSizer.growthRate": "growth",
  "report.marketSizer.growthRateValue": "{value}%/yr growth",
  "report.marketSizer.growthLabel": "growth",
  "report.marketSizer.trendPrefix": "trend",
  "report.marketSizer.trendAccelerating": "Accelerating trend",
  "report.marketSizer.trendStable": "Stable trend",
  "report.marketSizer.trendDeclining": "Declining trend",
  "report.marketSizer.keyTrends": "Key Trends",
  "report.marketSizer.targetSegments": "Target Segments",
  "report.marketSizer.percentOf": "% of",
  "report.competitor.title": "Competitor Analyst",
  "report.competitor.copySection": "Copy competitor section",
  "report.competitor.competitors": "Competitors",
  "report.competitor.strengths": "Strengths",
  "report.competitor.weaknesses": "Weaknesses",
  "report.competitor.marketShareSuffix": "market share",
  "report.competitor.visit": "Visit",
  "report.competitor.matrix": "Competitive Matrix",
  "report.competitor.gaps": "Market Gaps & Opportunities",
  "report.competitor.gapOpportunity": "Opportunity:",
  "report.competitor.positioning.premium": "Premium",
  "report.competitor.positioning.midMarket": "Mid-market",
  "report.competitor.positioning.budget": "Budget",
  "report.competitor.positioning.niche": "Niche",
  "report.pain.title": "Pain Detective",
  "report.pain.copySection": "Copy pain section",
  "report.pain.critical": "Critical",
  "report.pain.significant": "Significant",
  "report.pain.minor": "Minor",
  "report.pain.personas": "Personas",
  "report.pain.unmetNeeds": "Unmet needs",
  "report.pain.topPainPoints": "Top Pain Points",
  "report.pain.affectsPrefix": "Affects:",
  "report.pain.whyUnmet": "Why unmet:",
  "report.pain.opportunity": "Opportunity:",
  "report.pain.userPersonas": "User Personas",
  "report.pain.goals": "Goals",
  "report.pain.frustrations": "Frustrations",
  "report.pain.frequency.common": "Common",
  "report.pain.frequency.occasional": "Occasional",
  "report.pain.frequency.rare": "Rare",
  "report.pricing.title": "Pricing Scout",
  "report.pricing.copySection": "Copy pricing section",
  "report.pricing.priceBands": "Price Bands",
  "report.pricing.typicalMarker": "Typical",
  "report.pricing.typicalPrefix": "Typical:",
  "report.pricing.recommendedTiers": "Recommended Pricing Tiers",
  "report.pricing.perUserMonth": "per user / month",
  "report.pricing.perUserYear": "per user / year",
  "report.pricing.oneTime": "one-time",
  "report.pricing.perUsage": "per usage",
  "report.pricing.monetizationModels": "Monetization Models",
  "report.pricing.prevalenceSuffix": "prevalence",
  "report.pricing.examplesPrefix": "Examples:",
  "report.pricing.willingnessToPay": "Willingness to Pay by Segment",
  "report.pricing.perMonth": "/mo",
  "report.pricing.band.budget": "Budget",
  "report.pricing.band.midMarket": "Mid-market",
  "report.pricing.band.premium": "Premium",
  "report.pricing.band.enterprise": "Enterprise",
  "report.channel.title": "Channel Scout",
  "report.channel.copySection": "Copy channel section",
  "report.channel.recommendedChannels": "Recommended Channels",
  "report.channel.landscape": "Channel Landscape",
  "report.channel.effectivenessPrefix": "Effectiveness:",
  "report.channel.reach": "Reach",
  "report.channel.costEfficiency": "Cost-efficiency",
  "report.channel.communityHubs": "Community Hubs",
  "report.channel.contentTopics": "Content Topics",
  "report.channel.competitionSuffix": "comp",
  "report.synthesis.title": "Synthesis",
  "report.synthesis.copySection": "Copy synthesis section",
  "report.synthesis.opportunity": "Opportunity",
  "report.synthesis.risk": "Risk",
  "report.synthesis.netScore": "Net score",
  "report.synthesis.netScoreFormula": "Opportunity − Risk",
  "report.synthesis.basedOnInsights": "Based on cross-agent validation across {count} insights",
  "report.synthesis.topOpportunities": "Top 3 Opportunities",
  "report.synthesis.whyWorks": "Why this works:",
  "report.synthesis.topRisks": "Top 3 Risks",
  "report.synthesis.mitigation": "Mitigation:",
  "report.synthesis.crossValidated": "Cross-Validated Insights",
  "report.synthesis.supportedBy": "Supported by:",
  "report.synthesis.nextStep": "Recommended Next Step",
  "report.synthesis.importBrief": "LaunchLens Import Brief",
  "report.synthesis.importBriefSubtitle": "Ready to paste into launchlens-ai for GTM strategy generation",
  "report.synthesis.charactersSuffix": "characters",
  "report.synthesis.copyBrief": "Copy brief",
  "report.synthesis.copiedBrief": "Copied!",
  "report.synthesis.opportunityLabel.strong": "Strong opportunity",
  "report.synthesis.opportunityLabel.promising": "Promising",
  "report.synthesis.opportunityLabel.moderate": "Moderate",
  "report.synthesis.opportunityLabel.challenging": "Challenging",
  "report.synthesis.opportunityLabel.highRisk": "High risk",
  "crash.title": "エラーが発生しました",
  "crash.body": "予期しないエラーが発生しました。作業は失われていません。",
  "crash.tryAgain": "再試行",
  "crash.goHome": "ホームへ戻る",
  "crash.copyTrace": "エラー詳細をコピー",
  "crash.copied": "コピーしました",
  "notFound.title": "ページが見つかりません",
  "notFound.body": "お探しのページは存在しないか、移動された可能性があります。",
  "notFound.backHome": "リサーチスタジオに戻る",
  "commandPalette.placeholder": "コマンドまたは検索...",
  "commandPalette.noResults": "コマンドが見つかりません",
  "commandPalette.tryDifferent": "別のキーワードを試してください",
  "commandPalette.navigate": "ナビゲート",
  "commandPalette.select": "選択",
  "commandPalette.close": "閉じる",
  "commandPalette.category.navigation": "ナビゲーション",
  "commandPalette.category.action": "アクション",
  "commandPalette.category.setting": "設定",
  "commandPalette.category.template": "テンプレート",
  "commandPalette.all": "すべて",
  "history.title": "調査履歴",
  "history.empty": "調査がありません",
  "history.emptyDesc": "最初の調査を開始してください",
  "history.searchPlaceholder": "調査を検索...",
  "history.filterAll": "すべて",
  "history.filterCompleted": "完了",
  "history.filterFailed": "失敗",
  "history.sortNewest": "新しい順",
  "history.sortOldest": "古い順",
  "history.sortQuery": "クエリ順",
  "history.selected": "件選択中",
  "history.selectAll": "すべて選択",
  "history.clearSelection": "選択解除",
  "history.exportSelected": "選択したものをエクスポート",
  "history.deleteSelected": "選択したものを削除",
  "history.confirmDelete": "これらの調査を削除してもよろしいですか？",
  "export.title": "レポートをエクスポート",
  "export.markdown": "Markdown",
  "export.json": "JSON",
  "export.pdf": "PDF / 印刷",
  "export.copy": "コピー",
  "export.copied": "コピーしました！",
  "export.download": "ダウンロード",
  "search.placeholder": "レポート内を検索...",
  "search.noMatches": "一致なし",
  "search.prev": "前へ",
  "search.next": "次へ",
  "search.matchCount": "/",
  "shortcuts.title": "キーボードショートカット",
  "shortcuts.searchPlaceholder": "ショートカットを検索...",
  "shortcuts.noResults": "ショートカットが見つかりません",
  "shortcuts.total": "個のショートカット",
  "folder.new": "新規フォルダ",
  "folder.rename": "名前を変更",
  "folder.delete": "フォルダを削除",
  "folder.empty": "フォルダがありません",
  "folder.dragToReorder": "ドラッグで並べ替え",
  "settings.title": "設定",
  "settings.theme": "テーマ",
  "settings.light": "ライト",
  "settings.dark": "ダーク",
  "settings.system": "システムに合わせる",
  "settings.language": "言語",
  "toc.title": "目次",
  "toc.readingProgress": "読了",
  "common.loading": "読み込み中...",
  "common.error": "エラー",
  "common.retry": "再試行",
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.close": "閉じる",
  "common.back": "戻る",
  "common.share": "共有",
  "common.copy": "コピー",
  "common.copied": "コピーしました！",
  "common.delete": "削除",
  "common.edit": "編集",
  "common.search": "検索",
  "common.settings": "設定",
  "common.home": "ホーム",
  "common.history": "履歴",
  "commands.navHome.label": "ホームへ",
  "commands.navHome.description": "リサーチスタジオのホームに戻ります",
  "commands.navHistory.label": "履歴へ",
  "commands.navHistory.description": "過去のリサーチセッションをすべて表示",
  "commands.navTemplates.label": "テンプレートへ",
  "commands.navTemplates.description": "リサーチテンプレートを閲覧・管理",
  "commands.navBatch.label": "バッチリサーチへ",
  "commands.navBatch.description": "複数のリサーチクエリを同時に実行",
  "commands.navCompare.label": "比較へ",
  "commands.navCompare.description": "2つのリサーチレポートを並べて比較",
  "commands.navStarred.label": "スター付きへ",
  "commands.navStarred.description": "スター付きのリサーチを表示",
  "commands.themeToggle.label": "テーマを切り替え",
  "commands.themeToggle.description": "ライトモードとダークモードを切り替え",
  "commands.themeDark.label": "ダークモード",
  "commands.themeDark.description": "ダークテーマに切り替え",
  "commands.themeLight.label": "ライトモード",
  "commands.themeLight.description": "ライトテーマに切り替え",
  "commands.paletteOpen.label": "コマンドパレット",
  "commands.paletteOpen.description": "コマンドパレットを開く",
  "shortcuts.openPalette": "コマンドパレットを開く",
  "shortcuts.showShortcuts": "キーボードショートカットを表示",
  "shortcuts.goHome": "ホームへ移動",
  "shortcuts.goHistory": "セッション / 履歴へ移動",
  "shortcuts.goTemplates": "テンプレートへ移動",
  "shortcuts.goBatch": "バッチリサーチへ移動",
  "shortcuts.goCompare": "比較へ移動",
  "shortcuts.toggleTheme": "テーマを切り替え",
  "shortcuts.closeDialogs": "ダイアログ / モーダルを閉じる",
  "common.templates": "テンプレート",
  "date.justNow": "たった今",
  "date.inFuture": "未来",
  "date.secondsShort": "{n} 秒前",
  "date.minutesShort": "{n} 分前",
  "date.hoursShort": "{n} 時間前",
  "date.daysShort": "{n} 日前",
  "date.weeksShort": "{n} 週間前",
  "date.monthsShort": "{n} ヶ月前",
  "date.yearsShort": "{n} 年前",
  "date.minutesLong": "{n} 分前",
  "date.hoursLong": "{n} 時間前",
  "date.daysLong": "{n} 日前",
  "date.today": "今日",
  "date.yesterday": "昨日",
  "validation.bodyNotObject": "リクエストボディは JSON オブジェクトである必要があります。",
  "validation.queryRequired": "フィールド 'query' は必須かつ文字列である必要があります。",
  "validation.queryTooShort": "query は {min} 文字以上である必要があります。",
  "validation.queryTooLong": "query は {max} 文字以下である必要があります。",
  "validation.keywordsNotArray": "フィールド 'keywords' は文字列配列である必要があります。",
  "validation.tooManyKeywords": "キーワードは最大 {max} 個までです。",
  "validation.keywordNotString": "キーワードの {index} 番目は文字列である必要があります。",
  "validation.keywordTooLong": "キーワード \"{preview}...\" は {max} 文字を超えています。",
  "validation.gotChars": "{got} 文字取得しました。",
  "compare.title": "リサーチ比較",
  "compare.backToHistory": "← 履歴に戻る",
  "compare.optionA": "案 A",
  "compare.optionB": "案 B",
  "compare.loading": "読み込み中...",
  "compare.error.selectTwo": "比較する 2 件のリサーチを選択してください。",
  "compare.error.loadA": "案 A の読み込みに失敗しました (HTTP {status})",
  "compare.error.loadB": "案 B の読み込みに失敗しました (HTTP {status})",
  "compare.error.loadFailed": "読み込みに失敗しました",
  "compare.error.title": "比較に失敗しました",
  "compare.view.sideBySide": "📊 並べて表示",
  "compare.view.diff": "🔍 差分表示",
  "compare.changesSuffix": "件の変更",
  "compare.section.scoreCompare": "スコアの比較",
  "compare.section.execSummary": "エグゼクティブサマリー",
  "compare.section.diffOverview": "差分の概要",
  "compare.section.keywords": "キーワードの重なり",
  "compare.section.sources": "情報源の重なり",
  "compare.section.insights": "主な洞察 (A: {a} · B: {b})",
  "compare.section.opportunities": "主なチャンス",
  "compare.section.risks": "主なリスク",
  "compare.section.nextStep": "推奨される次のステップ",
  "compare.score.opportunity": "チャンス指数",
  "compare.score.risk": "リスク指数",
  "compare.score.opportunityShort": "チャンス",
  "compare.score.riskShort": "リスク",
  "compare.score.unit": "点",
  "compare.diff.added": "追加",
  "compare.diff.removed": "削除",
  "compare.diff.modified": "変更",
  "compare.diff.insightsAdded": "追加された洞察 ({count})",
  "compare.diff.insightsRemoved": "削除された洞察 ({count})",
  "compare.diff.insightsModified": "変更された洞察 ({count})",
  "compare.diff.opportunitiesAdded": "追加されたチャンス ({count})",
  "compare.diff.opportunitiesRemoved": "削除されたチャンス ({count})",
  "compare.diff.opportunitiesModified": "変更されたチャンス ({count})",
  "compare.diff.risksAdded": "追加されたリスク ({count})",
  "compare.diff.risksRemoved": "削除されたリスク ({count})",
  "compare.diff.risksModified": "変更されたリスク ({count})",
  "compare.diff.nextStepChanged": "推奨される次のステップ（変更あり）",
  "compare.diff.before": "変更前",
  "compare.diff.after": "変更後",
  "compare.diff.empty": "✨ 2 件のリサーチは同一です",
  "compare.keywords.shared": "共通 ({count})",
  "compare.keywords.onlyA": "A のみ ({count})",
  "compare.keywords.onlyB": "B のみ ({count})",
  "compare.sources.similarity": "類似度 {pct}%",
  "compare.sources.sourcesA": "案 A の情報源",
  "compare.sources.shared": "共通",
  "compare.sources.sourcesB": "案 B の情報源",
  "compare.sources.sharedDomains": "共通ドメイン ({count})",
  "compare.sources.domainsOnlyA": "A のみのドメイン",
  "compare.sources.domainsOnlyB": "B のみのドメイン",
  "compare.insightsCount": "主な洞察",
  "common.confirm": "確認",
};


const ko: Dict = {
  "agent.channel-scout.description": "고객 확보 채널, 커뮤니티 허브, 콘텐츠 주제",
  "agent.channel-scout.name": "채널 탐색정",
  "agent.competitor-analyst.description": "경쟁 구도, 시장 공백, 포지셔닝 매트릭스",
  "agent.competitor-analyst.name": "경쟁사 분석가",
  "agent.market-sizer.description": "TAM/SAM/SOM 추정, 성장 트렌드, 시장 세그먼트",
  "agent.market-sizer.name": "시장 규모 분석가",
  "agent.pain-detective.description": "사용자 페인 포인트, 미충족 요구, 실제 사용자 목소리",
  "agent.pain-detective.name": "페인 포인트 탐정",
  "agent.pricing-scout.description": "가격 범위, 수익 모델, 지불 의향",
  "agent.pricing-scout.name": "가격 탐색정",
  "agent.status.done": "완료",
  "agent.status.error": "오류",
  "agent.degraded": "데모",
  "batch.status.queued": "대기 중",
  "batch.status.running": "실행 중",
  "batch.status.completed": "완료",
  "batch.status.failed": "실패",
  "batch.title": "일괄 리서치",
  "batch.subtitle": "여러 리서치 질문을 한 번에 제출하면 시스템이 순차적으로 처리합니다.",
  "batch.backHome": "← 홈으로",
  "batch.queriesLabel": "리서치 질문 (한 줄에 하나, 최대 10개)",
  "batch.queriesPlaceholder": "생성 AI 시장 기회 분석\nAI 에이전트 트렌드 조사\n교육 분야 AI 활용 평가",
  "batch.queryCount": "개",
  "batch.keywordsLabel": "공통 키워드 (쉼표 구분, 선택)",
  "batch.keywordsPlaceholder": "예: 시장 규모, 경쟁 구도",
  "batch.submit": "🚀 일괄 리서치 시작",
  "batch.submitting": "제출 중...",
  "batch.maxQueries": "최대 10개의 리서치 질문을 지원합니다.",
  "batch.progressTitle": "일괄 진행률",
  "batch.progressDone": "완료",
  "batch.progressSuccess": "성공",
  "batch.progressFailed": "실패",
  "batch.viewRun": "보기 →",
  "batch.historyTitle": "최근 일괄 리서치",
  "batch.historyCount": "건",
  "schedule.title": "예약 리서치",
  "schedule.subtitle": "정기 자동 리서치를 설정하여 변화를 지속적으로 추적하세요.",
  "schedule.statTotal": "전체",
  "schedule.statActive": "실행 중",
  "schedule.statPaused": "일시정지",
  "schedule.statRuns": "누적 실행",
  "schedule.new": "+ 새 예약",
  "schedule.nameLabel": "이름",
  "schedule.namePlaceholder": "일일 시장 스캔",
  "schedule.queryLabel": "리서치 질문",
  "schedule.queryPlaceholder": "AI 업계 최신 동향",
  "schedule.keywordsLabel": "키워드 (쉼표 구분, 선택)",
  "schedule.keywordsPlaceholder": "시장 동향, 경쟁 구도",
  "schedule.frequencyLabel": "빈도",
  "schedule.intervalHourly": "매시간",
  "schedule.intervalDaily": "매일",
  "schedule.intervalWeekly": "매주",
  "schedule.intervalCustom": "사용자 지정 (분)",
  "schedule.intervalMinutesLabel": "간격 (분)",
  "schedule.hourLabel": "시간 (시)",
  "schedule.dayOfWeekLabel": "요일",
  "schedule.cancel": "취소",
  "schedule.create": "예약 만들기",
  "schedule.creating": "생성 중...",
  "schedule.untitled": "제목 없는 예약",
  "schedule.empty": "예약된 리서치가 없습니다",
  "schedule.emptyHint": "하나 만들어 리서치를 자동으로 실행하세요.",
  "schedule.metaFrequency": "빈도",
  "schedule.metaNextRun": "다음 실행",
  "schedule.metaLastRun": "마지막 실행",
  "schedule.metaTotal": "누적",
  "schedule.runsUnit": "회",
  "schedule.successSuffix": "성공",
  "schedule.failedSuffix": "실패",
  "schedule.trigger": "▶ 지금 실행",
  "schedule.triggerTitle": "지금 즉시 한 번 실행",
  "schedule.pause": "⏸ 일시정지",
  "schedule.resume": "▶ 재개",
  "schedule.delete": "삭제",
  "schedule.deleteConfirmTitle": "예약 리서치를 삭제하시겠습니까?",
  "schedule.deleteConfirmBody": "이 예약은 영구적으로 중지됩니다.",
  "schedule.statusActive": "실행 중",
  "schedule.statusPaused": "일시정지",
  "schedule.intervalHourlyShort": "매시간",
  "schedule.intervalDailyShort": "매일 {hh}:00",
  "schedule.intervalWeeklyShort": "{day} {hh}:00",
  "schedule.intervalMinutesShort": "{minutes}분마다",
  "schedule.intervalUnknown": "알 수 없음",
  "schedule.daySun": "일",
  "schedule.dayMon": "월",
  "schedule.dayTue": "화",
  "schedule.dayWed": "수",
  "schedule.dayThu": "목",
  "schedule.dayFri": "금",
  "schedule.daySat": "토",
  "agent.status.idle": "대기 중",
  "agent.status.running": "리서치 중",
  "agent.synthesis.description": "에이전트 간 검증, 실행 가능한 요약, 공유 가능한 브리프",
  "agent.synthesis.name": "종합 분석",
  "commandPalette.all": "전체",
  "commandPalette.category.action": "작업",
  "commandPalette.category.navigation": "탐색",
  "commandPalette.category.setting": "설정",
  "commandPalette.category.template": "템플릿",
  "commandPalette.noResults": "명령을 찾을 수 없습니다",
  "commandPalette.placeholder": "명령 또는 검색어를 입력하세요...",
  "commandPalette.tryDifferent": "다른 검색어로 시도해 보세요",
  "commandPalette.navigate": "이동",
  "commandPalette.select": "선택",
  "commandPalette.close": "닫기",
  "common.back": "뒤로",
  "common.cancel": "취소",
  "common.close": "닫기",
  "common.confirm": "확인",
  "common.copied": "복사됨!",
  "common.copy": "복사",
  "common.delete": "삭제",
  "common.edit": "편집",
  "common.error": "오류",
  "common.history": "기록",
  "common.home": "홈",
  "common.loading": "로딩 중...",
  "common.retry": "다시 시도",
  "common.save": "저장",
  "common.search": "검색",
  "common.settings": "설정",
  "common.share": "공유",
  "commands.navHome.label": "홈으로",
  "commands.navHome.description": "리서치 스튜디오 홈으로 돌아갑니다",
  "commands.navHistory.label": "기록으로",
  "commands.navHistory.description": "모든 이전 리서치 세션 보기",
  "commands.navTemplates.label": "템플릿으로",
  "commands.navTemplates.description": "리서치 템플릿 찾아보기 및 관리",
  "commands.navBatch.label": "일괄 리서치로",
  "commands.navBatch.description": "여러 리서치 쿼리를 한 번에 실행",
  "commands.navCompare.label": "비교로",
  "commands.navCompare.description": "두 리서치 보고서를 나란히 비교",
  "commands.navStarred.label": "즐겨찾기로",
  "commands.navStarred.description": "즐겨찾기한 리서치 보기",
  "commands.themeToggle.label": "테마 전환",
  "commands.themeToggle.description": "라이트 모드와 다크 모드 사이를 전환",
  "commands.themeDark.label": "다크 모드",
  "commands.themeDark.description": "다크 테마로 전환",
  "commands.themeLight.label": "라이트 모드",
  "commands.themeLight.description": "라이트 테마로 전환",
  "commands.paletteOpen.label": "명령 팔레트",
  "commands.paletteOpen.description": "명령 팔레트 열기",
  "shortcuts.openPalette": "명령 팔레트 열기",
  "shortcuts.showShortcuts": "키보드 단축키 표시",
  "shortcuts.goHome": "홈으로 이동",
  "shortcuts.goHistory": "세션 / 기록으로 이동",
  "shortcuts.goTemplates": "템플릿으로 이동",
  "shortcuts.goBatch": "일괄 리서치로 이동",
  "shortcuts.goCompare": "비교로 이동",
  "shortcuts.toggleTheme": "테마 전환",
  "shortcuts.closeDialogs": "대화상자 / 모달 닫기",
  "common.templates": "템플릿",
  "date.justNow": "방금 전",
  "date.inFuture": "미래",
  "date.secondsShort": "{n}초 전",
  "date.minutesShort": "{n}분 전",
  "date.hoursShort": "{n}시간 전",
  "date.daysShort": "{n}일 전",
  "date.weeksShort": "{n}주 전",
  "date.monthsShort": "{n}개월 전",
  "date.yearsShort": "{n}년 전",
  "date.minutesLong": "{n}분 전",
  "date.hoursLong": "{n}시간 전",
  "date.daysLong": "{n}일 전",
  "date.today": "오늘",
  "date.yesterday": "어제",
  "validation.bodyNotObject": "요청 본문은 JSON 객체여야 합니다.",
  "validation.queryRequired": "'query' 필드는 필수이며 문자열이어야 합니다.",
  "validation.queryTooShort": "query는 최소 {min}자 이상이어야 합니다.",
  "validation.queryTooLong": "query는 최대 {max}자까지 허용됩니다.",
  "validation.keywordsNotArray": "'keywords' 필드는 문자열 배열이어야 합니다.",
  "validation.tooManyKeywords": "키워드는 최대 {max}개까지 허용됩니다.",
  "validation.keywordNotString": "키워드의 {index}번째 항목은 문자열이어야 합니다.",
  "validation.keywordTooLong": "키워드 \"{preview}...\"가 {max}자를 초과합니다.",
  "validation.gotChars": "{got}자 입력됨.",
  "compare.title": "리서치 비교",
  "compare.backToHistory": "← 기록으로 돌아가기",
  "compare.optionA": "옵션 A",
  "compare.optionB": "옵션 B",
  "compare.loading": "불러오는 중...",
  "compare.error.selectTwo": "비교할 리서치 두 개를 선택하세요.",
  "compare.error.loadA": "옵션 A 불러오기 실패 (HTTP {status})",
  "compare.error.loadB": "옵션 B 불러오기 실패 (HTTP {status})",
  "compare.error.loadFailed": "불러오기 실패",
  "compare.error.title": "비교 실패",
  "compare.view.sideBySide": "📊 나란히 보기",
  "compare.view.diff": "🔍 차이 보기",
  "compare.changesSuffix": "개의 변경",
  "compare.section.scoreCompare": "점수 비교",
  "compare.section.execSummary": "요약",
  "compare.section.diffOverview": "차이 개요",
  "compare.section.keywords": "키워드 중복",
  "compare.section.sources": "출처 중복",
  "compare.section.insights": "핵심 통찰 (A: {a} · B: {b})",
  "compare.section.opportunities": "주요 기회",
  "compare.section.risks": "주요 위험",
  "compare.section.nextStep": "권장 다음 단계",
  "compare.score.opportunity": "기회 지수",
  "compare.score.risk": "위험 지수",
  "compare.score.opportunityShort": "기회",
  "compare.score.riskShort": "위험",
  "compare.score.unit": "점",
  "compare.diff.added": "추가",
  "compare.diff.removed": "삭제",
  "compare.diff.modified": "변경",
  "compare.diff.insightsAdded": "추가된 통찰 ({count})",
  "compare.diff.insightsRemoved": "삭제된 통찰 ({count})",
  "compare.diff.insightsModified": "변경된 통찰 ({count})",
  "compare.diff.opportunitiesAdded": "추가된 기회 ({count})",
  "compare.diff.opportunitiesRemoved": "삭제된 기회 ({count})",
  "compare.diff.opportunitiesModified": "변경된 기회 ({count})",
  "compare.diff.risksAdded": "추가된 위험 ({count})",
  "compare.diff.risksRemoved": "삭제된 위험 ({count})",
  "compare.diff.risksModified": "변경된 위험 ({count})",
  "compare.diff.nextStepChanged": "권장 다음 단계 (변경됨)",
  "compare.diff.before": "이전",
  "compare.diff.after": "현재",
  "compare.diff.empty": "✨ 두 리서치가 동일합니다",
  "compare.keywords.shared": "공통 ({count})",
  "compare.keywords.onlyA": "A만 ({count})",
  "compare.keywords.onlyB": "B만 ({count})",
  "compare.sources.similarity": "유사도 {pct}%",
  "compare.sources.sourcesA": "옵션 A 출처",
  "compare.sources.shared": "공통",
  "compare.sources.sourcesB": "옵션 B 출처",
  "compare.sources.sharedDomains": "공통 도메인 ({count})",
  "compare.sources.domainsOnlyA": "A만 있는 도메인",
  "compare.sources.domainsOnlyB": "B만 있는 도메인",
  "compare.insightsCount": "핵심 통찰",
  "crash.body": "예기치 않은 오류가 발생했습니다. 작업 내용은 손실되지 않았습니다.",
  "crash.copied": "복사됨",
  "crash.copyTrace": "오류 세부 정보 복사",
  "crash.goHome": "홈으로 이동",
  "crash.title": "문제가 발생했습니다",
  "crash.tryAgain": "다시 시도",
  "errors.dismiss": "닫기",
  "errors.startFailed": "리서치를 시작하지 못했습니다",
  "errors.rateLimit": "요청이 너무 많습니다. {seconds}초 후 다시 시도해 주세요.",
  "errors.serviceUnavailable": "서비스가 일시적으로 사용 불가능합니다. 나중에 다시 시도해 주세요.",
  "errors.notFound": "찾을 수 없습니다.",
  "errors.badRequest": "잘못된 요청입니다.",
  "errors.unauthorized": "인증되지 않았습니다.",
  "errors.cronNotConfigured": "예약 작업 엔드포인트가 구성되지 않았습니다. LAUNCHLENS_CRON_SECRET을 설정하세요.",
  "errors.sessionExpired": "실시간 엔진 세션이 만료되었습니다. 완료된 리포트는 기록에서 계속 확인할 수 있습니다.",
  "errors.retryTitle": "리서치를 실행할 수 없습니다",
  "errors.retryHint": "리서치 세션을 시작하거나 복구하지 못했습니다. 연결을 확인한 후 다시 시도해 주세요.",
  "errors.notFoundTitle": "리서치를 찾을 수 없습니다",
  "errors.notFoundHint": "이 리서치는 만료되었거나 삭제되었을 수 있습니다. 최근 완료된 리포트는 기록에서 확인할 수 있습니다.",
  "errors.failedRunTitle": "이 리서치는 실패했습니다",
  "errors.failedRunHint": "실행이 완료되지 않았습니다. 동일한 쿼리로 다시 실행하거나 새 리서치를 시작하세요.",
  "errors.tryAgain": "다시 시도",
  "common.backToHistory": "기록으로 돌아가기",
  "common.backToStudio": "스튜디오로 돌아가기",
  "common.startNew": "새 리서치 시작",
  "export.copied": "복사됨!",
  "export.copy": "복사",
  "export.download": "다운로드",
  "export.json": "JSON",
  "export.markdown": "마크다운",
  "export.pdf": "PDF / 인쇄",
  "export.title": "보고서 내보내기",
  "folder.delete": "폴더 삭제",
  "folder.dragToReorder": "드래그하여 순서 변경",
  "folder.empty": "폴더가 없습니다",
  "folder.new": "새 폴더",
  "folder.rename": "이름 변경",
  "footer.tagline": "LaunchLens Research Studio - launchlens-ai 오픈소스 프로젝트",
  "header.newResearch": "새 리서치",
  "header.researchComplete": "리서치 완료",
  "header.share": "공유",
  "header.subtitle": "제품 아이디어를 위한 멀티 에이전트 시장 인사이트",
  "hero.subtitle": "6개의 전문 AI 에이전트가 병렬로 작업하여 완전한 시장 인텔리전스 보고서를 제공합니다. API 키가 필요 없습니다.",
  "hero.title": "몇 분 만에 모든 시장을 리서치하세요",
  "history.clearSelection": "선택 해제",
  "history.confirmDelete": "선택한 실행을 정말 삭제하시겠습니까?",
  "history.deleteSelected": "선택 항목 삭제",
  "history.empty": "리서치가 없습니다",
  "history.emptyDesc": "첫 리서치를 시작하면 여기에 표시됩니다",
  "history.exportSelected": "선택 항목 내보내기",
  "history.filterAll": "전체",
  "history.filterCompleted": "완료됨",
  "history.filterFailed": "실패함",
  "history.searchPlaceholder": "리서치 검색...",
  "history.selectAll": "전체 선택",
  "history.selected": "개 선택됨",
  "history.sortNewest": "최신순",
  "history.sortOldest": "오래된순",
  "history.sortQuery": "쿼리 A-Z",
  "history.title": "리서치 기록",
  "language.label": "언어",
  "notFound.backHome": "리서치 스튜디오로 돌아가기",
  "notFound.body": "찾으시는 페이지가 존재하지 않거나 이동되었습니다.",
  "notFound.title": "페이지를 찾을 수 없습니다",
  "provider.breakerOpen": "프로바이더 차단기 열림",
  "provider.mock": "목업 모델",
  "provider.streaming": "스트리밍",
  "provider.probe.test": "테스트",
  "provider.probe.testing": "테스트 중…",
  "provider.probe.ok": "연결됨 ({ms}ms)",
  "provider.probe.mockOk": "목업 모델 — 네트워크 불필요",
  "provider.probe.failed": "실패: {reason}",
  "provider.probe.error": "오류: {message}",
  "report.degradedBanner.title": "{count}개 에이전트가 데모 데이터 표시 중",
  "report.degradedBanner.body": "일부 에이전트가 실제 LLM 프로바이더에 연결하지 못해 예시용 목업 데이터로 폴백했습니다. API 키와 프로바이더 설정을 확인한 뒤 신뢰할 수 있는 결과를 위해 다시 실행하세요.",
  "report.common.copied": "Copied",
  "report.common.copySection": "Copy section",
  "report.common.item": "item",
  "report.common.items": "items",
  "report.confidence.high": "High confidence",
  "report.confidence.low": "Low confidence",
  "report.confidence.medium": "Medium confidence",
  "report.marketSizer.title": "Market Sizer",
  "report.marketSizer.copySection": "Copy market section",
  "report.marketSizer.marketSizeEstimate": "Market Size Estimate",
  "report.marketSizer.tamLabel": "Total addressable market",
  "report.marketSizer.samLabel": "Serviceable addressable market",
  "report.marketSizer.somLabel": "3-year obtainable market",
  "report.marketSizer.growthRate": "growth",
  "report.marketSizer.growthRateValue": "{value}%/yr growth",
  "report.marketSizer.growthLabel": "growth",
  "report.marketSizer.trendPrefix": "trend",
  "report.marketSizer.trendAccelerating": "Accelerating trend",
  "report.marketSizer.trendStable": "Stable trend",
  "report.marketSizer.trendDeclining": "Declining trend",
  "report.marketSizer.keyTrends": "Key Trends",
  "report.marketSizer.targetSegments": "Target Segments",
  "report.marketSizer.percentOf": "% of",
  "report.competitor.title": "Competitor Analyst",
  "report.competitor.copySection": "Copy competitor section",
  "report.competitor.competitors": "Competitors",
  "report.competitor.strengths": "Strengths",
  "report.competitor.weaknesses": "Weaknesses",
  "report.competitor.marketShareSuffix": "market share",
  "report.competitor.visit": "Visit",
  "report.competitor.matrix": "Competitive Matrix",
  "report.competitor.gaps": "Market Gaps & Opportunities",
  "report.competitor.gapOpportunity": "Opportunity:",
  "report.competitor.positioning.premium": "Premium",
  "report.competitor.positioning.midMarket": "Mid-market",
  "report.competitor.positioning.budget": "Budget",
  "report.competitor.positioning.niche": "Niche",
  "report.pain.title": "Pain Detective",
  "report.pain.copySection": "Copy pain section",
  "report.pain.critical": "Critical",
  "report.pain.significant": "Significant",
  "report.pain.minor": "Minor",
  "report.pain.personas": "Personas",
  "report.pain.unmetNeeds": "Unmet needs",
  "report.pain.topPainPoints": "Top Pain Points",
  "report.pain.affectsPrefix": "Affects:",
  "report.pain.whyUnmet": "Why unmet:",
  "report.pain.opportunity": "Opportunity:",
  "report.pain.userPersonas": "User Personas",
  "report.pain.goals": "Goals",
  "report.pain.frustrations": "Frustrations",
  "report.pain.frequency.common": "Common",
  "report.pain.frequency.occasional": "Occasional",
  "report.pain.frequency.rare": "Rare",
  "report.pricing.title": "Pricing Scout",
  "report.pricing.copySection": "Copy pricing section",
  "report.pricing.priceBands": "Price Bands",
  "report.pricing.typicalMarker": "Typical",
  "report.pricing.typicalPrefix": "Typical:",
  "report.pricing.recommendedTiers": "Recommended Pricing Tiers",
  "report.pricing.perUserMonth": "per user / month",
  "report.pricing.perUserYear": "per user / year",
  "report.pricing.oneTime": "one-time",
  "report.pricing.perUsage": "per usage",
  "report.pricing.monetizationModels": "Monetization Models",
  "report.pricing.prevalenceSuffix": "prevalence",
  "report.pricing.examplesPrefix": "Examples:",
  "report.pricing.willingnessToPay": "Willingness to Pay by Segment",
  "report.pricing.perMonth": "/mo",
  "report.pricing.band.budget": "Budget",
  "report.pricing.band.midMarket": "Mid-market",
  "report.pricing.band.premium": "Premium",
  "report.pricing.band.enterprise": "Enterprise",
  "report.channel.title": "Channel Scout",
  "report.channel.copySection": "Copy channel section",
  "report.channel.recommendedChannels": "Recommended Channels",
  "report.channel.landscape": "Channel Landscape",
  "report.channel.effectivenessPrefix": "Effectiveness:",
  "report.channel.reach": "Reach",
  "report.channel.costEfficiency": "Cost-efficiency",
  "report.channel.communityHubs": "Community Hubs",
  "report.channel.contentTopics": "Content Topics",
  "report.channel.competitionSuffix": "comp",
  "report.synthesis.title": "Synthesis",
  "report.synthesis.copySection": "Copy synthesis section",
  "report.synthesis.opportunity": "Opportunity",
  "report.synthesis.risk": "Risk",
  "report.synthesis.netScore": "Net score",
  "report.synthesis.netScoreFormula": "Opportunity − Risk",
  "report.synthesis.basedOnInsights": "Based on cross-agent validation across {count} insights",
  "report.synthesis.topOpportunities": "Top 3 Opportunities",
  "report.synthesis.whyWorks": "Why this works:",
  "report.synthesis.topRisks": "Top 3 Risks",
  "report.synthesis.mitigation": "Mitigation:",
  "report.synthesis.crossValidated": "Cross-Validated Insights",
  "report.synthesis.supportedBy": "Supported by:",
  "report.synthesis.nextStep": "Recommended Next Step",
  "report.synthesis.importBrief": "LaunchLens Import Brief",
  "report.synthesis.importBriefSubtitle": "Ready to paste into launchlens-ai for GTM strategy generation",
  "report.synthesis.charactersSuffix": "characters",
  "report.synthesis.copyBrief": "Copy brief",
  "report.synthesis.copiedBrief": "Copied!",
  "report.synthesis.opportunityLabel.strong": "Strong opportunity",
  "report.synthesis.opportunityLabel.promising": "Promising",
  "report.synthesis.opportunityLabel.moderate": "Moderate",
  "report.synthesis.opportunityLabel.challenging": "Challenging",
  "report.synthesis.opportunityLabel.highRisk": "High risk",
  "search.matchCount": "of",
  "search.next": "다음",
  "search.noMatches": "일치하는 항목 없음",
  "search.placeholder": "보고서에서 검색...",
  "search.prev": "이전",
  "settings.dark": "다크",
  "settings.language": "언어",
  "settings.light": "라이트",
  "settings.system": "시스템 따름",
  "settings.theme": "테마",
  "settings.title": "설정",
  "shortcuts.noResults": "단축키를 찾을 수 없습니다",
  "shortcuts.searchPlaceholder": "단축키 검색...",
  "shortcuts.title": "키보드 단축키",
  "shortcuts.total": "개의 단축키",
  "status.completed": "리서치 완료",
  "status.error": "리서치 실패",
  "status.loading": "리서치 세션 시작 중",
  "status.running": "리서치 에이전트 실행 중",
  "status.retryingIn": "요청이 제한되었습니다. {seconds}초 후 다시 시도해 주세요.",
  "status.readyToRetry": "다시 시도할 수 있습니다.",
  "status.reconnectingIn": "연결이 끊겼습니다. {seconds}초 후에 다시 연결합니다…",
  "status.polling": "폴링으로 전환되었습니다. 업데이트가 약간 지연될 수 있습니다.",
  "status.pollingEvery": "폴링 중입니다. {seconds}초마다 업데이트합니다.",
  "status.retryCount": "재시도 {count}회차",
  "studio.poweredBy": "6개의 리서치 에이전트가 함께합니다:",
  "studio.researchAgents": "리서치 에이전트",
  "studio.tipReset": "초기화",
  "studio.tipStart": "시작하려면",
  "toc.readingProgress": "읽는 중",
  "toc.title": "목차",
};
export const DICTIONARIES: Record<Locale, Dict> = {
  "en": en,
  "zh-CN": zhCN,
  "ja": ja,
  "ko": ko,
};

export function translate(
  locale: Locale,
  key: DictionaryKey | string,
  fallback?: string,
  params?: Record<string, string | number>,
): string {
  const dict = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
  const k = key as DictionaryKey;
  let raw = dict[k] || DICTIONARIES[DEFAULT_LOCALE][k] || fallback;
  if (!raw) return typeof key === "string" ? key : "";
  if (params) {
    for (const [name, val] of Object.entries(params)) {
      raw = raw.replace(new RegExp(`\\{\\s*${name}\\s*\\}`, "g"), String(val));
    }
  }
  return raw;
}
