// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ConfidenceBadge } from "./ConfidenceBadge";

/**
 * R210: provider normalization fills confidence in the happy path, but
 * these tests guard the second layer: ConfidenceBadge must never throw
 * on an undefined or invalid level, even if a future schema change or
 * a session cached before normalization was added leaks a bad value
 * through. The previous behavior was an uncaught TypeError that
 * white-screened the entire report tab.
 */
describe("ConfidenceBadge (R210 defense)", () => {
  it("renders a valid level", () => {
    const { container } = render(<ConfidenceBadge level="high" />);
    expect(container.textContent?.toLowerCase()).toContain("high");
  });

  it("does not throw on undefined level (falls back to 'low')", () => {
    expect(() => render(<ConfidenceBadge level={undefined as unknown as "high"} />)).not.toThrow();
  });

  it("does not throw on an invalid level string", () => {
    expect(() => render(<ConfidenceBadge level={"maybe" as unknown as "high"} />)).not.toThrow();
  });

  it("does not throw on a numeric level", () => {
    expect(() => render(<ConfidenceBadge level={42 as unknown as "high"} />)).not.toThrow();
  });

  it("falls back to 'low' visually for an unknown level", () => {
    const { container } = render(<ConfidenceBadge level={"extreme" as unknown as "high"} />);
    expect(container.textContent?.toLowerCase()).toContain("low");
  });
});
