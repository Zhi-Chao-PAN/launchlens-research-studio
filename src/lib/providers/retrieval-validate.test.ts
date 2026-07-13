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
    expect(out.accepted).toBe(2);
    expect(out.rejected).toBe(0);
    expect(out.missingUrl).toBe(0);
    expect(out.unverifiable).toBe(0);
    expect(out.total).toBe(2);
  });

  it("keeps compatible citations but strips unsafe clickable URLs", () => {
    const unsafe = c("javascript:alert(1)", "unsafe-link");
    const out = filterCitationsAgainstRetrieved([unsafe], []);

    expect(out.citations).toHaveLength(1);
    expect(out.citations[0]).not.toHaveProperty("url");
    expect(out.accepted).toBe(1);
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
    expect(out.accepted).toBe(2);
    expect(out.rejected).toBe(2);
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
    expect(out.missingUrl).toBe(1);
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

  it("keeps exact-match legacy semantics unless strict mode is explicit", () => {
    const citation = c("https://example.com/report?utm_source=model", "model-id");
    const source = {
      ...r("https://EXAMPLE.com/report/"),
      id: "retrieved-id",
      title: "retrieved title",
    };

    const out = filterCitationsAgainstRetrieved([citation], [source]);

    expect(out.citations).toEqual([]);
    expect(out.idRemap).toEqual({});
    expect(out.rejected).toBe(1);
  });
});

describe("filterCitationsAgainstRetrieved strict policy", () => {
  it("fails closed when the retrieved set is empty", () => {
    const citations: SourceCitation[] = [
      c("https://example.com/report", "with-url"),
      { ...c("https://example.com/missing", "without-url"), url: undefined },
    ];

    const out = filterCitationsAgainstRetrieved(citations, [], { policy: "strict" });

    expect(out.citations).toEqual([]);
    expect(out.total).toBe(2);
    expect(out.accepted).toBe(0);
    expect(out.rejected).toBe(2);
    expect(out.missingUrl).toBe(1);
    expect(out.unverifiable).toBe(2);
    expect(out.idRemap).toEqual({});
  });

  it("rejects missing, non-HTTP(S), malformed, and unmatched URLs", () => {
    const citations: SourceCitation[] = [
      { ...c("https://example.com/missing", "missing"), url: undefined },
      c("mailto:research@example.com", "mailto"),
      c("not an absolute URL", "malformed"),
      c("https://other.example.com/report", "unmatched"),
      c("https://example.com/report", "accepted"),
    ];

    const out = filterCitationsAgainstRetrieved(
      citations,
      [r("https://example.com/report")],
      { policy: "strict" },
    );

    expect(out.citations.map((citation) => citation.id)).toEqual([
      "r-https://example.com/report",
    ]);
    expect(out.total).toBe(5);
    expect(out.accepted).toBe(1);
    expect(out.rejected).toBe(4);
    expect(out.missingUrl).toBe(1);
    expect(out.unverifiable).toBe(4);
  });

  it("normalizes host casing, trailing slashes, tracking params, fragments, and query order", () => {
    const source: RetrievedSource = {
      ...r("https://EXAMPLE.com/reports/market/?b=2&utm_source=tavily&a=1#results"),
      id: "retrieved-source-id",
      title: "Canonical retrieved title",
      snippet: "Canonical retrieved snippet",
      accessedAt: "2026-07-13T09:30:00.000Z",
    };
    const citation: SourceCitation = {
      ...c(
        "https://example.com/reports/market?a=1&fbclid=tracking&b=2",
        "model-citation-id",
      ),
      title: "Model supplied title",
      snippet: "Model supplied snippet",
      accessedAt: "1999-01-01T00:00:00.000Z",
    };

    const out = filterCitationsAgainstRetrieved([citation], [source], {
      policy: "strict",
    });

    expect(out.accepted).toBe(1);
    expect(out.rejected).toBe(0);
    expect(out.citations).toEqual([
      {
        ...citation,
        id: source.id,
        title: source.title,
        url: "https://example.com/reports/market?a=1&b=2",
        snippet: source.snippet,
        accessedAt: source.accessedAt,
        confidence: source.confidence,
      },
    ]);
    expect(out.idRemap["model-citation-id"]).toBe("retrieved-source-id");
  });

  it("uses the first retrieved source when normalized URLs collide", () => {
    const first = {
      ...r("https://example.com/report/?utm_medium=search"),
      id: "first-source",
      title: "First source",
    };
    const second = {
      ...r("https://EXAMPLE.com/report"),
      id: "second-source",
      title: "Second source",
    };

    const out = filterCitationsAgainstRetrieved(
      [c("https://example.com/report?gclid=click", "model-id")],
      [first, second],
      { policy: "strict" },
    );

    expect(out.citations[0].id).toBe("first-source");
    expect(out.citations[0].title).toBe("First source");
    expect(out.idRemap["model-id"]).toBe("first-source");
  });

  it("reports accepted policy decisions before deduplicating canonical sources", () => {
    const source = r("https://example.com/report");
    const out = filterCitationsAgainstRetrieved(
      [
        c("https://example.com/report", "model-a"),
        c("https://example.com/report/", "model-b"),
      ],
      [source],
      { policy: "strict" },
    );

    expect(out.accepted).toBe(2);
    expect(out.rejected).toBe(0);
    expect(out.citations).toHaveLength(1);
    expect(out.idRemap["model-a"]).toBe(source.id);
    expect(out.idRemap["model-b"]).toBe(source.id);
  });

  it("safely records model-generated ids that look like object properties", () => {
    const source = r("https://example.com/report");
    const out = filterCitationsAgainstRetrieved(
      [c("https://example.com/report", "__proto__")],
      [source],
      { policy: "strict" },
    );

    expect(out.idRemap["__proto__"]).toBe(source.id);
    expect(Object.getPrototypeOf(out.idRemap)).toBeNull();
  });

  it("fails closed when one model citation id points to different URLs", () => {
    const first = r("https://one.example.com/report");
    const second = r("https://two.example.com/report");
    const out = filterCitationsAgainstRetrieved(
      [
        c(first.url!, "ambiguous-id"),
        c(second.url!, "ambiguous-id"),
      ],
      [first, second],
      { policy: "strict" },
    );

    expect(out.citations).toEqual([]);
    expect(out.accepted).toBe(0);
    expect(out.rejected).toBe(2);
    expect(out.idRemap["ambiguous-id"]).toBeUndefined();
  });

  it("uses retrieved-source confidence instead of the model's self-rating", () => {
    const source = { ...r("https://example.com/report"), confidence: "low" as const };
    const citation = { ...c(source.url!, "model-id"), confidence: "high" as const };

    const out = filterCitationsAgainstRetrieved([citation], [source], {
      policy: "strict",
    });

    expect(out.citations[0].confidence).toBe("low");
  });

  it.each([
    "https://user:secret@example.com/report",
    "http://localhost/report",
    "http://127.0.0.1/report",
    "http://169.254.169.254/latest/meta-data",
  ])("rejects unsafe URLs even if retrieval returned the same value: %s", (url) => {
    const out = filterCitationsAgainstRetrieved([c(url)], [r(url)], {
      policy: "strict",
    });
    expect(out.citations).toEqual([]);
    expect(out.rejected).toBe(1);
  });
});
