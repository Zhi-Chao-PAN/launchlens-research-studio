// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock the scheduler tick so we don't depend on real schedules.
vi.mock("@/lib/research/scheduler", () => ({
  tickSchedules: vi.fn(async () => 3),
}));

import { POST, GET } from "./route";

const ORIGINAL_SECRET = process.env.LAUNCHLENS_CRON_SECRET;

function setSecret(value: string | undefined) {
  if (value === undefined) {
    delete process.env.LAUNCHLENS_CRON_SECRET;
  } else {
    process.env.LAUNCHLENS_CRON_SECRET = value;
  }
}

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new Request(`http://localhost${path}`, { method: "GET", headers }));
}

describe("/api/cron/scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    // Reset to whatever the dev environment had so other suites aren't
    // polluted by our secret.
    setSecret(ORIGINAL_SECRET);
  });

  it("returns 503 when LAUNCHLENS_CRON_SECRET is unset", async () => {
    setSecret(undefined);
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "anything" }));
    expect(res.status).toBe(503);
  });

  it("returns 401 when secret header is missing", async () => {
    setSecret("correct-secret");
    const res = await POST(makeRequest("/api/cron/scheduler"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when secret header is wrong", async () => {
    setSecret("correct-secret");
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("accepts correct x-cron-secret header and returns triggered count", async () => {
    setSecret("correct-secret");
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "correct-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.triggered).toBe(3);
    expect(body.timestamp).toBeDefined();
  });

  it("accepts Authorization: Bearer header", async () => {
    setSecret("correct-secret");
    const res = await POST(
      makeRequest("/api/cron/scheduler", { authorization: "Bearer correct-secret" }),
    );
    expect(res.status).toBe(200);
  });

  it("GET is allowed as an alias for POST (some platforms only support GET)", async () => {
    setSecret("correct-secret");
    const res = await GET(makeRequest("/api/cron/scheduler", { "x-cron-secret": "correct-secret" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("secret comparison is length-sensitive (length mismatch → 401)", async () => {
    setSecret("correct-secret");
    // Different length: must not authenticate even if prefix matches.
    const res = await POST(makeRequest("/api/cron/scheduler", { "x-cron-secret": "correct-secre" }));
    expect(res.status).toBe(401);
  });
});