import { lookup as nodeLookup } from "node:dns/promises";
import {
  ProviderBaseUrlError,
  isPublicIpAddress,
  normalizeManagedProviderBaseUrl,
} from "./provider-base-url";

export interface ProviderDnsAddress {
  address: string;
  family: number;
}

export type ProviderDnsLookup = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<ProviderDnsAddress[]>;

export interface AssertPublicProviderEndpointOptions {
  lookupImpl?: ProviderDnsLookup;
  nodeEnv?: string;
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Resolve every address for an admin-configured provider URL before a secret
 * is attached. Any private, reserved, documentation, or unresolved address
 * fails the whole check; redirects are separately disabled by callers.
 */
export async function assertPublicProviderBaseUrl(
  raw: string,
  options: AssertPublicProviderEndpointOptions = {},
): Promise<string> {
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  const normalized = normalizeManagedProviderBaseUrl(raw, raw, {
    nodeEnv,
    env: options.env,
  });
  const url = new URL(normalized);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");

  if (nodeEnv !== "production" && isDevelopmentLoopback(hostname)) {
    return normalized;
  }

  let addresses: ProviderDnsAddress[];
  try {
    addresses = await (options.lookupImpl ?? defaultLookup)(hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new ProviderBaseUrlError(
      "Provider base URL does not resolve to a public endpoint.",
    );
  }
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new ProviderBaseUrlError(
      "Provider base URL does not resolve to a public endpoint.",
    );
  }
  return normalized;
}

const defaultLookup: ProviderDnsLookup = async (hostname, options) =>
  nodeLookup(hostname, options);

function isDevelopmentLoopback(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/u, "");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
}
