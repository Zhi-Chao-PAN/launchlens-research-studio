// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComparePage from "./page";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("a=run-a&b=run-b"),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/layout/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("@/components/venn/VennDiagram", () => ({ VennDiagram: () => null }));
vi.mock("@/components/skeleton/Skeleton", () => ({ CardSkeleton: () => <div>Skeleton</div> }));
vi.mock("@/lib/i18n/LocaleProvider", () => {
  const t = (key: string) => key;
  return { useLocale: () => ({ t }) };
});
vi.mock("@/lib/research/synthesis-parser", () => ({ parseSynthesis: () => null }));
vi.mock("@/lib/research/research-diff", () => ({
  diffResearch: vi.fn(),
  formatDelta: vi.fn(),
}));
vi.mock("@/lib/research/source-overlap", () => ({ computeSourceOverlap: vi.fn() }));

const RUNS = {
  "run-a": {
    id: "run-a",
    query: "Alpha",
    keywords: [],
    result: "",
    provider: "mock",
    model: "mock-a",
    createdAt: 1,
    durationMs: 100,
    status: "completed",
  },
  "run-b": {
    id: "run-b",
    query: "Beta",
    keywords: [],
    result: "",
    provider: "mock",
    model: "mock-b",
    createdAt: 2,
    durationMs: 200,
    status: "completed",
  },
} as const;

describe("ComparePage loading state", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const id = String(input).endsWith("run-a") ? "run-a" : "run-b";
      return {
        ok: true,
        json: async () => RUNS[id],
      } as Response;
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("leaves the skeleton after both research runs load", async () => {
    render(<ComparePage />);

    expect(screen.getByRole("main").getAttribute("aria-busy")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeTruthy();
      expect(screen.getByText("Beta")).toBeTruthy();
    });

    expect(screen.getByRole("main").hasAttribute("aria-busy")).toBe(false);
    expect(screen.queryByText("compare.loading")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
