/**
 * Soft delete with undo grace period.
 *
 * When you "delete" an item, it goes into a pending state for a grace period.
 * If the user clicks "Undo" within that period, the deletion is cancelled.
 * Otherwise, the actual delete happens.
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface PendingDelete<T> {
  item: T;
  timer: ReturnType<typeof setTimeout>;
}

export interface UseUndoDeleteOptions<T> {
  /** Grace period in ms */
  gracePeriod?: number;
  /** Actual delete function */
  onDelete: (item: T) => void | Promise<void>;
  /** Optional restore function (for items already persisted) */
  onRestore?: (item: T) => void | Promise<void>;
}

export interface UseUndoDeleteResult<T> {
  /** IDs of items pending deletion */
  pendingIds: Set<string>;
  /** Request deletion - enters grace period */
  requestDelete: (item: T, id: string) => void;
  /** Cancel pending deletion */
  undoDelete: (id: string) => void;
  /** Immediately delete (skip grace period) */
  confirmDelete: (item: T, id: string) => void;
  /** Is an item pending deletion? */
  isPending: (id: string) => boolean;
}

export function useUndoDelete<T>({
  gracePeriod = 5000,
  onDelete,
  onRestore,
}: UseUndoDeleteOptions<T>): UseUndoDeleteResult<T> {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const pendingItems = useRef<Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>>(
    new Map()
  );

  const clearPending = useCallback((id: string) => {
    const entry = pendingItems.current.get(id);
    if (entry) {
      clearTimeout(entry.timer);
      pendingItems.current.delete(id);
    }
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const confirmDelete = useCallback(
    (item: T, id: string) => {
      clearPending(id);
      onDelete(item);
    },
    [onDelete, clearPending]
  );

  const requestDelete = useCallback(
    (item: T, id: string) => {
      // Clear any existing
      clearPending(id);

      const timer = setTimeout(() => {
        confirmDelete(item, id);
      }, gracePeriod);

      pendingItems.current.set(id, { item, timer });
      setPendingIds((prev) => new Set(prev).add(id));
    },
    [gracePeriod, confirmDelete, clearPending]
  );

  const undoDelete = useCallback(
    (id: string) => {
      const entry = pendingItems.current.get(id);
      if (!entry) return;

      clearPending(id);
      onRestore?.(entry.item);
    },
    [onRestore, clearPending]
  );

  const isPending = useCallback(
    (id: string) => pendingIds.has(id),
    [pendingIds]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      pendingItems.current.forEach((entry) => {
        clearTimeout(entry.timer);
      });
      pendingItems.current.clear();
    };
  }, []);

  return { pendingIds, requestDelete, undoDelete, confirmDelete, isPending };
}

export default useUndoDelete;
