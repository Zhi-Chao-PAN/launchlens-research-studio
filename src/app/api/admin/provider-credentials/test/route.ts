import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ProviderCredentialNotFoundError,
  ProviderCredentialValidationError,
  ProviderCredentialsConflictError,
  ProviderCredentialsIntegrityError,
  ProviderCredentialsUnavailableError,
  isLlmProvider,
  isProviderCredentialSlot,
} from "@/lib/admin/provider-credentials";
import { testProviderCredentialConnection } from "@/lib/admin/provider-connection-test";
import { recordAuthAudit } from "@/lib/api/auth-audit";
import { checkCors, handleOptions } from "@/lib/api/cors";
import { verifyCsrf } from "@/lib/api/csrf-guard";
import { rotateCsrf } from "@/lib/api/csrf-rotate";
import { requireAdmin } from "@/lib/api/require-admin";
import { resolveManagedKeyringTargetProvider } from "@/lib/providers/managed-keyring-config";
import { hashIp } from "@/lib/telemetry/request-log";

const MAX_BODY_BYTES = 512;

export async function POST(request: NextRequest) {
  const cors = checkCors(request);
  if (!cors.allowed && cors.response) return cors.response;
  const auth = requireAdmin(request);
  if (!auth.ok) return applyHeaders(auth.response, cors.headers);
  const csrf = verifyCsrf(request);
  if (csrf) return applyHeaders(csrf, cors.headers);

  const parsed = await readBody(request);
  if (!parsed.ok) return applyHeaders(parsed.response, cors.headers);
  const targetProvider = resolveManagedKeyringTargetProvider(process.env);
  if (!targetProvider) {
    return applyHeaders(
      apiError(
        503,
        "PROVIDER_KEYRING_RUNTIME_PROVIDER_UNAVAILABLE",
        "Managed provider keyring target provider is unavailable.",
      ),
      cors.headers,
    );
  }
  if (parsed.provider !== targetProvider) {
    return applyHeaders(
      apiError(
        409,
        "PROVIDER_KEYRING_PROVIDER_MISMATCH",
        "provider must match the managed keyring runtime provider.",
      ),
      cors.headers,
    );
  }

  try {
    const data = await testProviderCredentialConnection(
      parsed.provider,
      parsed.slot,
      parsed.credentialId,
      parsed.expectedRevision,
    );
    recordAuthAudit("admin_action", {
      ipHash: hashIp(auth.ip),
      tokenHash: auth.tokenHash,
      scope: "admin",
      // Do not include the key, base URL, model, request, or upstream body.
      detail: `provider credential slot ${parsed.slot} connection tested (${parsed.provider}, ${data.ok ? "ok" : "failed"})`,
    });
    return rotateCsrf(
      NextResponse.json({ data }, { headers: privateHeaders(cors.headers) }),
    );
  } catch (error) {
    return routeError(error, cors.headers);
  }
}

export async function OPTIONS(request: NextRequest) {
  return handleOptions(request) || new Response(null, { status: 204 });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(request: NextRequest): Promise<
  | {
      ok: true;
      provider: "openai" | "anthropic";
      slot: 1 | 2 | 3;
      credentialId: string;
      expectedRevision: number;
    }
  | { ok: false; response: NextResponse }
> {
  const declaredLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
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
        response: apiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large."),
      };
    }
    value = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      response: apiError(400, "INVALID_JSON", "Request body must be valid JSON."),
    };
  }
  if (!isRecord(value)) return validationError("Request body must be an object.");
  const allowed = new Set([
    "provider",
    "slot",
    "credentialId",
    "expectedRevision",
  ]);
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
    typeof value.credentialId !== "string" ||
    !/^[a-f0-9]{32}$/u.test(value.credentialId)
  ) {
    return validationError("credentialId is invalid.");
  }
  if (
    !Number.isSafeInteger(value.expectedRevision) ||
    Number(value.expectedRevision) < 0
  ) {
    return validationError(
      "expectedRevision must be a non-negative integer.",
    );
  }
  return {
    ok: true,
    provider: value.provider,
    slot: value.slot,
    credentialId: value.credentialId,
    expectedRevision: Number(value.expectedRevision),
  };
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
      apiError(
        404,
        error.code,
        "Provider credential was not found or was replaced.",
      ),
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
    apiError(500, "INTERNAL_ERROR", "Unable to test provider connection."),
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

function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function applyHeaders(
  response: Response,
  headers: Record<string, string>,
): Response {
  response.headers.set("Cache-Control", "private, no-store");
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }
  return response;
}

function privateHeaders(headers: Record<string, string>): Record<string, string> {
  return { ...headers, "Cache-Control": "private, no-store" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
