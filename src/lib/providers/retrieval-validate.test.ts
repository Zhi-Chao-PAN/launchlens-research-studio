// @vitest-environment node
import { describe, it, expect } from "vitest";
import { filterCitationsAgainstRetrieved } from "./retrieval-validate";
import type { SourceCitation } from "@/lib/schema/research-schema";
import type { RetrievedSource } from "./retrieval.types";

function c(url: string, id = `c-${url}`): SourceCitation {
  return {
    id,
    title: `title for ${url}`,
    url,
    snippet: "snippet",
    accessedAt: "2026-06-27T00:00:00.000Z",
    confidence: "medium",
    agent: "market-sizer",
  };
}

function r(url: string, score = 0.7): RetrievedSource {
  return {
    id: `r-${url}`,
    title: `title for ${url}`,
    url,
    snippet: "snippet",
    accessedAt: "2026-06-27T00:00:00.000Z",
    confidence: "high",
    agent: "market-sizer",
    score,
    retrievedAt: "2026-06-27T00:00:00.000Z",
  };
}

describe("filterCitationsAgainstRetrieved (R215)", () => {
  it("returns input unchanged when no retrieved set is available", () => {
    const citations = [c("https://a.com"), c("https://b.com")];
    const out = filterCitationsAgainstRetrieved(citations, []);
    expect(out.citations).toHaveLength(2);
    expect(out.unverifiable).toBe(0);
    expect(out.total).toBe(2);
  });

  it("keeps only citations whose URL is in the retrieved set", () => {
    const citations = [
      c("https://real.com/1"),
      c("https://fake.com/1"),
      c("https://real.com/2"),
      c("https://fake.com/2"),
    ];
    const retrieved = [r("https://real.com/1"), r("https://real.com/2")];
    const out = filterCitationsAgainstRetrieved(citations, retrieved);
    expect(out.citations.map((x) => x.url)).toEqual([
      "https://real.com/1",
      "https://real.com/2",
    ]);
    expect(out.unverifiable).toBe(2);
    expect(out.total).toBe(4);
  });

  it("preserves citations whose URL is missing (don't drop URL-less entries)", () => {
    const citations: SourceCitation[] = [
      { ...c("https://real.com/1"), url: undefined },
      c("https://fake.com/1"),
    ];
    const retrieved = [r("https://real.com/1")];
    const out = filterCitationsAgainstRetrieved(citations, retrieved);
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].url).toBeUndefined();
    expect(out.unverifiable).toBe(1);
  });

  it("deduplicates citations by URL", () => {
    const citations = [c("https://a.com"), c("https://a.com"), c("https://b.com")];
    const retrieved = [r("https://a.com"), r("https://b.com")];
    const out = filterCitationsAgainstRetrieved(citations, retrieved);
    expect(out.citations).toHaveLength(2);
  });

  it("deduplicates by id when URLs are missing", () => {
    const citations = [
      { ...c("https://a.com"), url: undefined, id: "shared-id" },
      { ...c("https://b.com"), url: undefined, id: "shared-id" },
      { ...c("https://c.com"), url: undefined, id: "other" },
    ];
    const out = filterCitationsAgainstRetrieved(citations, []);
    expect(out.citations).toHaveLength(2);
  });
});