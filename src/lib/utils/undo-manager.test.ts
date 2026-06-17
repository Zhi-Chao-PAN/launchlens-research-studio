import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UndoManager } from "./undo-manager";

describe("UndoManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("starts with no pending deletes", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });
    expect(manager.pendingCount).toBe(0);
    expect(manager.isPending("test")).toBe(false);
  });

  it("marks item as pending when requestDelete is called", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.requestDelete({ name: "test" }, "id-1");

    expect(manager.isPending("id-1")).toBe(true);
    expect(manager.pendingCount).toBe(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("calls onDelete after grace period", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.requestDelete({ name: "test" }, "id-1");

    // Before grace period
    vi.advanceTimersByTime(500);
    expect(onDelete).not.toHaveBeenCalled();
    expect(manager.isPending("id-1")).toBe(true);

    // After grace period
    vi.advanceTimersByTime(600);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith({ name: "test" });
    expect(manager.isPending("id-1")).toBe(false);
  });

  it("cancels delete when undo is called", () => {
    const onDelete = vi.fn();
    const onRestore = vi.fn();
    const manager = new UndoManager({ onDelete, onRestore, gracePeriod: 1000 });

    manager.requestDelete({ name: "test" }, "id-1");
    const result = manager.undoDelete("id-1");

    expect(result).toBe(true);
    expect(manager.isPending("id-1")).toBe(false);
    expect(onRestore).toHaveBeenCalledWith({ name: "test" });

    // Advance past grace period - should NOT call onDelete
    vi.advanceTimersByTime(2000);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("undoDelete returns false for non-pending id", () => {
    const onDelete = vi.fn();
    const onRestore = vi.fn();
    const manager = new UndoManager({ onDelete, onRestore, gracePeriod: 1000 });

    const result = manager.undoDelete("nonexistent");
    expect(result).toBe(false);
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("confirmDelete skips grace period", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.confirmDelete({ name: "now" }, "id-now");

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(manager.isPending("id-now")).toBe(false);
  });

  it("handles multiple pending deletes independently", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.requestDelete({ name: "a" }, "id-a");
    manager.requestDelete({ name: "b" }, "id-b");

    expect(manager.isPending("id-a")).toBe(true);
    expect(manager.isPending("id-b")).toBe(true);
    expect(manager.pendingCount).toBe(2);

    manager.undoDelete("id-a");

    expect(manager.isPending("id-a")).toBe(false);
    expect(manager.isPending("id-b")).toBe(true);

    vi.advanceTimersByTime(1500);

    // Only b should have been deleted
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith({ name: "b" });
  });

  it("cancelAll stops all pending deletes", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.requestDelete({ name: "a" }, "id-a");
    manager.requestDelete({ name: "b" }, "id-b");
    manager.cancelAll();

    expect(manager.pendingCount).toBe(0);

    vi.advanceTimersByTime(2000);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("re-requesting delete resets the timer", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.requestDelete({ name: "test" }, "id-1");
    vi.advanceTimersByTime(800);

    // Re-request before timer fires
    manager.requestDelete({ name: "test" }, "id-1");
    expect(manager.isPending("id-1")).toBe(true);

    // Advance past original timer, but not past new one
    vi.advanceTimersByTime(300);
    expect(onDelete).not.toHaveBeenCalled();

    // Advance past the new timer
    vi.advanceTimersByTime(800);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("getPendingIds returns all pending IDs", () => {
    const onDelete = vi.fn();
    const manager = new UndoManager({ onDelete, gracePeriod: 1000 });

    manager.requestDelete({ name: "a" }, "id-a");
    manager.requestDelete({ name: "b" }, "id-b");

    const ids = manager.getPendingIds();
    expect(ids).toContain("id-a");
    expect(ids).toContain("id-b");
    expect(ids.length).toBe(2);
  });
});
