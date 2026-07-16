const MAX_PROVIDER_BASE_URL_LENGTH = 2048;

export const DEFAULT_MANAGED_PROVIDER_BASE_URLS = [
  "https://api.minimaxi.com/v1",
  "https://ark.cn-beijing.volces.com/api/plan/v3",
  "https://api.deepseek.com",
] as const;

export class ProviderBaseUrlError extends Error {
  readonly code = "unsafe_provider_base_url";

  constructor(message = "Provider base URL is not allowed.") {
    super(message);
    this.name = "ProviderBaseUrlError";
  }
}

export interface NormalizeProviderBaseUrlOptions {
  /** Defaults to the current runtime environment. */
  nodeEnv?: string;
}

export interface NormalizeManagedProviderBaseUrlOptions
  extends NormalizeProviderBaseUrlOptions {
  /** Reserved for call-site compatibility; managed routes are built-in only. */
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Validate and normalize a server-side provider endpoint before a secret is
 * attached to an outbound request.
 *
 * Production endpoints must use HTTPS. Plain HTTP is supported only for a
 * loopback development endpoint and is disabled when NODE_ENV=production.
 * Embedded credentials, query strings, and fragments are rejected so an API
 * key cannot be redirected through URL-userinfo or endpoint decorations.
 */
export function normalizeProviderBaseUrl(
  raw: string | undefined,
  fallback: string,
  options: NormalizeProviderBaseUrlOptions = {},
): string {
  const input = (raw || fallback).trim();
  if (!input || input.length > MAX_PROVIDER_BASE_URL_LENGTH) {
    throw new ProviderBaseUrlError();
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ProviderBaseUrlError();
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderBaseUrlError();
  }

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const hostname = normalizeHostname(url.hostname);
  const isHttps = url.protocol === "https:";
  const isDevelopmentLoopback =
    url.protocol === "http:" && nodeEnv !== "production" && isLoopbackHostname(hostname);
  if (!isHttps && !isDevelopmentLoopback) {
    throw new ProviderBaseUrlError();
  }
  if (
    nodeEnv === "production" &&
    (isLocalNetworkHostname(hostname) ||
      (isIpLiteral(hostname) && !isPublicIpAddress(hostname)))
  ) {
    throw new ProviderBaseUrlError();
  }

  return url.toString().replace(/\/+$/, "");
}

export function isSafeProviderBaseUrl(
  raw: string | undefined,
  fallback: string,
  options: NormalizeProviderBaseUrlOptions = {},
): boolean {
  try {
    normalizeProviderBaseUrl(raw, fallback, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Managed credentials target one of the exact built-in endpoints. Matching
 * the normalized host, port, and path prevents this admin surface from
 * becoming an arbitrary HTTPS proxy.
 */
export function normalizeManagedProviderBaseUrl(
  raw: string | undefined,
  fallback: string,
  options: NormalizeManagedProviderBaseUrlOptions = {},
): string {
  const normalized = normalizeProviderBaseUrl(raw, fallback, options);
  const allowed = new Set<string>(DEFAULT_MANAGED_PROVIDER_BASE_URLS);
  if (!allowed.has(normalized)) throw new ProviderBaseUrlError();
  return normalized;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1"
  ) {
    return true;
  }

  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) &&
    Number(octets[0]) === 127
  );
}

function isLocalNetworkHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    isLoopbackHostname(normalized) ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa")
  );
}

function isIpLiteral(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized);
}

/** Conservative public-address check used before provider secrets are attached. */
export function isPublicIpAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  if (normalized.includes(":")) {
    // Globally routable IPv6 unicast space is 2000::/3. This deliberately
    // rejects loopback, ULA, link-local, multicast, mapped IPv4, and docs.
    const first = normalized.split(":", 1)[0];
    if (!/^[23][0-9a-f]{3}$/u.test(first.padStart(4, "0"))) return false;
    return !normalized.startsWith("2001:db8:") && normalized !== "2001:db8::";
  }

  const octets = normalized.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}
