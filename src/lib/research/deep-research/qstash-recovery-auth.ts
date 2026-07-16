import { Receiver } from "@upstash/qstash";

export const QSTASH_RECOVERY_SCHEDULE_ID =
  "launchlens-deep-recovery-production-v1" as const;
export const QSTASH_RECOVERY_PRODUCTION_URL =
  "https://launchlens-research-studio.vercel.app/api/cron/scheduler" as const;

export interface QStashRecoveryEnvironment {
  LAUNCHLENS_DEEP_RECOVERY_SOURCE?: string;
  LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY?: string;
  LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY?: string;
  QSTASH_CURRENT_SIGNING_KEY?: string;
  QSTASH_NEXT_SIGNING_KEY?: string;
  LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID?: string;
  LAUNCHLENS_QSTASH_RECOVERY_URL?: string;
}

export type QStashRecoveryEnvironmentInput =
  | Readonly<QStashRecoveryEnvironment>
  | Readonly<Record<string, string | undefined>>;

export type QStashRecoveryConfigurationErrorCode =
  | "recovery_source_not_qstash"
  | "signing_keys_missing"
  | "schedule_id_misconfigured"
  | "recovery_url_misconfigured";

export type QStashRecoveryAuthenticationErrorCode =
  | "signature_missing"
  | "signature_invalid"
  | "request_body_unreadable"
  | "schedule_id_invalid"
  | "message_id_invalid"
  | "retried_invalid";

export type QStashRecoveryAuthErrorCode =
  | QStashRecoveryConfigurationErrorCode
  | QStashRecoveryAuthenticationErrorCode;

/**
 * Stable, secret-safe error boundary for the recovery route.
 *
 * QStash signature failures can contain JWT claims and body hashes. Those
 * details deliberately stay behind this boundary; callers receive only a
 * stable code and a generic message that is safe to return or log.
 */
export abstract class QStashRecoveryAuthError extends Error {
  abstract readonly kind: "configuration" | "authentication";
  abstract readonly status: 401 | 503;
  readonly retryable = false as const;

  protected constructor(
    readonly code: QStashRecoveryAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QStashRecoveryAuthError";
  }
}

export class QStashRecoveryConfigurationError extends QStashRecoveryAuthError {
  readonly kind = "configuration" as const;
  readonly status = 503 as const;

  constructor(code: QStashRecoveryConfigurationErrorCode) {
    super(code, "QStash recovery authentication is not configured.");
    this.name = "QStashRecoveryConfigurationError";
  }
}

export class QStashRecoveryAuthenticationError extends QStashRecoveryAuthError {
  readonly kind = "authentication" as const;
  readonly status = 401 as const;

  constructor(code: QStashRecoveryAuthenticationErrorCode) {
    super(code, "QStash recovery authentication failed.");
    this.name = "QStashRecoveryAuthenticationError";
  }
}

export interface VerifiedQStashRecoveryContext {
  readonly source: "qstash";
  readonly scheduleId: typeof QSTASH_RECOVERY_SCHEDULE_ID;
  readonly messageId: string;
  readonly retried: number;
  readonly recoveryUrl: string;
  /** The exact bytes-as-text covered by the QStash body-hash claim. */
  readonly rawBody: string;
}

interface QStashRecoveryConfiguration {
  currentSigningKey: string;
  nextSigningKey: string;
  recoveryUrl: string;
}

const MESSAGE_ID_PATTERN = /^msg_[A-Za-z0-9_-]{1,200}$/;
const RETRIED_PATTERN = /^(0|[1-9][0-9]*)$/;

/**
 * Authenticate the production Deep Research recovery tick.
 *
 * The function owns the one-time body read so signature verification always
 * sees the unparsed body. It returns that same value for the route to consume
 * after the request crosses the authentication boundary.
 */
export async function authenticateQStashRecoveryRequest(
  request: Request,
  env: QStashRecoveryEnvironmentInput = readProcessEnvironment(),
): Promise<VerifiedQStashRecoveryContext> {
  const configuration = resolveConfiguration(env);
  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    throw new QStashRecoveryAuthenticationError("signature_missing");
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    throw new QStashRecoveryAuthenticationError("request_body_unreadable");
  }

  const receiver = new Receiver({
    currentSigningKey: configuration.currentSigningKey,
    nextSigningKey: configuration.nextSigningKey,
    // Production recovery must never silently accept local QStash dev keys.
    devMode: false,
  });

  try {
    // Receiver verifies the JWT issuer/time window, exact `sub` URL, and the
    // SHA-256 claim for the unparsed request body, trying current then next
    // signing key during rotation.
    // Sources:
    // https://upstash.com/docs/qstash/features/security#verifying-the-signature
    // https://github.com/upstash/qstash-js#receiving-a-message
    const verified = await receiver.verify({
      signature,
      body: rawBody,
      // Never derive this value from Host / forwarded headers. The expected
      // JWT subject is the exact production URL under operator control.
      url: configuration.recoveryUrl,
    });
    if (!verified) {
      throw new Error("QStash receiver did not verify the request");
    }
  } catch {
    throw new QStashRecoveryAuthenticationError("signature_invalid");
  }

  const scheduleId = request.headers.get("upstash-schedule-id");
  if (scheduleId !== QSTASH_RECOVERY_SCHEDULE_ID) {
    throw new QStashRecoveryAuthenticationError("schedule_id_invalid");
  }

  const messageId = request.headers.get("upstash-message-id") ?? "";
  if (!MESSAGE_ID_PATTERN.test(messageId)) {
    throw new QStashRecoveryAuthenticationError("message_id_invalid");
  }

  const retriedHeader = request.headers.get("upstash-retried") ?? "";
  if (!RETRIED_PATTERN.test(retriedHeader)) {
    throw new QStashRecoveryAuthenticationError("retried_invalid");
  }
  const retried = Number(retriedHeader);
  if (!Number.isSafeInteger(retried)) {
    throw new QStashRecoveryAuthenticationError("retried_invalid");
  }

  return {
    source: "qstash",
    scheduleId: QSTASH_RECOVERY_SCHEDULE_ID,
    messageId,
    retried,
    recoveryUrl: configuration.recoveryUrl,
    rawBody,
  };
}

function readProcessEnvironment(): QStashRecoveryEnvironment {
  return {
    LAUNCHLENS_DEEP_RECOVERY_SOURCE:
      process.env.LAUNCHLENS_DEEP_RECOVERY_SOURCE,
    LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY:
      process.env.LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY,
    LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY:
      process.env.LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID:
      process.env.LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID,
    LAUNCHLENS_QSTASH_RECOVERY_URL:
      process.env.LAUNCHLENS_QSTASH_RECOVERY_URL,
  };
}

function resolveConfiguration(
  env: QStashRecoveryEnvironmentInput,
): QStashRecoveryConfiguration {
  if (env.LAUNCHLENS_DEEP_RECOVERY_SOURCE !== "qstash") {
    throw new QStashRecoveryConfigurationError("recovery_source_not_qstash");
  }

  const currentSigningKey =
    env.LAUNCHLENS_QSTASH_CURRENT_SIGNING_KEY ||
    env.QSTASH_CURRENT_SIGNING_KEY ||
    "";
  const nextSigningKey =
    env.LAUNCHLENS_QSTASH_NEXT_SIGNING_KEY ||
    env.QSTASH_NEXT_SIGNING_KEY ||
    "";
  if (
    currentSigningKey.length < 24 ||
    nextSigningKey.length < 24 ||
    currentSigningKey === nextSigningKey
  ) {
    throw new QStashRecoveryConfigurationError("signing_keys_missing");
  }

  if (
    env.LAUNCHLENS_QSTASH_RECOVERY_SCHEDULE_ID !==
    QSTASH_RECOVERY_SCHEDULE_ID
  ) {
    throw new QStashRecoveryConfigurationError("schedule_id_misconfigured");
  }

  const recoveryUrl = env.LAUNCHLENS_QSTASH_RECOVERY_URL ?? "";
  if (recoveryUrl !== QSTASH_RECOVERY_PRODUCTION_URL) {
    throw new QStashRecoveryConfigurationError("recovery_url_misconfigured");
  }

  return { currentSigningKey, nextSigningKey, recoveryUrl };
}
