import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getTokenInfoByHash } from "@/lib/api/bypass-tokens";

export const ADMIN_SESSION_COOKIE = "ll_admin_session";
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;

interface AdminSessionPayload {
  v: 1;
  tokenHash: string;
  expiresAt: number;
}

export class AdminSessionConfigurationError extends Error {
  constructor() {
    super("Admin session signing is not configured.");
    this.name = "AdminSessionConfigurationError";
  }
}

function getSigningSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.LAUNCHLENS_ADMIN_SESSION_SECRET?.trim() || "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new AdminSessionConfigurationError();
  }
  return secret;
}

function getTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.LAUNCHLENS_ADMIN_SESSION_TTL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.max(MIN_TTL_SECONDS, Math.min(MAX_TTL_SECONDS, Math.floor(parsed)));
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createAdminSession(
  tokenHash: string,
  options: { now?: number; env?: NodeJS.ProcessEnv } = {},
): { value: string; expiresAt: number } {
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    throw new Error("Invalid admin token hash.");
  }
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const expiresAt = now + getTtlSeconds(env) * 1000;
  const payload: AdminSessionPayload = { v: 1, tokenHash, expiresAt };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    value: `${encoded}.${sign(encoded, getSigningSecret(env))}`,
    expiresAt,
  };
}

export function verifyAdminSession(
  value: string | undefined,
  options: { now?: number; env?: NodeJS.ProcessEnv } = {},
): AdminSessionPayload | null {
  if (!value) return null;
  const env = options.env ?? process.env;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra) return null;

  let secret: string;
  try {
    secret = getSigningSecret(env);
  } catch {
    return null;
  }
  if (!safeEqual(signature, sign(encoded, secret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;
    if (
      parsed.v !== 1 ||
      typeof parsed.tokenHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.tokenHash) ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= (options.now ?? Date.now())
    ) {
      return null;
    }
    const token = getTokenInfoByHash(parsed.tokenHash);
    if (!token || token.scope !== "admin") return null;
    return parsed as AdminSessionPayload;
  } catch {
    return null;
  }
}

export function readAdminSession(request: NextRequest): AdminSessionPayload | null {
  return verifyAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function setAdminSessionCookie(
  response: NextResponse,
  session: { value: string; expiresAt: number },
): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(session.expiresAt),
  });
  return response;
}

export function clearAdminSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
