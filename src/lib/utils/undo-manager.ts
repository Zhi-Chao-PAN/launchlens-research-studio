/**
 * UndoManager - pure delete-with-grace-period logic.
 * No React dependencies - fully testable in node environment.
 */

export interface UndoManagerOptions<T> {
  gracePeriod?: number;
  onDelete: (item: T) => void;
  onRestore?: (item: T) => void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

export class UndoManager<T> {
  private gracePeriod: number;
  private onDelete: (item: T) => void;
  private onRestore?: (item: T) => void;
  private pending = new Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>();
  private setTimeout: typeof setTimeout;
  private clearTimeout: typeof clearTimeout;

  constructor(options: UndoManagerOptions<T>) {
    this.gracePeriod = options.gracePeriod ?? 5000;
    this.onDelete = options.onDelete;
    this.onRestore = options.onRestore;
    this.setTimeout = options.setTimeout ?? globalThis.setTimeout;
    this.clearTimeout = options.clearTimeout ?? globalThis.clearTimeout;
  }

  /** Request deletion - enters grace period */
  requestDelete(item: T, id: string): void {
    this.clearPending(id);

    const timer = this.setTimeout(() => {
      this.pending.delete(id);
      this.onDelete(item);
    }, this.gracePeriod);

    this.pending.set(id, { item, timer });
  }

  /** Cancel pending deletion */
  undoDelete(id: string): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;

    this.clearPending(id);
    this.onRestore?.(entry.item);
    return true;
  }

  /** Immediately delete (skip grace period) */
  confirmDelete(item: T, id: string): void {
    this.clearPending(id);
    this.onDelete(item);
  }

  /** Is an item pending deletion? */
  isPending(id: string): boolean {
    return this.pending.has(id);
  }

  /** Get number of pending deletions */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Get all pending IDs */
  getPendingIds(): string[] {
    return Array.from(this.pending.keys());
  }

  private clearPending(id: string): void {
    const entry = this.pending.get(id);
    if (entry) {
      this.clearTimeout(entry.timer);
      this.pending.delete(id);
    }
  }

  /** Cancel all pending deletions without executing them */
  cancelAll(): void {
    this.pending.forEach((entry) => {
      this.clearTimeout(entry.timer);
    });
    this.pending.clear();
  }

  /** Destroy - cancel all pending */
  destroy(): void {
    this.cancelAll();
  }
}

export default UndoManager;
