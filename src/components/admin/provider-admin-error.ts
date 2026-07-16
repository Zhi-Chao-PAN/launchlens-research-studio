import { AdminApiError } from "./admin-client";
import type { AdminMessageKey } from "./admin-i18n";

export type ProviderAdminErrorKey = Extract<
  AdminMessageKey,
  | "auth.expired"
  | "common.operationFailed"
  | "providers.conflict"
  | "providers.providerMismatch"
  | "providers.requestForbidden"
  | "providers.requestInvalid"
  | "providers.requestRateLimited"
  | "providers.requestRuntimeUnavailable"
  | "providers.requestServiceError"
  | "providers.requestStale"
  | "providers.unavailable"
>;

/**
 * Convert typed admin API failures into a safe, localizable UI category.
 * Server-provided messages are intentionally never returned to the interface.
 */
export function classifyProviderAdminError(
  error: unknown,
): ProviderAdminErrorKey {
  if (!(error instanceof AdminApiError)) {
    return "common.operationFailed";
  }

  switch (error.code) {
    case "PROVIDER_CREDENTIALS_REVISION_CONFLICT":
      return "providers.conflict";
    case "PROVIDER_CREDENTIAL_NOT_FOUND":
      return "providers.requestStale";
    case "PROVIDER_KEYRING_PROVIDER_MISMATCH":
      return "providers.providerMismatch";
    case "PROVIDER_KEYRING_RUNTIME_PROVIDER_UNAVAILABLE":
      return "providers.requestRuntimeUnavailable";
    case "PROVIDER_CREDENTIALS_UNAVAILABLE":
    case "PROVIDER_CREDENTIALS_INTEGRITY_ERROR":
      return "providers.unavailable";
    case "PROVIDER_CREDENTIAL_VALIDATION_ERROR":
    case "VALIDATION_ERROR":
    case "PAYLOAD_TOO_LARGE":
    case "INVALID_JSON":
      return "providers.requestInvalid";
    case "INTERNAL_ERROR":
      return "providers.requestServiceError";
    default:
      break;
  }

  if (error.status === 401) return "auth.expired";
  if (error.status === 403) return "providers.requestForbidden";
  if (error.status === 404) return "providers.requestStale";
  if (error.status === 409) return "providers.conflict";
  if ([400, 413, 422].includes(error.status)) {
    return "providers.requestInvalid";
  }
  if (error.status === 429) return "providers.requestRateLimited";
  if (error.status === 503) return "providers.unavailable";
  if (error.status >= 500) return "providers.requestServiceError";
  return "common.operationFailed";
}
