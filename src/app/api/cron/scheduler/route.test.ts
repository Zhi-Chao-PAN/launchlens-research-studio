// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the scheduler tick so we don't depend on real schedules.
vi.mock("@/lib/research/scheduler", () => ({
  tickSchedules: vi.fn(async () => 3),
}));

import { POST, GET } from "./route";

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
