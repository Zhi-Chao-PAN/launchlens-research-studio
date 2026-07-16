// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

import SharePage from "./page";

const SHARE_TOKEN = "public-token-sentinel";
const SENSITIVE_SENTINELS = [
  "PROVIDER_INTERNAL_SENTINEL",
  "MODEL_INTERNAL_SENTINEL",
  "RESULT_INTERNAL_SENTINEL",
  "RUN_ID_INTERNAL_SENTINEL",
  "TOKEN_INTERNAL_SENTINEL",
];

function response(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function renderPage() {
  return render(
    <LocaleProvider>
      <SharePage params={Promise.resolve({ token: SHARE_TOKEN })} />
    </LocaleProvider>,
  );
}

describe("public research share page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders only the allowlisted selected sections and never exposes internal fields", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      report: {
        version: 1,
        query: "Evidence-led restaurant operations",
        createdAt: Date.UTC(2026, 6, 16),
        durationMs: 42_000,
        status: "completed",
        sections: {
          summary: "Operators need a simpler handoff workflow.",
          scores: { opportunityScore: 82, riskScore: 31 },
          insights: [{
            insight: "Fewer handoffs matter more than more dashboards.",
            supportingAgents: ["pain-detective"],
            confidence: "high",
          }],
          nextStep: "Interview ten owner-operators.",
        },
        provider: SENSITIVE_SENTINELS[0],
        model: SENSITIVE_SENTINELS[1],
        result: SENSITIVE_SENTINELS[2],
        runId: SENSITIVE_SENTINELS[3],
        token: SENSITIVE_SENTINELS[4],
      },
      share: {
        views: 3,
        maxViews: 100,
        expiresAt: null,
        sections: ["summary", "scores", "insights", "nextStep"],
      },
    }));

    const { container } = renderPage();

    expect(await screen.findByRole("heading", {
      level: 1,
      name: "Evidence-led restaurant operations",
    })).toBeTruthy();
    expect(screen.getByText("Operators need a simpler handoff workflow.")).toBeTruthy();
    expect(screen.getByText("Fewer handoffs matter more than more dashboards.")).toBeTruthy();
    expect(screen.getByText("Interview ten owner-operators.")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Opportunity" }).getAttribute("aria-valuenow")).toBe("82");

    expect(screen.queryByRole("heading", { name: "Top opportunities" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Key risks" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Evidence sources" })).toBeNull();
    for (const sentinel of SENSITIVE_SENTINELS) {
      expect(container.textContent).not.toContain(sentinel);
    }

    expect(fetch).toHaveBeenCalledWith(
      `/api/research/share/${SHARE_TOKEN}`,
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }),
    );
  });

  it("uses the attributed product-growth CTA URL", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      report: {
        version: 1,
        query: "Shared report",
        createdAt: 1,
        durationMs: 1,
        status: "completed",
        sections: { summary: "Selected summary" },
      },
      share: { views: 1, maxViews: null, expiresAt: null },
    }));

    renderPage();

    const cta = await screen.findByRole("link", { name: /research your idea/i });
    expect(cta.getAttribute("href")).toBe(
      "/?utm_source=shared_report&utm_medium=public_share&utm_campaign=research_dossier",
    );
  });

  it("cleans up the clipboard fallback and restores focus when copying throws", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      report: {
        version: 1,
        query: "Clipboard safety",
        createdAt: 1,
        durationMs: 1,
        status: "completed",
        sections: { summary: "Selected summary" },
      },
      share: { views: 1, maxViews: null, expiresAt: null },
    }));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => { throw new Error("copy blocked"); }),
    });

    renderPage();
    const copy = await screen.findByRole("button", { name: "Copy link" });
    copy.focus();
    fireEvent.click(copy);

    await waitFor(() => expect(screen.getByRole("button", { name: "Copy failed" })).toBeTruthy());
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(copy);
  });

  it("shows a terminal unavailable state for missing or consumed shares", async () => {
    vi.mocked(fetch).mockResolvedValue(response({}, { ok: false, status: 404 }));

    renderPage();

    expect(await screen.findByRole("heading", {
      name: "This research link is no longer available.",
    })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: /explore launchlens/i }).getAttribute("href")).toBe("/");
  });

  it("shows a retryable connection state when loading fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("network offline"));

    renderPage();

    expect(await screen.findByRole("heading", {
      name: "We could not open this research share.",
    })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("switches the public report chrome to Simplified Chinese", async () => {
    vi.mocked(fetch).mockResolvedValue(response({
      report: {
        version: 1,
        query: "共享调研",
        createdAt: 1,
        durationMs: 1,
        status: "completed",
        sections: { summary: "只公开这一段摘要。" },
      },
      share: { views: 1, maxViews: null, expiresAt: null },
    }));

    renderPage();
    await screen.findByRole("heading", { level: 1, name: "共享调研" });

    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), {
      target: { value: "zh-CN" },
    });

    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));
    expect(screen.getByRole("heading", { name: "执行摘要" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /开始调研我的想法/ })).toBeTruthy();
  });
});
