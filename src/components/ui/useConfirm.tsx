"use client";
import { useCallback, useState } from "react";
import { ConfirmDialog, type ConfirmDialogProps } from "@/components/ui/ConfirmDialog";

export interface ConfirmRequest {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  onConfirm?: () => void | Promise<void>;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmRequest>({ open: false, title: "" });

  const askConfirm = useCallback(
    (
      title: string,
      message: string | undefined,
      onConfirm: () => void | Promise<void>,
      opts: Partial<Pick<ConfirmDialogProps, "confirmLabel" | "cancelLabel" | "tone">> = {},
    ) => {
      setState({
        open: true,
        title,
        message,
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        tone: opts.tone ?? "danger",
        pending: false,
        onConfirm,
      });
    },
    [],
  );

  const handleConfirm = useCallback(async () => {
    const fn = state.onConfirm;
    if (!fn) return;
    const result = fn();
    if (result && typeof (result as Promise<void>).then === "function") {
      setState((prev) => ({ ...prev, pending: true }));
      try {
        await result;
      } finally {
        setState({ open: false, title: "" });
      }
    } else {
      setState({ open: false, title: "" });
    }
  }, [state.onConfirm]);

  const handleCancel = useCallback(() => {
    if (state.pending) return;
    setState({ open: false, title: "" });
  }, [state.pending]);

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      tone={state.tone}
      pending={state.pending}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { askConfirm, dialog };
}
