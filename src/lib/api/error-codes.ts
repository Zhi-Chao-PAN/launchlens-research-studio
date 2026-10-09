/**
 * Structured error codes returned by the /api/research endpoint.
 * The frontend uses these to render field-specific inline errors and
 * smart retry UX (e.g., Retry-After countdown for rate limiting).
 */

export type ApiErrorCode =
  | "RATE_LIMITED"
  | "INVALID_JSON"
  | "INVALID_BODY"
  | "QUERY_REQUIRED"
  | "QUERY_TOO_SHORT"
  | "QUERY_TOO_LONG"
  | "KEYWORDS_NOT_ARRAY"
  | "KEYWORDS_TOO_MANY"
  | "KEYWORD_INVALID"
  | "KEYWORD_TOO_LONG"
  | "VALIDATION_ERROR"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_SESSION_ID"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN";

export type ApiErrorField = "query" | "keywords" | "general";

/**
 * A structured error parsed from a non-OK /api/research response.
 *
 * - `code`:    machine-readable code for programmatic UX branching
 * - `field`:   which form field the error is attached to (if any)
 * - `message`: already-localized server-rendered message for direct display
 * - `details`: optional extra detail string (currently set for QUERY_TOO_SHORT/LONG)
 * - `retryAfterSeconds`: seconds until the client is permitted to retry.
 *              Present on RATE_LIMITED (sourced from `Retry-After` header
 *              or the response `resetMs` field); undefined otherwise.
 */
export interface StructuredApiError {
  code: ApiErrorCode;
  field: ApiErrorField;
  message: string;
  details?: string;
  retryAfterSeconds?: number;
}

/**
 * Map response codes to the form field they should highlight inline.
 * Anything without a clear field mapping goes to "general" and is shown
 * as a form-level banner.
 */
const FIELD_MAP: Record<string, ApiErrorField> = {
  QUERY_REQUIRED: "query",
  QUERY_TOO_SHORT: "query",
  QUERY_TOO_LONG: "query",
  KEYWORDS_NOT_ARRAY: "keywords",
  KEYWORDS_TOO_MANY: "keywords",
  KEYWORD_INVALID: "keywords",
  KEYWORD_TOO_LONG: "keywords",
  INVALID_SESSION_ID: "general",
  SESSION_NOT_FOUND: "general",
  SESSION_EXPIRED: "general",
};

function mapField(code: string, bodyField?: unknown): ApiErrorField {
  if (bodyField === "query") return "query";
  if (bodyField === "keywords") return "keywords";
  return FIELD_MAP[code] ?? "general";
}

/**
 * Parse a failed fetch() response to /api/research into a StructuredApiError.
 *
 * Safely degrades: if the body isn't JSON, or the shape is unexpected, we
 * still return a usable error with code "UNKNOWN" and a generic message.
 * Network-level failures (fetch threw, e.g. DNS down / offline) should be
 * converted by the caller into a `NETWORK_ERROR` StructuredApiError via
 * `networkError()`.
 */
export async function parseApiErrorResponse(
  res: Response,
  fallbackMessage = "Request failed.",
): Promise<StructuredApiError> {
  let body: Record<string, unknown> = {};
  try {
    const b = await res.json();
    if (b && typeof b === "object") body = b as Record<string, unknown>;
  } catch {
    // Non-JSON body (e.g. proxy HTML error page). Fall through to generic.
  }

  const rawCode = typeof body.code === "string" ? body.code : "";
  const message =
    (typeof body.error === "string" && body.error) ||
    (res.statusText ? `${fallbackMessage} (${res.statusText})` : `${fallbackMessage} (${res.status})`);
  const details = typeof body.details === "string" ? body.details : undefined;

  // Retry-After: honour the HTTP header first (standard), fall back to
  // the vendor resetMs field (milliseconds). Both are ceil()'d to whole
  // seconds by the server.
  let retryAfterSeconds: number | undefined;
  const raHeader = res.headers.get("Retry-After");
  if (raHeader) {
    const n = parseInt(raHeader, 10);
    if (Number.isFinite(n) && n > 0) retryAfterSeconds = n;
  }
  if (retryAfterSeconds === undefined && typeof body.resetMs === "number") {
    retryAfterSeconds = Math.max(1, Math.ceil(body.resetMs / 1000));
  }

  // Map HTTP status → code if the body didn't supply a machine-readable one.
  let code: ApiErrorCode;
  if (rawCode) {
    code = rawCode as ApiErrorCode;
  } else if (res.status === 405) {
    code = "METHOD_NOT_ALLOWED";
  } else if (res.status === 404) {
    code = "SESSION_NOT_FOUND";
  } else if (res.status === 429) {
    code = "RATE_LIMITED";
  } else if (res.status >= 500) {
    code = "INTERNAL_ERROR";
  } else if (res.status >= 400) {
    code = "VALIDATION_ERROR";
  } else {
    code = "UNKNOWN";
  }

  return {
    code,
    field: mapField(code, body.field),
    message,
    details,
    retryAfterSeconds,
  };
}

/** Construct a StructuredApiError for a thrown network/offline failure. */
export function networkError(message = "Network error. Please check your connection."): StructuredApiError {
  return { code: "NETWORK_ERROR", field: "general", message };
}

/** Wrap an unknown caught value into a StructuredApiError. */
export function wrapThrownError(err: unknown): StructuredApiError {
  if (err instanceof TypeError) {
    // fetch() throws TypeError on network failure in most browsers.
    return networkError();
  }
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";
  return { code: "UNKNOWN", field: "general", message };
}
