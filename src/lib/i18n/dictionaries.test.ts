import { describe, it, expect } from "vitest";
import {
  DICTIONARIES,
  SUPPORTED_LOCALES,
  translate,
  DEFAULT_LOCALE,
  type DictionaryKey,
} from "./dictionaries";

const WORKBENCH_KEYS = [
  "queryInput.briefEyebrow",
  "queryInput.modeUnavailable",
  "queryInput.cancellingButton",
  "queryInput.cancellingAriaLabel",
  "status.cancelled",
  "status.cancelling",
  "researchMode.legend",
  "researchMode.availability.ready",
  "researchMode.availability.preview",
  "researchMode.standard.label",
  "researchMode.standard.description",
  "researchMode.standard.depthLabel",
  "researchMode.standard.duration",
  "researchMode.standard.capabilityNotice",
  "researchMode.deep.label",
  "researchMode.deep.description",
  "researchMode.deep.depthLabel",
  "researchMode.deep.duration",
  "researchMode.deep.capabilityNotice",
  "researchMode.retrieval.optional",
  "researchMode.retrieval.required",
  "researchMode.validationPass.one",
  "researchMode.validationPass.other",
  "researchProtocol.eyebrow",
  "researchProtocol.title",
  "researchProtocol.execution",
  "researchProtocol.evidence",
  "researchProtocol.validation",
  "researchProtocol.analysts",
  "researchProtocol.previewOnly",
  "researchProtocol.ready",
  "researchProtocol.asyncRunnerRequired",
  "researchProtocol.requestBoundGuard",
  "researchProtocol.reportedCitation.one",
  "researchProtocol.reportedCitation.other",
  "researchProtocol.retrieval",
  "researchProtocol.sourceAllowlistRequired",
  "researchProtocol.citationUrlVerificationPending",
  "researchProtocol.draftCitationConflictReview",
  "researchProtocol.schemaCrossAgentSynthesis",
  "researchProtocol.analystsComplete",
  "researchProtocol.parallelModel",
  "researchProtocol.demoFallback.one",
  "researchProtocol.demoFallback.other",
  "researchProtocol.specialistsThenSynthesis",
  "researchProtocol.standardNotice",
  "workspace.aria.evidenceValidation",
  "workspace.hero.eyebrow",
  "workspace.hero.title",
  "workspace.hero.subtitle",
  "workspace.newRun.eyebrow",
  "workspace.newRun.title",
  "workspace.newRun.teamComposition",
  "workspace.startMode",
  "workspace.deepResearchPreparing",
  "workspace.suggestions.eyebrow",
  "workspace.suggestions.title",
  "workspace.suggestion.followUp",
  "workspace.suggestion.deepDive",
  "workspace.suggestion.related",
  "workspace.suggestion.trending",
  "workspace.controls",
  "workspace.analystsProgress",
  "workspace.rerunMode",
  "workspace.runStatus.complete",
  "workspace.runStatus.cancelled",
  "workspace.runStatus.cancelling",
  "workspace.runStatus.running",
  "workspace.runStatus.error",
  "workspace.runStatus.idle",
  "workspace.stats.eyebrow",
  "workspace.stats.title",
  "workspace.stats.allRuns",
  "workspace.stats.thisWeek",
  "workspace.stats.starred",
  "workspace.stats.templates",
  "workspace.team.eyebrow",
  "workspace.team.title",
  "workspace.team.process",
  "workspace.saved.title",
  "workspace.saved.count",
  "workspace.saved.openAria",
  "workspace.saved.delete",
  "workspace.saved.deleteAria",
  "workspace.recent.title",
  "workspace.recent.rerun",
  "workspace.recent.rerunAria",
  "workspace.recent.open",
  "workspace.recent.openAria",
  "workspace.recent.remove",
  "workspace.recent.removeAria",
  "workspace.keywordsMore",
  "workspace.citationCount.one",
  "workspace.citationCount.other",
] as const satisfies readonly DictionaryKey[];

function placeholders(value: string): string[] {
  return Array.from(value.matchAll(/\{\s*([\w]+)\s*\}/g), (match) => match[1]).sort();
}

describe("i18n dictionaries", () => {
  it("default locale is English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });
  it("all locales have the same key set", () => {
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    for (const l of SUPPORTED_LOCALES) {
      const keys = Object.keys(DICTIONARIES[l]).sort();
      expect(keys).toEqual(enKeys);
    }
  });
  it("no empty translation strings", () => {
    for (const l of SUPPORTED_LOCALES) {
      for (const [k, v] of Object.entries(DICTIONARIES[l])) {
        expect(v && v.length > 0, l + ":" + k).toBe(true);
      }
    }
  });
  it("translate returns the requested locale", () => {
    expect(translate("zh-CN", "hero.title")).toContain("市场");
    expect(translate("ja", "hero.title")).toContain("市場");
    expect(translate("en", "hero.title")).toContain("Research");
  });
  it("translate falls back to English for unknown keys via fallback param", () => {
    expect(translate("zh-CN", "missing.key" as never, "fallback")).toBe("fallback");
  });
  it("ships every workbench key in all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of WORKBENCH_KEYS) {
        expect(DICTIONARIES[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });
  it("keeps workbench interpolation placeholders identical across locales", () => {
    for (const key of WORKBENCH_KEYS) {
      const expected = placeholders(DICTIONARIES.en[key]);
      for (const locale of SUPPORTED_LOCALES) {
        expect(placeholders(DICTIONARIES[locale][key]), `${locale}:${key}`).toEqual(expected);
      }
    }
  });
  it("interpolates localized workbench mode and progress labels", () => {
    expect(translate("zh-CN", "workspace.startMode", undefined, { mode: "深度研究" })).toBe("启动深度研究");
    expect(
      translate("ja", "researchProtocol.analystsComplete", undefined, { completed: 4, total: 6 }),
    ).toBe("4/6 完了");
    expect(translate("ko", "workspace.citationCount.other", undefined, { count: 12 })).toBe("인용 12건");
  });
});
