const MAX_EXTERNAL_URL_LENGTH = 2048;

const TRACKING_QUERY_PARAMETERS = new Set([
  "_ga",
  "_gl",
  "dclid",
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "srsltid",
  "ttclid",
  "twclid",
  "yclid",
]);

/**
 * Parse an untrusted outbound link and return a canonical, display-safe URL.
 *
 * This helper is intentionally synchronous: these URLs are rendered as links,
 * not fetched by the server. It rejects literal private/reserved IPs and local
 * hostnames. Any future server-side fetch must additionally pin DNS resolution
 * to a public address to close DNS-rebinding/TOCTOU risks.
 */
export function parseSafeExternalUrl(raw: unknown): URL | undefined {
  if (typeof raw !== "string") return undefined;
  const input = raw.trim();
  if (!input || input.length > MAX_EXTERNAL_URL_LENGTH) return undefined;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username || url.password) return undefined;

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isLocalHostname(hostname) || isNonPublicIpLiteral(hostname)) {
    return undefined;
  }

  // A single-label DNS name is normally an intranet host. Public IP literals
  // are handled separately above; public DNS links must have a dotted name.
  if (!hostname.includes(".") && !parseIpv4(hostname) && !parseIpv6(hostname)) {
    return undefined;
  }

  if (!parseIpv6(hostname)) url.hostname = hostname;
  url.hash = "";
  for (const name of Array.from(url.searchParams.keys())) {
    const normalizedName = name.toLowerCase();
    if (
      normalizedName.startsWith("utm_") ||
      TRACKING_QUERY_PARAMETERS.has(normalizedName)
    ) {
      url.searchParams.delete(name);
    }
  }
  url.searchParams.sort();
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  }

  return url;
}

export function canonicalizeSafeExternalUrl(raw: unknown): string | undefined {
  return parseSafeExternalUrl(raw)?.toString();
}

function normalizeHostname(value: string): string {
  const withoutIpv6Brackets = value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1)
    : value;
  return withoutIpv6Brackets.toLowerCase().replace(/\.+$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "local" ||
    hostname.endsWith(".local")
  );
}

function isNonPublicIpLiteral(hostname: string): boolean {
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return isNonPublicIpv4(ipv4);

  const ipv6 = parseIpv6(hostname);
  if (ipv6) return isNonPublicIpv6(ipv6);

  return false;
}

function parseIpv4(hostname: string): [number, number, number, number] | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined;
  }
  return octets as [number, number, number, number];
}

function isNonPublicIpv4([a, b, c]: [number, number, number, number]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function parseIpv6(hostname: string): number[] | undefined {
  if (!hostname.includes(":")) return undefined;
  if (hostname.includes("%")) return undefined;
  if (!/^[0-9a-f:]+$/i.test(hostname)) return undefined;
  if ((hostname.match(/::/g) ?? []).length > 1) return undefined;

  const [leftRaw, rightRaw] = hostname.split("::");
  const left = leftRaw ? leftRaw.split(":") : [];
  const right = rightRaw ? rightRaw.split(":") : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/i.test(part))) {
    return undefined;
  }

  const hasCompression = hostname.includes("::");
  if (
    (!hasCompression && left.length !== 8) ||
    (hasCompression && left.length + right.length > 7)
  ) {
    return undefined;
  }

  const zeroCount = hasCompression ? 8 - left.length - right.length : 0;
  const parts = [
    ...left.map((part) => Number.parseInt(part, 16)),
    ...Array.from({ length: zeroCount }, () => 0),
    ...right.map((part) => Number.parseInt(part, 16)),
  ];
  return parts.length === 8 ? parts : undefined;
}

function isNonPublicIpv6(parts: number[]): boolean {
  const [first, second, third] = parts;
  const allZero = parts.every((part) => part === 0);
  const loopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;

  return (
    allZero ||
    loopback ||
    first === 0 || // IPv4-compatible/mapped and other special ::/8 forms
    (first & 0xfe00) === 0xfc00 || // unique-local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
    (first & 0xff00) === 0xff00 || // multicast ff00::/8
    (first === 0x0064 && second === 0xff9b && third === 1) ||
    first === 0x0100 || // discard-only 100::/64 (conservative /16 rejection)
    (first === 0x2001 && second <= 0x01ff) || // IETF special-purpose space
    (first === 0x2001 && second === 0x0db8) || // documentation
    first === 0x2002 || // 6to4 can embed non-public IPv4 targets
    (first === 0x3fff && (second & 0xf000) === 0) || // documentation 3fff::/20
    first === 0x5f00 // reserved for SRv6 SIDs
  );
}
