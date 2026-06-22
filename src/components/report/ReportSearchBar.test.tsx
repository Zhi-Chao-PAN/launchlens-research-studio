/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReportSearchBar } from "@/components/report/ReportSearchBar";
import type { RefObject } from "react";

function setupContainer() {
  const container = document.createElement("div");
  container.innerHTML = `
    <div>
      <h2>Market Sizer Report</h2>
      <p>Market size analysis with TAM, SAM, and SOM.</p>
      <p>Key trends show AI adoption is accelerating rapidly.</p>
      <ul>
        <li>Market growth is strong</li>
        <li>SMB adoption is widespread</li>
      </ul>
    </div>
  `;
  document.body.appendChild(container);
  return container;
}

describe("ReportSearchBar", () => {
  let container: HTMLDivElement;
  let containerRef: RefObject<HTMLDivElement>;

  beforeEach(() => {
    document.body.innerHTML = "";
    container = setupContainer();
    containerRef = { current: container } as RefObject<HTMLDivElement>;
  });

  it("renders search input", () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    expect(screen.getByPlaceholderText("Search in report...")).toBeTruthy();
  });

  it("highlights matches when typing a query", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "market" } });

    // The component uses a debounce; waitFor polls until the DOM updates
    // and runs the checks inside React's act() so no act() warnings fire.
    await waitFor(() => {
      const marks = container.querySelectorAll("mark[data-search-highlight]");
      expect(marks.length).toBeGreaterThan(0);
      for (const mark of marks) {
        expect(mark.textContent?.toLowerCase()).toContain("market");
      }
    });
  });

  it("shows match count in input", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "market" } });

    await waitFor(() => {
      const counter = document.querySelector(".tabular-nums");
      expect(counter).toBeTruthy();
      expect(counter?.textContent).toMatch(/[0-9]+\/[0-9]+/);
    });
  });

  it("clears highlights when query is empty", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "AI" } });
    await waitFor(() => {
      expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);
    });

    fireEvent.change(input, { target: { value: "" } });
    await waitFor(() => {
      expect(container.querySelectorAll("mark").length).toBe(0);
    });
  });
});
