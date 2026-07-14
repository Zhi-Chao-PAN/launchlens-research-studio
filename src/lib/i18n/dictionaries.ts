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
  | "agent.status.stopped"
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
  | "date.minutesCompact"
  | "date.hoursCompact"
  | "date.daysCompact"
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
  | "errors.activeDeepDeleteConflict"
  | "errors.unauthorized"
  | "errors.cronNotConfigured"
  | "errors.sessionExpired"
  | "errors.reportNotCompleted"
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
  | "history.addTag"
  | "history.addedToFolder"
  | "history.badgeEvidence"
  | "history.badgeLocalRecovery"
  | "history.badgeSources"
  | "history.badgeStarred"
  | "history.badgeStudio"
  | "history.buttonClear"
  | "history.buttonRefresh"
  | "history.clearFilters"
  | "history.clearSelection"
  | "history.confirmDelete"
  | "history.confirmDeleteBody"
  | "history.confirmDeleteLabel"
  | "history.dateNotRecorded"
  | "history.deleteFailed"
  | "history.deleteSelected"
  | "history.deleteSuccess"
  | "history.empty"
  | "history.emptyDesc"
  | "history.errorTitle"
  | "history.exportSelected"
  | "history.exportSuccess"
  | "history.exportSuccessPartial"
  | "history.filterAll"
  | "history.filterCancelled"
  | "history.filterCompleted"
  | "history.filterFailed"
  | "history.heading"
  | "history.labelFocus"
  | "history.labelSearch"
  | "history.labelSort"
  | "history.labelStatus"
  | "history.linkBack"
  | "history.linkNew"
  | "history.loadFailed"
  | "history.loadingSaved"
  | "history.localFallback"
  | "history.modelUnknown"
  | "history.moreTags"
  | "history.moveToFolder"
  | "history.next"
  | "history.noFolders"
  | "history.noMatching"
  | "history.noMatchingHint"
  | "history.noSavedHint"
  | "history.noSavedYet"
  | "history.noTags"
  | "history.openReport"
  | "history.pagination"
  | "history.previous"
  | "history.providerUnknown"
  | "history.resultsAfterFilters"
  | "history.resultsCount"
  | "history.resultsFromTotal"
  | "history.searchPlaceholder"
  | "history.selectAll"
  | "history.selectAllOnPage"
  | "history.selectReports"
  | "history.selected"
  | "history.selectedOnPage"
  | "history.sortFastest"
  | "history.sortNewest"
  | "history.sortOldest"
  | "history.sortQuery"
  | "history.sortSlowest"
  | "history.starredOnly"
  | "history.startResearch"
  | "history.statusRunning"
  | "history.subtitle"
  | "history.summaryCancelled"
  | "history.summaryCitationReady"
  | "history.summaryCompleted"
  | "history.summaryFailed"
  | "history.summaryNeedsRetry"
  | "history.summaryStopped"
  | "history.summarySuccessRate"
  | "history.summaryTotal"
  | "history.summaryVisibleNow"
  | "history.summaryWithSources"
  | "history.tagFailed"
  | "history.taggedSuccess"
  | "history.title"
  | "history.tryAgain"
  | "history.untitled"
  | "queryInput.title"
  | "queryInput.queryLabel"
  | "queryInput.queryPlaceholder"
  | "queryInput.keywordsLabel"
  | "queryInput.keywordsHint"
  | "queryInput.keywordsPlaceholder"
  | "queryInput.moreKeywords"
  | "queryInput.minChars"
  | "queryInput.maxChars"
  | "queryInput.maxKeywords"
  | "queryInput.keywordTooLong"
  | "queryInput.startingResearch"
  | "queryInput.cooldownWait"
  | "queryInput.startButton"
  | "queryInput.cancelButton"
  | "queryInput.cancelAriaLabel"
  | "queryInput.cancellingButton"
  | "queryInput.cancellingAriaLabel"
  | "queryInput.tryExample"
  | "queryInput.readyToRetry"
  | "dataManager.exportTab"
  | "dataManager.importTab"
  | "dataManager.exportDesc"
  | "dataManager.optionRuns"
  | "dataManager.optionNotes"
  | "dataManager.optionFolders"
  | "dataManager.optionTemplates"
  | "dataManager.preparing"
  | "dataManager.downloadBackup"
  | "dataManager.estimateSize"
  | "dataManager.estimatedSize"
  | "dataManager.importDesc"
  | "dataManager.mergeStrategyLabel"
  | "dataManager.strategyMerge"
  | "dataManager.strategyOverwrite"
  | "dataManager.strategySkip"
  | "dataManager.adminTokenLabel"
  | "dataManager.tokenSaved"
  | "dataManager.clearToken"
  | "dataManager.tokenPlaceholder"
  | "dataManager.saveToken"
  | "dataManager.tokenHint"
  | "dataManager.processing"
  | "dataManager.chooseFile"
  | "dataManager.importComplete"
  | "dataManager.colType"
  | "dataManager.colImported"
  | "dataManager.colSkipped"
  | "dataManager.colTotal"
  | "dataManager.typeRuns"
  | "dataManager.typeNotes"
  | "dataManager.typeFolders"
  | "dataManager.typeTemplates"
  | "dataManager.issuesCount"
  | "dataManager.errorInvalidFile"
  | "dataManager.errorTokenRequired"
  | "dataManager.errorTokenRejected"
  | "dataManager.errorRunImportFailed"
  | "report.backLink"
  | "report.kicker"
  | "report.subtitle"
  | "report.statusCompleted"
  | "report.statusFailed"
  | "report.statusCancelled"
  | "report.star"
  | "report.unstar"
  | "report.starred"
  | "report.rerun"
  | "report.saveAsTemplate"
  | "report.share"
  | "report.copyMarkdown"
  | "report.compare"
  | "report.export"
  | "report.exportMd"
  | "report.exportMdDesc"
  | "report.exportPdf"
  | "report.exportPdfDesc"
  | "report.exportJson"
  | "report.exportJsonDesc"
  | "report.exportTxt"
  | "report.exportTxtDesc"
  | "report.exportedToast"
  | "report.reportCopied"
  | "report.linkCopied"
  | "report.copyLinkFailed"
  | "report.shareLinkCopied"
  | "report.shareLinkCreated"
  | "report.shareCopied"
  | "report.shareFailed"
  | "report.shareTitle"
  | "report.shareDesc"
  | "report.shareGenerating"
  | "report.shareGenerateLink"
  | "report.shareOrCopyLabel"
  | "report.shareCopyLink"
  | "report.shareGenerated"
  | "report.shareCopy"
  | "report.templateTitle"
  | "report.templateSaved"
  | "report.templateNameLabel"
  | "report.outputProfileLabel"
  | "report.profileIdea"
  | "report.profileIdeaEyebrow"
  | "report.profileIdeaDesc"
  | "report.profileFounder"
  | "report.profileFounderEyebrow"
  | "report.profileFounderDesc"
  | "report.profileAnalyst"
  | "report.profileAnalystEyebrow"
  | "report.profileAnalystDesc"
  | "report.opportunityLabel"
  | "report.riskLabel"
  | "report.evidenceLabel"
  | "report.rationale"
  | "report.mitigation"
  | "report.sourcesNoticeFull"
  | "report.sourcesUnit"
  | "report.sourcesShown"
  | "report.tocTitle"
  | "report.tocExecSummary"
  | "report.tocScores"
  | "report.tocKeyInsights"
  | "report.tocOpportunities"
  | "report.tocRisks"
  | "report.tocNextStep"
  | "report.tocSources"
  | "report.tocResult"
  | "report.tocRawOutput"
  | "report.showRawOutput"
  | "report.hideRawOutput"
  | "report.sourcesNotice"
  | "report.analysisCompanion"
  | "report.viewSource"
  | "report.citedIn"
  | "report.keywordAnalysis"
  | "report.agentsLabel"
  | "report.scoresLabel"
  | "report.readingProgress"
  | "report.kbNavHint"
  | "report.customTemplate"
  | "report.rerunResearch"
  | "report.exportReport"
  | "report.copyReport"
  | "report.backToHistory"
  | "report.notFound"
  | "report.failedToLoad"
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
  | "report.synthesis.useExportPanel"
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
  | "status.cancelled"
  | "status.cancelling"
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
  | "queryInput.briefEyebrow"
  | "queryInput.modeUnavailable"
  | "researchMode.legend"
  | "researchMode.availability.ready"
  | "researchMode.availability.preview"
  | "researchMode.standard.label"
  | "researchMode.standard.description"
  | "researchMode.standard.depthLabel"
  | "researchMode.standard.duration"
  | "researchMode.standard.capabilityNotice"
  | "researchMode.deep.label"
  | "researchMode.deep.description"
  | "researchMode.deep.depthLabel"
  | "researchMode.deep.duration"
  | "researchMode.deep.capabilityNotice"
  | "researchMode.retrieval.optional"
  | "researchMode.retrieval.required"
  | "researchMode.validationPass.one"
  | "researchMode.validationPass.other"
  | "researchMode.requirementsReady"
  | "researchProtocol.eyebrow"
  | "researchProtocol.title"
  | "researchProtocol.execution"
  | "researchProtocol.evidence"
  | "researchProtocol.validation"
  | "researchProtocol.analysts"
  | "researchProtocol.previewOnly"
  | "researchProtocol.ready"
  | "researchProtocol.asyncRunnerRequired"
  | "researchProtocol.requestBoundGuard"
  | "researchProtocol.reportedCitation.one"
  | "researchProtocol.reportedCitation.other"
  | "researchProtocol.sourcesCollected.one"
  | "researchProtocol.sourcesCollected.other"
  | "researchProtocol.matchedCitation.one"
  | "researchProtocol.matchedCitation.other"
  | "researchProtocol.rejectedCitation.one"
  | "researchProtocol.rejectedCitation.other"
  | "researchProtocol.urlAllowlistActive"
  | "researchProtocol.urlMembershipOnly"
  | "researchProtocol.urlGroundedAgents"
  | "researchProtocol.claimVerificationPending"
  | "researchProtocol.semanticValidationNotRun"
  | "researchProtocol.citationReferencesResolved"
  | "researchProtocol.sourceDomainCoverage"
  | "researchProtocol.retrievalUnavailable"
  | "researchProtocol.retrievalNotConfigured"
  | "researchProtocol.retrieval"
  | "researchProtocol.sourceAllowlistRequired"
  | "researchProtocol.citationUrlVerificationPending"
  | "researchProtocol.draftCitationConflictReview"
  | "researchProtocol.schemaCrossAgentSynthesis"
  | "researchProtocol.analystsComplete"
  | "researchProtocol.parallelModel"
  | "researchProtocol.demoFallback.one"
  | "researchProtocol.demoFallback.other"
  | "researchProtocol.specialistsThenSynthesis"
  | "researchProtocol.standardNotice"
  | "researchProtocol.deepReadyNotice"
  | "researchProtocol.deepPreviewNotice"
  | "researchProtocol.deepExecutedNotice"
  | "researchProtocol.nextBlocker"
  | "researchProtocol.deepWorkGraph"
  | "researchProtocol.deepWorkProgress"
  | "researchProtocol.deepWorkCurrent"
  | "researchProtocol.deepWorkComplete"
  | "researchProtocol.deepWork.specialist"
  | "researchProtocol.deepWork.semantic_pass_1"
  | "researchProtocol.deepWork.semantic_pass_2"
  | "researchProtocol.deepWork.semantic_pass_3"
  | "researchProtocol.deepWork.synthesis"
  | "researchProtocol.deepWork.finalize"
  | "researchRequirement.explicit_opt_in"
  | "researchRequirement.durable_state"
  | "researchRequirement.generation_provider"
  | "researchRequirement.retrieval_provider"
  | "researchRequirement.semantic_reviewer"
  | "researchRequirement.worker_wake"
  | "researchRequirement.independent_recovery"
  | "workspace.aria.evidenceValidation"
  | "workspace.hero.eyebrow"
  | "workspace.hero.title"
  | "workspace.hero.subtitle"
  | "workspace.newRun.eyebrow"
  | "workspace.newRun.title"
  | "workspace.newRun.teamComposition"
  | "workspace.startMode"
  | "workspace.deepResearchPreparing"
  | "workspace.suggestions.eyebrow"
  | "workspace.suggestions.title"
  | "workspace.suggestion.followUp"
  | "workspace.suggestion.deepDive"
  | "workspace.suggestion.related"
  | "workspace.suggestion.trending"
  | "workspace.controls"
  | "workspace.analystsProgress"
  | "workspace.rerunMode"
  | "workspace.runStatus.complete"
  | "workspace.runStatus.cancelled"
  | "workspace.runStatus.cancelling"
  | "workspace.runStatus.running"
  | "workspace.runStatus.error"
  | "workspace.runStatus.idle"
  | "workspace.stats.eyebrow"
  | "workspace.stats.title"
  | "workspace.stats.allRuns"
  | "workspace.stats.thisWeek"
  | "workspace.stats.starred"
  | "workspace.stats.templates"
  | "workspace.team.eyebrow"
  | "workspace.team.title"
  | "workspace.team.process"
  | "workspace.saved.title"
  | "workspace.saved.count"
  | "workspace.saved.openAria"
  | "workspace.saved.delete"
  | "workspace.saved.deleteAria"
  | "workspace.recent.title"
  | "workspace.recent.rerun"
  | "workspace.recent.rerunAria"
  | "workspace.recent.open"
  | "workspace.recent.openAria"
  | "workspace.recent.remove"
  | "workspace.recent.removeAria"
  | "workspace.keywordsMore"
  | "workspace.citationCount.one"
  | "workspace.citationCount.other"
  | "report.sourceCount.one"
  | "report.sourceCount.other"
  | "report.accessedAt"
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
  "errors.activeDeepDeleteConflict": "Cancel the active Deep Research run before deleting its live session.",
  "errors.unauthorized": "Unauthorized.",
  "errors.cronNotConfigured": "Scheduled-task endpoint is not configured. Set CRON_SECRET.",
  "errors.sessionExpired": "Live engine session expired. The completed report is still available in History.",
  "errors.reportNotCompleted": "This report must complete before it can be exported.",
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
  "status.cancelled": "Research cancelled",
  "status.cancelling": "Cancelling research",
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
  "agent.status.stopped": "Stopped",
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
  "report.synthesis.useExportPanel": "Use the Export panel above to copy or send the validation-aware brief. The raw synthesis text is not importable to avoid exporting unverified figures.",
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
  "history.searchPlaceholder": "Search queries or keywords...",
  "history.filterAll": "All",
  "history.filterCompleted": "Completed",
  "history.filterFailed": "Failed",
  "history.filterCancelled": "Cancelled",
  "history.sortNewest": "Newest first",
  "history.sortOldest": "Oldest first",
  "history.sortFastest": "Fastest first",
  "history.sortSlowest": "Slowest first",
  "history.sortQuery": "Query A-Z",
  "history.selected": "selected",
  "history.selectAll": "Select all",
  "history.clearSelection": "Exit selection",
  "history.exportSelected": "Export Markdown",
  "history.deleteSelected": "Delete",
  "history.confirmDelete": "Delete selected research?",
  "history.confirmDeleteBody": "This will permanently delete {count} selected run(s) from history.",
  "history.confirmDeleteLabel": "Delete",
  "history.loadFailed": "Unable to load research history.",
  "history.localFallback": "Showing {count} locally remembered report link(s). Server history failed: {message}",
  "history.deleteSuccess": "Deleted {count} research run(s).",
  "history.deleteFailed": "Delete failed.",
  "history.exportSuccessPartial": "Exported {succeeded} run(s); {failed} failed.",
  "history.exportSuccess": "Exported {count} run(s).",
  "history.addedToFolder": "Added {count} run(s) to folder.",
  "history.taggedSuccess": "Tagged {count} run(s).",
  "history.tagFailed": "Failed to add tag.",
  "history.badgeStudio": "Research Studio",
  "history.badgeEvidence": "Evidence archive",
  "history.heading": "Research runs, reports, and proof trails.",
  "history.subtitle": "Recover completed reports, audit sources, and hand off research evidence without depending on the transient worker that generated the run.",
  "history.buttonRefresh": "Refresh",
  "history.linkBack": "Back to studio",
  "history.linkNew": "New research",
  "history.summaryTotal": "Total saved",
  "history.summaryCompleted": "Completed",
  "history.summaryWithSources": "With sources",
  "history.summaryFailed": "Failed",
  "history.summaryCancelled": "Cancelled",
  "history.summaryVisibleNow": "{count} visible now",
  "history.summarySuccessRate": "{rate}% success rate",
  "history.summaryCitationReady": "Citation-ready reports",
  "history.summaryNeedsRetry": "Needs retry or review",
  "history.summaryStopped": "Stopped or still running",
  "history.labelSearch": "Search",
  "history.buttonClear": "Clear",
  "history.labelStatus": "Status",
  "history.labelFocus": "Focus",
  "history.starredOnly": "Starred only",
  "history.labelSort": "Sort",
  "history.loadingSaved": "Loading saved research...",
  "history.resultsCount": "{visible} visible result{plural}{fromTotal}",
  "history.resultsAfterFilters": " after filters",
  "history.resultsFromTotal": " from {total} saved",
  "history.clearFilters": "Clear filters",
  "history.selectReports": "Select reports",
  "history.selectedOnPage": "{count} selected on this page",
  "history.selectAllOnPage": "Select reports on this page",
  "history.moveToFolder": "Move to folder",
  "history.noFolders": "No custom folders yet.",
  "history.addTag": "Add tag",
  "history.noTags": "No tags yet.",
  "history.pagination": "Page {page} of {totalPages} - {total} saved result{plural}",
  "history.previous": "Previous",
  "history.next": "Next",
  "history.badgeStarred": "Starred",
  "history.badgeSources": "Sources",
  "history.badgeLocalRecovery": "Local recovery",
  "history.untitled": "Untitled research",
  "history.providerUnknown": "provider unknown",
  "history.modelUnknown": "model unknown",
  "history.moreTags": "+{count} tags",
  "history.openReport": "Open report",
  "history.noMatching": "No matching reports",
  "history.noSavedYet": "No saved research yet",
  "history.noMatchingHint": "Try clearing filters or searching with a broader phrase.",
  "history.noSavedHint": "Run a research task and the completed report will appear here for recovery, export, and follow-up review.",
  "history.startResearch": "Start research",
  "history.errorTitle": "History could not load",
  "history.tryAgain": "Try again",
  "history.dateNotRecorded": "Date not recorded",
  "history.statusRunning": "Running",
  "queryInput.title": "Start a Research Session",
  "queryInput.queryLabel": "Product idea",
  "queryInput.queryPlaceholder": "Describe the product idea you want to research… e.g., an AI-powered go-to-market tool for solo founders",
  "queryInput.keywordsLabel": "Keywords",
  "queryInput.keywordsHint": "(optional, comma-separated)",
  "queryInput.keywordsPlaceholder": "e.g., SaaS, AI, productivity, remote work",
  "queryInput.moreKeywords": "+{count} more",
  "queryInput.minChars": "Minimum {n} characters",
  "queryInput.maxChars": "Maximum {n} characters",
  "queryInput.maxKeywords": "Max {n} keywords",
  "queryInput.keywordTooLong": "\"{preview}...\" is too long",
  "queryInput.startingResearch": "Starting research…",
  "queryInput.cooldownWait": "Please wait {n}s…",
  "queryInput.startButton": "Start Research",
  "queryInput.cancelButton": "Cancel",
  "queryInput.cancelAriaLabel": "Cancel research",
  "queryInput.cancellingButton": "Cancelling…",
  "queryInput.cancellingAriaLabel": "Research cancellation in progress",
  "queryInput.tryExample": "Or try an example",
  "queryInput.readyToRetry": "Ready to retry — you can submit again.",
  "dataManager.exportTab": "Export",
  "dataManager.importTab": "Import",
  "dataManager.exportDesc": "Download all your research data as a backup file.",
  "dataManager.optionRuns": "Research runs",
  "dataManager.optionNotes": "Notes & annotations",
  "dataManager.optionFolders": "Folders",
  "dataManager.optionTemplates": "Templates",
  "dataManager.preparing": "Preparing...",
  "dataManager.downloadBackup": "Download Backup",
  "dataManager.estimateSize": "Estimate Size",
  "dataManager.estimatedSize": "Estimated size: {size}",
  "dataManager.importDesc": "Restore data from a backup file.",
  "dataManager.mergeStrategyLabel": "Merge strategy:",
  "dataManager.strategyMerge": "Merge (newer wins)",
  "dataManager.strategyOverwrite": "Overwrite existing",
  "dataManager.strategySkip": "Skip existing",
  "dataManager.adminTokenLabel": "Admin token (required for server-side run restore)",
  "dataManager.tokenSaved": "✓ Token saved in this browser",
  "dataManager.clearToken": "Clear",
  "dataManager.tokenPlaceholder": "Paste an admin-scope token",
  "dataManager.saveToken": "Save",
  "dataManager.tokenHint": "Notes, folders, and templates restore locally and don't need a token. Only server-stored research runs require admin scope.",
  "dataManager.processing": "Processing...",
  "dataManager.chooseFile": "Choose Backup File",
  "dataManager.importComplete": "Import complete",
  "dataManager.colType": "Type",
  "dataManager.colImported": "Imported",
  "dataManager.colSkipped": "Skipped",
  "dataManager.colTotal": "Total",
  "dataManager.typeRuns": "Runs",
  "dataManager.typeNotes": "Notes",
  "dataManager.typeFolders": "Folders",
  "dataManager.typeTemplates": "Templates",
  "dataManager.issuesCount": "{count} issue(s): {issues}",
  "dataManager.errorInvalidFile": "Invalid backup file: {errors}",
  "dataManager.errorTokenRequired": "Run import requires an admin token. Enter your admin token in the field above to enable server-side restore.",
  "dataManager.errorTokenRejected": "Admin token rejected (401). Clear and re-enter it.",
  "dataManager.errorRunImportFailed": "Run import failed: HTTP {status}",
  "report.backLink": "← Research history",
  "report.kicker": "LaunchLens Research Studio · Evidence-backed market report",
  "report.subtitle": "Audience-aware reading, citation recovery, and decision-ready synthesis for the current report.",
  "report.statusCompleted": "completed",
  "report.statusFailed": "failed",
  "report.statusCancelled": "cancelled",
  "report.star": "☆ Star",
  "report.unstar": "Unstar",
  "report.starred": "★ Starred",
  "report.rerun": "Rerun",
  "report.saveAsTemplate": "Save as template",
  "report.share": "Share",
  "report.copyMarkdown": "Copy Markdown",
  "report.compare": "Compare",
  "report.export": "Export",
  "report.exportMd": "Markdown",
  "report.exportMdDesc": ".md file with formatting",
  "report.exportPdf": "PDF",
  "report.exportPdfDesc": "Print / Save as PDF",
  "report.exportJson": "JSON",
  "report.exportJsonDesc": "Structured data",
  "report.exportTxt": "Plain Text",
  "report.exportTxtDesc": ".txt file",
  "report.exportedToast": "Exported {format}",
  "report.reportCopied": "Report copied to clipboard",
  "report.linkCopied": "Link copied to clipboard",
  "report.copyLinkFailed": "Failed to copy link",
  "report.shareLinkCopied": "Share link copied to clipboard",
  "report.shareLinkCreated": "Share link created: {url}",
  "report.shareCopied": "Share link copied",
  "report.shareFailed": "Failed to copy",
  "report.shareTitle": "Share Research",
  "report.shareDesc": "Generate a public share link for this research report.",
  "report.shareGenerating": "Generating...",
  "report.shareGenerateLink": "Generate link",
  "report.shareOrCopyLabel": "Or copy current page link:",
  "report.shareCopyLink": "📋 Copy link",
  "report.shareGenerated": "Share link generated!",
  "report.shareCopy": "Copy",
  "report.templateTitle": "Save as Template",
  "report.templateSaved": "✓ Template saved successfully",
  "report.templateNameLabel": "Template name",
  "report.outputProfileLabel": "Output profile",
  "report.profileIdea": "Idea",
  "report.profileIdeaEyebrow": "Plain-language validation",
  "report.profileIdeaDesc": "For individual builders who need the answer, the risk, and the next move without analyst-heavy detail.",
  "report.profileFounder": "Founder",
  "report.profileFounderEyebrow": "Execution-ready brief",
  "report.profileFounderDesc": "For early teams that need enough evidence to decide, prioritize, and hand off into GTM execution.",
  "report.profileAnalyst": "Analyst",
  "report.profileAnalystEyebrow": "Full evidence mode",
  "report.profileAnalystDesc": "For expert reviewers who want scores, citation trails, raw evidence, and all intermediate detail.",
  "report.opportunityLabel": "Opportunity",
  "report.riskLabel": "Risk",
  "report.evidenceLabel": "Evidence",
  "report.rationale": "Rationale:",
  "report.mitigation": "Mitigation:",
  "report.sourcesNoticeFull": "Showing the first {n} sources for readability. Switch to Analyst for the complete citation trail.",
  "report.sourcesUnit": "sources",
  "report.sourcesShown": "{n} shown · full trail in Analyst",
  "report.tocTitle": "Table of Contents",
  "report.tocExecSummary": "Executive Summary",
  "report.tocScores": "Scores",
  "report.tocKeyInsights": "Key Insights ({n})",
  "report.tocOpportunities": "Top Opportunities",
  "report.tocRisks": "Top Risks",
  "report.tocNextStep": "Recommended Next Step",
  "report.tocSources": "Sources ({n}+)",
  "report.tocResult": "Result",
  "report.tocRawOutput": "Raw Output",
  "report.showRawOutput": "Show raw output",
  "report.hideRawOutput": "Hide raw output",
  "report.sourcesNotice": "Showing the first N sources for readability. Switch to Analyst for the complete citation trail.",
  "report.analysisCompanion": "Analysis companion",
  "report.viewSource": "View source",
  "report.citedIn": "Cited in:",
  "report.keywordAnalysis": "Keyword Analysis",
  "report.agentsLabel": "Agents:",
  "report.scoresLabel": "Scores",
  "report.readingProgress": "{pct}% read",
  "report.kbNavHint": "j k nav · t top · b bottom",
  "report.customTemplate": "Custom",
  "report.rerunResearch": "Rerun Research",
  "report.exportReport": "Export Report",
  "report.copyReport": "Copy Report",
  "report.backToHistory": "Back to History",
  "report.notFound": "Research run not found. It may have expired or been deleted.",
  "report.failedToLoad": "Failed to load",
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
  "date.minutesCompact": "{n}m ago",
  "date.hoursCompact": "{n}h ago",
  "date.daysCompact": "{n}d ago",
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
  "queryInput.briefEyebrow": "Research brief",
  "queryInput.modeUnavailable": "Mode not yet available",
  "researchMode.legend": "Research mode",
  "researchMode.availability.ready": "Ready",
  "researchMode.availability.preview": "Preview",
  "researchMode.standard.label": "Standard",
  "researchMode.standard.description": "A focused 5+1 agent scan with one synthesis pass for exploratory decisions.",
  "researchMode.standard.depthLabel": "Focused evidence scan",
  "researchMode.standard.duration": "{min}–{max} min",
  "researchMode.standard.capabilityNotice": "Runs inside the current request-bound {seconds}-second execution window.",
  "researchMode.deep.label": "Deep Research",
  "researchMode.deep.description": "A durable evidence-first protocol with mandatory retrieval and three ordered semantic reviews.",
  "researchMode.deep.depthLabel": "Multi-pass evidence audit",
  "researchMode.deep.duration": "{min}–{max} min target",
  "researchMode.deep.capabilityNotice": "Async Preview until durable state, real providers, authenticated worker wake, and independent recovery are verified; no run beyond the {seconds}-second request window will start.",
  "researchMode.retrieval.optional": "Optional",
  "researchMode.retrieval.required": "Required",
  "researchMode.validationPass.one": "{count} validation pass",
  "researchMode.validationPass.other": "{count} validation passes",
  "researchMode.requirementsReady": "{ready}/{total} controls ready",
  "researchProtocol.eyebrow": "Run controls",
  "researchProtocol.title": "Research protocol",
  "researchProtocol.execution": "Execution",
  "researchProtocol.evidence": "Evidence",
  "researchProtocol.validation": "Validation",
  "researchProtocol.analysts": "Analysts",
  "researchProtocol.previewOnly": "Preview only",
  "researchProtocol.ready": "Ready",
  "researchProtocol.asyncRunnerRequired": "Async runner required",
  "researchProtocol.requestBoundGuard": "Request-bound, {seconds} s guard",
  "researchProtocol.reportedCitation.one": "{count} reported citation",
  "researchProtocol.reportedCitation.other": "{count} reported citations",
  "researchProtocol.sourcesCollected.one": "{count} source collected",
  "researchProtocol.sourcesCollected.other": "{count} sources collected",
  "researchProtocol.matchedCitation.one": "{count} citation URL matched",
  "researchProtocol.matchedCitation.other": "{count} citation URLs matched",
  "researchProtocol.rejectedCitation.one": "{count} citation rejected",
  "researchProtocol.rejectedCitation.other": "{count} citations rejected",
  "researchProtocol.urlAllowlistActive": "URL allowlist active",
  "researchProtocol.urlMembershipOnly": "URL matching checks membership only",
  "researchProtocol.urlGroundedAgents": "{count}/{total} outputs URL-grounded",
  "researchProtocol.claimVerificationPending": "Claim-to-source verification remains pending",
  "researchProtocol.semanticValidationNotRun": "Semantic claim verification was not run",
  "researchProtocol.citationReferencesResolved": "{resolved}/{total} citation references resolved",
  "researchProtocol.sourceDomainCoverage": "{sources} sources across {domains} domains",
  "researchProtocol.retrievalUnavailable": "Retrieval unavailable",
  "researchProtocol.retrievalNotConfigured": "Retrieval not configured",
  "researchProtocol.retrieval": "{level} retrieval",
  "researchProtocol.sourceAllowlistRequired": "Source allowlist required before launch",
  "researchProtocol.citationUrlVerificationPending": "Citation URL verification not yet active",
  "researchProtocol.draftCitationConflictReview": "Draft, citation and conflict review",
  "researchProtocol.schemaCrossAgentSynthesis": "Schema and cross-agent synthesis",
  "researchProtocol.analystsComplete": "{completed}/{total} complete",
  "researchProtocol.parallelModel": "5 + 1 parallel model",
  "researchProtocol.demoFallback.one": "{count} section using demo fallback",
  "researchProtocol.demoFallback.other": "{count} sections using demo fallback",
  "researchProtocol.specialistsThenSynthesis": "Specialists followed by synthesis",
  "researchProtocol.standardNotice": "Standard mode is exploratory. Reported citations are visible, but should not be treated as independently verified evidence yet.",
  "researchProtocol.deepReadyNotice": "Durable 10–20 minute execution is ready with mandatory retrieval and three ordered semantic review passes.",
  "researchProtocol.deepPreviewNotice": "Deep Research remains Preview: {ready}/{total} production controls are ready.",
  "researchProtocol.deepExecutedNotice": "This dossier completed the three-pass Deep Research protocol; current launch readiness is checked separately.",
  "researchProtocol.nextBlocker": "Next blocker: {label}",
  "researchProtocol.deepWorkGraph": "Durable work graph",
  "researchProtocol.deepWorkProgress": "{completed}/{total} work units committed",
  "researchProtocol.deepWorkCurrent": "Current: {work} · attempt {attempt}/{max}",
  "researchProtocol.deepWorkComplete": "All {total} work units committed",
  "researchProtocol.deepWork.specialist": "Specialist · {agent}",
  "researchProtocol.deepWork.semantic_pass_1": "Review 1 · claim-source entailment",
  "researchProtocol.deepWork.semantic_pass_2": "Review 2 · corroboration and conflict",
  "researchProtocol.deepWork.semantic_pass_3": "Review 3 · adjudication",
  "researchProtocol.deepWork.synthesis": "Evidence-constrained synthesis",
  "researchProtocol.deepWork.finalize": "Final integrity gate",
  "researchRequirement.explicit_opt_in": "operator opt-in",
  "researchRequirement.durable_state": "durable state",
  "researchRequirement.generation_provider": "research model",
  "researchRequirement.retrieval_provider": "independent retrieval",
  "researchRequirement.semantic_reviewer": "semantic reviewer",
  "researchRequirement.worker_wake": "worker wake",
  "researchRequirement.independent_recovery": "independent recovery",
  "workspace.aria.evidenceValidation": "Evidence and validation status",
  "workspace.hero.eyebrow": "Market intelligence workspace",
  "workspace.hero.title": "Build a research dossier, not a generic summary.",
  "workspace.hero.subtitle": "Frame the decision once, then let five specialist analysts investigate the market before a synthesis reviewer resolves the final brief.",
  "workspace.newRun.eyebrow": "New research run",
  "workspace.newRun.title": "Scope the decision",
  "workspace.newRun.teamComposition": "5 specialists + 1 reviewer",
  "workspace.startMode": "Start {mode}",
  "workspace.deepResearchPreparing": "Deep Research in preparation",
  "workspace.suggestions.eyebrow": "Based on recent work",
  "workspace.suggestions.title": "Suggested follow-ups",
  "workspace.suggestion.followUp": "Follow-up",
  "workspace.suggestion.deepDive": "Deep dive",
  "workspace.suggestion.related": "Related",
  "workspace.suggestion.trending": "Trending",
  "workspace.controls": "Research controls",
  "workspace.analystsProgress": "{done}/{total} analysts",
  "workspace.rerunMode": "Rerun {mode}",
  "workspace.runStatus.complete": "Complete",
  "workspace.runStatus.cancelled": "Cancelled",
  "workspace.runStatus.cancelling": "Cancelling",
  "workspace.runStatus.running": "Running",
  "workspace.runStatus.error": "Error",
  "workspace.runStatus.idle": "Idle",
  "workspace.stats.eyebrow": "Workspace",
  "workspace.stats.title": "Activity",
  "workspace.stats.allRuns": "All runs",
  "workspace.stats.thisWeek": "This week",
  "workspace.stats.starred": "Starred",
  "workspace.stats.templates": "Templates",
  "workspace.team.eyebrow": "Analysis model",
  "workspace.team.title": "Five specialists, one synthesis reviewer",
  "workspace.team.process": "Parallel research → final review",
  "workspace.saved.title": "Saved dossiers",
  "workspace.saved.count": "({count})",
  "workspace.saved.openAria": "Open saved dossier: {query}",
  "workspace.saved.delete": "Delete saved dossier",
  "workspace.saved.deleteAria": "Delete saved dossier: {query}",
  "workspace.recent.title": "Recent research",
  "workspace.recent.rerun": "Rerun",
  "workspace.recent.rerunAria": "Rerun research: {query}",
  "workspace.recent.open": "Open",
  "workspace.recent.openAria": "Open report: {query}",
  "workspace.recent.remove": "Remove from history",
  "workspace.recent.removeAria": "Remove from history: {query}",
  "workspace.keywordsMore": "+{count}",
  "workspace.citationCount.one": "{count} citation",
  "workspace.citationCount.other": "{count} citations",
  "report.sourceCount.one": "{count} source",
  "report.sourceCount.other": "{count} sources",
  "report.accessedAt": "Accessed {date}",
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
  "errors.activeDeepDeleteConflict": "请先取消正在运行的深度研究，再删除其实时会话。",
  "errors.unauthorized": "未授权。",
  "errors.cronNotConfigured": "定时任务端点未配置，请设置 CRON_SECRET。",
  "errors.sessionExpired": "实时引擎会话已过期，完整报告仍可在历史记录中查看。",
  "errors.reportNotCompleted": "调研完成后才能导出该报告。",
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
  "status.cancelled": "调研已取消",
  "status.cancelling": "正在取消调研",
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
  "agent.status.stopped": "已停止",
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
  "report.synthesis.useExportPanel": "请使用上方的导出面板复制或发送经过验证的简报。原始综合文本不可导入，以避免导出未经验证的数据。",
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
  "history.searchPlaceholder": "搜索查询或关键词...",
  "history.filterAll": "全部",
  "history.filterCompleted": "已完成",
  "history.filterFailed": "失败",
  "history.filterCancelled": "已取消",
  "history.sortNewest": "最新优先",
  "history.sortOldest": "最早优先",
  "history.sortFastest": "最快优先",
  "history.sortSlowest": "最慢优先",
  "history.sortQuery": "按查询排序",
  "history.selected": "项已选",
  "history.selectAll": "全选",
  "history.clearSelection": "退出选择",
  "history.exportSelected": "导出 Markdown",
  "history.deleteSelected": "删除",
  "history.confirmDelete": "删除选中的调研？",
  "history.confirmDeleteBody": "这将从历史记录中永久删除 {count} 条选中的记录。",
  "history.confirmDeleteLabel": "删除",
  "history.loadFailed": "无法加载调研历史。",
  "history.localFallback": "显示 {count} 条本地缓存的报告链接。服务器历史加载失败：{message}",
  "history.deleteSuccess": "已删除 {count} 条调研记录。",
  "history.deleteFailed": "删除失败。",
  "history.exportSuccessPartial": "已导出 {succeeded} 条；{failed} 条失败。",
  "history.exportSuccess": "已导出 {count} 条记录。",
  "history.addedToFolder": "已将 {count} 条记录添加到文件夹。",
  "history.taggedSuccess": "已为 {count} 条记录添加标签。",
  "history.tagFailed": "添加标签失败。",
  "history.badgeStudio": "调研工作室",
  "history.badgeEvidence": "证据档案",
  "history.heading": "调研运行、报告和证据链。",
  "history.subtitle": "恢复已完成的报告、审计来源、移交调研证据，无需依赖生成运行的临时工作器。",
  "history.buttonRefresh": "刷新",
  "history.linkBack": "返回工作室",
  "history.linkNew": "新建调研",
  "history.summaryTotal": "总计保存",
  "history.summaryCompleted": "已完成",
  "history.summaryWithSources": "有来源",
  "history.summaryFailed": "失败",
  "history.summaryCancelled": "已取消",
  "history.summaryVisibleNow": "当前显示 {count} 条",
  "history.summarySuccessRate": "成功率 {rate}%",
  "history.summaryCitationReady": "可引用报告",
  "history.summaryNeedsRetry": "需要重试或审核",
  "history.summaryStopped": "已停止或仍在运行",
  "history.labelSearch": "搜索",
  "history.buttonClear": "清除",
  "history.labelStatus": "状态",
  "history.labelFocus": "筛选",
  "history.starredOnly": "仅收藏",
  "history.labelSort": "排序",
  "history.loadingSaved": "正在加载已保存的调研...",
  "history.resultsCount": "{visible} 条可见结果{plural}{fromTotal}",
  "history.resultsAfterFilters": "（筛选后）",
  "history.resultsFromTotal": "（共 {total} 条已保存）",
  "history.clearFilters": "清除筛选",
  "history.selectReports": "选择报告",
  "history.selectedOnPage": "本页已选 {count} 条",
  "history.selectAllOnPage": "选择本页所有报告",
  "history.moveToFolder": "移动到文件夹",
  "history.noFolders": "暂无自定义文件夹。",
  "history.addTag": "添加标签",
  "history.noTags": "暂无标签。",
  "history.pagination": "第 {page} 页 / 共 {totalPages} 页 - {total} 条已保存结果",
  "history.previous": "上一页",
  "history.next": "下一页",
  "history.badgeStarred": "已收藏",
  "history.badgeSources": "来源",
  "history.badgeLocalRecovery": "本地恢复",
  "history.untitled": "未命名调研",
  "history.providerUnknown": "未知提供方",
  "history.modelUnknown": "未知模型",
  "history.moreTags": "+{count} 个标签",
  "history.openReport": "打开报告",
  "history.noMatching": "没有匹配的报告",
  "history.noSavedYet": "暂无已保存的调研",
  "history.noMatchingHint": "尝试清除筛选或使用更宽泛的关键词搜索。",
  "history.noSavedHint": "运行调研任务后，完成的报告将显示在这里，可用于恢复、导出和后续审核。",
  "history.startResearch": "开始调研",
  "history.errorTitle": "历史记录加载失败",
  "history.tryAgain": "重试",
  "history.dateNotRecorded": "日期未记录",
  "history.statusRunning": "运行中",
  "queryInput.title": "开始调研会话",
  "queryInput.queryLabel": "产品创意",
  "queryInput.queryPlaceholder": "描述你想调研的产品创意…例如：面向独立创业者的 AI 驱动 GTM 工具",
  "queryInput.keywordsLabel": "关键词",
  "queryInput.keywordsHint": "（可选，逗号分隔）",
  "queryInput.keywordsPlaceholder": "例如：SaaS, AI, 生产力, 远程工作",
  "queryInput.moreKeywords": "+{count} 更多",
  "queryInput.minChars": "最少 {n} 个字符",
  "queryInput.maxChars": "最多 {n} 个字符",
  "queryInput.maxKeywords": "最多 {n} 个关键词",
  "queryInput.keywordTooLong": "\"{preview}...\" 太长了",
  "queryInput.startingResearch": "正在启动调研…",
  "queryInput.cooldownWait": "请等待 {n} 秒…",
  "queryInput.startButton": "开始调研",
  "queryInput.cancelButton": "取消",
  "queryInput.cancelAriaLabel": "取消调研",
  "queryInput.cancellingButton": "正在取消…",
  "queryInput.cancellingAriaLabel": "正在处理调研取消请求",
  "queryInput.tryExample": "或者试试示例",
  "queryInput.readyToRetry": "可以重新提交了。",
  "dataManager.exportTab": "导出",
  "dataManager.importTab": "导入",
  "dataManager.exportDesc": "下载所有研究数据作为备份文件。",
  "dataManager.optionRuns": "研究记录",
  "dataManager.optionNotes": "笔记和注释",
  "dataManager.optionFolders": "文件夹",
  "dataManager.optionTemplates": "模板",
  "dataManager.preparing": "准备中...",
  "dataManager.downloadBackup": "下载备份",
  "dataManager.estimateSize": "估算大小",
  "dataManager.estimatedSize": "估算大小：{size}",
  "dataManager.importDesc": "从备份文件恢复数据。",
  "dataManager.mergeStrategyLabel": "合并策略：",
  "dataManager.strategyMerge": "合并（新数据优先）",
  "dataManager.strategyOverwrite": "覆盖现有数据",
  "dataManager.strategySkip": "跳过现有数据",
  "dataManager.adminTokenLabel": "管理员令牌（服务端运行恢复需要）",
  "dataManager.tokenSaved": "✓ 令牌已保存在此浏览器",
  "dataManager.clearToken": "清除",
  "dataManager.tokenPlaceholder": "粘贴管理员令牌",
  "dataManager.saveToken": "保存",
  "dataManager.tokenHint": "笔记、文件夹和模板在本地恢复，不需要令牌。只有服务端存储的研究记录需要管理员权限。",
  "dataManager.processing": "处理中...",
  "dataManager.chooseFile": "选择备份文件",
  "dataManager.importComplete": "导入完成",
  "dataManager.colType": "类型",
  "dataManager.colImported": "已导入",
  "dataManager.colSkipped": "已跳过",
  "dataManager.colTotal": "总计",
  "dataManager.typeRuns": "研究记录",
  "dataManager.typeNotes": "笔记",
  "dataManager.typeFolders": "文件夹",
  "dataManager.typeTemplates": "模板",
  "dataManager.issuesCount": "{count} 个问题：{issues}",
  "dataManager.errorInvalidFile": "无效的备份文件：{errors}",
  "dataManager.errorTokenRequired": "导入研究记录需要管理员令牌。请在上方输入管理员令牌以启用服务端恢复。",
  "dataManager.errorTokenRejected": "管理员令牌被拒绝（401）。请清除后重新输入。",
  "dataManager.errorRunImportFailed": "研究记录导入失败：HTTP {status}",
  "report.backLink": "← 研究历史",
  "report.kicker": "LaunchLens 研究工作室 · 证据驱动的市场报告",
  "report.subtitle": "受众感知阅读、引用恢复、当前报告的决策就绪综合。",
  "report.statusCompleted": "已完成",
  "report.statusFailed": "失败",
  "report.statusCancelled": "已取消",
  "report.star": "☆ 收藏",
  "report.unstar": "取消收藏",
  "report.starred": "★ 已收藏",
  "report.rerun": "重新运行",
  "report.saveAsTemplate": "另存为模板",
  "report.share": "分享",
  "report.copyMarkdown": "复制 Markdown",
  "report.compare": "对比",
  "report.export": "导出",
  "report.exportMd": "Markdown",
  "report.exportMdDesc": "带格式的 .md 文件",
  "report.exportPdf": "PDF",
  "report.exportPdfDesc": "打印 / 保存为 PDF",
  "report.exportJson": "JSON",
  "report.exportJsonDesc": "结构化数据",
  "report.exportTxt": "纯文本",
  "report.exportTxtDesc": ".txt 文件",
  "report.exportedToast": "已导出 {format}",
  "report.reportCopied": "报告已复制到剪贴板",
  "report.linkCopied": "链接已复制到剪贴板",
  "report.copyLinkFailed": "复制链接失败",
  "report.shareLinkCopied": "分享链接已复制到剪贴板",
  "report.shareLinkCreated": "分享链接已创建: {url}",
  "report.shareCopied": "分享链接已复制",
  "report.shareFailed": "复制失败",
  "report.shareTitle": "分享研究",
  "report.shareDesc": "为这份研究报告生成公开分享链接。",
  "report.shareGenerating": "生成中...",
  "report.shareGenerateLink": "生成链接",
  "report.shareOrCopyLabel": "或复制当前页面链接：",
  "report.shareCopyLink": "📋 复制链接",
  "report.shareGenerated": "分享链接已生成！",
  "report.shareCopy": "复制",
  "report.templateTitle": "另存为模板",
  "report.templateSaved": "✓ 模板保存成功",
  "report.templateNameLabel": "模板名称",
  "report.outputProfileLabel": "输出配置",
  "report.profileIdea": "创意验证",
  "report.profileIdeaEyebrow": "通俗语言验证",
  "report.profileIdeaDesc": "适合独立创业者，需要答案、风险提示和下一步行动，无需分析师级别的细节。",
  "report.profileFounder": "创始人",
  "report.profileFounderEyebrow": "可执行简报",
  "report.profileFounderDesc": "适合早期团队，需要足够的证据来决策、排优先级并移交给 GTM 执行。",
  "report.profileAnalyst": "分析师",
  "report.profileAnalystEyebrow": "完整证据模式",
  "report.profileAnalystDesc": "适合专业评审，需要评分、引用链、原始证据和所有中间细节。",
  "report.opportunityLabel": "机会",
  "report.riskLabel": "风险",
  "report.evidenceLabel": "证据",
  "report.rationale": "理由：",
  "report.mitigation": "缓解措施：",
  "report.sourcesNoticeFull": "为便于阅读，显示前 {n} 个来源。切换到分析师模式查看完整引用链。",
  "report.sourcesUnit": "个来源",
  "report.sourcesShown": "显示 {n} 个 · 分析师模式查看完整引用链",
  "report.tocTitle": "目录",
  "report.tocExecSummary": "执行摘要",
  "report.tocScores": "评分",
  "report.tocKeyInsights": "关键洞察 ({n})",
  "report.tocOpportunities": "核心机遇",
  "report.tocRisks": "主要风险",
  "report.tocNextStep": "推荐下一步",
  "report.tocSources": "来源 ({n}+)",
  "report.tocResult": "结果",
  "report.tocRawOutput": "原始输出",
  "report.showRawOutput": "显示原始输出",
  "report.hideRawOutput": "隐藏原始输出",
  "report.sourcesNotice": "为便于阅读，仅显示前 N 个来源。切换到分析师模式查看完整引用链。",
  "report.analysisCompanion": "分析伴侣",
  "report.viewSource": "查看来源",
  "report.citedIn": "引用位置：",
  "report.keywordAnalysis": "关键词分析",
  "report.agentsLabel": "智能体：",
  "report.scoresLabel": "评分",
  "report.readingProgress": "已读 {pct}%",
  "report.kbNavHint": "j k 导航 · t 顶部 · b 底部",
  "report.customTemplate": "自定义",
  "report.rerunResearch": "重新运行研究",
  "report.exportReport": "导出报告",
  "report.copyReport": "复制报告",
  "report.backToHistory": "返回历史",
  "report.notFound": "未找到研究运行。它可能已过期或被删除。",
  "report.failedToLoad": "加载失败",
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
  "date.minutesCompact": "{n} 分钟前",
  "date.hoursCompact": "{n} 小时前",
  "date.daysCompact": "{n} 天前",
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
  "queryInput.briefEyebrow": "研究简报",
  "queryInput.modeUnavailable": "该模式暂不可用",
  "researchMode.legend": "研究模式",
  "researchMode.availability.ready": "可运行",
  "researchMode.availability.preview": "预览",
  "researchMode.standard.label": "标准模式",
  "researchMode.standard.description": "聚焦型 5+1 智能体扫描，通过一轮综合验证辅助探索性决策。",
  "researchMode.standard.depthLabel": "聚焦式证据扫描",
  "researchMode.standard.duration": "{min}–{max} 分钟",
  "researchMode.standard.capabilityNotice": "在当前请求绑定的 {seconds} 秒执行窗口内运行。",
  "researchMode.deep.label": "深度研究",
  "researchMode.deep.description": "持久化、证据优先的研究协议，强制检索并依次完成三轮语义审查。",
  "researchMode.deep.depthLabel": "多轮证据审计",
  "researchMode.deep.duration": "目标 {min}–{max} 分钟",
  "researchMode.deep.capabilityNotice": "异步能力保持预览状态，直至持久化状态、真实提供方、鉴权工作器唤醒与独立恢复全部验证；不会启动超过 {seconds} 秒请求窗口的任务。",
  "researchMode.retrieval.optional": "可选",
  "researchMode.retrieval.required": "必需",
  "researchMode.validationPass.one": "{count} 轮验证",
  "researchMode.validationPass.other": "{count} 轮验证",
  "researchMode.requirementsReady": "{ready}/{total} 项控制就绪",
  "researchProtocol.eyebrow": "运行控制",
  "researchProtocol.title": "研究协议",
  "researchProtocol.execution": "执行",
  "researchProtocol.evidence": "证据",
  "researchProtocol.validation": "验证",
  "researchProtocol.analysts": "分析员",
  "researchProtocol.previewOnly": "仅供预览",
  "researchProtocol.ready": "就绪",
  "researchProtocol.asyncRunnerRequired": "需要异步任务运行器",
  "researchProtocol.requestBoundGuard": "请求绑定 · {seconds} 秒上限",
  "researchProtocol.reportedCitation.one": "已报告 {count} 条引用",
  "researchProtocol.reportedCitation.other": "已报告 {count} 条引用",
  "researchProtocol.sourcesCollected.one": "已收集 {count} 个来源",
  "researchProtocol.sourcesCollected.other": "已收集 {count} 个来源",
  "researchProtocol.matchedCitation.one": "{count} 条引用 URL 已匹配",
  "researchProtocol.matchedCitation.other": "{count} 条引用 URL 已匹配",
  "researchProtocol.rejectedCitation.one": "已拒绝 {count} 条引用",
  "researchProtocol.rejectedCitation.other": "已拒绝 {count} 条引用",
  "researchProtocol.urlAllowlistActive": "URL 白名单校验已启用",
  "researchProtocol.urlMembershipOnly": "URL 匹配仅校验名单归属",
  "researchProtocol.urlGroundedAgents": "{count}/{total} 个输出已完成 URL 归源",
  "researchProtocol.claimVerificationPending": "主张与来源内容的一致性仍待验证",
  "researchProtocol.semanticValidationNotRun": "尚未执行主张与来源的语义验证",
  "researchProtocol.citationReferencesResolved": "已解析 {resolved}/{total} 个引用关系",
  "researchProtocol.sourceDomainCoverage": "{sources} 个来源，覆盖 {domains} 个域名",
  "researchProtocol.retrievalUnavailable": "检索暂不可用",
  "researchProtocol.retrievalNotConfigured": "尚未配置检索服务",
  "researchProtocol.retrieval": "{level}检索",
  "researchProtocol.sourceAllowlistRequired": "上线前需配置来源白名单",
  "researchProtocol.citationUrlVerificationPending": "尚未启用引用 URL 验证",
  "researchProtocol.draftCitationConflictReview": "草稿、引用与冲突复核",
  "researchProtocol.schemaCrossAgentSynthesis": "结构校验与跨智能体综合",
  "researchProtocol.analystsComplete": "{completed}/{total} 位分析员已完成",
  "researchProtocol.parallelModel": "5 + 1 并行分析模型",
  "researchProtocol.demoFallback.one": "{count} 个章节使用演示数据回退",
  "researchProtocol.demoFallback.other": "{count} 个章节使用演示数据回退",
  "researchProtocol.specialistsThenSynthesis": "专项分析后进行综合复核",
  "researchProtocol.standardNotice": "标准模式用于探索性研究。界面会展示模型报告的引用，但在完成独立验证前，不应将其视为已核实证据。",
  "researchProtocol.deepReadyNotice": "可恢复的 10–20 分钟深度执行已就绪，将强制检索并依次完成三轮语义审查。",
  "researchProtocol.deepPreviewNotice": "深度研究仍处于预览状态：{ready}/{total} 项生产控制已就绪。",
  "researchProtocol.deepExecutedNotice": "该档案已完成三轮深度研究协议；当前环境能否启动新任务会另行检查。",
  "researchProtocol.nextBlocker": "下一阻塞项：{label}",
  "researchProtocol.deepWorkGraph": "持久化工作图",
  "researchProtocol.deepWorkProgress": "已提交 {completed}/{total} 个工作单元",
  "researchProtocol.deepWorkCurrent": "当前：{work} · 第 {attempt}/{max} 次尝试",
  "researchProtocol.deepWorkComplete": "全部 {total} 个工作单元已提交",
  "researchProtocol.deepWork.specialist": "专项分析 · {agent}",
  "researchProtocol.deepWork.semantic_pass_1": "审查一 · 主张与来源蕴含关系",
  "researchProtocol.deepWork.semantic_pass_2": "审查二 · 独立佐证与冲突",
  "researchProtocol.deepWork.semantic_pass_3": "审查三 · 最终裁决",
  "researchProtocol.deepWork.synthesis": "证据约束综合",
  "researchProtocol.deepWork.finalize": "最终完整性门禁",
  "researchRequirement.explicit_opt_in": "运维显式启用",
  "researchRequirement.durable_state": "持久化状态",
  "researchRequirement.generation_provider": "研究模型",
  "researchRequirement.retrieval_provider": "独立检索",
  "researchRequirement.semantic_reviewer": "语义审查器",
  "researchRequirement.worker_wake": "工作器唤醒",
  "researchRequirement.independent_recovery": "独立恢复调度",
  "workspace.aria.evidenceValidation": "证据与验证状态",
  "workspace.hero.eyebrow": "市场情报工作台",
  "workspace.hero.title": "构建研究档案，而非泛泛总结。",
  "workspace.hero.subtitle": "一次明确决策问题，随后由五位专业分析员调查市场，再由综合评审员校验并形成最终简报。",
  "workspace.newRun.eyebrow": "新建研究任务",
  "workspace.newRun.title": "界定决策范围",
  "workspace.newRun.teamComposition": "5 位专业分析员 + 1 位综合评审员",
  "workspace.startMode": "启动{mode}",
  "workspace.deepResearchPreparing": "深度研究准备中",
  "workspace.suggestions.eyebrow": "基于近期研究",
  "workspace.suggestions.title": "建议的后续研究",
  "workspace.suggestion.followUp": "后续研究",
  "workspace.suggestion.deepDive": "深度挖掘",
  "workspace.suggestion.related": "相关主题",
  "workspace.suggestion.trending": "趋势主题",
  "workspace.controls": "研究控制",
  "workspace.analystsProgress": "{done}/{total} 位分析员",
  "workspace.rerunMode": "以{mode}重新运行",
  "workspace.runStatus.complete": "已完成",
  "workspace.runStatus.cancelled": "已取消",
  "workspace.runStatus.cancelling": "取消中",
  "workspace.runStatus.running": "运行中",
  "workspace.runStatus.error": "错误",
  "workspace.runStatus.idle": "空闲",
  "workspace.stats.eyebrow": "工作台",
  "workspace.stats.title": "研究活动",
  "workspace.stats.allRuns": "全部任务",
  "workspace.stats.thisWeek": "本周",
  "workspace.stats.starred": "已收藏",
  "workspace.stats.templates": "模板",
  "workspace.team.eyebrow": "分析流程",
  "workspace.team.title": "五位专业分析员，一位综合评审员",
  "workspace.team.process": "并行研究 → 最终复核",
  "workspace.saved.title": "已保存的研究档案",
  "workspace.saved.count": "（{count}）",
  "workspace.saved.openAria": "打开已保存的研究档案：{query}",
  "workspace.saved.delete": "删除已保存的研究档案",
  "workspace.saved.deleteAria": "删除已保存的研究档案：{query}",
  "workspace.recent.title": "最近研究",
  "workspace.recent.rerun": "重新运行",
  "workspace.recent.rerunAria": "重新运行研究：{query}",
  "workspace.recent.open": "查看",
  "workspace.recent.openAria": "打开报告：{query}",
  "workspace.recent.remove": "从历史记录移除",
  "workspace.recent.removeAria": "从历史记录移除：{query}",
  "workspace.keywordsMore": "+{count}",
  "workspace.citationCount.one": "{count} 条引用",
  "workspace.citationCount.other": "{count} 条引用",
  "report.sourceCount.one": "{count} 个来源",
  "report.sourceCount.other": "{count} 个来源",
  "report.accessedAt": "访问日期：{date}",
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
  "errors.activeDeepDeleteConflict": "実行中のディープリサーチをキャンセルしてから、ライブセッションを削除してください。",
  "errors.unauthorized": "認証されていません。",
  "errors.cronNotConfigured": "スケジュールタスクのエンドポイントが設定されていません。CRON_SECRET を設定してください。",
  "errors.sessionExpired": "ライブエンジンセッションの有効期限が切れました。完成したレポートは履歴から引き続き閲覧できます。",
  "errors.reportNotCompleted": "このレポートは完了後にエクスポートできます。",
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
  "status.cancelled": "リサーチはキャンセルされました",
  "status.cancelling": "リサーチをキャンセルしています",
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
  "agent.status.stopped": "停止済み",
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
  "report.synthesis.useExportPanel": "Use the Export panel above to copy or send the validation-aware brief. The raw synthesis text is not importable to avoid exporting unverified figures.",
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
  "history.searchPlaceholder": "クエリまたはキーワードで検索...",
  "history.filterAll": "すべて",
  "history.filterCompleted": "完了",
  "history.filterFailed": "失敗",
  "history.filterCancelled": "キャンセル済み",
  "history.sortNewest": "新しい順",
  "history.sortOldest": "古い順",
  "history.sortFastest": "速い順",
  "history.sortSlowest": "遅い順",
  "history.sortQuery": "クエリ順",
  "history.selected": "件選択中",
  "history.selectAll": "すべて選択",
  "history.clearSelection": "選択を終了",
  "history.exportSelected": "Markdown でエクスポート",
  "history.deleteSelected": "削除",
  "history.confirmDelete": "選択した調査を削除しますか？",
  "history.confirmDeleteBody": "選択した {count} 件の実行履歴が完全に削除されます。",
  "history.confirmDeleteLabel": "削除",
  "history.loadFailed": "調査履歴を読み込めませんでした。",
  "history.localFallback": "ローカルに記憶された {count} 件のレポートリンクを表示しています。サーバー履歴の取得に失敗しました：{message}",
  "history.deleteSuccess": "{count} 件の調査実行を削除しました。",
  "history.deleteFailed": "削除に失敗しました。",
  "history.exportSuccessPartial": "{succeeded} 件エクスポートしました；{failed} 件失敗しました。",
  "history.exportSuccess": "{count} 件エクスポートしました。",
  "history.addedToFolder": "{count} 件をフォルダに追加しました。",
  "history.taggedSuccess": "{count} 件にタグを付けました。",
  "history.tagFailed": "タグの追加に失敗しました。",
  "history.badgeStudio": "リサーチスタジオ",
  "history.badgeEvidence": "エビデンスアーカイブ",
  "history.heading": "調査実行、レポート、証跡。",
  "history.subtitle": "完了したレポートの復元、ソースの監査、調査証跡の引き継ぎが、実行を生成した一時的なワーカーに依存せずに行えます。",
  "history.buttonRefresh": "更新",
  "history.linkBack": "スタジオに戻る",
  "history.linkNew": "新しい調査",
  "history.summaryTotal": "保存済み合計",
  "history.summaryCompleted": "完了",
  "history.summaryWithSources": "ソースあり",
  "history.summaryFailed": "失敗",
  "history.summaryCancelled": "キャンセル",
  "history.summaryVisibleNow": "{count} 件表示中",
  "history.summarySuccessRate": "成功率 {rate}%",
  "history.summaryCitationReady": "引用可能なレポート",
  "history.summaryNeedsRetry": "再試行またはレビューが必要",
  "history.summaryStopped": "停止済みまたは実行中",
  "history.labelSearch": "検索",
  "history.buttonClear": "クリア",
  "history.labelStatus": "ステータス",
  "history.labelFocus": "フォーカス",
  "history.starredOnly": "スター付きのみ",
  "history.labelSort": "並び替え",
  "history.loadingSaved": "保存済み調査を読み込み中...",
  "history.resultsCount": "{visible} 件の表示結果{plural}{fromTotal}",
  "history.resultsAfterFilters": "（フィルタ適用後）",
  "history.resultsFromTotal": "（{total} 件の保存済みから）",
  "history.clearFilters": "フィルタをクリア",
  "history.selectReports": "レポートを選択",
  "history.selectedOnPage": "このページで {count} 件選択中",
  "history.selectAllOnPage": "このページのレポートをすべて選択",
  "history.moveToFolder": "フォルダに移動",
  "history.noFolders": "カスタムフォルダはまだありません。",
  "history.addTag": "タグを追加",
  "history.noTags": "タグはまだありません。",
  "history.pagination": "{page} / {totalPages} ページ - {total} 件の保存済み結果",
  "history.previous": "前へ",
  "history.next": "次へ",
  "history.badgeStarred": "スター付き",
  "history.badgeSources": "ソース",
  "history.badgeLocalRecovery": "ローカル回復",
  "history.untitled": "無題の調査",
  "history.providerUnknown": "不明なプロバイダ",
  "history.modelUnknown": "不明なモデル",
  "history.moreTags": "+{count} 個のタグ",
  "history.openReport": "レポートを開く",
  "history.noMatching": "一致するレポートがありません",
  "history.noSavedYet": "保存済みの調査はまだありません",
  "history.noMatchingHint": "フィルタをクリアするか、より広いキーワードで検索してみてください。",
  "history.noSavedHint": "調査タスクを実行すると、完了したレポートがここに表示され、復元、エクスポート、フォローアップレビューができるようになります。",
  "history.startResearch": "調査を開始",
  "history.errorTitle": "履歴を読み込めませんでした",
  "history.tryAgain": "再試行",
  "history.dateNotRecorded": "日時は記録されていません",
  "history.statusRunning": "実行中",
  "queryInput.title": "リサーチセッションを開始",
  "queryInput.queryLabel": "プロダクトアイデア",
  "queryInput.queryPlaceholder": "リサーチしたいプロダクトアイデアを説明してください…例：ソロファウンダー向けAI駆動GTMツール",
  "queryInput.keywordsLabel": "キーワード",
  "queryInput.keywordsHint": "（任意、カンマ区切り）",
  "queryInput.keywordsPlaceholder": "例：SaaS, AI, 生産性, リモートワーク",
  "queryInput.moreKeywords": "+{count} 件その他",
  "queryInput.minChars": "最小 {n} 文字",
  "queryInput.maxChars": "最大 {n} 文字",
  "queryInput.maxKeywords": "最大 {n} 個のキーワード",
  "queryInput.keywordTooLong": "「{preview}...」が長すぎます",
  "queryInput.startingResearch": "リサーチを開始中…",
  "queryInput.cooldownWait": "{n}秒お待ちください…",
  "queryInput.startButton": "リサーチを開始",
  "queryInput.cancelButton": "キャンセル",
  "queryInput.cancelAriaLabel": "リサーチをキャンセル",
  "queryInput.cancellingButton": "キャンセル中…",
  "queryInput.cancellingAriaLabel": "リサーチのキャンセル処理中",
  "queryInput.tryExample": "例を試す",
  "queryInput.readyToRetry": "再試行できます — もう一度送信できます。",
  "dataManager.exportTab": "エクスポート",
  "dataManager.importTab": "インポート",
  "dataManager.exportDesc": "すべてのリサーチデータをバックアップファイルとしてダウンロードします。",
  "dataManager.optionRuns": "リサーチ実行",
  "dataManager.optionNotes": "メモと注釈",
  "dataManager.optionFolders": "フォルダ",
  "dataManager.optionTemplates": "テンプレート",
  "dataManager.preparing": "準備中...",
  "dataManager.downloadBackup": "バックアップをダウンロード",
  "dataManager.estimateSize": "サイズを見積もる",
  "dataManager.estimatedSize": "推定サイズ: {size}",
  "dataManager.importDesc": "バックアップファイルからデータを復元します。",
  "dataManager.mergeStrategyLabel": "マージ方法:",
  "dataManager.strategyMerge": "マージ（新しい方を優先）",
  "dataManager.strategyOverwrite": "既存を上書き",
  "dataManager.strategySkip": "既存をスキップ",
  "dataManager.adminTokenLabel": "管理者トークン（サーバー側実行の復元に必要）",
  "dataManager.tokenSaved": "✓ このブラウザにトークンを保存しました",
  "dataManager.clearToken": "クリア",
  "dataManager.tokenPlaceholder": "管理者スコープのトークンを貼り付け",
  "dataManager.saveToken": "保存",
  "dataManager.tokenHint": "メモ、フォルダ、テンプレートはローカルで復元されるためトークンは不要です。サーバー保存のリサーチ実行のみ管理者スコープが必要です。",
  "dataManager.processing": "処理中...",
  "dataManager.chooseFile": "バックアップファイルを選択",
  "dataManager.importComplete": "インポート完了",
  "dataManager.colType": "種類",
  "dataManager.colImported": "インポート済み",
  "dataManager.colSkipped": "スキップ済み",
  "dataManager.colTotal": "合計",
  "dataManager.typeRuns": "実行",
  "dataManager.typeNotes": "メモ",
  "dataManager.typeFolders": "フォルダ",
  "dataManager.typeTemplates": "テンプレート",
  "dataManager.issuesCount": "{count}件の問題: {issues}",
  "dataManager.errorInvalidFile": "無効なバックアップファイル: {errors}",
  "dataManager.errorTokenRequired": "実行のインポートには管理者トークンが必要です。サーバー側の復元を有効にするには、上のフィールドに管理者トークンを入力してください。",
  "dataManager.errorTokenRejected": "管理者トークンが拒否されました（401）。クリアして再入力してください。",
  "dataManager.errorRunImportFailed": "実行のインポートに失敗: HTTP {status}",
  "report.backLink": "← リサーチ履歴",
  "report.kicker": "LaunchLens Research Studio · エビデンスに基づく市場レポート",
  "report.subtitle": "閲覧者に合わせた可読性、引用復元、現在のレポートの意思決定対応合成。",
  "report.statusCompleted": "完了",
  "report.statusFailed": "失敗",
  "report.statusCancelled": "キャンセル済み",
  "report.star": "☆ スター",
  "report.unstar": "スター解除",
  "report.starred": "★ スター付き",
  "report.rerun": "再実行",
  "report.saveAsTemplate": "テンプレートとして保存",
  "report.share": "共有",
  "report.copyMarkdown": "Markdown をコピー",
  "report.compare": "比較",
  "report.export": "エクスポート",
  "report.exportMd": "Markdown",
  "report.exportMdDesc": "フォーマット付き .md ファイル",
  "report.exportPdf": "PDF",
  "report.exportPdfDesc": "印刷 / PDF として保存",
  "report.exportJson": "JSON",
  "report.exportJsonDesc": "構造化データ",
  "report.exportTxt": "プレーンテキスト",
  "report.exportTxtDesc": ".txt ファイル",
  "report.exportedToast": "{format} をエクスポートしました",
  "report.reportCopied": "レポートをクリップボードにコピーしました",
  "report.linkCopied": "リンクをクリップボードにコピーしました",
  "report.copyLinkFailed": "リンクのコピーに失敗しました",
  "report.shareLinkCopied": "共有リンクをクリップボードにコピーしました",
  "report.shareLinkCreated": "共有リンクが作成されました: {url}",
  "report.shareCopied": "共有リンクをコピーしました",
  "report.shareFailed": "コピーに失敗しました",
  "report.shareTitle": "リサーチを共有",
  "report.shareDesc": "このリサーチレポートの公開共有リンクを生成します。",
  "report.shareGenerating": "生成中...",
  "report.shareGenerateLink": "リンクを生成",
  "report.shareOrCopyLabel": "または現在のページリンクをコピー:",
  "report.shareCopyLink": "📋 リンクをコピー",
  "report.shareGenerated": "共有リンクが生成されました！",
  "report.shareCopy": "コピー",
  "report.templateTitle": "テンプレートとして保存",
  "report.templateSaved": "✓ テンプレートが正常に保存されました",
  "report.templateNameLabel": "テンプレート名",
  "report.outputProfileLabel": "出力プロファイル",
  "report.profileIdea": "アイデア",
  "report.profileIdeaEyebrow": "平易な言語による検証",
  "report.profileIdeaDesc": "アナリスト向けの詳細を除いた、回答、リスク、次のアクションが必要な個人ビルダー向け。",
  "report.profileFounder": "ファウンダー",
  "report.profileFounderEyebrow": "実行対応ブリーフ",
  "report.profileFounderDesc": "GTM 実行に向けて意思決定、優先順位付け、引き継ぎに十分なエビデンスが必要な初期チーム向け。",
  "report.profileAnalyst": "アナリスト",
  "report.profileAnalystEyebrow": "フルエビデンスモード",
  "report.profileAnalystDesc": "スコア、引用トレイル、生のエビデンス、すべての中間詳細が必要な専門レビュアー向け。",
  "report.opportunityLabel": "機会",
  "report.riskLabel": "リスク",
  "report.evidenceLabel": "エビデンス",
  "report.rationale": "根拠:",
  "report.mitigation": "緩和策:",
  "report.sourcesNoticeFull": "可読性のため最初の {n} ソースを表示しています。完全な引用トレイルはアナリストに切り替えてください。",
  "report.sourcesUnit": "ソース",
  "report.sourcesShown": "{n} 件表示 · 完全なトレイルはアナリストで",
  "report.tocTitle": "目次",
  "report.tocExecSummary": "エグゼクティブサマリー",
  "report.tocScores": "スコア",
  "report.tocKeyInsights": "主要な洞察 ({n})",
  "report.tocOpportunities": "主要な機会",
  "report.tocRisks": "主要なリスク",
  "report.tocNextStep": "推奨される次のステップ",
  "report.tocSources": "ソース ({n}+)",
  "report.tocResult": "結果",
  "report.tocRawOutput": "生の出力",
  "report.showRawOutput": "生の出力を表示",
  "report.hideRawOutput": "生の出力を非表示",
  "report.sourcesNotice": "可読性のため最初の N ソースを表示しています。完全な引用トレイルにはアナリストに切り替えてください。",
  "report.analysisCompanion": "分析コンパニオン",
  "report.viewSource": "ソースを表示",
  "report.citedIn": "引用箇所:",
  "report.keywordAnalysis": "キーワード分析",
  "report.agentsLabel": "エージェント:",
  "report.scoresLabel": "スコア",
  "report.readingProgress": "{pct}% 読了",
  "report.kbNavHint": "j k ナビ · t トップ · b ボトム",
  "report.customTemplate": "カスタム",
  "report.rerunResearch": "リサーチを再実行",
  "report.exportReport": "レポートをエクスポート",
  "report.copyReport": "レポートをコピー",
  "report.backToHistory": "履歴に戻る",
  "report.notFound": "リサーチ実行が見つかりません。期限切れまたは削除された可能性があります。",
  "report.failedToLoad": "読み込みに失敗しました",
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
  "date.minutesCompact": "{n}分前",
  "date.hoursCompact": "{n}時間前",
  "date.daysCompact": "{n}日前",
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
  "queryInput.briefEyebrow": "リサーチブリーフ",
  "queryInput.modeUnavailable": "このモードはまだ利用できません",
  "researchMode.legend": "リサーチモード",
  "researchMode.availability.ready": "実行可能",
  "researchMode.availability.preview": "プレビュー",
  "researchMode.standard.label": "標準",
  "researchMode.standard.description": "探索的な意思決定向けに、5+1エージェントで対象を絞って調査し、1回の統合検証を行います。",
  "researchMode.standard.depthLabel": "重点型エビデンススキャン",
  "researchMode.standard.duration": "{min}～{max} 分",
  "researchMode.standard.capabilityNotice": "現在のリクエスト連動型の実行枠（{seconds} 秒以内）で動作します。",
  "researchMode.deep.label": "ディープリサーチ",
  "researchMode.deep.description": "情報取得を必須とし、順序付き 3 段階の意味レビューを行う、永続的なエビデンス優先プロトコルです。",
  "researchMode.deep.depthLabel": "複数段階のエビデンス監査",
  "researchMode.deep.duration": "目標 {min}～{max} 分",
  "researchMode.deep.capabilityNotice": "永続状態、実プロバイダー、認証済みワーカー起動、独立復旧がすべて検証されるまで非同期機能はプレビューのままです。{seconds} 秒のリクエスト枠を超える実行は開始しません。",
  "researchMode.retrieval.optional": "任意",
  "researchMode.retrieval.required": "必須",
  "researchMode.validationPass.one": "検証 {count} 回",
  "researchMode.validationPass.other": "検証 {count} 回",
  "researchMode.requirementsReady": "制御 {ready}/{total} 件が準備完了",
  "researchProtocol.eyebrow": "実行コントロール",
  "researchProtocol.title": "リサーチプロトコル",
  "researchProtocol.execution": "実行",
  "researchProtocol.evidence": "エビデンス",
  "researchProtocol.validation": "検証",
  "researchProtocol.analysts": "アナリスト",
  "researchProtocol.previewOnly": "プレビューのみ",
  "researchProtocol.ready": "準備完了",
  "researchProtocol.asyncRunnerRequired": "非同期ジョブランナーが必要",
  "researchProtocol.requestBoundGuard": "リクエスト連動型 · 上限 {seconds} 秒",
  "researchProtocol.reportedCitation.one": "報告済み引用 {count} 件",
  "researchProtocol.reportedCitation.other": "報告済み引用 {count} 件",
  "researchProtocol.sourcesCollected.one": "{count} 件のソースを収集",
  "researchProtocol.sourcesCollected.other": "{count} 件のソースを収集",
  "researchProtocol.matchedCitation.one": "{count} 件の引用 URL が一致",
  "researchProtocol.matchedCitation.other": "{count} 件の引用 URL が一致",
  "researchProtocol.rejectedCitation.one": "{count} 件の引用を除外",
  "researchProtocol.rejectedCitation.other": "{count} 件の引用を除外",
  "researchProtocol.urlAllowlistActive": "URL 許可リスト照合が有効",
  "researchProtocol.urlMembershipOnly": "URL 照合はリスト所属のみを確認",
  "researchProtocol.urlGroundedAgents": "{count}/{total} 件の出力を URL に紐付け済み",
  "researchProtocol.claimVerificationPending": "主張と情報源内容の一致検証は未完了",
  "researchProtocol.semanticValidationNotRun": "主張と情報源の意味的一致検証は未実施",
  "researchProtocol.citationReferencesResolved": "引用参照 {resolved}/{total} 件を解決",
  "researchProtocol.sourceDomainCoverage": "{domains} ドメインから {sources} 件の情報源",
  "researchProtocol.retrievalUnavailable": "情報取得を利用できません",
  "researchProtocol.retrievalNotConfigured": "情報取得サービスが未設定",
  "researchProtocol.retrieval": "{level}の情報取得",
  "researchProtocol.sourceAllowlistRequired": "公開前に情報源の許可リストが必要",
  "researchProtocol.citationUrlVerificationPending": "引用 URL の検証は未有効化",
  "researchProtocol.draftCitationConflictReview": "草稿・引用・矛盾のレビュー",
  "researchProtocol.schemaCrossAgentSynthesis": "スキーマ検証とエージェント横断の統合",
  "researchProtocol.analystsComplete": "{completed}/{total} 完了",
  "researchProtocol.parallelModel": "5 + 1 並列分析モデル",
  "researchProtocol.demoFallback.one": "{count} セクションでデモデータにフォールバック",
  "researchProtocol.demoFallback.other": "{count} セクションでデモデータにフォールバック",
  "researchProtocol.specialistsThenSynthesis": "専門分析の後に統合レビュー",
  "researchProtocol.standardNotice": "標準モードは探索的な調査向けです。報告された引用は表示されますが、独立検証が完了するまでは検証済みのエビデンスとして扱わないでください。",
  "researchProtocol.deepReadyNotice": "必須の情報取得と順序付き 3 段階の意味レビューを備えた、復旧可能な 10～20 分の実行準備が完了しています。",
  "researchProtocol.deepPreviewNotice": "ディープリサーチはプレビューのままです：本番制御 {ready}/{total} 件が準備完了。",
  "researchProtocol.deepExecutedNotice": "この資料は 3 段階のディープリサーチ手順を完了済みです。新規実行の可否は現在の環境で別途確認されます。",
  "researchProtocol.nextBlocker": "次の阻害要因：{label}",
  "researchProtocol.deepWorkGraph": "永続ワークグラフ",
  "researchProtocol.deepWorkProgress": "作業単位 {completed}/{total} 件をコミット",
  "researchProtocol.deepWorkCurrent": "現在：{work} · 試行 {attempt}/{max}",
  "researchProtocol.deepWorkComplete": "全 {total} 作業単位をコミット済み",
  "researchProtocol.deepWork.specialist": "専門分析 · {agent}",
  "researchProtocol.deepWork.semantic_pass_1": "レビュー 1 · 主張と情報源の含意",
  "researchProtocol.deepWork.semantic_pass_2": "レビュー 2 · 裏付けと矛盾",
  "researchProtocol.deepWork.semantic_pass_3": "レビュー 3 · 裁定",
  "researchProtocol.deepWork.synthesis": "エビデンス制約付き統合",
  "researchProtocol.deepWork.finalize": "最終整合性ゲート",
  "researchRequirement.explicit_opt_in": "運用者による明示的な有効化",
  "researchRequirement.durable_state": "永続状態",
  "researchRequirement.generation_provider": "リサーチモデル",
  "researchRequirement.retrieval_provider": "独立した情報取得",
  "researchRequirement.semantic_reviewer": "意味レビュアー",
  "researchRequirement.worker_wake": "ワーカー起動",
  "researchRequirement.independent_recovery": "独立した復旧スケジュール",
  "workspace.aria.evidenceValidation": "エビデンスと検証の状態",
  "workspace.hero.eyebrow": "市場インテリジェンス・ワークスペース",
  "workspace.hero.title": "汎用的な要約ではなく、意思決定に使えるリサーチ・ドシエを構築する。",
  "workspace.hero.subtitle": "意思決定課題を一度定義すると、5人の専門アナリストが市場を調査し、統合レビュアーが最終ブリーフを検証・整理します。",
  "workspace.newRun.eyebrow": "新規リサーチ",
  "workspace.newRun.title": "意思決定範囲を定義",
  "workspace.newRun.teamComposition": "専門アナリスト 5人 + 統合レビュアー 1人",
  "workspace.startMode": "{mode}を開始",
  "workspace.deepResearchPreparing": "ディープリサーチを準備中",
  "workspace.suggestions.eyebrow": "最近の作業に基づく提案",
  "workspace.suggestions.title": "推奨されるフォローアップ",
  "workspace.suggestion.followUp": "フォローアップ",
  "workspace.suggestion.deepDive": "深掘り",
  "workspace.suggestion.related": "関連テーマ",
  "workspace.suggestion.trending": "トレンド",
  "workspace.controls": "リサーチコントロール",
  "workspace.analystsProgress": "アナリスト {done}/{total} 人",
  "workspace.rerunMode": "{mode}で再実行",
  "workspace.runStatus.complete": "完了",
  "workspace.runStatus.cancelled": "キャンセル済み",
  "workspace.runStatus.cancelling": "キャンセル中",
  "workspace.runStatus.running": "実行中",
  "workspace.runStatus.error": "エラー",
  "workspace.runStatus.idle": "待機中",
  "workspace.stats.eyebrow": "ワークスペース",
  "workspace.stats.title": "アクティビティ",
  "workspace.stats.allRuns": "全実行",
  "workspace.stats.thisWeek": "今週",
  "workspace.stats.starred": "お気に入り",
  "workspace.stats.templates": "テンプレート",
  "workspace.team.eyebrow": "分析モデル",
  "workspace.team.title": "5人の専門アナリストと1人の統合レビュアー",
  "workspace.team.process": "並列リサーチ → 最終レビュー",
  "workspace.saved.title": "保存済みドシエ",
  "workspace.saved.count": "（{count}）",
  "workspace.saved.openAria": "保存済みドシエを開く：{query}",
  "workspace.saved.delete": "保存済みドシエを削除",
  "workspace.saved.deleteAria": "保存済みドシエを削除：{query}",
  "workspace.recent.title": "最近のリサーチ",
  "workspace.recent.rerun": "再実行",
  "workspace.recent.rerunAria": "リサーチを再実行：{query}",
  "workspace.recent.open": "開く",
  "workspace.recent.openAria": "レポートを開く：{query}",
  "workspace.recent.remove": "履歴から削除",
  "workspace.recent.removeAria": "履歴から削除：{query}",
  "workspace.keywordsMore": "+{count}",
  "workspace.citationCount.one": "引用 {count} 件",
  "workspace.citationCount.other": "引用 {count} 件",
  "report.sourceCount.one": "{count} 件のソース",
  "report.sourceCount.other": "{count} 件のソース",
  "report.accessedAt": "アクセス日：{date}",
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
  "agent.status.stopped": "중지됨",
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
  "date.minutesCompact": "{n}분 전",
  "date.hoursCompact": "{n}시간 전",
  "date.daysCompact": "{n}일 전",
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
  "errors.activeDeepDeleteConflict": "실행 중인 심층 리서치를 취소한 후 라이브 세션을 삭제하세요.",
  "errors.unauthorized": "인증되지 않았습니다.",
  "errors.cronNotConfigured": "예약 작업 엔드포인트가 구성되지 않았습니다. CRON_SECRET을 설정하세요.",
  "errors.sessionExpired": "실시간 엔진 세션이 만료되었습니다. 완료된 리포트는 기록에서 계속 확인할 수 있습니다.",
  "errors.reportNotCompleted": "리서치가 완료된 후에만 이 리포트를 내보낼 수 있습니다.",
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
  "history.title": "리서치 기록",
  "history.empty": "리서치가 없습니다",
  "history.emptyDesc": "첫 리서치를 시작하면 여기에 표시됩니다",
  "history.searchPlaceholder": "쿼리 또는 키워드 검색...",
  "history.filterAll": "전체",
  "history.filterCompleted": "완료됨",
  "history.filterFailed": "실패함",
  "history.filterCancelled": "취소됨",
  "history.sortNewest": "최신순",
  "history.sortOldest": "오래된순",
  "history.sortFastest": "빠른순",
  "history.sortSlowest": "느린순",
  "history.sortQuery": "쿼리 A-Z",
  "history.selected": "개 선택됨",
  "history.selectAll": "전체 선택",
  "history.clearSelection": "선택 종료",
  "history.exportSelected": "Markdown으로 내보내기",
  "history.deleteSelected": "삭제",
  "history.confirmDelete": "선택한 리서치를 삭제하시겠습니까?",
  "history.confirmDeleteBody": "선택한 {count}개의 실행 기록이 영구적으로 삭제됩니다.",
  "history.confirmDeleteLabel": "삭제",
  "history.loadFailed": "리서치 기록을 불러올 수 없습니다.",
  "history.localFallback": "로컬에 저장된 {count}개의 보고서 링크를 표시합니다. 서버 기록 로드 실패: {message}",
  "history.deleteSuccess": "{count}개의 리서치 실행을 삭제했습니다.",
  "history.deleteFailed": "삭제 실패.",
  "history.exportSuccessPartial": "{succeeded}개 내보냄; {failed}개 실패.",
  "history.exportSuccess": "{count}개를 내보냈습니다.",
  "history.addedToFolder": "{count}개를 폴더에 추가했습니다.",
  "history.taggedSuccess": "{count}개에 태그를 지정했습니다.",
  "history.tagFailed": "태그 추가 실패.",
  "history.badgeStudio": "리서치 스튜디오",
  "history.badgeEvidence": "증거 아카이브",
  "history.heading": "리서치 실행, 보고서, 증거 추적.",
  "history.subtitle": "실행을 생성한 임시 워커에 의존하지 않고 완료된 보고서 복구, 소스 감사, 리서치 증거 인계가 가능합니다.",
  "history.buttonRefresh": "새로고침",
  "history.linkBack": "스튜디오로 돌아가기",
  "history.linkNew": "새 리서치",
  "history.summaryTotal": "총 저장됨",
  "history.summaryCompleted": "완료",
  "history.summaryWithSources": "소스 있음",
  "history.summaryFailed": "실패",
  "history.summaryCancelled": "취소",
  "history.summaryVisibleNow": "{count}개 표시 중",
  "history.summarySuccessRate": "성공률 {rate}%",
  "history.summaryCitationReady": "인용 가능한 보고서",
  "history.summaryNeedsRetry": "재시도 또는 검토 필요",
  "history.summaryStopped": "중지됨 또는 실행 중",
  "history.labelSearch": "검색",
  "history.buttonClear": "지우기",
  "history.labelStatus": "상태",
  "history.labelFocus": "포커스",
  "history.starredOnly": "즐겨찾기만",
  "history.labelSort": "정렬",
  "history.loadingSaved": "저장된 리서치 불러오는 중...",
  "history.resultsCount": "{visible}개 표시 결과{plural}{fromTotal}",
  "history.resultsAfterFilters": " (필터 적용 후)",
  "history.resultsFromTotal": " (저장된 {total}개 중)",
  "history.clearFilters": "필터 지우기",
  "history.selectReports": "보고서 선택",
  "history.selectedOnPage": "이 페이지에서 {count}개 선택됨",
  "history.selectAllOnPage": "이 페이지의 보고서 모두 선택",
  "history.moveToFolder": "폴더로 이동",
  "history.noFolders": "사용자 지정 폴더가 아직 없습니다.",
  "history.addTag": "태그 추가",
  "history.noTags": "태그가 아직 없습니다.",
  "history.pagination": "{page} / {totalPages} 페이지 - 저장된 결과 {total}개",
  "history.previous": "이전",
  "history.next": "다음",
  "history.badgeStarred": "즐겨찾기",
  "history.badgeSources": "소스",
  "history.badgeLocalRecovery": "로컬 복구",
  "history.untitled": "제목 없는 리서치",
  "history.providerUnknown": "알 수 없는 제공자",
  "history.modelUnknown": "알 수 없는 모델",
  "history.moreTags": "+{count}개의 태그",
  "history.openReport": "보고서 열기",
  "history.noMatching": "일치하는 보고서 없음",
  "history.noSavedYet": "저장된 리서치가 아직 없습니다",
  "history.noMatchingHint": "필터를 지우거나 더 넓은 구문으로 검색해 보세요.",
  "history.noSavedHint": "리서치 태스크를 실행하면 완료된 보고서가 여기에 표시되어 복구, 내보내기, 후속 검토를 할 수 있습니다.",
  "history.startResearch": "리서치 시작",
  "history.errorTitle": "기록을 불러올 수 없습니다",
  "history.tryAgain": "다시 시도",
  "history.dateNotRecorded": "날짜가 기록되지 않음",
  "history.statusRunning": "실행 중",
  "queryInput.title": "리서치 세션 시작",
  "queryInput.queryLabel": "제품 아이디어",
  "queryInput.queryPlaceholder": "리서치하고 싶은 제품 아이디어를 설명하세요… 예: 1인 창업자를 위한 AI 기반 GTM 도구",
  "queryInput.keywordsLabel": "키워드",
  "queryInput.keywordsHint": "(선택 사항, 쉼표로 구분)",
  "queryInput.keywordsPlaceholder": "예: SaaS, AI, 생산성, 원격근무",
  "queryInput.moreKeywords": "+{count}개 더보기",
  "queryInput.minChars": "최소 {n}자",
  "queryInput.maxChars": "최대 {n}자",
  "queryInput.maxKeywords": "최대 {n}개의 키워드",
  "queryInput.keywordTooLong": "\"{preview}...\"가 너무 깁니다",
  "queryInput.startingResearch": "리서치 시작 중…",
  "queryInput.cooldownWait": "{n}초 기다려 주세요…",
  "queryInput.startButton": "리서치 시작",
  "queryInput.cancelButton": "취소",
  "queryInput.cancelAriaLabel": "리서치 취소",
  "queryInput.cancellingButton": "취소 중…",
  "queryInput.cancellingAriaLabel": "리서치 취소 처리 중",
  "queryInput.tryExample": "예시 사용해 보기",
  "queryInput.readyToRetry": "다시 시도할 준비가 되었습니다 — 다시 제출할 수 있습니다.",
  "dataManager.exportTab": "내보내기",
  "dataManager.importTab": "가져오기",
  "dataManager.exportDesc": "모든 리서치 데이터를 백업 파일로 다운로드합니다.",
  "dataManager.optionRuns": "리서치 실행",
  "dataManager.optionNotes": "메모 및 주석",
  "dataManager.optionFolders": "폴더",
  "dataManager.optionTemplates": "템플릿",
  "dataManager.preparing": "준비 중...",
  "dataManager.downloadBackup": "백업 다운로드",
  "dataManager.estimateSize": "크기 예측",
  "dataManager.estimatedSize": "예상 크기: {size}",
  "dataManager.importDesc": "백업 파일에서 데이터를 복원합니다.",
  "dataManager.mergeStrategyLabel": "병합 전략:",
  "dataManager.strategyMerge": "병합 (최신 우선)",
  "dataManager.strategyOverwrite": "기존 덮어쓰기",
  "dataManager.strategySkip": "기존 건너뛰기",
  "dataManager.adminTokenLabel": "관리자 토큰 (서버 측 실행 복원에 필요)",
  "dataManager.tokenSaved": "✓ 이 브라우저에 토큰이 저장됨",
  "dataManager.clearToken": "지우기",
  "dataManager.tokenPlaceholder": "관리자 범위 토큰을 붙여넣기",
  "dataManager.saveToken": "저장",
  "dataManager.tokenHint": "메모, 폴더, 템플릿은 로컬에서 복원되므로 토큰이 필요하지 않습니다. 서버에 저장된 리서치 실행만 관리자 범위가 필요합니다.",
  "dataManager.processing": "처리 중...",
  "dataManager.chooseFile": "백업 파일 선택",
  "dataManager.importComplete": "가져오기 완료",
  "dataManager.colType": "유형",
  "dataManager.colImported": "가져옴",
  "dataManager.colSkipped": "건너뜀",
  "dataManager.colTotal": "합계",
  "dataManager.typeRuns": "실행",
  "dataManager.typeNotes": "메모",
  "dataManager.typeFolders": "폴더",
  "dataManager.typeTemplates": "템플릿",
  "dataManager.issuesCount": "{count}개 문제: {issues}",
  "dataManager.errorInvalidFile": "잘못된 백업 파일: {errors}",
  "dataManager.errorTokenRequired": "실행 가져오기에는 관리자 토큰이 필요합니다. 서버 측 복원을 활성화하려면 위 필드에 관리자 토큰을 입력하세요.",
  "dataManager.errorTokenRejected": "관리자 토큰이 거부되었습니다 (401). 지우고 다시 입력하세요.",
  "dataManager.errorRunImportFailed": "실행 가져오기 실패: HTTP {status}",
  "report.backLink": "← 리서치 기록",
  "report.kicker": "LaunchLens Research Studio · 증거 기반 시장 보고서",
  "report.subtitle": "독자 맞춤 가독성, 인용 복구, 현재 보고서의 의사결정 지원 종합.",
  "report.statusCompleted": "완료됨",
  "report.statusFailed": "실패함",
  "report.statusCancelled": "취소됨",
  "report.star": "☆ 별표",
  "report.unstar": "별표 해제",
  "report.starred": "★ 별표됨",
  "report.rerun": "다시 실행",
  "report.saveAsTemplate": "템플릿으로 저장",
  "report.share": "공유",
  "report.copyMarkdown": "Markdown 복사",
  "report.compare": "비교",
  "report.export": "내보내기",
  "report.exportMd": "Markdown",
  "report.exportMdDesc": "서식이 적용된 .md 파일",
  "report.exportPdf": "PDF",
  "report.exportPdfDesc": "인쇄 / PDF로 저장",
  "report.exportJson": "JSON",
  "report.exportJsonDesc": "구조화된 데이터",
  "report.exportTxt": "일반 텍스트",
  "report.exportTxtDesc": ".txt 파일",
  "report.exportedToast": "{format} 내보냄",
  "report.reportCopied": "보고서가 클립보드에 복사됨",
  "report.linkCopied": "링크가 클립보드에 복사됨",
  "report.copyLinkFailed": "링크 복사 실패",
  "report.shareLinkCopied": "공유 링크가 클립보드에 복사됨",
  "report.shareLinkCreated": "공유 링크 생성됨: {url}",
  "report.shareCopied": "공유 링크 복사됨",
  "report.shareFailed": "복사 실패",
  "report.shareTitle": "리서치 공유",
  "report.shareDesc": "이 리서치 보고서에 대한 공개 공유 링크를 생성합니다.",
  "report.shareGenerating": "생성 중...",
  "report.shareGenerateLink": "링크 생성",
  "report.shareOrCopyLabel": "또는 현재 페이지 링크 복사:",
  "report.shareCopyLink": "📋 링크 복사",
  "report.shareGenerated": "공유 링크가 생성되었습니다!",
  "report.shareCopy": "복사",
  "report.templateTitle": "템플릿으로 저장",
  "report.templateSaved": "✓ 템플릿이 성공적으로 저장됨",
  "report.templateNameLabel": "템플릿 이름",
  "report.outputProfileLabel": "출력 프로필",
  "report.profileIdea": "아이디어",
  "report.profileIdeaEyebrow": "평이한 언어 검증",
  "report.profileIdeaDesc": "애널리스트 수준의 디테일 없이 답변, 위험, 다음 조치가 필요한 개인 빌더용.",
  "report.profileFounder": "창업자",
  "report.profileFounderEyebrow": "실행 준비 브리프",
  "report.profileFounderDesc": "의사결정, 우선순위 지정, GTM 실행 인계에 충분한 증거가 필요한 초기 팀용.",
  "report.profileAnalyst": "애널리스트",
  "report.profileAnalystEyebrow": "전체 증거 모드",
  "report.profileAnalystDesc": "점수, 인용 추적, 원시 증거, 모든 중간 상세 정보가 필요한 전문 검토자용.",
  "report.opportunityLabel": "기회",
  "report.riskLabel": "위험",
  "report.evidenceLabel": "증거",
  "report.rationale": "근거:",
  "report.mitigation": "완화 방안:",
  "report.sourcesNoticeFull": "가독성을 위해 처음 {n}개 출처를 표시합니다. 전체 인용 추적을 보려면 애널리스트로 전환하세요.",
  "report.sourcesUnit": "개 출처",
  "report.sourcesShown": "{n}개 표시 · 전체 추적은 애널리스트에서",
  "report.tocTitle": "목차",
  "report.tocExecSummary": "요약",
  "report.tocScores": "점수",
  "report.tocKeyInsights": "주요 통찰 ({n})",
  "report.tocOpportunities": "주요 기회",
  "report.tocRisks": "주요 위험",
  "report.tocNextStep": "권장 다음 단계",
  "report.tocSources": "출처 ({n}+)",
  "report.tocResult": "결과",
  "report.tocRawOutput": "원시 출력",
  "report.showRawOutput": "원시 출력 표시",
  "report.hideRawOutput": "원시 출력 숨기기",
  "report.sourcesNotice": "가독성을 위해 처음 N개 출처를 표시합니다. 전체 인용 추적을 보려면 애널리스트로 전환하세요.",
  "report.analysisCompanion": "분석 도우미",
  "report.viewSource": "출처 보기",
  "report.citedIn": "인용 위치:",
  "report.keywordAnalysis": "키워드 분석",
  "report.agentsLabel": "에이전트:",
  "report.scoresLabel": "점수",
  "report.readingProgress": "{pct}% 읽음",
  "report.kbNavHint": "j k 탐색 · t 맨위 · b 맨아래",
  "report.customTemplate": "사용자 지정",
  "report.rerunResearch": "리서치 다시 실행",
  "report.exportReport": "보고서 내보내기",
  "report.copyReport": "보고서 복사",
  "report.backToHistory": "기록으로 돌아가기",
  "report.notFound": "리서치 실행을 찾을 수 없습니다. 만료되었거나 삭제되었을 수 있습니다.",
  "report.failedToLoad": "불러오기 실패",
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
  "report.synthesis.useExportPanel": "Use the Export panel above to copy or send the validation-aware brief. The raw synthesis text is not importable to avoid exporting unverified figures.",
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
  "status.cancelled": "리서치 취소됨",
  "status.cancelling": "리서치 취소 중",
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
  "queryInput.briefEyebrow": "리서치 브리프",
  "queryInput.modeUnavailable": "아직 사용할 수 없는 모드입니다",
  "researchMode.legend": "리서치 모드",
  "researchMode.availability.ready": "실행 가능",
  "researchMode.availability.preview": "미리보기",
  "researchMode.standard.label": "표준",
  "researchMode.standard.description": "탐색적 의사결정을 위한 집중형 5+1 에이전트 조사와 한 차례의 종합 검증입니다.",
  "researchMode.standard.depthLabel": "집중형 증거 조사",
  "researchMode.standard.duration": "{min}~{max}분",
  "researchMode.standard.capabilityNotice": "현재 요청 연동형 {seconds}초 실행 범위 안에서 동작합니다.",
  "researchMode.deep.label": "심층 리서치",
  "researchMode.deep.description": "검색을 필수로 수행하고 순차적인 3단계 의미 검토를 거치는 영구 증거 우선 프로토콜입니다.",
  "researchMode.deep.depthLabel": "다단계 증거 감사",
  "researchMode.deep.duration": "목표 {min}~{max}분",
  "researchMode.deep.capabilityNotice": "영구 상태, 실제 제공자, 인증된 워커 호출, 독립 복구가 모두 검증될 때까지 비동기 기능은 미리보기로 유지되며 {seconds}초 요청 범위를 넘는 실행은 시작하지 않습니다.",
  "researchMode.retrieval.optional": "선택",
  "researchMode.retrieval.required": "필수",
  "researchMode.validationPass.one": "{count}회 검증",
  "researchMode.validationPass.other": "{count}회 검증",
  "researchMode.requirementsReady": "제어 {ready}/{total}개 준비",
  "researchProtocol.eyebrow": "실행 제어",
  "researchProtocol.title": "리서치 프로토콜",
  "researchProtocol.execution": "실행",
  "researchProtocol.evidence": "증거",
  "researchProtocol.validation": "검증",
  "researchProtocol.analysts": "분석가",
  "researchProtocol.previewOnly": "미리보기 전용",
  "researchProtocol.ready": "준비됨",
  "researchProtocol.asyncRunnerRequired": "비동기 작업 실행기 필요",
  "researchProtocol.requestBoundGuard": "요청 연동형 · {seconds}초 제한",
  "researchProtocol.reportedCitation.one": "보고된 인용 {count}건",
  "researchProtocol.reportedCitation.other": "보고된 인용 {count}건",
  "researchProtocol.sourcesCollected.one": "{count}개 출처 수집",
  "researchProtocol.sourcesCollected.other": "{count}개 출처 수집",
  "researchProtocol.matchedCitation.one": "{count}개 인용 URL 일치",
  "researchProtocol.matchedCitation.other": "{count}개 인용 URL 일치",
  "researchProtocol.rejectedCitation.one": "{count}개 인용 제외",
  "researchProtocol.rejectedCitation.other": "{count}개 인용 제외",
  "researchProtocol.urlAllowlistActive": "URL 허용 목록 대조 활성화",
  "researchProtocol.urlMembershipOnly": "URL 일치는 목록 포함 여부만 확인합니다",
  "researchProtocol.urlGroundedAgents": "{count}/{total}개 결과에 URL 근거 연결",
  "researchProtocol.claimVerificationPending": "주장과 출처 내용의 일치 검증은 아직 필요합니다",
  "researchProtocol.semanticValidationNotRun": "주장과 출처의 의미 일치 검증은 실행되지 않았습니다",
  "researchProtocol.citationReferencesResolved": "인용 참조 {resolved}/{total}개 해결",
  "researchProtocol.sourceDomainCoverage": "{domains}개 도메인에서 {sources}개 출처",
  "researchProtocol.retrievalUnavailable": "검색을 사용할 수 없음",
  "researchProtocol.retrievalNotConfigured": "검색 서비스가 설정되지 않음",
  "researchProtocol.retrieval": "{level} 검색",
  "researchProtocol.sourceAllowlistRequired": "출시 전 출처 허용 목록 필요",
  "researchProtocol.citationUrlVerificationPending": "인용 URL 검증이 아직 활성화되지 않음",
  "researchProtocol.draftCitationConflictReview": "초안·인용·상충 내용 검토",
  "researchProtocol.schemaCrossAgentSynthesis": "스키마 검증 및 에이전트 간 종합",
  "researchProtocol.analystsComplete": "{completed}/{total} 완료",
  "researchProtocol.parallelModel": "5 + 1 병렬 분석 모델",
  "researchProtocol.demoFallback.one": "{count}개 섹션에서 데모 데이터로 대체",
  "researchProtocol.demoFallback.other": "{count}개 섹션에서 데모 데이터로 대체",
  "researchProtocol.specialistsThenSynthesis": "전문 분석 후 종합 검토",
  "researchProtocol.standardNotice": "표준 모드는 탐색적 조사에 적합합니다. 보고된 인용을 확인할 수 있지만, 독립 검증이 끝나기 전에는 검증된 증거로 간주하면 안 됩니다.",
  "researchProtocol.deepReadyNotice": "필수 검색과 순차적인 3단계 의미 검토를 갖춘 복구 가능한 10~20분 실행이 준비되었습니다.",
  "researchProtocol.deepPreviewNotice": "심층 리서치는 아직 미리보기 상태입니다. 프로덕션 제어 {ready}/{total}개가 준비되었습니다.",
  "researchProtocol.deepExecutedNotice": "이 자료는 3단계 심층 리서치 프로토콜을 완료했습니다. 새 실행 가능 여부는 현재 환경에서 별도로 확인됩니다.",
  "researchProtocol.nextBlocker": "다음 차단 항목: {label}",
  "researchProtocol.deepWorkGraph": "영구 작업 그래프",
  "researchProtocol.deepWorkProgress": "작업 단위 {completed}/{total}개 커밋",
  "researchProtocol.deepWorkCurrent": "현재: {work} · 시도 {attempt}/{max}",
  "researchProtocol.deepWorkComplete": "작업 단위 {total}개 모두 커밋됨",
  "researchProtocol.deepWork.specialist": "전문 분석 · {agent}",
  "researchProtocol.deepWork.semantic_pass_1": "검토 1 · 주장-출처 함의",
  "researchProtocol.deepWork.semantic_pass_2": "검토 2 · 독립 확인 및 충돌",
  "researchProtocol.deepWork.semantic_pass_3": "검토 3 · 판정",
  "researchProtocol.deepWork.synthesis": "증거 제약 종합",
  "researchProtocol.deepWork.finalize": "최종 무결성 게이트",
  "researchRequirement.explicit_opt_in": "운영자 명시적 활성화",
  "researchRequirement.durable_state": "영구 상태",
  "researchRequirement.generation_provider": "리서치 모델",
  "researchRequirement.retrieval_provider": "독립 검색",
  "researchRequirement.semantic_reviewer": "의미 검토자",
  "researchRequirement.worker_wake": "워커 호출",
  "researchRequirement.independent_recovery": "독립 복구 일정",
  "workspace.aria.evidenceValidation": "증거 및 검증 상태",
  "workspace.hero.eyebrow": "시장 인텔리전스 워크스페이스",
  "workspace.hero.title": "일반적인 요약이 아닌 의사결정용 리서치 자료를 구축하세요.",
  "workspace.hero.subtitle": "의사결정 과제를 한 번 정의하면 다섯 명의 전문 분석가가 시장을 조사하고, 종합 검토자가 최종 브리프를 검증하고 정리합니다.",
  "workspace.newRun.eyebrow": "새 리서치 실행",
  "workspace.newRun.title": "의사결정 범위 설정",
  "workspace.newRun.teamComposition": "전문 분석가 5명 + 종합 검토자 1명",
  "workspace.startMode": "{mode} 시작",
  "workspace.deepResearchPreparing": "심층 리서치 준비 중",
  "workspace.suggestions.eyebrow": "최근 작업을 바탕으로 추천",
  "workspace.suggestions.title": "추천 후속 조사",
  "workspace.suggestion.followUp": "후속 조사",
  "workspace.suggestion.deepDive": "심층 분석",
  "workspace.suggestion.related": "관련 주제",
  "workspace.suggestion.trending": "트렌드",
  "workspace.controls": "리서치 제어",
  "workspace.analystsProgress": "분석가 {done}/{total}명",
  "workspace.rerunMode": "{mode}로 다시 실행",
  "workspace.runStatus.complete": "완료",
  "workspace.runStatus.cancelled": "취소됨",
  "workspace.runStatus.cancelling": "취소 중",
  "workspace.runStatus.running": "실행 중",
  "workspace.runStatus.error": "오류",
  "workspace.runStatus.idle": "대기 중",
  "workspace.stats.eyebrow": "워크스페이스",
  "workspace.stats.title": "활동",
  "workspace.stats.allRuns": "전체 실행",
  "workspace.stats.thisWeek": "이번 주",
  "workspace.stats.starred": "즐겨찾기",
  "workspace.stats.templates": "템플릿",
  "workspace.team.eyebrow": "분석 모델",
  "workspace.team.title": "전문 분석가 5명과 종합 검토자 1명",
  "workspace.team.process": "병렬 조사 → 최종 검토",
  "workspace.saved.title": "저장된 리서치 자료",
  "workspace.saved.count": "({count})",
  "workspace.saved.openAria": "저장된 리서치 자료 열기: {query}",
  "workspace.saved.delete": "저장된 리서치 자료 삭제",
  "workspace.saved.deleteAria": "저장된 리서치 자료 삭제: {query}",
  "workspace.recent.title": "최근 리서치",
  "workspace.recent.rerun": "다시 실행",
  "workspace.recent.rerunAria": "리서치 다시 실행: {query}",
  "workspace.recent.open": "열기",
  "workspace.recent.openAria": "보고서 열기: {query}",
  "workspace.recent.remove": "기록에서 삭제",
  "workspace.recent.removeAria": "기록에서 삭제: {query}",
  "workspace.keywordsMore": "+{count}",
  "workspace.citationCount.one": "인용 {count}건",
  "workspace.citationCount.other": "인용 {count}건",
  "report.sourceCount.one": "{count}개 출처",
  "report.sourceCount.other": "{count}개 출처",
  "report.accessedAt": "접근일: {date}",
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
