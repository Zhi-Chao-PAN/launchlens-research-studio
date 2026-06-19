"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType, options?: { duration?: number; action?: ToastItem["action"]; key?: string }) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let idCounter = 0;
function generateId(): string {
  idCounter++;
  return "toast-" + idCounter;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", options?: { duration?: number; action?: ToastItem["action"]; key?: string }) => {
      const id = generateId();
      const duration = options?.duration ?? (type === "error" ? 5000 : 3000);

      const toast: ToastItem = {
        id,
        message,
        type,
        duration,
        action: options?.action,
      };

      setToasts((prev) => {
        // Dedup by key if provided
        if (options?.key && prev.some((t) => (t as any)._key === options.key)) return prev;
        const entry = { ...toast, ...(options?.key ? { _key: options.key } : {}) };
        return [...prev, entry];
      });

      if (duration > 0) {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
          timersRef.current.delete(id);
        }, duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    []
  );

  const clearAll = useCallback(() => {
    setToasts([]);
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast, clearAll }}>
      {children}
      <div className="toast-container" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={"toast toast-" + toast.type} role="alert">
            <span className="toast-icon">
              {toast.type === "success" && "✓"}
              {toast.type === "error" && "✕"}
              {toast.type === "warning" && "⚠"}
              {toast.type === "info" && "ℹ"}
            </span>
            <span className="toast-message">{toast.message}</span>
            {toast.action && (
              <button
                className="toast-action"
                onClick={() => {
                  toast.action?.onClick();
                  dismissToast(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              className="toast-close"
              onClick={() => dismissToast(toast.id)}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export default ToastContext;
