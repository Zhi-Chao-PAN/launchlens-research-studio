// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useConfirm } from "./useConfirm";
import { useEffect } from "react";

describe("ConfirmDialog pending state (round 195)", () => {
  it("disables buttons and shows spinner while pending", () => {
    render(
      <ConfirmDialog
        open={true}
        title="Deleting..."
        pending={true}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const cancelBtn = screen.getByText("Cancel") as HTMLButtonElement;
    const confirmBtn = screen.getByText("Delete") as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);
    expect(confirmBtn.disabled).toBe(true);
    // spinner exists (span with animate-spin)
    expect(confirmBtn.querySelector(".animate-spin")).toBeTruthy();
  });
});

describe("useConfirm (round 195)", () => {
  it("closes after sync onConfirm", () => {
    function Host() {
      const { askConfirm, dialog } = useConfirm();
      useEffect(() => {
        askConfirm("Sure?", "msg", () => {});
      }, [askConfirm]);
      return <>{dialog}</>;
    }
    render(<Host />);
    expect(screen.getByText("Sure?")).toBeTruthy();
    fireEvent.click(screen.getByText("Confirm"));
    expect(screen.queryByText("Sure?")).toBeNull();
  });

  it("stays open during async onConfirm and closes after", async () => {
    let resolve: (() => void) | null = null;
    function Host() {
      const { askConfirm, dialog } = useConfirm();
      return (
        <>
          <button
            onClick={() => askConfirm("Delete?", "msg", () => new Promise<void>((r) => { resolve = r; }))}
          >
            ask
          </button>
          {dialog}
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByText("ask"));
    fireEvent.click(screen.getByText("Confirm"));
    // pending - spinner appears and cancel disabled
    const confirmBtn = screen.getByText("Confirm") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(confirmBtn.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.getByText("Delete?")).toBeTruthy();
    act(() => { resolve && resolve(); });
    await waitFor(() => expect(screen.queryByText("Delete?")).toBeNull());
  });

  it("cancel is disabled while pending", () => {
    let resolve: (() => void) | null = null;
    function Host() {
      const { askConfirm, dialog } = useConfirm();
      return (
        <>
          <button onClick={() => askConfirm("X?", "m", () => new Promise<void>((r) => { resolve = r; }))}>a</button>
          {dialog}
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByText("a"));
    fireEvent.click(screen.getByText("Confirm"));
    fireEvent.click(screen.getByText("Cancel"));
    // should still be open (cancel disabled while pending)
    expect(screen.getByText("X?")).toBeTruthy();
    act(() => { resolve && resolve(); });
  });
});
