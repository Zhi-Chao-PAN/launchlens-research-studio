import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getRedis } from "@/lib/research/redis-client";
import {
  DEFAULT_MANAGED_PROVIDER_BASE_URLS,
  normalizeManagedProviderBaseUrl,
} from "@/lib/security/provider-base-url";
import { MINIMAX_DEFAULT_MODEL } from "@/lib/providers/openai-compatible-profile";

export const PROVIDER_CREDENTIALS_KEY =
  "rs:admin:provider-credentials:v1";
const HEALTH_KEY_PREFIX = `${PROVIDER_CREDENTIALS_KEY}:health`;
const FORMAT_VERSION = 1 as const;
const ALGORITHM = "aes-256-gcm" as const;
const MIN_API_KEY_LENGTH = 16;
const MAX_API_KEY_LENGTH = 512;
const MAX_MODEL_LENGTH = 200;
const HEALTH_TTL_SECONDS = 30 * 24 * 60 * 60;

export const LLM_PROVIDERS = ["openai", "anthropic"] as const;
export const PROVIDER_CREDENTIAL_SLOTS = [1, 2, 3] as const;
export const DEFAULT_PROVIDER_BASE_URLS = {
  1: DEFAULT_MANAGED_PROVIDER_BASE_URLS[0],
  2: DEFAULT_MANAGED_PROVIDER_BASE_URLS[1],
  3: DEFAULT_MANAGED_PROVIDER_BASE_URLS[2],
} as const satisfies Record<ProviderCredentialSlot, string>;
export const DEFAULT_PROVIDER_MODELS = {
  1: MINIMAX_DEFAULT_MODEL,
  2: "doubao-seed-evolving",
  3: "deepseek-v4-flash",
} as const satisfies Record<ProviderCredentialSlot, string | null>;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];
export type ProviderCredentialSlot =
  (typeof PROVIDER_CREDENTIAL_SLOTS)[number];
export type ProviderCredentialHealthStatus =
  | "unknown"
  | "healthy"
  | "degraded"
  | "cooldown";
export type ProviderCredentialFailureReason =
  | "auth"
  | "rate_limit"
  | "network"
  | "server"
  | "unknown";

interface ProviderCredentialRedis {
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: string,
    options?: { nx?: boolean; ex?: number },
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

interface EncryptedPayload {
  algorithm: typeof ALGORITHM;
  iv: string;
  ciphertext: string;
  authTag: string;
}

interface StoredCredential {
  credentialId: string;
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  enabled: boolean;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Absent only on records written before per-slot endpoints were introduced.
   * Keeping this additive preserves the authenticated envelope of v1 records.
   */
  endpointConfig?: StoredEndpointConfig;
  encrypted: EncryptedPayload;
}

interface StoredEndpointConfig {
  version: 1;
  baseUrl: string;
  model: string | null;
}

interface StoredDocument {
  version: typeof FORMAT_VERSION;
  revision: number;
  credentials: StoredCredential[];
}

interface StoredHealth {
  credentialId: string;
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  status: ProviderCredentialHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: ProviderCredentialFailureReason | null;
  cooldownUntil: string | null;
}

export interface ProviderCredentialHealth {
  status: ProviderCredentialHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureReason: ProviderCredentialFailureReason | null;
  cooldownUntil: string | null;
}

export interface ProviderCredentialSlotStatus {
  slot: ProviderCredentialSlot;
  isConfigured: boolean;
  /** False only for legacy key-only records that must be explicitly rebound. */
  isRouteBound: boolean;
  provider: LlmProvider | null;
  enabled: boolean;
  /** Opaque identity; regenerated for every key replacement. */
  credentialId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Non-secret endpoint configuration; API keys remain write-only. */
  baseUrl: string;
  /** Null means use the provider-wide runtime model fallback. */
  model: string | null;
  health: ProviderCredentialHealth;
}

export interface ProviderCredentialsSnapshot {
  version: typeof FORMAT_VERSION;
  revision: number;
  slots: ProviderCredentialSlotStatus[];
}

export interface ResolvedProviderCredential {
  /** Opaque per-replacement identity used to reject stale health writes. */
  credentialId: string;
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  apiKey: string;
  /** Always populated after the route has been explicitly bound. */
  baseUrl: string;
  /** Null means the managed adapter must use its runtime model fallback. */
  model: string | null;
  fingerprint: string;
  health: ProviderCredentialHealth;
}

export interface UpsertProviderCredentialInput {
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  /** Required for creation/replacement; omit when only toggling enabled. */
  apiKey?: string;
  baseUrl?: string;
  /** Null clears a slot-specific override and restores the runtime fallback. */
  model?: string | null;
  enabled?: boolean;
  expectedRevision: number;
}

export interface DeleteProviderCredentialInput {
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  expectedRevision: number;
}

export interface ResolveProviderCredentialForTestInput {
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  credentialId: string;
  expectedRevision: number;
}

export interface ProviderCredentialStoreOptions {
  /** Test seam only. Production callers intentionally use getRedis(). */
  redis?: ProviderCredentialRedis | null;
  /** Test seam only. The encryption secret is still read exclusively by name. */
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => Date;
}

export interface ProviderCredentialProbeLease {
  provider: LlmProvider;
  slot: ProviderCredentialSlot;
  credentialId: string;
  leaseId: string;
}

export class ProviderCredentialsUnavailableError extends Error {
  readonly code = "PROVIDER_CREDENTIALS_UNAVAILABLE";

  constructor() {
    super("Provider credential storage is unavailable.");
    this.name = "ProviderCredentialsUnavailableError";
  }
}

export class ProviderCredentialsIntegrityError extends Error {
  readonly code = "PROVIDER_CREDENTIALS_INTEGRITY_ERROR";

  constructor() {
    super("Provider credential storage failed integrity verification.");
    this.name = "ProviderCredentialsIntegrityError";
  }
}

export class ProviderCredentialsConflictError extends Error {
  readonly code = "PROVIDER_CREDENTIALS_REVISION_CONFLICT";

  constructor(readonly currentRevision: number) {
    super("Provider credentials changed since they were last read.");
    this.name = "ProviderCredentialsConflictError";
  }
}

export class ProviderCredentialNotFoundError extends Error {
  readonly code = "PROVIDER_CREDENTIAL_NOT_FOUND";

  constructor() {
    super("Provider credential was not found.");
    this.name = "ProviderCredentialNotFoundError";
  }
}

export class ProviderCredentialValidationError extends Error {
  readonly code = "PROVIDER_CREDENTIAL_VALIDATION_ERROR";

  constructor(message: string) {
    super(message);
    this.name = "ProviderCredentialValidationError";
  }
}

const CAS_SCRIPT = `
local existing = redis.call("GET", KEYS[1])
local current_revision = 0
if existing then
  local ok, decoded = pcall(cjson.decode, existing)
  if not ok or type(decoded) ~= "table" or type(decoded.revision) ~= "number" then
    return { -1, -1 }
  end
  current_revision = decoded.revision
end
if current_revision ~= tonumber(ARGV[1]) then
  return { 0, current_revision }
end
redis.call("SET", KEYS[1], ARGV[2])
return { 1, tonumber(ARGV[3]) }
`;

const HEALTH_UPDATE_SCRIPT = `
local raw_config = redis.call("GET", KEYS[1])
if not raw_config then return { 0, 0 } end
local config_ok, config = pcall(cjson.decode, raw_config)
if not config_ok or type(config) ~= "table" or type(config.credentials) ~= "table" then
  return { -1, 0 }
end

local current = false
for _, credential in ipairs(config.credentials) do
  if credential.provider == ARGV[1]
    and tonumber(credential.slot) == tonumber(ARGV[2])
    and credential.credentialId == ARGV[3]
    and credential.enabled == true
  then
    current = true
    break
  end
end
if not current then return { 0, 0 } end

local previous = nil
local raw_health = redis.call("GET", KEYS[2])
if raw_health then
  local health_ok, decoded_health = pcall(cjson.decode, raw_health)
  if health_ok and type(decoded_health) == "table"
    and decoded_health.credentialId == ARGV[3]
  then
    previous = decoded_health
  end
end

local null = cjson.null
local next_health = {
  credentialId = ARGV[3],
  provider = ARGV[1],
  slot = tonumber(ARGV[2]),
  status = ARGV[4],
  consecutiveFailures = 0,
  lastSuccessAt = null,
  lastFailureAt = null,
  lastFailureReason = null,
  cooldownUntil = null
}

if previous then
  next_health.lastSuccessAt = previous.lastSuccessAt or null
  next_health.lastFailureAt = previous.lastFailureAt or null
  next_health.lastFailureReason = previous.lastFailureReason or null
end

if ARGV[4] == "healthy" then
  next_health.lastSuccessAt = ARGV[5]
else
  local failures = 0
  if previous and type(previous.consecutiveFailures) == "number" then
    failures = previous.consecutiveFailures
  end
  next_health.consecutiveFailures = math.min(1000000, failures + 1)
  next_health.lastFailureAt = ARGV[5]
  next_health.lastFailureReason = ARGV[6]
  if ARGV[7] ~= "" then next_health.cooldownUntil = ARGV[7] end
end

redis.call("SET", KEYS[2], cjson.encode(next_health), "EX", tonumber(ARGV[8]))
return { 1, next_health.consecutiveFailures }
`;

const RELEASE_PROBE_SCRIPT = `
local owner = redis.call("GET", KEYS[1])
if owner == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const CLEAR_HEALTH_SCRIPT = `
local raw = redis.call("GET", KEYS[1])
if not raw then return 0 end
local ok, health = pcall(cjson.decode, raw)
if ok and type(health) == "table" and health.credentialId == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export function isLlmProvider(value: unknown): value is LlmProvider {
  return value === "openai" || value === "anthropic";
}

export function isProviderCredentialSlot(
  value: unknown,
): value is ProviderCredentialSlot {
  return value === 1 || value === 2 || value === 3;
}

export function validateProviderApiKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new ProviderCredentialValidationError("apiKey must be a string.");
  }
  if (
    value.length < MIN_API_KEY_LENGTH ||
    value.length > MAX_API_KEY_LENGTH
  ) {
    throw new ProviderCredentialValidationError(
      `apiKey must be ${MIN_API_KEY_LENGTH}-${MAX_API_KEY_LENGTH} characters.`,
    );
  }
  if (value.trim() !== value || /[\s\u0000-\u001f\u007f]/u.test(value)) {
    throw new ProviderCredentialValidationError(
      "apiKey must not contain whitespace or control characters.",
    );
  }
  return value;
}

export function defaultProviderBaseUrl(
  slot: ProviderCredentialSlot,
): string {
  return DEFAULT_PROVIDER_BASE_URLS[slot];
}

export function defaultProviderModel(
  slot: ProviderCredentialSlot,
): string | null {
  return DEFAULT_PROVIDER_MODELS[slot];
}

export function validateProviderCredentialBaseUrl(
  value: unknown,
  slot: ProviderCredentialSlot,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (typeof value !== "string") {
    throw new ProviderCredentialValidationError("baseUrl must be a string.");
  }
  try {
    return normalizeManagedProviderBaseUrl(value, defaultProviderBaseUrl(slot), {
      nodeEnv: env.NODE_ENV,
      env,
    });
  } catch {
    throw new ProviderCredentialValidationError(
      "baseUrl must be a safe HTTPS provider endpoint.",
    );
  }
}

export function validateProviderCredentialModel(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ProviderCredentialValidationError("model must be a string or null.");
  }
  if (
    value.length < 1 ||
    value.length > MAX_MODEL_LENGTH ||
    value.trim() !== value ||
    /[\s\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new ProviderCredentialValidationError(
      `model must be 1-${MAX_MODEL_LENGTH} non-whitespace characters.`,
    );
  }
  return value;
}

export async function getProviderCredentialsSnapshot(
  options: ProviderCredentialStoreOptions = {},
): Promise<ProviderCredentialsSnapshot> {
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  const decrypted = await verifyCredentials(document, context.key);
  const health = await Promise.all(
    PROVIDER_CREDENTIAL_SLOTS.map((slot) =>
      readHealth(context.redis, slot),
    ),
  );

  return {
    version: FORMAT_VERSION,
    revision: document.revision,
    slots: PROVIDER_CREDENTIAL_SLOTS.map((slot, index) => {
      const record = decrypted.find((item) => item.record.slot === slot);
      if (!record) return emptySlot(slot);
      const slotHealth = health[index];
      return {
        slot,
        isConfigured: true,
        isRouteBound: record.record.endpointConfig !== undefined,
        provider: record.record.provider,
        enabled: record.record.enabled,
        credentialId: record.record.credentialId,
        createdAt: record.record.createdAt,
        updatedAt: record.record.updatedAt,
        baseUrl:
          record.record.endpointConfig?.baseUrl ?? defaultProviderBaseUrl(slot),
        model: record.record.endpointConfig
          ? record.record.endpointConfig.model
          : defaultProviderModel(slot),
        health:
          slotHealth &&
          slotHealth.provider === record.record.provider &&
          slotHealth.credentialId === record.record.credentialId
            ? publicHealth(slotHealth)
            : unknownHealth(),
      };
    }),
  };
}

export async function upsertProviderCredential(
  input: UpsertProviderCredentialInput,
  options: ProviderCredentialStoreOptions = {},
): Promise<ProviderCredentialsSnapshot> {
  validateMutationIdentity(input);
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  const verified = await verifyCredentials(document, context.key);
  assertExpectedRevision(document, input.expectedRevision);

  const existing = verified.find(({ record }) => record.slot === input.slot);
  const differentProviderPeer = verified.find(
    ({ record }) =>
      record.slot !== input.slot && record.provider !== input.provider,
  );
  if (differentProviderPeer) {
    throw new ProviderCredentialValidationError(
      "All configured slots must use the same provider.",
    );
  }
  const now = (options.now ?? (() => new Date()))().toISOString();
  let nextRecord: StoredCredential;

  const hasBaseUrl = Object.prototype.hasOwnProperty.call(input, "baseUrl");
  const hasModel = Object.prototype.hasOwnProperty.call(input, "model");
  const currentBaseUrl =
    existing?.record.endpointConfig?.baseUrl ?? defaultProviderBaseUrl(input.slot);
  const currentModel = existing?.record.endpointConfig
    ? existing.record.endpointConfig.model
    : defaultProviderModel(input.slot);
  const nextBaseUrl = hasBaseUrl
    ? validateProviderCredentialBaseUrl(input.baseUrl, input.slot, options.env)
    : currentBaseUrl;
  const nextModel = hasModel
    ? validateProviderCredentialModel(input.model)
    : currentModel;
  const endpointChanged =
    existing !== undefined && (
      existing.record.endpointConfig === undefined ||
      nextBaseUrl !== currentBaseUrl ||
      nextModel !== currentModel
    );
  const endpointConfig: StoredEndpointConfig = {
    version: 1,
    baseUrl: nextBaseUrl,
    model: nextModel,
  };

  if (input.apiKey !== undefined) {
    const apiKey = validateProviderApiKey(input.apiKey);
    nextRecord = encryptCredential(
      {
        credentialId: randomBytes(16).toString("hex"),
        provider: input.provider,
        slot: input.slot,
        enabled: input.enabled ?? true,
        createdAt: existing?.record.createdAt ?? now,
        updatedAt: now,
        endpointConfig,
      },
      apiKey,
      context.key,
    );
  } else {
    if (!existing || existing.record.provider !== input.provider) {
      throw new ProviderCredentialNotFoundError();
    }
    if (
      typeof input.enabled !== "boolean" &&
      !hasBaseUrl &&
      !hasModel
    ) {
      throw new ProviderCredentialValidationError(
        "apiKey, enabled, baseUrl, or model must be provided.",
      );
    }
    const enabled = input.enabled ?? existing.record.enabled;
    nextRecord = encryptCredential(
      {
        credentialId: endpointChanged
          ? randomBytes(16).toString("hex")
          : existing.record.credentialId,
        provider: existing.record.provider,
        slot: existing.record.slot,
        enabled,
        createdAt: existing.record.createdAt,
        updatedAt: now,
        endpointConfig,
      },
      existing.apiKey,
      context.key,
    );
  }

  const next: StoredDocument = {
    version: FORMAT_VERSION,
    revision: document.revision + 1,
    credentials: document.credentials
      .filter((record) => record.slot !== input.slot)
      .concat(nextRecord)
      .sort((a, b) => a.slot - b.slot),
  };
  await compareAndSet(context.redis, document.revision, next);

  // Health never carries secrets. Clearing it is best-effort and stale entries
  // are ignored unless their provider matches the newly configured slot.
  if (existing && existing.record.credentialId !== nextRecord.credentialId) {
    await clearCredentialRuntimeState(
      context.redis,
      input.slot,
      existing.record.credentialId,
    );
  }
  return getProviderCredentialsSnapshot(options);
}

export async function deleteProviderCredential(
  input: DeleteProviderCredentialInput,
  options: ProviderCredentialStoreOptions = {},
): Promise<ProviderCredentialsSnapshot> {
  validateMutationIdentity(input);
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  await verifyCredentials(document, context.key);
  assertExpectedRevision(document, input.expectedRevision);
  const existing = document.credentials.find(
    (record) => record.slot === input.slot && record.provider === input.provider,
  );
  if (!existing) throw new ProviderCredentialNotFoundError();

  const next: StoredDocument = {
    version: FORMAT_VERSION,
    revision: document.revision + 1,
    credentials: document.credentials.filter(
      (record) => record.slot !== input.slot,
    ),
  };
  await compareAndSet(context.redis, document.revision, next);
  await clearCredentialRuntimeState(
    context.redis,
    input.slot,
    existing.credentialId,
  );
  return getProviderCredentialsSnapshot(options);
}

/**
 * Server-only resolution surface used by provider adapters. Results are always
 * ordered 1 -> 2 -> 3 and disabled credentials are omitted.
 */
export async function resolveProviderCredentials(
  provider: LlmProvider,
  options: ProviderCredentialStoreOptions = {},
): Promise<ResolvedProviderCredential[]> {
  if (!isLlmProvider(provider)) {
    throw new ProviderCredentialValidationError("Unsupported provider.");
  }
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  const verified = await verifyCredentials(document, context.key);
  const matches = verified
    .filter(
      ({ record }) =>
        record.provider === provider &&
        record.enabled &&
        record.endpointConfig !== undefined,
    )
    .sort((a, b) => a.record.slot - b.record.slot);

  return Promise.all(
    matches.map(async ({ record, apiKey }) => {
      const storedHealth = await readHealth(context.redis, record.slot);
      return {
        credentialId: record.credentialId,
        provider,
        slot: record.slot,
        apiKey,
        baseUrl:
          record.endpointConfig?.baseUrl ?? defaultProviderBaseUrl(record.slot),
        model: record.endpointConfig
          ? record.endpointConfig.model
          : defaultProviderModel(record.slot),
        fingerprint: record.fingerprint,
        health:
          storedHealth && storedHealth.provider === provider
            && storedHealth.credentialId === record.credentialId
            ? publicHealth(storedHealth)
            : unknownHealth(),
      };
    }),
  );
}

/**
 * Resolve one exact saved slot for an authenticated manual connection test.
 * Disabled credentials are eligible once their route is bound. Revision +
 * immutable identity prevent a stale browser snapshot from silently selecting
 * a replacement credential.
 */
export async function resolveProviderCredentialForTest(
  input: ResolveProviderCredentialForTestInput,
  options: ProviderCredentialStoreOptions = {},
): Promise<ResolvedProviderCredential> {
  validateRuntimeIdentity(input.provider, input.slot, input.credentialId);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    throw new ProviderCredentialValidationError(
      "expectedRevision must be a non-negative integer.",
    );
  }
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  assertExpectedRevision(document, input.expectedRevision);
  const verified = await verifyCredentials(document, context.key);
  const match = verified.find(
    ({ record }) =>
      record.provider === input.provider &&
      record.slot === input.slot &&
      record.credentialId === input.credentialId &&
      record.endpointConfig !== undefined,
  );
  if (!match) throw new ProviderCredentialNotFoundError();
  const storedHealth = await readHealth(context.redis, input.slot);
  return {
    credentialId: match.record.credentialId,
    provider: match.record.provider,
    slot: match.record.slot,
    apiKey: match.apiKey,
    baseUrl:
      match.record.endpointConfig?.baseUrl ?? defaultProviderBaseUrl(input.slot),
    model: match.record.endpointConfig
      ? match.record.endpointConfig.model
      : defaultProviderModel(input.slot),
    fingerprint: match.record.fingerprint,
    health:
      storedHealth &&
      storedHealth.provider === input.provider &&
      storedHealth.credentialId === input.credentialId
        ? publicHealth(storedHealth)
        : unknownHealth(),
  };
}

export async function recordProviderCredentialSuccess(
  provider: LlmProvider,
  slot: ProviderCredentialSlot,
  credentialId: string,
  options: ProviderCredentialStoreOptions = {},
): Promise<void> {
  await writeHealthUpdate(
    provider,
    slot,
    credentialId,
    "healthy",
    null,
    0,
    options,
  );
}

export async function recordProviderCredentialFailure(
  provider: LlmProvider,
  slot: ProviderCredentialSlot,
  credentialId: string,
  reason: ProviderCredentialFailureReason,
  cooldownMs: number,
  options: ProviderCredentialStoreOptions = {},
): Promise<void> {
  if (!isFailureReason(reason)) {
    throw new ProviderCredentialValidationError("Invalid failure reason.");
  }
  if (!Number.isFinite(cooldownMs) || cooldownMs < 0 || cooldownMs > 86_400_000) {
    throw new ProviderCredentialValidationError(
      "cooldownMs must be between 0 and 86400000.",
    );
  }
  await writeHealthUpdate(
    provider,
    slot,
    credentialId,
    cooldownMs > 0 ? "cooldown" : "degraded",
    reason,
    cooldownMs,
    options,
  );
}

/**
 * Grants a short single-flight lease when a cooled-down credential is probed.
 * The key includes the immutable credentialId, so replacing a key can never be
 * blocked or mutated by an in-flight request for its predecessor.
 */
export async function acquireProviderCredentialProbe(
  provider: LlmProvider,
  slot: ProviderCredentialSlot,
  credentialId: string,
  ttlSeconds = 15,
  options: ProviderCredentialStoreOptions = {},
): Promise<ProviderCredentialProbeLease | null> {
  validateRuntimeIdentity(provider, slot, credentialId);
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 5 ||
    ttlSeconds > 300
  ) {
    throw new ProviderCredentialValidationError(
      "Probe TTL must be between 5 and 300 seconds.",
    );
  }
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  await verifyCredentials(document, context.key);
  const current = document.credentials.some(
    (record) =>
      record.provider === provider &&
      record.slot === slot &&
      record.credentialId === credentialId &&
      record.enabled,
  );
  if (!current) throw new ProviderCredentialNotFoundError();

  const leaseId = randomBytes(16).toString("hex");
  try {
    const acquired = await context.redis.set(
      probeKey(slot, credentialId),
      leaseId,
      { nx: true, ex: ttlSeconds },
    );
    return acquired
      ? { provider, slot, credentialId, leaseId }
      : null;
  } catch {
    throw new ProviderCredentialsUnavailableError();
  }
}

export async function releaseProviderCredentialProbe(
  lease: ProviderCredentialProbeLease,
  options: ProviderCredentialStoreOptions = {},
): Promise<boolean> {
  validateRuntimeIdentity(lease.provider, lease.slot, lease.credentialId);
  if (!/^[a-f0-9]{32}$/u.test(lease.leaseId)) {
    throw new ProviderCredentialValidationError("Invalid probe lease.");
  }
  const context = resolveContext(options);
  try {
    const released = await context.redis.eval(
      RELEASE_PROBE_SCRIPT,
      [probeKey(lease.slot, lease.credentialId)],
      [lease.leaseId],
    );
    return Number(released) > 0;
  } catch {
    throw new ProviderCredentialsUnavailableError();
  }
}

type ResolvedContext = {
  redis: ProviderCredentialRedis;
  key: Buffer;
  env: Readonly<Record<string, string | undefined>>;
};

function resolveContext(
  options: ProviderCredentialStoreOptions,
): ResolvedContext {
  const redis =
    options.redis === undefined
      ? (getRedis() as unknown as ProviderCredentialRedis | null)
      : options.redis;
  const env = options.env ?? process.env;
  const source = env.LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET;
  const key = decodeMasterKey(source);
  if (!redis || !key) {
    throw new ProviderCredentialsUnavailableError();
  }
  return { redis, key, env };
}

function decodeMasterKey(value: unknown): Buffer | null {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9+/]{43}=$/u.test(value)
  ) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 && decoded.toString("base64") === value
      ? decoded
      : null;
  } catch {
    return null;
  }
}

async function readDocument(
  redis: ProviderCredentialRedis,
  env: Readonly<Record<string, string | undefined>>,
): Promise<StoredDocument> {
  let raw: unknown;
  try {
    raw = await redis.get(PROVIDER_CREDENTIALS_KEY);
  } catch {
    throw new ProviderCredentialsUnavailableError();
  }
  if (raw === null || raw === undefined) return emptyDocument();
  try {
    const decoded = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isStoredDocument(decoded, env)) throw new Error("invalid document");
    return decoded;
  } catch {
    throw new ProviderCredentialsIntegrityError();
  }
}

async function verifyCredentials(
  document: StoredDocument,
  key: Buffer,
): Promise<Array<{ record: StoredCredential; apiKey: string }>> {
  return document.credentials.map((record) => ({
    record,
    apiKey: decryptCredential(record, key),
  }));
}

function encryptCredential(
  metadata: Omit<StoredCredential, "encrypted" | "fingerprint">,
  apiKey: string,
  key: Buffer,
): StoredCredential {
  const fingerprint = fingerprintFor(apiKey, key);
  const recordBase = { ...metadata, fingerprint };
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aadFor(recordBase), "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return {
    ...recordBase,
    encrypted: {
      algorithm: ALGORITHM,
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      authTag: cipher.getAuthTag().toString("base64url"),
    },
  };
}

function decryptCredential(record: StoredCredential, key: Buffer): string {
  try {
    const iv = Buffer.from(record.encrypted.iv, "base64url");
    const authTag = Buffer.from(record.encrypted.authTag, "base64url");
    const ciphertext = Buffer.from(record.encrypted.ciphertext, "base64url");
    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
      throw new Error("invalid envelope");
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAAD(Buffer.from(aadFor(record), "utf8"));
    decipher.setAuthTag(authTag);
    const apiKey = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    validateProviderApiKey(apiKey);
    const expected = Buffer.from(record.fingerprint, "utf8");
    const actual = Buffer.from(fingerprintFor(apiKey, key), "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new Error("fingerprint mismatch");
    }
    return apiKey;
  } catch {
    throw new ProviderCredentialsIntegrityError();
  }
}

function aadFor(
  record: Pick<
    StoredCredential,
    | "credentialId"
    | "provider"
    | "slot"
    | "enabled"
    | "fingerprint"
    | "createdAt"
    | "updatedAt"
    | "endpointConfig"
  >,
): string {
  const legacy = [
    "launchlens-provider-credential",
    FORMAT_VERSION,
    record.credentialId,
    record.provider,
    record.slot,
    record.enabled ? "1" : "0",
    record.fingerprint,
    record.createdAt,
    record.updatedAt,
  ];
  if (!("endpointConfig" in record) || record.endpointConfig === undefined) {
    return legacy.join(":");
  }
  return legacy.concat(
    "endpoint-v1",
    Buffer.from(record.endpointConfig.baseUrl, "utf8").toString("base64url"),
    record.endpointConfig.model === null
      ? "-"
      : Buffer.from(record.endpointConfig.model, "utf8").toString("base64url"),
  ).join(":");
}

function fingerprintFor(apiKey: string, key: Buffer): string {
  return createHmac("sha256", key)
    .update("launchlens-provider-key-fingerprint\0", "utf8")
    .update(apiKey, "utf8")
    .digest("hex")
    .slice(0, 20);
}

async function compareAndSet(
  redis: ProviderCredentialRedis,
  expectedRevision: number,
  next: StoredDocument,
): Promise<void> {
  let raw: unknown;
  try {
    raw = await redis.eval(
      CAS_SCRIPT,
      [PROVIDER_CREDENTIALS_KEY],
      [String(expectedRevision), JSON.stringify(next), String(next.revision)],
    );
  } catch {
    throw new ProviderCredentialsUnavailableError();
  }
  const result = Array.isArray(raw) ? raw.map(Number) : [];
  if (result[0] === 1) return;
  if (result[0] === 0 && Number.isSafeInteger(result[1])) {
    throw new ProviderCredentialsConflictError(result[1]);
  }
  throw new ProviderCredentialsIntegrityError();
}

async function readHealth(
  redis: ProviderCredentialRedis,
  slot: ProviderCredentialSlot,
): Promise<StoredHealth | null> {
  let raw: unknown;
  try {
    raw = await redis.get(healthKey(slot));
  } catch {
    throw new ProviderCredentialsUnavailableError();
  }
  if (raw === null || raw === undefined) return null;
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return isStoredHealth(value) ? value : null;
  } catch {
    return null;
  }
}

async function writeHealthUpdate(
  provider: LlmProvider,
  slot: ProviderCredentialSlot,
  credentialId: string,
  status: "healthy" | "degraded" | "cooldown",
  reason: ProviderCredentialFailureReason | null,
  cooldownMs: number,
  options: ProviderCredentialStoreOptions,
): Promise<void> {
  validateRuntimeIdentity(provider, slot, credentialId);
  const context = resolveContext(options);
  const document = await readDocument(context.redis, context.env);
  await verifyCredentials(document, context.key);
  const credential = document.credentials.find(
    (record) =>
      record.slot === slot &&
      record.provider === provider &&
      record.credentialId === credentialId,
  );
  if (!credential) throw new ProviderCredentialNotFoundError();
  const now = (options.now ?? (() => new Date()))().toISOString();
  const cooldownUntil =
    cooldownMs > 0
      ? new Date(Date.parse(now) + cooldownMs).toISOString()
      : "";
  let result: unknown;
  try {
    result = await context.redis.eval(
      HEALTH_UPDATE_SCRIPT,
      [PROVIDER_CREDENTIALS_KEY, healthKey(slot)],
      [
        provider,
        String(slot),
        credentialId,
        status,
        now,
        reason ?? "",
        cooldownUntil,
        String(HEALTH_TTL_SECONDS),
      ],
    );
  } catch {
    throw new ProviderCredentialsUnavailableError();
  }
  const parsed = Array.isArray(result) ? result.map(Number) : [];
  if (parsed[0] === 1) return;
  if (parsed[0] === 0) throw new ProviderCredentialNotFoundError();
  throw new ProviderCredentialsIntegrityError();
}

async function clearHealthIfCredentialMatches(
  redis: ProviderCredentialRedis,
  slot: ProviderCredentialSlot,
  credentialId: string,
): Promise<void> {
  try {
    await redis.eval(
      CLEAR_HEALTH_SCRIPT,
      [healthKey(slot)],
      [credentialId],
    );
  } catch {
    // Config is already committed. Stale health is non-secret and ignored
    // because every read is identity-bound, so cleanup remains best-effort.
  }
}

async function clearCredentialRuntimeState(
  redis: ProviderCredentialRedis,
  slot: ProviderCredentialSlot,
  credentialId: string,
): Promise<void> {
  await clearHealthIfCredentialMatches(redis, slot, credentialId);
  try {
    await redis.del(probeKey(slot, credentialId));
  } catch {
    // The immutable identity means a stale lease cannot affect the replacement.
  }
}

function validateRuntimeIdentity(
  provider: unknown,
  slot: unknown,
  credentialId: unknown,
): asserts provider is LlmProvider {
  if (
    !isLlmProvider(provider) ||
    !isProviderCredentialSlot(slot) ||
    typeof credentialId !== "string" ||
    !/^[a-f0-9]{32}$/u.test(credentialId)
  ) {
    throw new ProviderCredentialValidationError(
      "Invalid provider credential identity.",
    );
  }
}

function validateMutationIdentity(input: {
  provider: unknown;
  slot: unknown;
  expectedRevision: unknown;
}): void {
  if (!isLlmProvider(input.provider)) {
    throw new ProviderCredentialValidationError("Unsupported provider.");
  }
  if (!isProviderCredentialSlot(input.slot)) {
    throw new ProviderCredentialValidationError("slot must be 1, 2, or 3.");
  }
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0
  ) {
    throw new ProviderCredentialValidationError(
      "expectedRevision must be a non-negative integer.",
    );
  }
}

function assertExpectedRevision(
  document: StoredDocument,
  expectedRevision: number,
): void {
  if (document.revision !== expectedRevision) {
    throw new ProviderCredentialsConflictError(document.revision);
  }
}

function emptyDocument(): StoredDocument {
  return { version: FORMAT_VERSION, revision: 0, credentials: [] };
}

function emptySlot(slot: ProviderCredentialSlot): ProviderCredentialSlotStatus {
  return {
    slot,
    isConfigured: false,
    isRouteBound: false,
    provider: null,
    enabled: false,
    credentialId: null,
    createdAt: null,
    updatedAt: null,
    baseUrl: defaultProviderBaseUrl(slot),
    model: defaultProviderModel(slot),
    health: unknownHealth(),
  };
}

function unknownHealth(): ProviderCredentialHealth {
  return {
    status: "unknown",
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    cooldownUntil: null,
  };
}

function publicHealth(value: StoredHealth): ProviderCredentialHealth {
  return {
    status: value.status,
    consecutiveFailures: value.consecutiveFailures,
    lastSuccessAt: value.lastSuccessAt,
    lastFailureAt: value.lastFailureAt,
    lastFailureReason: value.lastFailureReason,
    cooldownUntil: value.cooldownUntil,
  };
}

function healthKey(slot: ProviderCredentialSlot): string {
  return `${HEALTH_KEY_PREFIX}:${slot}`;
}

function probeKey(
  slot: ProviderCredentialSlot,
  credentialId: string,
): string {
  return `${HEALTH_KEY_PREFIX}:probe:${slot}:${credentialId}`;
}

function isStoredDocument(
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
): value is StoredDocument {
  if (!isRecord(value)) return false;
  if (
    value.version !== FORMAT_VERSION ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !Array.isArray(value.credentials) ||
    value.credentials.length > PROVIDER_CREDENTIAL_SLOTS.length
  ) {
    return false;
  }
  const seen = new Set<number>();
  const providers = new Set<LlmProvider>();
  const valid = value.credentials.every((entry) => {
    if (!isStoredCredential(entry, env) || seen.has(entry.slot)) return false;
    seen.add(entry.slot);
    providers.add(entry.provider);
    return true;
  });
  return valid && providers.size <= 1;
}

function isStoredCredential(
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
): value is StoredCredential {
  if (!isRecord(value) || !isRecord(value.encrypted)) return false;
  if (!isProviderCredentialSlot(value.slot)) return false;
  const endpointConfigValid = value.endpointConfig === undefined || (
    isRecord(value.endpointConfig) &&
    value.endpointConfig.version === 1 &&
    typeof value.endpointConfig.baseUrl === "string" &&
    isSafeStoredBaseUrl(value.endpointConfig.baseUrl, value.slot, env) &&
    (value.endpointConfig.model === null ||
      isSafeStoredModel(value.endpointConfig.model))
  );
  return (
    isLlmProvider(value.provider) &&
    typeof value.credentialId === "string" &&
    /^[a-f0-9]{32}$/u.test(value.credentialId) &&
    typeof value.enabled === "boolean" &&
    typeof value.fingerprint === "string" &&
    /^[a-f0-9]{20}$/u.test(value.fingerprint) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    endpointConfigValid &&
    value.encrypted.algorithm === ALGORITHM &&
    isBase64Url(value.encrypted.iv) &&
    isBase64Url(value.encrypted.ciphertext) &&
    isBase64Url(value.encrypted.authTag)
  );
}

function isSafeStoredBaseUrl(
  value: string,
  slot: ProviderCredentialSlot,
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  try {
    return normalizeManagedProviderBaseUrl(
      value,
      defaultProviderBaseUrl(slot),
      { nodeEnv: env.NODE_ENV, env },
    ) === value;
  } catch {
    return false;
  }
}

function isSafeStoredModel(value: unknown): value is string {
  try {
    return validateProviderCredentialModel(value) === value;
  } catch {
    return false;
  }
}

function isStoredHealth(value: unknown): value is StoredHealth {
  if (!isRecord(value)) return false;
  return (
    typeof value.credentialId === "string" &&
    /^[a-f0-9]{32}$/u.test(value.credentialId) &&
    isLlmProvider(value.provider) &&
    isProviderCredentialSlot(value.slot) &&
    (value.status === "unknown" ||
      value.status === "healthy" ||
      value.status === "degraded" ||
      value.status === "cooldown") &&
    Number.isSafeInteger(value.consecutiveFailures) &&
    Number(value.consecutiveFailures) >= 0 &&
    nullableTimestamp(value.lastSuccessAt) &&
    nullableTimestamp(value.lastFailureAt) &&
    (value.lastFailureReason === null ||
      isFailureReason(value.lastFailureReason)) &&
    nullableTimestamp(value.cooldownUntil)
  );
}

function isFailureReason(
  value: unknown,
): value is ProviderCredentialFailureReason {
  return (
    value === "auth" ||
    value === "rate_limit" ||
    value === "network" ||
    value === "server" ||
    value === "unknown"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function nullableTimestamp(value: unknown): boolean {
  return value === null || isIsoTimestamp(value);
}

function isBase64Url(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/u.test(value);
}
