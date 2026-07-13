// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SourceCitation } from "@/lib/schema/research-schema";
import { CitationList } from "./CitationList";

const citation: SourceCitation = {
  id: "source-1",
  title: "Primary market report",
  url: "https://example.com/report",
  snippet: "Representative evidence from the source.",
  accessedAt: "2026-07-13T00:00:00.000Z",
  confidence: "high",
  agent: "market-sizer",
};

describe("CitationList", () => {
  it("keeps compact citations collapsed until requested", () => {
    render(<CitationList citations={[citation]} compact />);

    const toggle = screen.getByRole("button", { name: "1 source" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: citation.title })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: citation.title }).getAttribute("href")).toBe(citation.url);
  });

  it("provides a stable citation target for inline references", () => {
    const { container } = render(<CitationList citations={[citation]} />);

    expect(container.querySelector("#cite-source-1")).toBeTruthy();
  });

  it("renders unsafe historical citation URLs as non-clickable text", () => {
    render(
      <CitationList
        citations={[{ ...citation, url: "javascript:alert(1)" }]}
      />,
    );

    expect(screen.queryByRole("link", { name: citation.title })).toBeNull();
    expect(screen.getByText(citation.title)).toBeTruthy();
  });
});
