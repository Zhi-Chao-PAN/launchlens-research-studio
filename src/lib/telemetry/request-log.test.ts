import { describe, it, expect, beforeEach } from "vitest";
import {
  clearRequestLog,
  getRecentRequests,
  hashIp,
  recordRequest,
} from "./request-log";

describe("request log", () => {
  beforeEach(() => clearRequestLog());

  it("records and returns most recent entries first", () => {
    recordRequest({ ts: 1, route: "/api/research", method: "POST", status: 201, durationMs: 5, ipHash: "x", uaSnippet: "u", ok: true });
    recordRequest({ ts: 2, route: "/api/research", method: "POST", status: 429, durationMs: 1, ipHash: "y", uaSnippet: "u", ok: false });
    const recent = getRecentRequests();
    expect(recent[0].ts).toBe(2);
    expect(recent[1].status).toBe(201);
  });

  it("caps the ring at 100 entries", () => {
    for (let i = 0; i < 150; i++) {
      recordRequest({ ts: i, route: "/r", method: "POST", status: 200, durationMs: 0, ipHash: "h", uaSnippet: "", ok: true });
    }
    const recent = getRecentRequests(500);
    expect(recent.length).toBe(100);
  });

  it("hashIp produces stable 8-character hex", () => {
    const a = hashIp("203.0.113.7");
    const b = hashIp("203.0.113.7");
    const c = hashIp("203.0.113.8");
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
