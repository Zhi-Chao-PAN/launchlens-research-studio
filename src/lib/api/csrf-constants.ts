// Edge-safe CSRF constants — pure data, no node:* imports.
//
// R230: extracted from csrf.ts so middleware (which runs on the Edge
// runtime by default) can import the cookie/header names without
// pulling in node:crypto / randomBytes / timingSafeEqual that csrf.ts
// needs for token generation and verification in route handlers.
//
// DO NOT add anything to this file that imports node:*, fs:*, or
// browser-incompatible APIs. The whole point is that this file is
// safe to bundle into Edge functions.

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
