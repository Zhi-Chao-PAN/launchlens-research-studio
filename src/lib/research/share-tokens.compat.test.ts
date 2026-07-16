import { beforeEach, describe, expect, it } from "vitest";
import { saveResearchRun } from "@/lib/research/storage";
import {
  _resetShareTokens,
  createFolderShareToken,
  createPasswordShareToken,
  createShareToken,
  LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS,
  readLegacyPublicRunShare,
  synchronizeLegacyPublicShareViews,
} from "@/lib/research/share-tokens";

describe("legacy public-share compatibility", () => {
  beforeEach(() => {
    _resetShareTokens();
    saveResearchRun({
      id: "legacy-share-run",
      query: "Legacy research",
      keywords: ["legacy"],
      result: JSON.stringify({
        execSummary: "Legacy summary",
        opportunityScore: 75,
        riskScore: 25,
        keyInsights: [],
        topThreeOpportunities: [],
        topThreeRisks: [],
        recommendedNextStep: "Validate",
        citations: [],
      }),
      provider: "private-provider",
      model: "private-model",
      createdAt: 100,
      durationMs: 200,
      status: "completed",
    });
  });

  it("returns an eligible run without incrementing before repository adoption", () => {
    const share = createShareToken("legacy-share-run", { maxViews: 2 });

    expect(readLegacyPublicRunShare(share.token, 1_000)).toMatchObject({
      run: { id: "legacy-share-run", provider: "private-provider" },
      share: { views: 0, maxViews: 2 },
    });
    expect(readLegacyPublicRunShare(share.token, 1_000)?.share.views).toBe(0);

    synchronizeLegacyPublicShareViews(share.token, 1);
    expect(readLegacyPublicRunShare(share.token, 1_000)?.share.views).toBe(1);
    synchronizeLegacyPublicShareViews(share.token, 2);
    expect(readLegacyPublicRunShare(share.token, 1_000)).toBeNull();
  });

  it("fails closed for password, folder, expired, and post-window legacy shares", () => {
    const password = createPasswordShareToken("legacy-share-run", "secret");
    const folder = createFolderShareToken("folder-1");
    const expiring = createShareToken("legacy-share-run", { expiresInMs: 1_000 });
    const ordinary = createShareToken("legacy-share-run");

    expect(readLegacyPublicRunShare(password.token, 1_000)).toBeNull();
    expect(readLegacyPublicRunShare(folder.token, 1_000)).toBeNull();
    expect(readLegacyPublicRunShare(expiring.token, expiring.createdAt + 1_000)).toBeNull();
    expect(readLegacyPublicRunShare(ordinary.token, LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS)).toBeNull();
  });
});
