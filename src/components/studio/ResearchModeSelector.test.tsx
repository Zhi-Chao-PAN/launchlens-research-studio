// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResearchModeSelector } from "./ResearchModeSelector";

describe("ResearchModeSelector", () => {
  it("exposes both modes and reports a deep-mode selection", () => {
    const onChange = vi.fn();
    render(<ResearchModeSelector value="standard" onChange={onChange} />);

    expect((screen.getByRole("radio", { name: /standard/i }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Preview").textContent).toBe("Preview");

    fireEvent.click(screen.getByRole("radio", { name: /deep research/i }));
    expect(onChange).toHaveBeenCalledWith("deep");
  });

  it("renders server-authoritative Deep readiness instead of the static preview flag", () => {
    render(
      <ResearchModeSelector
        value="deep"
        onChange={vi.fn()}
        runtimeAvailability={{ deep: "available" }}
        readiness={{ deep: { ready: 7, total: 7 } }}
      />,
    );

    expect(screen.getAllByText("Ready")).toHaveLength(2);
    expect(screen.getByText(/7\/7 controls ready/)).toBeTruthy();
    expect(screen.queryByText("Preview")).toBeNull();
  });
});
