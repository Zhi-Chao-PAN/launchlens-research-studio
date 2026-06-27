// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionableError } from "./ActionableError";

describe("ActionableError (R223)", () => {
  it("renders title and detail", () => {
    render(
      <ActionableError
        title="Research failed"
        detail="Connection refused"
        variant="error"
      />,
    );
    expect(screen.getByText("Research failed")).toBeTruthy();
    expect(screen.getByText("Connection refused")).toBeTruthy();
  });

  it("omits detail block when not provided", () => {
    render(<ActionableError title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeTruthy();
    expect(screen.queryByText("Connection refused")).toBeNull();
  });

  it("renders action buttons and fires onClick", () => {
    const onPrimary = vi.fn();
    const onSecondary = vi.fn();
    render(
      <ActionableError
        title="Failed"
        actions={[
          { label: "Retry", onClick: onPrimary },
          { label: "Dismiss", onClick: onSecondary, variant: "secondary" },
        ]}
      />,
    );
    fireEvent.click(screen.getByText("Retry"));
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("applies primary filled style and secondary outline style", () => {
    render(
      <ActionableError
        title="Failed"
        actions={[
          { label: "Retry", onClick: () => {} },
          { label: "Dismiss", onClick: () => {}, variant: "secondary" },
        ]}
      />,
    );
    const retry = screen.getByText("Retry").closest("button")!;
    const dismiss = screen.getByText("Dismiss").closest("button")!;
    expect(retry.className).toContain("bg-indigo-600");
    expect(dismiss.className).toContain("border");
    expect(dismiss.className).not.toContain("bg-indigo-600");
  });

  it("uses alert role + assertive aria-live for error variant", () => {
    render(<ActionableError title="Boom" variant="error" />);
    const el = screen.getByText("Boom").closest("[role]")!;
    expect(el.getAttribute("role")).toBe("alert");
    expect(el.getAttribute("aria-live")).toBe("assertive");
  });

  it("uses status role + polite aria-live for info variant", () => {
    render(<ActionableError title="Not found" variant="info" role="status" />);
    const el = screen.getByText("Not found").closest("[role]")!;
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("renders a custom icon when provided", () => {
    render(<ActionableError title="X" icon={<span data-testid="ico">🚫</span>} />);
    expect(screen.getByTestId("ico")).toBeTruthy();
  });
});
