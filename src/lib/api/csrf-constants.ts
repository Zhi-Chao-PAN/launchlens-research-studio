// Runtime-portable CSRF constants — pure data, no node:* imports.
//
// R230: extracted from csrf.ts so the global proxy can import the
// cookie/header names without pulling in node:crypto / randomBytes /
// timingSafeEqual that csrf.ts needs in route handlers.
//
// DO NOT add anything to this file that imports node:*, fs:*, or
// browser-incompatible APIs. The whole point is that this file is
// safe to bundle into lightweight request boundaries.

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";
