/**
 * Client-side share utilities.
 * Works in the browser — calls the share API to create tokens.
 */

const SHARE_API_BASE = "/api/research/share";

/**
 * Build a share URL from a share token.
 * Uses the current window origin.
 */
export function buildShareUrl(token: string): string {
  if (typeof window === "undefined") {
    return `/share/${token}`;
  }
  return `${window.location.origin}/share/${token}`;
}

/**
 * Create a share token for a run and copy the URL to clipboard.
 * Returns true on success.
 */
export async function copyShareUrl(
  runId: string,
  options: { expiresInMs?: number; maxViews?: number } = {},
): Promise<boolean> {
  try {
    const res = await fetch(SHARE_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        ...options,
      }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    const url = buildShareUrl(data.token);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }

    // Fallback
    const textarea = document.createElement("textarea");
    textarea.value = url;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return true;
  } catch {
    return false;
  }
}

/**
 * Revoke a share token.
 */
export async function revokeShare(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${SHARE_API_BASE}?token=${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Get all shares for a run.
 */
export interface ShareInfo {
  token: string;
  runId: string;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  maxViews: number | null;
  revoked: boolean;
}

export async function getShares(runId: string): Promise<ShareInfo[]> {
  try {
    const res = await fetch(`${SHARE_API_BASE}?runId=${encodeURIComponent(runId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.shares || [];
  } catch {
    return [];
  }
}
