import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  QSTASH_RECOVERY_PRODUCTION_URL,
  QSTASH_RECOVERY_SCHEDULE_ID,
  QStashRecoveryAuthenticationError,
  QStashRecoveryConfigurationError,
  authenticateQStashRecoveryRequest,
} from "./qstash-recovery-auth";

const CURRENT_KEY = "sig_current_signing_key_for_tests";
const NEXT_KEY = "sig_next_signing_key_for_tests";
const RECOVERY_URL = QSTASH_RECOVERY_PRODUCTION_URL;
const RAW_BODY = '{"kind":"recover"}';

const ENV = {
  LAUNCHLENS_DEEP_RECOVERY_SOURCE: "qstash",
  QSTASH_CURRENT_SIGNING_KEY: CURRENT_KEY,
  QSTASH_NEXT_SIGNING_KEY: NEXT_KEY,
  LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID: QSTASH_RECOVERY_SCHEDULE_ID,
  LAUNCHLENS_QSTASH_RECOVERY_URL: RECOVERY_URL,
} as const;

function signRequest({
  body = RAW_BODY,
  key = CURRENT_KEY,
  url = RECOVERY_URL,
}: {
  body?: string;
  key?: string;
  url?: string;
} = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "Upstash",
      sub: url,
      iat: now,
      nbf: now - 1,
      exp: now + 60,
      jti: "jwt_qstash-recovery-test",
      body: createHash("sha256").update(body).digest("base64url"),
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", key)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function recoveryRequest(
  overrides: Record<string, string> = {},
  body = RAW_BODY,
): Request {
  return new Request(RECOVERY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "upstash-signature": signRequest({ body }),
      "upstash-schedule-id": QSTASH_RECOVERY_SCHEDULE_ID,
      "upstash-message-id": "msg_qstash-recovery-test-001",
      "upstash-retried": "0",
      ...overrides,
    },
    body,
  });
}

describe("authenticateQStashRecoveryRequest", () => {
  it("verifies a QStash request against the raw body and exact production URL", async () => {
    await expect(
      authenticateQStashRecoveryRequest(recoveryRequest(), ENV),
    ).resolves.toEqual({
      source: "qstash",
      scheduleId: QSTASH_RECOVERY_SCHEDULE_ID,
      messageId: "msg_qstash-recovery-test-001",
      retried: 0,
      recoveryUrl: RECOVERY_URL,
      rawBody: RAW_BODY,
    });
  });

  it("falls back to the standard next signing key during rotation", async () => {
    const request = recoveryRequest({
      "upstash-signature": signRequest({ key: NEXT_KEY }),
      "upstash-retried": "2",
    });

    await expect(
      authenticateQStashRecoveryRequest(request, ENV),
    ).resolves.toMatchObject({ retried: 2, rawBody: RAW_BODY });
  });

  it("prefers LaunchLens signing-key aliases over standard fallbacks", async () => {
    const env = {
      ...ENV,
      LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY: CURRENT_KEY,
      LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY: NEXT_KEY,
      QSTASH_CURRENT_SIGNING_KEY: "sig_wrong_standard_current",
      QSTASH_NEXT_SIGNING_KEY: "sig_wrong_standard_next",
    };

    await expect(
      authenticateQStashRecoveryRequest(recoveryRequest(), env),
    ).resolves.toMatchObject({ source: "qstash" });
  });

  it("rejects a signature bound to a different raw body or URL", async () => {
    const tamperedBody = '{ "kind": "recover" }';
    const bodyRequest = recoveryRequest(
      { "upstash-signature": signRequest({ body: RAW_BODY }) },
      tamperedBody,
    );
    const urlRequest = recoveryRequest({
      "upstash-signature": signRequest({
        url: "https://preview.example/api/cron/scheduler",
      }),
    });

    await expect(
      authenticateQStashRecoveryRequest(bodyRequest, ENV),
    ).rejects.toMatchObject({
      kind: "authentication",
      code: "signature_invalid",
      retryable: false,
      status: 401,
    });
    await expect(
      authenticateQStashRecoveryRequest(urlRequest, ENV),
    ).rejects.toMatchObject({ code: "signature_invalid" });
  });

  it.each([
    ["missing source", { LAUNCHLENS_DEEP_RECOVERY_SOURCE: undefined }, "recovery_source_not_qstash"],
    ["legacy source", { LAUNCHLENS_DEEP_RECOVERY_SOURCE: "github" }, "recovery_source_not_qstash"],
    ["case variant source", { LAUNCHLENS_DEEP_RECOVERY_SOURCE: "QSTASH" }, "recovery_source_not_qstash"],
    ["missing current key", { QSTASH_CURRENT_SIGNING_KEY: undefined }, "signing_keys_missing"],
    ["missing next key", { QSTASH_NEXT_SIGNING_KEY: undefined }, "signing_keys_missing"],
    ["short current key", { QSTASH_CURRENT_SIGNING_KEY: "short" }, "signing_keys_missing"],
    ["identical signing keys", { QSTASH_NEXT_SIGNING_KEY: CURRENT_KEY }, "signing_keys_missing"],
    ["wrong configured schedule", { LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID: "another-schedule" }, "schedule_id_misconfigured"],
    ["another valid HTTPS URL", { LAUNCHLENS_QSTASH_RECOVERY_URL: "https://preview.example/api/cron/scheduler" }, "recovery_url_misconfigured"],
    ["non-HTTPS URL", { LAUNCHLENS_QSTASH_RECOVERY_URL: "http://launchlens.example/api/cron/scheduler" }, "recovery_url_misconfigured"],
    ["URL with credentials", { LAUNCHLENS_QSTASH_RECOVERY_URL: "https://user:pass@launchlens.example/api/cron/scheduler" }, "recovery_url_misconfigured"],
    ["URL with query", { LAUNCHLENS_QSTASH_RECOVERY_URL: `${RECOVERY_URL}?source=qstash` }, "recovery_url_misconfigured"],
    ["URL with fragment", { LAUNCHLENS_QSTASH_RECOVERY_URL: `${RECOVERY_URL}#tick` }, "recovery_url_misconfigured"],
  ])("fails closed on %s", async (_label, override, code) => {
    const env = { ...ENV, ...override };
    const promise = authenticateQStashRecoveryRequest(recoveryRequest(), env);

    await expect(promise).rejects.toBeInstanceOf(
      QStashRecoveryConfigurationError,
    );
    await expect(promise).rejects.toMatchObject({
      kind: "configuration",
      code,
      retryable: false,
      status: 503,
    });
  });

  it.each([
    ["missing signature", { "upstash-signature": "" }, "signature_missing"],
    ["invalid signature", { "upstash-signature": "not-a-jwt" }, "signature_invalid"],
    ["missing schedule", { "upstash-schedule-id": "" }, "schedule_id_invalid"],
    ["wrong schedule", { "upstash-schedule-id": "launchlens-deep-recovery-preview-v1" }, "schedule_id_invalid"],
    ["missing message id", { "upstash-message-id": "" }, "message_id_invalid"],
    ["malformed message id", { "upstash-message-id": "job_123" }, "message_id_invalid"],
    ["missing retried count", { "upstash-retried": "" }, "retried_invalid"],
    ["negative retried count", { "upstash-retried": "-1" }, "retried_invalid"],
    ["fractional retried count", { "upstash-retried": "1.5" }, "retried_invalid"],
    ["unsafe retried count", { "upstash-retried": "9007199254740992" }, "retried_invalid"],
  ])("rejects %s as non-retryable authentication", async (_label, headers, code) => {
    const promise = authenticateQStashRecoveryRequest(
      recoveryRequest(headers),
      ENV,
    );

    await expect(promise).rejects.toBeInstanceOf(
      QStashRecoveryAuthenticationError,
    );
    await expect(promise).rejects.toMatchObject({
      kind: "authentication",
      code,
      retryable: false,
      status: 401,
    });
  });

  it("maps an unreadable body to a secret-safe authentication error", async () => {
    const base = recoveryRequest();
    const unreadableRequest = {
      headers: base.headers,
      text: async () => {
        throw new Error(`do not expose ${CURRENT_KEY}`);
      },
    } as unknown as Request;

    let error: unknown;
    try {
      await authenticateQStashRecoveryRequest(unreadableRequest, ENV);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(QStashRecoveryAuthenticationError);
    expect(error).toMatchObject({
      code: "request_body_unreadable",
      retryable: false,
    });
    expect(String(error)).not.toContain(CURRENT_KEY);
    expect(JSON.stringify(error)).not.toContain(CURRENT_KEY);
    expect(JSON.stringify(error)).not.toContain(NEXT_KEY);
  });

  it("does not leak signing keys or Receiver diagnostics on bad signatures", async () => {
    let error: unknown;
    try {
      await authenticateQStashRecoveryRequest(
        recoveryRequest({ "upstash-signature": "not-a-jwt" }),
        ENV,
      );
    } catch (caught) {
      error = caught;
    }

    const serialized = `${String(error)} ${JSON.stringify(error)}`;
    expect(serialized).not.toContain(CURRENT_KEY);
    expect(serialized).not.toContain(NEXT_KEY);
    expect(serialized).not.toContain("not-a-jwt");
    expect(serialized).not.toMatch(/jwt|jose|body hash|invalid subject/i);
  });
});
