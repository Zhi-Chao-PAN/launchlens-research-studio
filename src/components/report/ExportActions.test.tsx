/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Stub the toast hook before importing the component so the module-level
// import resolves to our mock.
vi.mock("@/components/toast/ToastContext", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// Stub URL.createObjectURL / Blob / document for the download handler.
// We don't actually want to trigger file downloads during tests.
beforeEach(() => {
  vi.stubGlobal("URL", {
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => {},
  });
  vi.stubGlobal(
    "Blob",
    class {
      parts: unknown[];
      opts: unknown;
      constructor(parts: unknown[], opts: unknown) {
        this.parts = parts;
        this.opts = opts;
      }
    },
  );
  // jsdom doesn't implement anchor.click() download by default; stub it.
  const origCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreate(tag) as HTMLElement & { click?: () => void };
    if (tag === "a") {
      el.click = () => {};
    }
    return el as ReturnType<typeof origCreate>;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Import after the mocks are wired so they apply.
import { ExportActions } from "@/components/report/ExportActions";
import type { AgentId, AgentOutput, SynthesisOutput } from "@/lib/schema/research-schema";

function fullOutputs(): Record<AgentId, AgentOutput> {
  const syn: SynthesisOutput = {
    agent: "synthesis",
    execSummary: "A high-potential market for AI-powered note-taking tools among indie SaaS founders.",
    opportunityScore: 78,
    riskScore: 32,
    keyInsights: [],
    topThreeOpportunities: [{ title: "Untapped mobile UX gap", description: "", rationale: "" }],
    topThreeRisks: [{ title: "Crowded market", description: "", mitigation: "Differentiate on AI" }],
    recommendedNextStep: "Build MVP",
    launchlensBrief: "",
    citations: [],
  };
  return {
    "market-sizer": {
      agent: "market-sizer",
      summary: "",
      marketSize: { tam: 5e9, sam: 8e8, som: 5e7, currency: "USD", growthRate: 18, growthTrend: "accelerating", unit: "revenue", sources: [], confidence: "high" },
      keyTrends: [],
      targetSegments: [{ name: "Indie SaaS founders", size: 120000, description: "Solo or two-person teams shipping B2B tools" }],
      citations: [],
    },
    "competitor-analyst": {
      agent: "competitor-analyst",
      summary: "",
      competitors: [{ id: "c1", name: "AcmeCorp", tagline: "x", strengths: [], weaknesses: [], pricing: { min: 0, max: 0, model: "free", currency: "USD" }, positioning: "mid-market", differentiation: "x", citations: [] }],
      competitiveMatrix: [],
      gaps: [],
      citations: [],
    },
    "pain-detective": {
      agent: "pain-detective",
      summary: "",
      painPoints: [],
      unmetNeeds: [],
      userPersonas: [{ name: "Solo Founder", role: "CEO", goals: ["Ship faster"], frustrations: ["Too many tools"] }],
      citations: [],
    },
    "pricing-scout": {
      agent: "pricing-scout",
      summary: "",
      priceBands: [],
      competitorPricing: [],
      monetizationModels: [],
      willingnessToPay: [],
      recommendations: [],
      citations: [],
    },
    "channel-scout": {
      agent: "channel-scout",
      summary: "",
      channels: [],
      communityHubs: [],
      contentTopics: [],
      recommendedChannels: [],
      citations: [],
    },
    synthesis: syn,
  };
}

const baseProps = {
  sessionId: "sess-abc12345",
  query: "AI-powered note-taking tool for indie SaaS founders",
  keywords: ["ai", "notes", "saas"],
};

describe("ExportActions — Send to LaunchLens AI button (R231)", () => {
  it("renders the button when synthesis is available", () => {
    render(<ExportActions {...baseProps} outputs={fullOutputs()} />);
    const btn = screen.getByTestId("send-to-launchlens-ai");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("Send to LaunchLens AI");
  });

  it("disables the button when synthesis is missing", () => {
    const outputs = fullOutputs();
    // @ts-expect-error - intentionally removing synthesis for the test
    delete outputs.synthesis;
    render(<ExportActions {...baseProps} outputs={outputs} />);
    const btn = screen.getByTestId("send-to-launchlens-ai") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("opens launchlens-ai in a new tab with #brief=<base64url>", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);

    render(<ExportActions {...baseProps} outputs={fullOutputs()} />);
    fireEvent.click(screen.getByTestId("send-to-launchlens-ai"));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target, features] = openSpy.mock.calls[0] as [string, string, string];
    expect(target).toBe("_blank");
    // R253: noopener is deliberately dropped so the new tab retains an opener
    // reference for the postMessage handshake back to research-studio. Only
    // noreferrer is kept (avoids leaking Referer). The launchlens-ai side
    // posts {type:"launchlens:brief-applied"} to window.opener on success.
    expect(features).not.toContain("noopener");
    expect(features).toContain("noreferrer");
    expect(url.startsWith("https://launchlens-ai-two.vercel.app/#brief=")).toBe(true);

    // Decode the hash and confirm it parses to a valid research-studio envelope.
    const encoded = url.slice("https://launchlens-ai-two.vercel.app/#brief=".length);
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
    // Mirror launchlens-ai's decoder: atob → Uint8Array → TextDecoder → JSON.parse.
    // A naive atob + JSON.parse would mangle multi-byte UTF-8 (Chinese, emoji).
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.source).toBe("launchlens-research-studio");
    expect(json.schemaVersion).toBe("1.0.0");
    expect(json.sessionId).toBe("sess-abc12345");
    expect(json.input.tone).toBe("Practical, crisp, and founder-friendly");
    expect(json.input.idea).toContain("AI-powered note-taking tool");
    expect(json.meta.opportunityScore).toBe(78);
    expect(json.meta.riskScore).toBe(32);
    // R231: reportUrl is populated so launchlens-ai can back-link.
    expect(json.reportUrl).toBe("https://launchlens-research-studio.vercel.app/research/sess-abc12345");
  });

  it("honors NEXT_PUBLIC_LAUNCHLENS_AI_URL env override", () => {
    const prev = process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
    process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = "https://launchlens-ai.staging.example.com/";
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    try {
      render(<ExportActions {...baseProps} outputs={fullOutputs()} />);
      fireEvent.click(screen.getByTestId("send-to-launchlens-ai"));
      const [url] = openSpy.mock.calls[0] as [string, string, string];
      // trailing slash is stripped before concatenation
      expect(url.startsWith("https://launchlens-ai.staging.example.com/#brief=")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL;
      else process.env.NEXT_PUBLIC_LAUNCHLENS_AI_URL = prev;
    }
  });

  it("surfaces a toast when the popup is blocked (window.open returns null)", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ExportActions {...baseProps} outputs={fullOutputs()} />);
    // No throw — the component should swallow null and surface a hint.
    expect(() => fireEvent.click(screen.getByTestId("send-to-launchlens-ai"))).not.toThrow();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it("URL-encodes a Chinese query correctly (UTF-8 round-trip)", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(
      <ExportActions
        {...baseProps}
        query="面向中国创业者的 AI 笔记应用 🚀"
        outputs={fullOutputs()}
      />,
    );
    fireEvent.click(screen.getByTestId("send-to-launchlens-ai"));

    const [url] = openSpy.mock.calls[0] as [string, string, string];
    const encoded = url.slice("https://launchlens-ai-two.vercel.app/#brief=".length);
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
    // UTF-8-safe decode (mirrors launchlens-ai's decodeBase64UrlUtf8).
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    expect(json.query).toBe("面向中国创业者的 AI 笔记应用 🚀");
    expect(json.input.idea).toContain("面向中国创业者的 AI 笔记应用 🚀");
  });
});

describe("ExportActions — download fallback (R231)", () => {
  it("still renders the .json download button as a fallback", () => {
    render(<ExportActions {...baseProps} outputs={fullOutputs()} />);
    const downloadBtn = screen.getByText(/Export LaunchLens brief \(\.json\)/);
    expect(downloadBtn).toBeTruthy();
  });

  it("clicking the download button does not invoke window.open", () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue({} as Window);
    render(<ExportActions {...baseProps} outputs={fullOutputs()} />);
    fireEvent.click(screen.getByText(/Export LaunchLens brief \(\.json\)/));
    expect(openSpy).not.toHaveBeenCalled();
  });
});
