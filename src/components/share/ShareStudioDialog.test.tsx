// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareButton } from "@/components/report/ShareButton";
import { LocaleProvider, useLocale } from "@/lib/i18n/LocaleProvider";

const { createShareWithOptions, posterFilename, qrDataUrl, renderSharePoster } = vi.hoisted(() => ({
  createShareWithOptions: vi.fn(),
  posterFilename: vi.fn(() => "LaunchLens-research-poster.png"),
  qrDataUrl: vi.fn(),
  renderSharePoster: vi.fn(),
}));

vi.mock("@/lib/research/share-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/research/share-api")>();
  return { ...actual, createShareWithOptions };
});

vi.mock("@/lib/research/share-poster", () => ({
  posterFilename,
  qrDataUrl,
  renderSharePoster,
}));

const report = {
  query: "AI tools for independent restaurants",
  synthesis: {
    execSummary: "A focused workflow product has a credible wedge in owner-operated restaurants.",
    opportunityScore: 78,
    riskScore: 42,
    keyInsights: [{ insight: "Operators value fewer handoffs more than another analytics dashboard." }],
    topThreeOpportunities: [{ title: "Workflow wedge", description: "Own the daily handoff." }],
    topThreeRisks: [{ title: "Adoption", description: "Busy teams resist setup." }],
    recommendedNextStep: "Interview ten owner-operators and test the workflow prototype.",
    citations: [{ title: "Industry source", url: "https://example.test/source" }],
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function LocaleToggle() {
  const { setLocale } = useLocale();
  return <button type="button" onClick={() => setLocale("zh-CN")}>Switch locale</button>;
}

describe("ShareStudioDialog", () => {
  beforeEach(() => {
    createShareWithOptions.mockReset();
    createShareWithOptions.mockResolvedValue({
      token: "public-share-token",
      manageToken: "private-management-token",
      expiresAt: null,
      maxViews: null,
      createdAt: 1,
      sections: ["summary", "scores", "insights", "nextStep"],
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    let objectUrlSequence = 0;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => `blob:share-poster-${++objectUrlSequence}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    renderSharePoster.mockReset();
    renderSharePoster.mockResolvedValue(new Blob(["poster"], { type: "image/png" }));
    qrDataUrl.mockReset();
    qrDataUrl.mockResolvedValue("data:image/png;base64,cXI=");
    posterFilename.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("opens a single accessible studio with poster and link modes", () => {
    render(<ShareButton sessionId="run-1" report={report} label="Share" />);

    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(screen.getByRole("dialog", { name: /turn this research/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Poster" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Link" })).toBeTruthy();
    expect(screen.getByText("4 sections selected")).toBeTruthy();
    expect(screen.queryByText("??")).toBeNull();
  });

  it("creates a public link with the exact selected manifest", async () => {
    render(<ShareButton sessionId="run-2" report={report} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Full report" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /evidence sources/i }));
    fireEvent.click(screen.getByRole("tab", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));

    await waitFor(() => expect(createShareWithOptions).toHaveBeenCalledTimes(1));
    expect(createShareWithOptions).toHaveBeenCalledWith("run-2", {
      sections: ["summary", "scores", "insights", "opportunities", "risks", "nextStep"],
      expiresInMs: undefined,
      maxViews: undefined,
    });
    expect((await screen.findByDisplayValue(/\/share\/public-share-token$/) as HTMLInputElement).value)
      .toContain("/share/public-share-token");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("/share/public-share-token"));
  });

  it("keeps at least one public section selected", () => {
    render(<ShareButton sessionId="run-3" report={report} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    const checked = screen.getAllByRole("checkbox").filter((node) => (node as HTMLInputElement).checked);
    for (const checkbox of checked.slice(0, -1)) fireEvent.click(checkbox);
    const finalCheckbox = screen.getAllByRole("checkbox").find((node) => (node as HTMLInputElement).checked)!;
    fireEvent.click(finalCheckbox);

    expect(screen.getAllByRole("checkbox").filter((node) => (node as HTMLInputElement).checked)).toHaveLength(1);
  });

  it("discards an in-flight share when its content selection changes", async () => {
    const firstRequest = deferred<{
      token: string;
      manageToken: string;
      expiresAt: null;
      maxViews: null;
      createdAt: number;
      sections: Array<"summary" | "scores" | "insights" | "nextStep">;
    } | null>();
    createShareWithOptions.mockReset();
    createShareWithOptions.mockReturnValueOnce(firstRequest.promise);
    createShareWithOptions.mockResolvedValueOnce({
      token: "fresh-token",
      manageToken: "fresh-manage-token",
      expiresAt: null,
      maxViews: null,
      createdAt: 2,
      sections: ["summary", "scores", "insights", "opportunities", "nextStep"],
    });

    render(<ShareButton sessionId="run-race" report={report} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("tab", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    await waitFor(() => expect(createShareWithOptions).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("checkbox", { name: /top opportunities/i }));
    firstRequest.resolve({
      token: "stale-token",
      manageToken: "stale-manage-token",
      expiresAt: null,
      maxViews: null,
      createdAt: 1,
      sections: ["summary", "scores", "insights", "nextStep"],
    });

    await waitFor(() => expect(screen.queryByDisplayValue(/stale-token/)).toBeNull());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));

    expect((await screen.findByDisplayValue(/fresh-token$/) as HTMLInputElement).value)
      .toContain("/share/fresh-token");
    expect(createShareWithOptions).toHaveBeenLastCalledWith("run-race", {
      sections: ["summary", "scores", "insights", "opportunities", "nextStep"],
      expiresInMs: undefined,
      maxViews: undefined,
    });
  });

  it("clears share artifacts when the report identity changes", async () => {
    createShareWithOptions.mockResolvedValueOnce({
      token: "first-report-token",
      manageToken: "first-manage-token",
      expiresAt: null,
      maxViews: null,
      createdAt: 1,
      sections: ["summary", "scores", "insights", "nextStep"],
    }).mockResolvedValueOnce({
      token: "second-report-token",
      manageToken: "second-manage-token",
      expiresAt: null,
      maxViews: null,
      createdAt: 2,
      sections: ["summary", "scores", "insights", "nextStep"],
    });
    const view = render(<ShareButton sessionId="run-old" report={{ ...report, createdAt: 1 }} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("tab", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    expect(await screen.findByDisplayValue(/first-report-token$/)).toBeTruthy();

    view.rerender(
      <ShareButton
        sessionId="run-new"
        report={{ ...report, query: "A different research report", createdAt: 2 }}
        label="Share"
      />,
    );

    await waitFor(() => expect(screen.queryByDisplayValue(/first-report-token$/)).toBeNull());
    expect(screen.getByRole("button", { name: "Create public link" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    expect(await screen.findByDisplayValue(/second-report-token$/)).toBeTruthy();
    expect(createShareWithOptions).toHaveBeenLastCalledWith("run-new", expect.any(Object));
  });

  it("downloads the poster when file sharing is not explicitly supported", async () => {
    const share = vi.fn();
    const canShare = vi.fn(() => false);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: canShare });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ShareButton sessionId="run-download" report={report} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Create QR poster" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share poster" }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(canShare).toHaveBeenCalledWith({ files: [expect.any(File)] });
    expect(share).not.toHaveBeenCalled();
  });

  it("falls back to a download when native file sharing fails", async () => {
    const share = vi.fn().mockRejectedValue(new Error("native share failed"));
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: vi.fn(() => true) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ShareButton sessionId="run-share-failure" report={report} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Create QR poster" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share poster" }));

    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  });

  it("invalidates only the poster artifact when the locale changes", async () => {
    render(
      <LocaleProvider>
        <LocaleToggle />
        <ShareButton sessionId="run-locale-artifact" report={report} label="Share" />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Create QR poster" }));
    await screen.findByRole("button", { name: "Share poster" });

    expect(renderSharePoster).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
    expect(createShareWithOptions).toHaveBeenCalledTimes(1);
    expect(document.querySelector('img[src^="blob:share-poster-"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch locale" }));
    await waitFor(() => {
      expect(document.querySelector('img[src^="blob:share-poster-"]')).toBeNull();
    });
    const regenerate = document.body.querySelector<HTMLButtonElement>('button[class*="primaryAction"]');
    expect(regenerate).toBeTruthy();
    fireEvent.click(regenerate!);

    await waitFor(() => expect(renderSharePoster).toHaveBeenCalledTimes(2));
    expect(renderSharePoster).toHaveBeenLastCalledWith(expect.objectContaining({ locale: "zh-CN" }));
    // Locale is presentation-only; the immutable curated report link is reused.
    expect(createShareWithOptions).toHaveBeenCalledTimes(1);
  });

  it("cleans up the clipboard fallback and restores focus when copying fails", async () => {
    render(<ShareButton sessionId="run-copy-focus" report={report} label="Share" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("tab", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Create public link" }));
    const urlInput = await screen.findByDisplayValue(/public-share-token$/);
    const copy = urlInput.closest("label")?.querySelector<HTMLButtonElement>("button");
    expect(copy).toBeTruthy();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    copy!.focus();
    fireEvent.click(copy!);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(copy);
  });

  it("pulls escaped focus back into the modal on the next Tab", () => {
    render(<ShareButton sessionId="run-focus-trap" report={report} label="Share" />);
    const trigger = screen.getByRole("button", { name: "Share" });
    fireEvent.click(trigger);
    trigger.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<ShareButton sessionId="run-4" report={report} label="Share" />);
    const trigger = screen.getByRole("button", { name: "Share" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("switches the studio copy to Simplified Chinese", async () => {
    window.localStorage.setItem("ll.locale", "zh-CN");
    render(
      <LocaleProvider>
        <ShareButton sessionId="run-5" report={report} label="分享" />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "分享" }));

    expect(await screen.findByText("把这份调研，变成一次有价值的讨论")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "海报分享" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "链接分享" })).toBeTruthy();
  });
});
