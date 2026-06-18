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
    if (/^[a-z0-9_-]+$/i.test(id)) return id;
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

/* ------------------------------------------------------------------ */
/*  Extended share utilities (round 147)                              */
/* ------------------------------------------------------------------ */

export interface ShareLinkInfo {
  sessionId: string;
  url: string;
  isSecure: boolean;
  hash: string;
}

export function inspectShareUrl(url: string): ShareLinkInfo | null {
  try {
    const u = new URL(url);
    const id = parseSessionFromHash(u.hash);
    if (!id) return null;
    return {
      sessionId: id,
      url: u.toString(),
      isSecure: u.protocol === "https:",
      hash: u.hash,
    };
  } catch {
    return null;
  }
}

export interface SocialShareUrls {
  twitter: string;
  linkedin: string;
  email: string;
  reddit: string;
}

export function buildSocialShareLinks(url: string, title?: string): SocialShareUrls {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title || "LaunchLens research");
  return {
    twitter: "https://twitter.com/intent/tweet?url=" + u + "&text=" + t,
    linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=" + u,
    email: "mailto:?subject=" + t + "&body=" + u,
    reddit: "https://www.reddit.com/submit?url=" + u + "&title=" + t,
  };
}

export interface EmbedSnippetOptions {
  width?: number;
  height?: number;
  responsive?: boolean;
}

export function buildEmbedSnippet(sessionId: string, baseUrl: string, opts: EmbedSnippetOptions = {}): string {
  const w = opts.width ?? 800;
  const h = opts.height ?? 600;
  const url = baseUrl.replace(/\/?$/, "") + "/embed/" + encodeURIComponent(sessionId);
  if (opts.responsive) {
    return '<div style="position:relative;padding-top:56.25%;"><iframe src="' + url + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" loading="lazy"></iframe></div>';
  }
  return '<iframe src="' + url + '" width="' + w + '" height="' + h + '" frameborder="0" loading="lazy"></iframe>';
}

export interface ShareEvent {
  id: string;
  sessionId: string;
  channel: "copy" | "twitter" | "linkedin" | "email" | "reddit" | "embed" | "direct";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export function createShareEvent(
  sessionId: string,
  channel: ShareEvent["channel"],
  metadata?: Record<string, unknown>,
): ShareEvent {
  return {
    id: "evt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    sessionId,
    channel,
    timestamp: Date.now(),
    metadata,
  };
}

export interface ShareAnalyticsSummary {
  totalShares: number;
  byChannel: Record<string, number>;
  firstSharedAt?: number;
  lastSharedAt?: number;
}

export function summarizeShares(events: ShareEvent[]): ShareAnalyticsSummary {
  const byChannel: Record<string, number> = {};
  let first: number | undefined;
  let last: number | undefined;
  events.forEach(e => {
    byChannel[e.channel] = (byChannel[e.channel] || 0) + 1;
    if (first === undefined || e.timestamp < first) first = e.timestamp;
    if (last === undefined || e.timestamp > last) last = e.timestamp;
  });
  return { totalShares: events.length, byChannel, firstSharedAt: first, lastSharedAt: last };
}

export interface ShareTokenPayload {
  sessionId: string;
  createdAt: number;
  expiresAt?: number;
  ttlDays?: number;
}

export function encodeShareToken(payload: ShareTokenPayload): string {
  const json = JSON.stringify(payload);
  if (typeof window !== "undefined" && "btoa" in window) {
    return btoa(unescape(encodeURIComponent(json)));
  }
  return Buffer.from(json, "utf8").toString("base64");
}

export function decodeShareToken(token: string): ShareTokenPayload | null {
  try {
    let json: string;
    if (typeof window !== "undefined" && "atob" in window) {
      json = decodeURIComponent(escape(atob(token)));
    } else {
      json = Buffer.from(token, "base64").toString("utf8");
    }
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.sessionId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isShareTokenExpired(payload: ShareTokenPayload, now: number = Date.now()): boolean {
  if (payload.expiresAt) return now > payload.expiresAt;
  if (payload.ttlDays && typeof payload.createdAt === "number") {
    return now > payload.createdAt + payload.ttlDays * 86400000;
  }
  return false;
}

export function isValidShareUrl(value: string): boolean {
  return inspectShareUrl(value) !== null;
}

export function extractSessionsFromUrls(urls: string[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  urls.forEach(u => {
    const info = inspectShareUrl(u);
    if (info && !seen.has(info.sessionId)) {
      seen.add(info.sessionId);
      ids.push(info.sessionId);
    }
  });
  return ids;
}
