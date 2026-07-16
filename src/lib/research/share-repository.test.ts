import { describe, expect, it } from "vitest";
import {
  createShareManifest,
  type PublicShareReportV1,
} from "@/lib/research/share-manifest";
import { MemoryShareRepository } from "@/lib/research/share-repository";
import { LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS } from "@/lib/research/share-compat";

function publicReport(
  sections: PublicShareReportV1["sections"] = { summary: "Original summary" },
): PublicShareReportV1 {
  return {
    version: 1,
    query: "Original query",
    createdAt: 100,
    durationMs: 200,
    status: "completed",
    sections,
  };
}

describe("MemoryShareRepository", () => {
  it("creates an independent public token and management token, then counts views", async () => {
    const repository = new MemoryShareRepository(() => 1_000);
    const created = await repository.create({
      runId: "run-1",
      manifest: createShareManifest(["summary", "risks"]),
      report: publicReport({
        summary: "Original summary",
        risks: [{ title: "Risk", description: "Description", mitigation: "Mitigation" }],
      }),
    });

    expect(created.token).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(created.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.token).not.toBe(created.manageToken);
    expect(created.sections).toEqual(["summary", "risks"]);

    await expect(repository.consume(created.token)).resolves.toMatchObject({
      runId: "run-1",
      views: 1,
      manifest: { sections: ["summary", "risks"] },
    });
    await expect(repository.consume(created.token)).resolves.toMatchObject({ views: 2 });
  });

  it("atomically enforces expiration and maximum views at the repository seam", async () => {
    let now = 10_000;
    const repository = new MemoryShareRepository(() => now);
    const maxed = await repository.create({
      runId: "run-max",
      manifest: createShareManifest(undefined),
      report: publicReport({
        summary: "Summary",
        scores: { opportunityScore: 70, riskScore: 30 },
        insights: [],
        opportunities: [],
        risks: [],
        nextStep: "Next",
        sources: [],
      }),
      maxViews: 1,
    });
    expect(await repository.consume(maxed.token)).toMatchObject({ views: 1 });
    expect(await repository.consume(maxed.token)).toBeNull();

    const expiring = await repository.create({
      runId: "run-expiring",
      manifest: createShareManifest(["summary"]),
      report: publicReport(),
      expiresInMs: 1_000,
    });
    now = 11_001;
    expect(await repository.consume(expiring.token)).toBeNull();
  });

  it("does not let a recipient revoke with the public token alone", async () => {
    const repository = new MemoryShareRepository(() => 1_000);
    const created = await repository.create({
      runId: "run-1",
      manifest: createShareManifest(undefined),
      report: publicReport({
        summary: "Summary",
        scores: { opportunityScore: 70, riskScore: 30 },
        insights: [], opportunities: [], risks: [], nextStep: "Next", sources: [],
      }),
    });

    await expect(repository.revoke(created.token, { kind: "manager", manageToken: created.token }))
      .resolves.toBe(false);
    expect(await repository.consume(created.token)).not.toBeNull();

    await expect(repository.revoke(created.token, { kind: "manager", manageToken: created.manageToken }))
      .resolves.toBe(true);
    expect(await repository.consume(created.token)).toBeNull();
  });

  it("allows an already-authorized administrator to revoke without the management token", async () => {
    const repository = new MemoryShareRepository(() => 1_000);
    const created = await repository.create({
      runId: "run-1",
      manifest: createShareManifest(undefined),
      report: publicReport({
        summary: "Summary",
        scores: { opportunityScore: 70, riskScore: 30 },
        insights: [], opportunities: [], risks: [], nextStep: "Next", sources: [],
      }),
    });

    await expect(repository.revoke(created.token, { kind: "admin" })).resolves.toBe(true);
    expect(await repository.consume(created.token)).toBeNull();
  });

  it("stores an immutable allowlisted report snapshot", async () => {
    const repository = new MemoryShareRepository(() => 1_000);
    const report = publicReport();
    const created = await repository.create({
      runId: "run-snapshot",
      manifest: createShareManifest(["summary"]),
      report: {
        ...report,
        provider: "must-not-persist",
        result: "must-not-persist",
      } as PublicShareReportV1,
    });

    report.query = "Changed after sharing";
    report.sections.summary = "Changed after sharing";
    const first = await repository.consume(created.token);
    expect(first?.report).toEqual(publicReport());

    if (first?.report) first.report.sections.summary = "Mutated consumer copy";
    const second = await repository.consume(created.token);
    expect(second?.report).toEqual(publicReport());
    expect(JSON.stringify(second?.report)).not.toContain("must-not-persist");
  });

  it("atomically adopts a legacy token without resetting its remaining view budget", async () => {
    const repository = new MemoryShareRepository(() => 1_000);
    const token = "legacy_public_token";
    const input = {
      token,
      runId: "legacy-run",
      manifest: createShareManifest(["summary"]),
      report: publicReport(),
      createdAt: 100,
      expiresAt: null,
      views: 1,
      maxViews: 3,
    };

    await expect(repository.adoptLegacyAndConsume(input)).resolves.toMatchObject({ views: 2 });
    // A racing/repeated adoption consumes the already-imported record rather
    // than overwriting it with the stale legacy count of 1.
    await expect(repository.adoptLegacyAndConsume(input)).resolves.toMatchObject({ views: 3 });
    await expect(repository.consume(token)).resolves.toBeNull();
    // The migration claim outlives the terminal record, so the same stale
    // plaintext candidate cannot recreate its exhausted budget.
    await expect(repository.adoptLegacyAndConsume(input)).resolves.toBeNull();
    await expect(repository.stats()).resolves.toEqual({ total: 0, active: 0, totalViews: 0 });
  });

  it("claims one-view legacy links once and keeps admin revocation terminal", async () => {
    const repository = new MemoryShareRepository(() => 1_000);
    const input = {
      token: "single_view_legacy",
      runId: "legacy-run",
      manifest: createShareManifest(["summary"]),
      report: publicReport(),
      createdAt: 100,
      expiresAt: null,
      views: 0,
      maxViews: 1,
    };

    await expect(repository.adoptLegacyAndConsume(input)).resolves.toMatchObject({ views: 1 });
    await expect(repository.adoptLegacyAndConsume(input)).resolves.toBeNull();

    const revocable = { ...input, token: "revocable_legacy", maxViews: 5 };
    await expect(repository.adoptLegacyAndConsume(revocable)).resolves.toMatchObject({ views: 1 });
    await expect(repository.revoke(revocable.token, { kind: "admin" })).resolves.toBe(true);
    await expect(repository.adoptLegacyAndConsume(revocable)).resolves.toBeNull();
  });

  it("can tombstone an unadopted legacy token and closes adoption at the compatibility cutoff", async () => {
    let now = 1_000;
    const repository = new MemoryShareRepository(() => now);
    const input = {
      token: "unadopted_legacy",
      runId: "legacy-run",
      manifest: createShareManifest(["summary"]),
      report: publicReport(),
      createdAt: 100,
      expiresAt: null,
      views: 0,
      maxViews: null,
    };

    await expect(repository.revokeLegacy(input.token)).resolves.toBe(true);
    await expect(repository.adoptLegacyAndConsume(input)).resolves.toBeNull();

    now = LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS;
    await expect(repository.adoptLegacyAndConsume({ ...input, token: "too_late_legacy" }))
      .resolves.toBeNull();
  });
});
