// Trusted IP / CIDR range utility.
//
// IPs or ranges listed in LAUNCHLENS_TRUSTED_IPS bypass rate limiting.
// Supports individual IPv4/IPv6 addresses and CIDR notation (e.g.
// "10.0.0.0/8", "192.168.1.0/24"). Comma-separated in the env var.
//
// This is a lightweight implementation that handles the common cases
// for self-hosted deployments. It does not support IPv6-in-IPv4
// mapping, overlapping ranges, or IPv6 CIDR (only individual IPv6).
// Those can come in a later round if needed.



interface ParsedRange {
  type: "ipv4" | "ipv6";
  address?: string; // for exact match
  network?: number; // for CIDR: numeric IPv4
  prefix?: number; // CIDR prefix length
}

let parsedRanges: ParsedRange[] | null = null;

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (let i = 0; i < 4; i++) {
    const octet = parseInt(parts[i], 10);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    result = (result << 8) | octet;
  }
  return result >>> 0; // unsigned
}

function parseRanges(): ParsedRange[] {
  if (parsedRanges !== null) return parsedRanges;

  const raw = process.env.LAUNCHLENS_TRUSTED_IPS || "";
  if (!raw.trim()) {
    parsedRanges = [];
    return parsedRanges;
  }

  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const result: ParsedRange[] = [];

  for (const entry of entries) {
    if (entry.includes("/")) {
      // CIDR notation
      const [addr, prefixStr] = entry.split("/", 2);
      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) continue;

      const num = ipv4ToNumber(addr);
      if (num === null) continue;

      // Mask the network address
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      result.push({
        type: "ipv4",
        network: (num & mask) >>> 0,
        prefix,
      });
    } else if (entry.includes(":")) {
      // IPv6 (exact match only)
      result.push({ type: "ipv6", address: entry.toLowerCase() });
    } else {
      // IPv4 exact match (treat as /32)
      const num = ipv4ToNumber(entry);
      if (num !== null) {
        result.push({ type: "ipv4", network: num, prefix: 32 });
      }
    }
  }

  parsedRanges = result;
  return result;
}

/**
 * Check if an IP address is in the trusted list.
 * Returns true if the IP matches any trusted IP or CIDR range.
 */
export function isTrustedIp(ip: string): boolean {
  const ranges = parseRanges();
  if (ranges.length === 0) return false;

  const normalized = ip.trim();
  if (!normalized) return false;

  if (normalized.includes(":")) {
    // IPv6 exact match
    const lower = normalized.toLowerCase();
    return ranges.some(
      (r) => r.type === "ipv6" && r.address === lower
    );
  }

  // IPv4
  const num = ipv4ToNumber(normalized);
  if (num === null) return false;

  return ranges.some((r) => {
    if (r.type !== "ipv4" || r.network === undefined || r.prefix === undefined) return false;
    const mask = r.prefix === 0 ? 0 : (0xffffffff << (32 - r.prefix)) >>> 0;
    return ((num & mask) >>> 0) === r.network;
  });
}

/**
 * Get the list of configured trusted IP ranges (for diagnostics / admin UI).
 */
export function getTrustedIpList(): string[] {
  return (process.env.LAUNCHLENS_TRUSTED_IPS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Reset the parsed cache (for testing).
 */
export function _resetTrustedIpCache() {
  parsedRanges = null;
}
