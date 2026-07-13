const MAX_PROVIDER_BASE_URL_LENGTH = 2048;

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
  const isHttps = url.protocol === "https:";
  const isDevelopmentLoopback =
    url.protocol === "http:" && nodeEnv !== "production" && isLoopbackHostname(url.hostname);
  if (!isHttps && !isDevelopmentLoopback) {
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

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
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
