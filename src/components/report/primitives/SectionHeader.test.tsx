// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders a semantic report heading and count", () => {
    render(<SectionHeader title="Market sizing" description="Decision context" count={3} />);

    expect(screen.getByRole("heading", { level: 2, name: "Market sizing" })).toBeTruthy();
    expect(screen.getByText("3 items")).toBeTruthy();
    expect(screen.getByText("Decision context")).toBeTruthy();
  });

  it("exposes the copy action with a visible accessible label", () => {
    const onCopy = vi.fn();
    render(<SectionHeader title="Market sizing" onCopy={onCopy} copyLabel="Copy analysis" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy analysis" }));
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("uses a flat editorial surface rather than a gradient treatment", () => {
    const { container } = render(<SectionHeader title="Market sizing" />);

    expect(container.querySelector('[class*="bg-gradient"]')).toBeNull();
  });
});
