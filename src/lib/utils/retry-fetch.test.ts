import { describe, it, expect, vi, beforeEach } from "vitest";
import { retryFetch, retryFetchJson, safeJson } from "./retry-fetch";

describe("retry-fetch", () => {
  describe("safeJson", () => {
    it("parses valid JSON", () => {
      expect(safeJson('{"a":1}', { a: 0 })).toEqual({ a: 1 });
    });

    it("returns fallback for invalid JSON", () => {
      expect(safeJson("not json", { a: 0 })).toEqual({ a: 0 });
    });

    it("handles empty string", () => {
      expect(safeJson("", null)).toBe(null);
    });

    it("works with arrays", () => {
      expect(safeJson("[1,2,3]", [])).toEqual([1, 2, 3]);
    });
  });

  describe("retryFetch", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("succeeds on first attempt", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: "ok" }),
      });

      const res = await retryFetch("/api/test", { retries: 2 });
      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 500 and eventually succeeds", async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "ok" }),
        });

      const res = await retryFetch("/api/test", { retries: 3, retryDelay: 1 });
      expect(res.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("exhausts retries and throws", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("network error"));

      await expect(
        retryFetch("/api/test", { retries: 2, retryDelay: 1 })
      ).rejects.toThrow("network error");
      expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it("does not retry on non-retryable status", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      });

      const res = await retryFetch("/api/test", { retries: 3, retryDelay: 1 });
      expect(res.status).toBe(400);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("respects custom retryOn status codes", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: "Not Found" })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const res = await retryFetch("/api/test", {
        retries: 2,
        retryDelay: 1,
        retryOn: [404],
      });
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("retryFetchJson", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("parses JSON response", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ foo: "bar" }),
      });

      const data = await retryFetchJson<{ foo: string }>("/api/test");
      expect(data.foo).toBe("bar");
    });

    it("throws on HTTP error", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(retryFetchJson("/api/test", { retries: 0 })).rejects.toThrow(
        "HTTP 500"
      );
    });
  });
});
