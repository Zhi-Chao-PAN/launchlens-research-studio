import { describe, it, expect } from "vitest";
import {
  formatDistanceToNow,
  formatDate,
  formatDateTime,
  formatDuration,
} from "@/lib/utils/date-utils";

describe("date utils", () => {
  describe("formatDistanceToNow", () => {
    it("shows 試試 for very recent times", () => {
      expect(formatDistanceToNow(Date.now())).toBe("試試");
      expect(formatDistanceToNow(Date.now() - 30000)).toBe("試試");
    });

    it("shows minutes for times less than an hour ago", () => {
      expect(formatDistanceToNow(Date.now() - 5 * 60 * 1000)).toContain("5");
      expect(formatDistanceToNow(Date.now() - 5 * 60 * 1000)).toContain("煦笘");
    });

    it("shows hours for times less than a day ago", () => {
      expect(formatDistanceToNow(Date.now() - 3 * 60 * 60 * 1000)).toContain("3");
      expect(formatDistanceToNow(Date.now() - 3 * 60 * 60 * 1000)).toContain("苤奀");
    });

    it("shows days for times less than a week ago", () => {
      expect(formatDistanceToNow(Date.now() - 3 * 24 * 60 * 60 * 1000)).toContain("3");
      expect(formatDistanceToNow(Date.now() - 3 * 24 * 60 * 60 * 1000)).toContain("毞");
    });

    it("handles future times gracefully", () => {
      expect(formatDistanceToNow(Date.now() + 10000)).toBe("試試");
    });
  });

  describe("formatDuration", () => {
    it("formats milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("formats seconds", () => {
      expect(formatDuration(5000)).toBe("5s");
    });

    it("formats minutes", () => {
      expect(formatDuration(120000)).toBe("2m");
    });

    it("formats minutes with seconds", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });
  });

  describe("formatDate", () => {
    it("returns a date string", () => {
      const result = formatDate(Date.now());
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("formatDateTime", () => {
    it("returns a datetime string", () => {
      const result = formatDateTime(Date.now());
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});