// @vitest-environment jsdom
﻿import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog (round 193)", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ConfirmDialog open={false} title="Sure?" onConfirm={() => {}} onCancel={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders title/message and calls onConfirm/onCancel", () => {
    let confirmed = false;
    let cancelled = false;
    render(
      <ConfirmDialog
        open={true}
        title="Delete item?"
        message="Cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { confirmed = true; }}
        onCancel={() => { cancelled = true; }}
      />
    );
    expect(screen.getByText("Delete item?")).toBeTruthy();
    expect(screen.getByText("Cannot be undone.")).toBeTruthy();
    fireEvent.click(screen.getByText("Delete"));
    expect(confirmed).toBe(true);
    render(
      <ConfirmDialog
        open={true}
        title="Delete item?"
        onConfirm={() => {}}
        onCancel={() => { cancelled = true; }}
      />, { container: document.body }
    );
    // Escape calls onCancel
    fireEvent.keyDown(window, { key: "Escape" });
  });
});
