// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SafeExternalLink } from "./SafeExternalLink";

describe("SafeExternalLink", () => {
  it("canonicalizes public HTTP(S) destinations", () => {
    render(
      <SafeExternalLink href="https://Example.com/report/?utm_source=mail#details">
        Public report
      </SafeExternalLink>,
    );

    const link = screen.getByRole("link", { name: "Public report" });
    expect(link.getAttribute("href")).toBe("https://example.com/report");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it.each([
    "javascript:alert(1)",
    "http://127.0.0.1/admin",
    "https://user:pass@example.com/private",
  ])("renders rejected destination %s as non-clickable text", (href) => {
    render(<SafeExternalLink href={href}>Untrusted report</SafeExternalLink>);

    expect(screen.queryByRole("link", { name: "Untrusted report" })).toBeNull();
    expect(screen.getByText("Untrusted report").tagName).toBe("SPAN");
  });
});
