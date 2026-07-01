/// <reference types="vitest/globals" />
import { describe, it, expect } from "vitest";
import {
  formatDistanceToNow,
  formatDate,
  formatDateTime,
  formatDuration,
} from "@/lib/utils/date-utils";

describe("date utils", () => {
  describe("formatDistanceToNow", () => {
    it("shows just now for very recent times", () => {
      expect(formatDistanceToNow(Date.now() - 1000)).toBe("just now");
      expect(formatDistanceToNow(Date.now() - 30000)).toBe("just now");
    });

    it("shows minutes for times less than an hour ago", () => {
      expect(formatDistanceToNow(Date.now() - 5 * 60 * 1000)).toContain("5");
      expect(formatDistanceToNow(Date.now() - 5 * 60 * 1000)).toContain("min ago");
    });

    it("shows hours for times less than a day ago", () => {
      expect(formatDistanceToNow(Date.now() - 3 * 60 * 60 * 1000)).toContain("3");
      expect(formatDistanceToNow(Date.now() - 3 * 60 * 60 * 1000)).toContain("hr ago");
    });

    it("shows days for times less than a week ago", () => {
      expect(formatDistanceToNow(Date.now() - 3 * 24 * 60 * 60 * 1000)).toContain("3");
      expect(formatDistanceToNow(Date.now() - 3 * 24 * 60 * 60 * 1000)).toContain("days ago");
    });

    it("handles future times gracefully", () => {
      expect(formatDistanceToNow(Date.now() + 10000)).toBe("in the future");
    });

    it("localizes to Chinese when given zh-CN", () => {
      expect(formatDistanceToNow(Date.now() - 1000, "zh-CN")).toBe("刚刚");
      expect(formatDistanceToNow(Date.now() - 5 * 60 * 1000, "zh-CN")).toBe("5 分钟前");
      expect(formatDistanceToNow(Date.now() + 10000, "zh-CN")).toBe("将来");
    });

    it("localizes to Japanese when given ja", () => {
      expect(formatDistanceToNow(Date.now() - 1000, "ja")).toBe("たった今");
      expect(formatDistanceToNow(Date.now() - 3 * 60 * 60 * 1000, "ja")).toBe("3 時間前");
    });

    it("localizes to Korean when given ko", () => {
      expect(formatDistanceToNow(Date.now() - 1000, "ko")).toBe("방금 전");
      expect(formatDistanceToNow(Date.now() - 3 * 24 * 60 * 60 * 1000, "ko")).toBe("3일 전");
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

    it("formats minutes and seconds", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    it("formats 1 second as singular", () => {
      expect(formatDuration(1000)).toBe("1s");
    });

    it("formats 1 minute as singular", () => {
      expect(formatDuration(60000)).toBe("1m");
    });

    it("rounds half-second values up", () => {
      expect(formatDuration(1500)).toBe("2s");
    });

    it("clamps negative durations to 0ms", () => {
      expect(formatDuration(-100)).toBe("0ms");
    });

    it("returns 0ms for non-finite input", () => {
      expect(formatDuration(Number.NaN)).toBe("0ms");
      expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0ms");
    });

    it("switches to hours at 24h and keeps leftover minutes", () => {
      expect(formatDuration(25 * 60 * 60 * 1000)).toBe("25h");
      expect(formatDuration(25 * 60 * 60 * 1000 + 5 * 60 * 1000)).toBe("25h 5m");
    });

    it("does not emit unbounded minute output for very long durations", () => {
      // 30 days used to be 43200m. Now it should be hours.
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const out = formatDuration(thirtyDays);
      expect(out.endsWith("h")).toBe(true);
      expect(out.includes("m ")).toBe(false);
    });
  });

  describe("formatDate", () => {
    it("formats a date", () => {
      const d = new Date(2024, 0, 15).getTime();
      expect(formatDate(d, "en-US")).toContain("2024");
    });
  });

  describe("formatDateTime", () => {
    it("formats a datetime", () => {
      const d = new Date(2024, 0, 15, 10, 30).getTime();
      expect(formatDateTime(d, "en-US")).toContain("2024");
    });
  });
});
