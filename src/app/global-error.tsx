"use client";

import { useEffect, useState } from "react";

// Global error boundary for the root layout.
// Next.js requires this file to provide its own <html>/<body> since it renders
// outside the normal layout tree. This catches errors thrown in the root layout
// (LocaleProvider, WebVitalsReporter, etc.) that error.tsx cannot catch.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[global-error]", error);
  }, [error]);

  const copyTrace = async () => {
    try {
      const trace = [
        "Message: " + error.message,
        "Digest: " + (error.digest ?? "n/a"),
        "Stack:",
        error.stack ?? "(no stack)",
      ].join("\n");
      await navigator.clipboard.writeText(trace);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
          <div style={{ maxWidth: 480, width: "100%", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", padding: "2rem", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#1e293b", margin: "0 0 0.5rem" }}>Something went wrong</h1>
            <p style={{ color: "#64748b", margin: "0 0 1.5rem" }}>
              An unexpected error occurred. Please try again.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace", marginBottom: "1rem" }}>
                Error ID: {error.digest}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", justifyContent: "center" }}>
              <button
                onClick={reset}
                style={{ padding: "0.5rem 1rem", background: "#4f46e5", color: "white", fontWeight: "500", borderRadius: "0.5rem", border: "none", cursor: "pointer", fontSize: "0.875rem" }}
              >
                Try again
              </button>
              <button
                onClick={copyTrace}
                style={{ padding: "0.5rem 1rem", background: "white", border: "1px solid #e2e8f0", color: "#334155", fontWeight: "500", borderRadius: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}
              >
                {copied ? "Copied" : "Copy error details"}
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
