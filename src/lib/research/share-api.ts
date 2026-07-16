import { fetchWithCsrf } from "@/lib/api/csrf-client";

/**
 * Client-side share utilities.
 * Works in the browser — calls the share API to create tokens.
 */

import type { ShareSectionId } from "@/lib/research/share-manifest";

const SHARE_API_BASE = "/api/research/share";

export interface ShareCreationOptions {
  expiresInMs?: number;
  maxViews?: number;
  sections?: ShareSectionId[];
}

export interface CreatedShare {
  token: string;
  /** One-time capability used by the creator to revoke this share. */
  manageToken: string;
  expiresAt: number | null;
  maxViews: number | null;
  createdAt: number;
  sections: ShareSectionId[];
}

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

export interface CopyShareResult {
  ok: boolean;
  url?: string;
  token?: string;
  manageToken?: string;
  sections?: ShareSectionId[];
  copied: boolean;
  error?: string;
}

/**
 * Create a share token for a run and copy the URL to the clipboard.
 * Returns structured result so callers can show the URL on copy failure.
 */
export async function createShareAndCopyUrl(
  runId: string,
  options: ShareCreationOptions = {},
): Promise<CopyShareResult> {
  try {
    const res = await fetchWithCsrf(SHARE_API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, ...options }),
    });

    if (!res.ok) {
      let reason = "HTTP " + res.status;
      try { const body = await res.json(); if (body?.error) reason = String(body.error); } catch { /* no body */ }
      return { ok: false, copied: false, error: reason };
    }

    const data = await res.json();
    const url = buildShareUrl(data.token);

    let copied = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(url); copied = true; } catch { copied = false; }
    }
    if (!copied) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { copied = false; }
    }
    return {
      ok: true,
      url,
      token: data.token,
      manageToken: data.manageToken,
      sections: data.sections,
      copied,
    };
  } catch (e) {
    return { ok: false, copied: false, error: e instanceof Error ? e.message : "Failed to create share link" };
  }
}

/** Back-compat: returns true when share is created AND URL is copied to clipboard. */
export async function copyShareUrl(
  runId: string,
  options: ShareCreationOptions = {},
): Promise<boolean> {
  const r = await createShareAndCopyUrl(runId, options);
  return r.ok && r.copied;
}

export async function createShareWithOptions(
  runId: string,
  options: ShareCreationOptions = {},
): Promise<CreatedShare | null> {
  try {
    const res = await fetchWithCsrf(SHARE_API_BASE, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        ...options,
      }),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Revoke a share token.
 */
export async function revokeShare(token: string, manageToken: string): Promise<boolean> {
  try {
    const res = await fetchWithCsrf(SHARE_API_BASE, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, manageToken }),
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

/* ------------------------------------------------------------------ */
/*  Pure share-api helpers (round 161)                                */
/* ------------------------------------------------------------------ */

/** Build share URL using an explicit base (SSR/test-safe version). */
export function buildShareUrlForBase(token: string, baseUrl?: string): string {
  if (!baseUrl) return buildShareUrl(token);
  const cleanBase = baseUrl.replace(/\/$/, "");
  return `${cleanBase}/share/${token}`;
}

/** Human-friendly time-remaining label, Chinese. Input is ms remaining. */
export function formatExpiryLabel(expiresAt: number | null | undefined, nowMs: number = Date.now()): string {
  if (!expiresAt) return "永不过期";
  const ms = expiresAt - nowMs;
  if (ms <= 0) return "已过期";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} 分钟后过期`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小时后过期`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} 天后过期`;
  const months = Math.floor(days / 30);
  return `${months} 个月后过期`;
}

export type ShareStatus = "active" | "expired" | "maxed" | "revoked";

/** Compute share status from a ShareInfo object (pure, no fetch). */
export function getShareStatus(s: ShareInfo, nowMs: number = Date.now()): ShareStatus {
  if (s.revoked) return "revoked";
  if (s.expiresAt != null && nowMs > s.expiresAt) return "expired";
  if (s.maxViews != null && s.views >= s.maxViews) return "maxed";
  return "active";
}

export interface ShareInfoSummary {
  total: number;
  active: number;
  expired: number;
  maxed: number;
  revoked: number;
  totalViews: number;
}

/** Summarize an array of ShareInfo records. */
export function summarizeShareInfo(shares: ShareInfo[], nowMs: number = Date.now()): ShareInfoSummary {
  const out: ShareInfoSummary = { total: shares.length, active: 0, expired: 0, maxed: 0, revoked: 0, totalViews: 0 };
  for (const s of shares) {
    out.totalViews += s.views;
    out[getShareStatus(s, nowMs)]++;
  }
  return out;
}

/** Validate options for share creation (expiresInMs, maxViews); returns normalized or throws. */
export function validateShareCreateOptions(opts: { expiresInMs?: number; maxViews?: number; runId?: string } = {}): { expiresInMs?: number; maxViews?: number; runId?: string } {
  const out: { expiresInMs?: number; maxViews?: number; runId?: string } = { ...opts };
  if (out.runId !== undefined && (typeof out.runId !== "string" || !out.runId.trim())) {
    throw new Error("runId is required");
  }
  if (out.expiresInMs !== undefined) {
    if (typeof out.expiresInMs !== "number" || !Number.isFinite(out.expiresInMs) || out.expiresInMs <= 0) {
      throw new Error("expiresInMs must be a positive number");
    }
    out.expiresInMs = Math.max(60_000, Math.min(out.expiresInMs, 365 * 24 * 60 * 60 * 1000));
  }
  if (out.maxViews !== undefined) {
    if (!Number.isInteger(out.maxViews) || out.maxViews < 1) throw new Error("maxViews must be a positive integer");
    out.maxViews = Math.max(1, Math.min(out.maxViews, 100_000));
  }
  return out;
}

/** CSV export for share info list. */
export function shareInfoToCsv(shares: ShareInfo[], nowMs: number = Date.now()): string {
  const header = "token,runId,status,views,maxViews,createdAt,expiresAt,revoked,shareUrl";
  const rows = shares.map((s) => [
    s.token, s.runId, getShareStatus(s, nowMs), s.views, s.maxViews ?? "",
    s.createdAt, s.expiresAt ?? "", s.revoked ? 1 : 0, buildShareUrl(s.token),
  ].join(","));
  return [header, ...rows].join("\n");
}

/** Equality for ShareInfo records. */
export function shareInfoEqual(a: ShareInfo, b: ShareInfo): boolean {
  return a.token === b.token && a.runId === b.runId &&
    a.createdAt === b.createdAt && a.expiresAt === b.expiresAt &&
    a.views === b.views && a.maxViews === b.maxViews && a.revoked === b.revoked;
}

/** Filter/search shares by status, runId, or token substring. */
export function filterShareInfo(shares: ShareInfo[], opts: { status?: ShareStatus; runId?: string; token?: string } = {}, nowMs: number = Date.now()): ShareInfo[] {
  let out = shares.slice();
  if (opts.status) out = out.filter((s) => getShareStatus(s, nowMs) === opts.status);
  if (opts.runId) out = out.filter((s) => s.runId === opts.runId);
  const t = (opts.token || "").trim().toLowerCase();
  if (t) out = out.filter((s) => s.token.toLowerCase().includes(t) || s.runId.toLowerCase().includes(t));
  return out;
}
