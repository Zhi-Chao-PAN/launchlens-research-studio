// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the scheduler tick so we don't depend on real schedules.
vi.mock("@/lib/research/scheduler", () => ({
  tickSchedules: vi.fn(async () => 3),
}));

import { POST, GET, checkStructuralRecoveryReadiness } from "./route";

const ORIGINAL_SECRET = process.env.LAUNCHLENS_CRON_SECRET;
const ORIGINAL_VERCEL_SECRET = process.env.CRON_SECRET;
const VALID_SECRET = "correct-cron-secret-at-least-24-characters";

function setLegacySecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.LAUNCHLENS_CRON_SECRET;
  } else {
    process.env.LAUNCHLENS_CRON_SECRET = value;
  }
}

function setVercelSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = value;
  }
}

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new Request(`http://localhost${path}`, { method: "GET", headers }));
}

describe("/api/cron/scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVercelSecret(undefined);
    setLegacySecret(undefined);
  });
  afterEach(() => {
    // Reset to whatever the dev environment had so other suites aren't
    // polluted by our secret.
    setLegacySecret(ORIGINAL_SECRET);
    setVercelSecret(ORIGINAL_VERCEL_SECRET);
  });

  it("returns 503 when CRON_SECRET and its legacy alias are unset", async () => {
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "anything" }));
    expect(res.status).toBe(503);
  });

  it("returns 401 when secret header is missing", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(makeRequest("/api/cron/scheduler"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret header is wrong", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("accepts correct x-cron-secret header and returns triggered count", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": VALID_SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.triggered).toBe(3);
    expect(body.timestamp).toBeDefined();
  });

  it("accepts Authorization: Bearer header", async () => {
    setVercelSecret(VALID_SECRET);
    setLegacySecret("ignored-legacy-secret");
    const res = await POST(
      makeRequest("/api/cron/scheduler", { authorization: `Bearer ${VALID_SECRET}` }),
    );
    expect(res.status).toBe(200);
  });

  it("GET is allowed as an alias for POST (some platforms only support GET)", async () => {
    setLegacySecret(VALID_SECRET);
    const res = await GET(makeRequest("/api/cron/scheduler", { "x-cron-secret": VALID_SECRET }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("secret comparison is length-sensitive (length mismatch → 401)", async () => {
    setLegacySecret(VALID_SECRET);
    // Different length: must not authenticate even if prefix matches.
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "correct-secre" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when the configured cron secret is too short", async () => {
    setVercelSecret("short");
    const res = await POST(
      makeRequest("/api/cron/scheduler", { authorization: "Bearer short" }),
    );
    expect(res.status).toBe(503);
  });
});

describe("checkStructuralRecoveryReadiness", () => {
  // The structural gate must NOT depend on the heartbeat freshness --
  // the cron tick is the producer of the heartbeat, and gating it on
  // its own output would prevent the first tick on a fresh deploy
  // from ever running recovery.

  const FULL_ENV = {
    LAUNCHLENS_DEEP_ENABLED: "1",
    CRON_SECRET: "cron-secret-at-least-24-characters",
    LAUNCHLENS_CRON_SECRET: "",
    LAUNCHLENS_DEEP_WORKER_SECRET: "worker-secret-at-least-24-characters",
    LAUNCHLENS_DEEP_WORKER_BASE_URL: "https://studio.example",
    OPENAI_API_KEY: "model-key",
    LAUNCHLENS_PROVIDER: "openai",
    LAUNCHLENS_REVIEW_PROVIDER: "openai",
    LAUNCHLENS_REVIEW_OPENAI_KEY: "review-key",
    TAVILY_API_KEY: "search-key",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "redis-token",
  };

  it("reports ready when every structural prerequisite is present", () => {
    const r = checkStructuralRecoveryReadiness(FULL_ENV);
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("refuses to run when deep is not enabled", () => {
    const r = checkStructuralRecoveryReadiness({ ...FULL_ENV, LAUNCHLENS_DEEP_ENABLED: "0" });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("deep-not-enabled");
  });

  it("refuses to run when cron secret is too short", () => {
    const r = checkStructuralRecoveryReadiness({ ...FULL_ENV, CRON_SECRET: "short" });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("cron-secret");
  });

  it("refuses to run when worker and cron secrets are equal", () => {
    const same = "shared-secret-at-least-24-chars";
    const r = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      CRON_SECRET: same,
      LAUNCHLENS_DEEP_WORKER_SECRET: same,
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("secrets-equal");
  });

  it("refuses to run when worker origin is missing", () => {
    const r = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_DEEP_WORKER_BASE_URL: "",
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("worker-origin");
  });

  it("refuses to run when retrieval is missing", () => {
    const r = checkStructuralRecoveryReadiness({ ...FULL_ENV, TAVILY_API_KEY: "" });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("retrieval-key");
  });

  it("refuses to run when retrieval is forced to mock", () => {
    const r = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_SEARCH_PROVIDER: "mock",
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("retrieval-forced-mock");
  });

  it("refuses to run when reviewer key is missing", () => {
    // Both a dedicated reviewer key AND the shared provider key must be
    // absent before we flag the reviewer as not-ready.
    const r = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      LAUNCHLENS_REVIEW_OPENAI_KEY: "",
      LAUNCHLENS_REVIEW_ANTHROPIC_KEY: "",
      OPENAI_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("reviewer-key");
  });

  it("refuses to run when redis authority is not configured", () => {
    const r = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toContain("redis");
  });

  it("uses KV_REST_API_* as a fallback for redis authority", () => {
    const r = checkStructuralRecoveryReadiness({
      ...FULL_ENV,
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "https://kv.example",
      KV_REST_API_TOKEN: "kv-token",
    });
    expect(r.ready).toBe(true);
  });

  it("ignores heartbeat freshness entirely (it is the producer)", () => {
    // No matter the heartbeat state, a fully-configured env is structurally
    // ready. The cron tick is the producer of the heartbeat and must
    // self-heal regardless of its own observation.
    const r = checkStructuralRecoveryReadiness(FULL_ENV);
    expect(r.ready).toBe(true);
  });
});
