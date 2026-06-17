/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReportSearchBar } from "@/components/report/ReportSearchBar";
import { createRef } from "react";
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
    // Clear body
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

    // Wait for debounce
    await new Promise((r) => setTimeout(r, 200));

    const marks = container.querySelectorAll("mark[data-search-highlight]");
    expect(marks.length).toBeGreaterThan(0);

    for (const mark of marks) {
      expect(mark.textContent?.toLowerCase()).toContain("market");
    }
  });

  it("shows match count in input", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "market" } });

    await new Promise((r) => setTimeout(r, 200));

    const counter = document.querySelector(".tabular-nums");
    expect(counter).toBeTruthy();
    expect(counter?.textContent).toMatch(/[0-9]+\/[0-9]+/);
  });

  it("clears highlights when query is empty", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "AI" } });
    await new Promise((r) => setTimeout(r, 200));
    expect(container.querySelectorAll("mark").length).toBeGreaterThan(0);

    fireEvent.change(input, { target: { value: "" } });
    await new Promise((r) => setTimeout(r, 200));
    expect(container.querySelectorAll("mark").length).toBe(0);
  });

  it("is case-insensitive", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "MARKET" } });
    await new Promise((r) => setTimeout(r, 200));

    const marks = container.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
  });

  it("shows 0/0 for non-matching query", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "nonexistentxyz" } });
    await new Promise((r) => setTimeout(r, 200));

    const counter = document.querySelector(".tabular-nums");
    expect(counter?.textContent).toContain("0/0");
  });

  it("navigates to next and previous matches", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...");

    fireEvent.change(input, { target: { value: "market" } });
    await new Promise((r) => setTimeout(r, 200));

    const marks = container.querySelectorAll("mark");
    const total = marks.length;
    expect(total).toBeGreaterThan(1);

    const nextBtn = screen.getByLabelText("Next match");
    const prevBtn = screen.getByLabelText("Previous match");

    // First match should be active initially
    expect(marks[0].classList.contains("search-match-active")).toBe(true);

    fireEvent.click(nextBtn);
    expect(marks[1].classList.contains("search-match-active")).toBe(true);
    expect(marks[0].classList.contains("search-match-active")).toBe(false);

    fireEvent.click(prevBtn);
    expect(marks[0].classList.contains("search-match-active")).toBe(true);
  });

  it("clears search on Escape key", async () => {
    render(<ReportSearchBar containerRef={containerRef} />);
    const input = screen.getByPlaceholderText("Search in report...") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "market" } });
    await new Promise((r) => setTimeout(r, 200));
    expect(input.value).toBe("market");

    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
  });
});
