"use client";

import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Best-effort telemetry; never let telemetry throw again.
    try {
      console.error("[error-boundary]", error, info.componentStack);
    } catch {
      /* no-op */
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl mb-4" aria-hidden>!</div>
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-600">An unexpected error occurred while rendering this page. You can try reloading or returning home.</p>
          {error.message && (
            <pre className="mt-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700 overflow-auto whitespace-pre-wrap">
              {error.message}
            </pre>
          )}
          <div className="mt-5 flex gap-2 justify-end">
            <a href="/" className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">Go home</a>
            <button onClick={() => { this.reset(); window.location.reload(); }} className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium">Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
