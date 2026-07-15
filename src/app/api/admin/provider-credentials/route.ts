import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ProviderCredentialNotFoundError,
  ProviderCredentialValidationError,
  ProviderCredentialsConflictError,
  ProviderCredentialsIntegrityError,
  ProviderCredentialsUnavailableError,
  deleteProviderCredential,
  getProviderCredentialsSnapshot,
  isLlmProvider,
  isProviderCredentialSlot,
  upsertProviderCredential,
} from "@/lib/admin/provider-credentials";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { requireAdmin, type AdminAuthOk } from "@/lib/api/require-admin";
import { resolveManagedKeyringProvider } from "@/lib/providers/managed-keyring-config";
import { hashIp } from "@/lib/telemetry/request-log";

const MAX_BODY_BYTES = 4_096;

interface MutationBody {
  provider: "openai" | "anthropic";
  slot: 1 | 2 | 3;
  expectedRevision: number;
  apiKey?: string;
  enabled?: boolean;
}

export async function GET(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = requireAdmin(request);
  if (!auth.ok) return applyHeaders(auth.response, cors.headers);

  try {
    const data = await getProviderCredentialsSnapshot();
    return NextResponse.json(
      { data, runtimeProvider: resolveManagedKeyringProvider(process.env) },
      { headers: cors.headers },
    );
  } catch (error) {
    return routeError(error, cors.headers);
  }
}

export async function PUT(request: NextRequest) {
  const preflight = authorizeMutation(request);
  if (!preflight.ok) return preflight.response;
  const parsed = await readMutationBody(request, true);
  if (!parsed.ok) return applyHeaders(parsed.response, preflight.headers);
  const runtimeProvider = resolveManagedKeyringProvider(process.env);
  if (!runtimeProvider) {
    return applyHeaders(
      apiError(
        503,
        "PROVIDER_KEYRING_RUNTIME_PROVIDER_UNAVAILABLE",
        "Managed provider keyring runtime configuration is unavailable.",
      ),
      preflight.headers,
    );
  }
  if (parsed.body.provider !== runtimeProvider) {
    return applyHeaders(
      apiError(
        409,
        "PROVIDER_KEYRING_PROVIDER_MISMATCH",
        "provider must match the managed keyring runtime provider.",
      ),
      preflight.headers,
    );
  }

  try {
    const data = await upsertProviderCredential({
      provider: parsed.body.provider,
      slot: parsed.body.slot,
      expectedRevision: parsed.body.expectedRevision,
      ...(parsed.body.apiKey === undefined
        ? {}
        : { apiKey: parsed.body.apiKey }),
      ...(parsed.body.enabled === undefined
        ? {}
        : { enabled: parsed.body.enabled }),
    });
    auditCredentialMutation(preflight.auth, "updated", parsed.body);
    return rotateCsrf(
      NextResponse.json(
        { data, runtimeProvider },
        { headers: preflight.headers },
      ),
    );
  } catch (error) {
    return routeError(error, preflight.headers);
  }
}

export async function DELETE(request: NextRequest) {
  const preflight = authorizeMutation(request);
  if (!preflight.ok) return preflight.response;
  const parsed = await readMutationBody(request, false);
  if (!parsed.ok) return applyHeaders(parsed.response, preflight.headers);

  try {
    const data = await deleteProviderCredential({
      provider: parsed.body.provider,
      slot: parsed.body.slot,
      expectedRevision: parsed.body.expectedRevision,
    });
    auditCredentialMutation(preflight.auth, "deleted", parsed.body);
    return rotateCsrf(
      NextResponse.json(
        {
          data,
          runtimeProvider: resolveManagedKeyringProvider(process.env),
        },
        { headers: preflight.headers },
      ),
    );
  } catch (error) {
    return routeError(error, preflight.headers);
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}

export const runtime = "nodejs";

function authorizeMutation(
  request: NextRequest,
):
  | {
      ok: true;
      auth: AdminAuthOk;
      headers: Record<string, string>;
    }
  | { ok: false; response: Response } {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) {
    return { ok: false, response: cors.response };
  }
  const auth = requireAdmin(request);
  if (!auth.ok) {
    return {
      ok: false,
      response: applyHeaders(auth.response, cors.headers),
    };
  }
  const csrf = verifyCsrf(request);
  if (csrf) {
    return { ok: false, response: applyHeaders(csrf, cors.headers) };
  }
  return { ok: true, auth, headers: cors.headers };
}

async function readMutationBody(
  request: NextRequest,
  allowCredentialFields: boolean,
): Promise<
  | { ok: true; body: MutationBody }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_BODY_BYTES
  ) {
    return {
      ok: false,
      response: apiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large."),
    };
  }

  let value: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return {
        ok: false,
        response: apiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "Request body is too large.",
        ),
      };
    }
    value = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: apiError(400, "INVALID_JSON", "Request body must be valid JSON."),
    };
  }
  if (!isRecord(value)) {
    return validationError("Request body must be an object.");
  }

  const allowed = allowCredentialFields
    ? new Set(["provider", "slot", "expectedRevision", "apiKey", "enabled"])
    : new Set(["provider", "slot", "expectedRevision"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return validationError("Request body contains unsupported fields.");
  }
  if (!isLlmProvider(value.provider)) {
    return validationError("provider must be openai or anthropic.");
  }
  if (!isProviderCredentialSlot(value.slot)) {
    return validationError("slot must be 1, 2, or 3.");
  }
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0
  ) {
    return validationError(
      "expectedRevision must be a non-negative integer.",
    );
  }

  if (allowCredentialFields) {
    if (value.apiKey !== undefined && typeof value.apiKey !== "string") {
      return validationError("apiKey must be a string.");
    }
    if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
      return validationError("enabled must be a boolean.");
    }
    if (value.apiKey === undefined && value.enabled === undefined) {
      return validationError("apiKey or enabled must be provided.");
    }
  }

  return {
    ok: true,
    body: {
      provider: value.provider,
      slot: value.slot,
      expectedRevision: Number(value.expectedRevision),
      ...(typeof value.apiKey === "string" ? { apiKey: value.apiKey } : {}),
      ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    },
  };
}

function auditCredentialMutation(
  auth: AdminAuthOk,
  action: "updated" | "deleted",
  body: Pick<MutationBody, "provider" | "slot">,
): void {
  recordAuthAudit("admin_action", {
    ipHash: hashIp(auth.ip),
    tokenHash: auth.tokenHash,
    scope: "admin",
    // Never include a key, raw suffix, request body, or exception detail.
    detail: `provider credential slot ${body.slot} ${action} (${body.provider})`,
  });
}

function routeError(
  error: unknown,
  headers: Record<string, string>,
): NextResponse {
  if (error instanceof ProviderCredentialValidationError) {
    return applyHeaders(
      apiError(422, error.code, error.message),
      headers,
    ) as NextResponse;
  }
  if (error instanceof ProviderCredentialNotFoundError) {
    return applyHeaders(
      apiError(404, error.code, "Provider credential was not found."),
      headers,
    ) as NextResponse;
  }
  if (error instanceof ProviderCredentialsConflictError) {
    return applyHeaders(
      NextResponse.json(
        {
          error: {
            code: error.code,
            message: "Provider credentials changed. Refresh and try again.",
            currentRevision: error.currentRevision,
          },
        },
        { status: 409 },
      ),
      headers,
    ) as NextResponse;
  }
  if (
    error instanceof ProviderCredentialsUnavailableError ||
    error instanceof ProviderCredentialsIntegrityError
  ) {
    return applyHeaders(
      apiError(
        503,
        error.code,
        "Provider credential storage is not available.",
      ),
      headers,
    ) as NextResponse;
  }
  return applyHeaders(
    apiError(500, "INTERNAL_ERROR", "Unable to manage provider credentials."),
    headers,
  ) as NextResponse;
}

function validationError(message: string): {
  ok: false;
  response: NextResponse;
} {
  return {
    ok: false,
    response: apiError(422, "VALIDATION_ERROR", message),
  };
}

function apiError(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function applyHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
