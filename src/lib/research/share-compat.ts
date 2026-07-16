/**
 * Legacy plaintext share links are accepted only during this bounded migration
 * window. Keeping the cutoff in a dependency-free module lets both the legacy
 * reader and the capability repository enforce the same deadline.
 */
export const LEGACY_PUBLIC_SHARE_COMPAT_UNTIL_MS = Date.UTC(2026, 9, 16);
