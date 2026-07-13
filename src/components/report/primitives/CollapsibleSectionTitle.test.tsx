// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CollapsibleSectionTitle } from "./CollapsibleSectionTitle";

describe("CollapsibleSectionTitle", () => {
  it("exposes native disclosure semantics and invokes its action", () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSectionTitle
        controls="exec-summary-content"
        expanded={false}
        onToggle={onToggle}
      >
        Executive summary
      </CollapsibleSectionTitle>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Executive summary" });
    const button = screen.getByRole("button", { name: "Executive summary" });
    expect(heading.contains(button)).toBe(true);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("exec-summary-content");

    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("reports the expanded state", () => {
    render(
      <CollapsibleSectionTitle
        controls="sources-content"
        expanded
        onToggle={() => {}}
      >
        Sources
      </CollapsibleSectionTitle>,
    );

    expect(screen.getByRole("button", { name: "Sources" }).getAttribute("aria-expanded"))
      .toBe("true");
  });
});
