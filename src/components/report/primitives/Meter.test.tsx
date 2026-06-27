// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Meter, Donut } from "./Meter";

describe("Meter (R214 finite-input defense)", () => {
  it("renders finite values normally", () => {
    const { container } = render(<Meter value={3} max={5} label="test" />);
    const bar = container.querySelector("div[style*='width']") as HTMLElement;
    expect(bar).toBeTruthy();
    // 3/5 = 60%
    expect(bar.style.width).toBe("60%");
  });

  it("clamps values above max to 100% width", () => {
    const { container } = render(<Meter value={10} max={5} label="x" />);
    const bar = container.querySelector("div[style*='width']") as HTMLElement;
    expect(bar.style.width).toBe("100%");
  });

  it("clamps negative values to 0% width", () => {
    const { container } = render(<Meter value={-5} max={5} label="x" />);
    const bar = container.querySelector("div[style*='width']") as HTMLElement;
    expect(bar.style.width).toBe("0%");
  });

  it("renders 0% width for NaN instead of NaN%", () => {
    const { container } = render(<Meter value={Number.NaN} max={5} label="x" />);
    const bar = container.querySelector("div[style*='width']") as HTMLElement;
    expect(bar.style.width).toBe("0%");
  });

  it("renders 0% width for undefined-like inputs", () => {
    // Pass through a number that's NaN to simulate bypassed validation.
    const { container } = render(<Meter value={Number.NaN} max={100} label="x" />);
    const bar = container.querySelector("div[style*='width']") as HTMLElement;
    expect(bar.style.width).toBe("0%");
  });
});

describe("Donut (R214 finite-input defense)", () => {
  it("renders finite values normally", () => {
    const { container } = render(<Donut value={75} label="x" color="#000" />);
    const text = container.textContent;
    // Center text shows the rounded value.
    expect(text).toContain("75");
  });

  it("clamps values above 100", () => {
    const { container } = render(<Donut value={150} label="x" color="#000" />);
    expect(container.textContent).toContain("100");
  });

  it("clamps negative values to 0", () => {
    const { container } = render(<Donut value={-50} label="x" color="#000" />);
    expect(container.textContent).toContain("0");
  });

  it("renders 0 (not 'NaN') for non-finite input", () => {
    const { container } = render(<Donut value={Number.NaN} label="x" color="#000" />);
    expect(container.textContent).not.toContain("NaN");
    expect(container.textContent).toContain("0");
  });
});