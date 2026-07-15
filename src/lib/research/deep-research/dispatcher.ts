import type { DeepWakeDispatcher } from "./service";

const DISPATCH_TIMEOUT_MS = 5_000;

export interface HttpDeepWakeDispatcherOptions {
  origin: string;
  secret: string;
  protectionBypassSecret?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Best-effort authenticated wake. It is never the durable recovery source. */
export class HttpDeepWakeDispatcher implements DeepWakeDispatcher {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpDeepWakeDispatcherOptions) {
    const url = new URL(options.origin);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      throw new Error("A safe HTTP(S) Deep worker origin is required.");
    }
    if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
      throw new Error("Deep worker origins must use HTTPS except on loopback hosts.");
    }
    if (options.secret.length < 24) {
      throw new Error("The Deep worker secret must contain at least 24 characters.");
    }
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = clampTimeout(options.timeoutMs ?? DISPATCH_TIMEOUT_MS);
  }

  async dispatch(sessionId: string): Promise<void> {
    if (!/^[a-z0-9]+$/i.test(sessionId)) throw new Error("Invalid Deep session id.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.options.secret}`,
      "x-launchlens-deep-worker-secret": this.options.secret,
    };
    if (this.options.protectionBypassSecret?.trim()) {
      headers["x-vercel-protection-bypass"] = this.options.protectionBypassSecret;
    }
    try {
      const response = await this.fetchImpl(
        `${new URL(this.options.origin).origin}/api/internal/deep-research/continue`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
          cache: "no-store",
          redirect: "error",
        },
      );
      if (!response.ok) {
        throw new Error(`Deep worker wake returned HTTP ${response.status}.`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function clampTimeout(value: number): number {
  if (!Number.isFinite(value)) return DISPATCH_TIMEOUT_MS;
  return Math.max(500, Math.min(15_000, Math.trunc(value)));
}
