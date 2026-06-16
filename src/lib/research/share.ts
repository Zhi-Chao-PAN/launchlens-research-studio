// Sharing utilities — build and parse shareable session references.

const SHARE_KEY_PREFIX = "share:";

export function buildShareUrl(sessionId: string, baseUrl?: string): string {
  if (typeof window === "undefined") return "";
  const origin = baseUrl ?? window.location.origin + window.location.pathname;
  const url = new URL(origin);
  url.hash = SHARE_KEY_PREFIX + sessionId;
  return url.toString();
}

export function parseSessionFromHash(hash: string): string | null {
  if (!hash) return null;
  const cleaned = hash.replace(/^#/, "");
  if (cleaned.startsWith(SHARE_KEY_PREFIX)) {
    const id = cleaned.slice(SHARE_KEY_PREFIX.length);
    if (/^[a-z0-9]+$/i.test(id)) return id;
  }
  return null;
}

export function clearHash(): void {
  if (typeof window === "undefined") return;
  if (window.location.hash) {
    // Use replaceState to avoid leaving an extra history entry
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

export async function copyShareUrl(sessionId: string): Promise<boolean> {
  const url = buildShareUrl(sessionId);
  if (!url) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    return true;
  } catch {
    return false;
  }
}
