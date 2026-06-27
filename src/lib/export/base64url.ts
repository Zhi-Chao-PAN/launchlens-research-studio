// base64url encoder for UTF-8 strings.
//
// Mirrors the symmetric decoder used by launchlens-ai's
// src/lib/launchlens/brief-fragment.ts::decodeBase64UrlUtf8:
//
//   1. Encode the input as UTF-8 bytes via TextEncoder.
//   2. Wrap the bytes as a binary string with String.fromCharCode.
//   3. btoa() to standard base64 (with + and /).
//   4. Swap to URL-safe alphabet (+ -> -, / -> _) and strip padding (=).
//
// The result is safe to embed directly in a URL hash fragment without
// further percent-encoding (per RFC 4648 §5). The decoder on the other
// side reverses step 4 before calling atob and re-adds padding, so any
// non-stripping or +/ leakage on our side would round-trip correctly
// anyway, but we keep the alphabet tight for cleanliness.
//
// No Buffer dependency, no Node-only API — runs in any modern browser
// or jsdom test environment.

/**
 * Encode a string as a URL-safe base64 string with no padding.
 *
 * @param input - any UTF-8 string. JSON is the primary caller.
 * @returns base64url-encoded string (alphabet: A-Z a-z 0-9 - _)
 */
export function encodeBase64UrlUtf8(input: string): string {
  if (typeof input !== "string") {
    throw new TypeError("encodeBase64UrlUtf8 expects a string");
  }
  // Encode UTF-8 -> bytes -> binary string -> standard base64 -> url-safe.
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Build a `#brief=<base64url-encoded-JSON>` hash fragment for a given
 * brief envelope. Centralizes the prefix so the wire shape lives in one
 * place (mirrors launchlens-ai's BRIEF_HASH_PREFIX constant).
 */
export const BRIEF_HASH_PREFIX = "#brief=";

export function briefHashFor(json: string): string {
  return BRIEF_HASH_PREFIX + encodeBase64UrlUtf8(json);
}
