// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { createCipheriv, createHmac } from "node:crypto";
import {
  PROVIDER_CREDENTIALS_KEY,
  ProviderCredentialNotFoundError,
  ProviderCredentialValidationError,
  ProviderCredentialsIntegrityError,
  ProviderCredentialsUnavailableError,
  acquireProviderCredentialProbe,
  deleteProviderCredential,
  getProviderCredentialsSnapshot,
  recordProviderCredentialFailure,
  recordProviderCredentialSuccess,
  releaseProviderCredentialProbe,
  resolveProviderCredentialForTest,
  resolveProviderCredentials,
  upsertProviderCredential,
} from "./provider-credentials";

const ENV = {
  LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET:
    Buffer.alloc(32, 7).toString("base64"),
};
const NOW = () => new Date("2026-07-15T08:00:00.000Z");

class FakeRedis {
  readonly store = new Map<string, string>();
  readonly expirations = new Map<string, number>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set(
    key: string,
    value: string,
    options?: { nx?: boolean; ex?: number },
  ): Promise<string | null> {
    if (options?.nx && this.store.has(key)) return null;
    this.store.set(key, value);
    if (options?.ex) this.expirations.set(key, options.ex);
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async eval(
    _script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    if (keys.length === 2) {
      const rawConfig = this.store.get(keys[0]);
      if (!rawConfig) return [0, 0];
      const config = JSON.parse(rawConfig) as {
        credentials: Array<{
          provider: string;
          slot: number;
          credentialId: string;
          enabled: boolean;
        }>;
      };
      const current = config.credentials.some(
        (credential) =>
          credential.provider === args[0] &&
          credential.slot === Number(args[1]) &&
          credential.credentialId === args[2] &&
          credential.enabled,
      );
      if (!current) return [0, 0];
      const previousRaw = this.store.get(keys[1]);
      const previous = previousRaw
        ? (JSON.parse(previousRaw) as Record<string, unknown>)
        : null;
      const isSuccess = args[3] === "healthy";
      const previousFailures =
        previous?.credentialId === args[2] &&
        typeof previous.consecutiveFailures === "number"
          ? previous.consecutiveFailures
          : 0;
      const health = {
        credentialId: args[2],
        provider: args[0],
        slot: Number(args[1]),
        status: args[3],
        consecutiveFailures: isSuccess ? 0 : previousFailures + 1,
        lastSuccessAt: isSuccess
          ? args[4]
          : (previous?.lastSuccessAt ?? null),
        lastFailureAt: isSuccess
          ? (previous?.lastFailureAt ?? null)
          : args[4],
        lastFailureReason: isSuccess
          ? (previous?.lastFailureReason ?? null)
          : args[5],
        cooldownUntil: args[6] || null,
      };
      this.store.set(keys[1], JSON.stringify(health));
      this.expirations.set(keys[1], Number(args[7]));
      return [1, health.consecutiveFailures];
    }
    if (args.length === 1) {
      const stored = this.store.get(keys[0]);
      if (!keys[0].includes(":probe:")) {
        if (!stored) return 0;
        const health = JSON.parse(stored) as { credentialId?: unknown };
        if (health.credentialId !== args[0]) return 0;
      } else if (stored !== args[0]) {
        return 0;
      }
      this.store.delete(keys[0]);
      return 1;
    }
    const raw = this.store.get(keys[0]);
    let currentRevision = 0;
    if (raw) {
      try {
        const value = JSON.parse(raw) as { revision?: unknown };
        if (!Number.isSafeInteger(value.revision)) return [-1, -1];
        currentRevision = Number(value.revision);
      } catch {
        return [-1, -1];
      }
    }
    const expectedRevision = Number(args[0]);
    if (currentRevision !== expectedRevision) return [0, currentRevision];
    this.store.set(keys[0], args[1]);
    return [1, Number(args[2])];
  }
}

describe("provider credential vault", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

  it("encrypts keys at rest and never exposes plaintext in snapshots", async () => {
    const apiKey = "sk-test-super-secret-key-value-NEVERLEAK";
    const snapshot = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey,
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );

    const stored = redis.store.get(PROVIDER_CREDENTIALS_KEY);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain(apiKey);
    expect(JSON.stringify(snapshot)).not.toContain(apiKey);
    expect(JSON.stringify(snapshot)).not.toContain(apiKey.slice(-6));
    expect(snapshot.revision).toBe(1);
    expect(snapshot.slots[0]).toMatchObject({
      slot: 1,
      isConfigured: true,
      provider: "openai",
      enabled: true,
    });
    expect(snapshot.slots[0].credentialId).toMatch(/^[a-f0-9]{32}$/u);
    expect(snapshot.slots[0]).not.toHaveProperty("fingerprint");
    expect(snapshot.slots[0]).not.toHaveProperty("hint");
    expect(snapshot.slots.map(({ baseUrl, model }) => ({ baseUrl, model })))
      .toEqual([
        { baseUrl: "https://api.minimaxi.com/v1", model: "MiniMax-M3" },
        {
          baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
          model: "doubao-seed-evolving",
        },
        { baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      ]);
  });

  it("binds endpoint configuration into GCM AAD", async () => {
    await upsertProviderCredential(
      {
        provider: "openai",
        slot: 2,
        apiKey: "sk-test-endpoint-aad-key-123456",
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        model: "doubao-seed-evolving",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const raw = JSON.parse(redis.store.get(PROVIDER_CREDENTIALS_KEY)!) as {
      credentials: Array<{
        endpointConfig: { baseUrl: string; model: string | null };
      }>;
    };
    raw.credentials[0].endpointConfig.baseUrl = "https://api.deepseek.com";
    raw.credentials[0].endpointConfig.model = "deepseek-v4-flash";
    redis.store.set(PROVIDER_CREDENTIALS_KEY, JSON.stringify(raw));

    await expect(getProviderCredentialsSnapshot({ redis, env: ENV }))
      .rejects.toBeInstanceOf(ProviderCredentialsIntegrityError);
  });

  it("rotates identity and clears health/probe when endpoint or model changes", async () => {
    const created = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-test-config-identity-key-123456",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const oldId = created.slots[0].credentialId!;
    await recordProviderCredentialFailure(
      "openai",
      1,
      oldId,
      "network",
      1_000,
      { redis, env: ENV, now: NOW },
    );
    await acquireProviderCredentialProbe("openai", 1, oldId, 15, {
      redis,
      env: ENV,
    });

    const endpointChanged = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        expectedRevision: created.revision,
      },
      { redis, env: ENV, now: NOW },
    );
    const nextId = endpointChanged.slots[0].credentialId!;
    expect(nextId).not.toBe(oldId);
    expect(endpointChanged.slots[0]).toMatchObject({
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      health: { status: "unknown" },
    });
    expect([...redis.store.keys()].some((key) => key.includes(oldId))).toBe(false);

    const toggled = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        enabled: false,
        expectedRevision: endpointChanged.revision,
      },
      { redis, env: ENV, now: NOW },
    );
    expect(toggled.slots[0].credentialId).toBe(nextId);
  });

  it("rejects arbitrary public endpoints unless the exact base URL is deployed", async () => {
    await expect(
      upsertProviderCredential(
        {
          provider: "openai",
          slot: 1,
          apiKey: "sk-test-disallowed-endpoint-key-123456",
          baseUrl: "https://evil.example/v1",
          expectedRevision: 0,
        },
        { redis, env: ENV, now: NOW },
      ),
    ).rejects.toBeInstanceOf(ProviderCredentialValidationError);

    await expect(
      upsertProviderCredential(
        {
          provider: "openai",
          slot: 1,
          apiKey: "sk-test-disallowed-extension-key-123456",
          baseUrl: "https://gateway.example/v1/",
          expectedRevision: 0,
        },
        {
          redis,
          env: {
            ...ENV,
            LAUNCHLENS_PROVIDER_BASE_URL_ALLOWLIST:
              "https://gateway.example/v1",
          },
          now: NOW,
        },
      ),
    ).rejects.toBeInstanceOf(ProviderCredentialValidationError);
  });

  it("requires an explicit route binding before a legacy key can run or be tested", async () => {
    const apiKey = "sk-test-legacy-envelope-key-123456";
    const legacy = legacyDocument(apiKey, 2);
    redis.store.set(PROVIDER_CREDENTIALS_KEY, JSON.stringify(legacy));

    const snapshot = await getProviderCredentialsSnapshot({ redis, env: ENV });
    expect(snapshot.slots[1]).toMatchObject({
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      model: "doubao-seed-evolving",
      isRouteBound: false,
    });
    await expect(resolveProviderCredentials("openai", { redis, env: ENV }))
      .resolves.toEqual([]);
    await expect(resolveProviderCredentialForTest(
      {
        provider: "openai",
        slot: 2,
        credentialId: legacy.credentials[0].credentialId,
        expectedRevision: 1,
      },
      { redis, env: ENV },
    )).rejects.toBeInstanceOf(ProviderCredentialNotFoundError);

    const migrated = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 2,
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        model: "doubao-seed-evolving",
        expectedRevision: 1,
      },
      { redis, env: ENV, now: NOW },
    );
    expect(migrated.slots[1]).toMatchObject({ isRouteBound: true });
    expect(migrated.slots[1].credentialId)
      .not.toBe(legacy.credentials[0].credentialId);
    const resolved = await resolveProviderCredentialForTest(
      {
        provider: "openai",
        slot: 2,
        credentialId: migrated.slots[1].credentialId!,
        expectedRevision: migrated.revision,
      },
      { redis, env: ENV },
    );
    expect(resolved).toMatchObject({ apiKey, model: "doubao-seed-evolving" });
  });

  it("resolves enabled keys in strict 1 -> 2 -> 3 order", async () => {
    const keys = [
      "sk-order-key-three-123456",
      "sk-order-key-one-12345678",
      "sk-order-key-two-12345678",
    ];
    let revision = 0;
    for (const [slot, apiKey] of [
      [3, keys[0]],
      [1, keys[1]],
      [2, keys[2]],
    ] as const) {
      const snapshot = await upsertProviderCredential(
        {
          provider: "openai",
          slot,
          apiKey,
          expectedRevision: revision,
        },
        { redis, env: ENV, now: NOW },
      );
      revision = snapshot.revision;
    }

    const resolved = await resolveProviderCredentials("openai", {
      redis,
      env: ENV,
    });
    expect(resolved.map(({ slot }) => slot)).toEqual([1, 2, 3]);
    expect(resolved.map(({ apiKey }) => apiKey)).toEqual([
      keys[1],
      keys[2],
      keys[0],
    ]);
  });

  it("supports only three global slots and rejects mixed providers", async () => {
    let revision = 0;
    for (const slot of [1, 2, 3] as const) {
      const snapshot = await upsertProviderCredential(
        {
          provider: "openai",
          slot,
          apiKey: `sk-test-slot-${slot}-credential-123456`,
          expectedRevision: revision,
        },
        { redis, env: ENV, now: NOW },
      );
      revision = snapshot.revision;
    }
    await expect(
      upsertProviderCredential(
        {
          provider: "anthropic",
          slot: 2,
          apiKey: "sk-ant-replacement-credential-123456",
          expectedRevision: revision,
        },
        { redis, env: ENV, now: NOW },
      ),
    ).rejects.toBeInstanceOf(ProviderCredentialValidationError);
    const replaced = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 2,
        apiKey: "sk-openai-replacement-credential-123456",
        expectedRevision: revision,
      },
      { redis, env: ENV, now: NOW },
    );
    expect(replaced.slots.filter((slot) => slot.isConfigured)).toHaveLength(3);
    expect(replaced.slots[1].provider).toBe("openai");

    await expect(
      upsertProviderCredential(
        {
          provider: "openai",
          slot: 4,
          apiKey: "sk-test-invalid-slot-123456",
          expectedRevision: replaced.revision,
        } as never,
        { redis, env: ENV },
      ),
    ).rejects.toBeInstanceOf(ProviderCredentialValidationError);
  });

  it("fails closed when a GCM authentication tag is tampered", async () => {
    await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-test-tamper-target-123456",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const raw = JSON.parse(redis.store.get(PROVIDER_CREDENTIALS_KEY)!) as {
      credentials: Array<{ encrypted: { authTag: string } }>;
    };
    raw.credentials[0].encrypted.authTag = "AAAAAAAAAAAAAAAAAAAAAA";
    redis.store.set(PROVIDER_CREDENTIALS_KEY, JSON.stringify(raw));

    await expect(
      getProviderCredentialsSnapshot({ redis, env: ENV }),
    ).rejects.toBeInstanceOf(ProviderCredentialsIntegrityError);
    await expect(
      resolveProviderCredentials("openai", { redis, env: ENV }),
    ).rejects.toBeInstanceOf(ProviderCredentialsIntegrityError);
  });

  it("also authenticates mutable metadata through GCM AAD", async () => {
    await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-test-metadata-target-123456",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const raw = JSON.parse(redis.store.get(PROVIDER_CREDENTIALS_KEY)!) as {
      credentials: Array<{ enabled: boolean }>;
    };
    raw.credentials[0].enabled = false;
    redis.store.set(PROVIDER_CREDENTIALS_KEY, JSON.stringify(raw));

    await expect(
      getProviderCredentialsSnapshot({ redis, env: ENV }),
    ).rejects.toBeInstanceOf(ProviderCredentialsIntegrityError);
  });

  it("fails closed without Redis or a sufficiently strong master secret", async () => {
    await expect(
      getProviderCredentialsSnapshot({ redis: null, env: ENV }),
    ).rejects.toBeInstanceOf(ProviderCredentialsUnavailableError);
    await expect(
      getProviderCredentialsSnapshot({ redis, env: {} }),
    ).rejects.toBeInstanceOf(ProviderCredentialsUnavailableError);
    await expect(
      getProviderCredentialsSnapshot({
        redis,
        env: { LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET: "too-short" },
      }),
    ).rejects.toBeInstanceOf(ProviderCredentialsUnavailableError);
  });

  it("rejects stale revisions without overwriting the current document", async () => {
    const first = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-test-first-revision-123456",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const before = redis.store.get(PROVIDER_CREDENTIALS_KEY);

    await expect(
      upsertProviderCredential(
        {
          provider: "openai",
          slot: 2,
          apiKey: "sk-test-stale-revision-123456",
          expectedRevision: 0,
        },
        { redis, env: ENV, now: NOW },
      ),
    ).rejects.toMatchObject({
      currentRevision: first.revision,
    });
    expect(redis.store.get(PROVIDER_CREDENTIALS_KEY)).toBe(before);
  });

  it("can disable, update health, and delete without exposing the key", async () => {
    const apiKey = "sk-ant-health-delete-key-123456";
    const created = await upsertProviderCredential(
      {
        provider: "anthropic",
        slot: 1,
        apiKey,
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const [resolvedCredential] = await resolveProviderCredentials(
      "anthropic",
      { redis, env: ENV },
    );
    await recordProviderCredentialFailure(
      "anthropic",
      1,
      resolvedCredential.credentialId,
      "rate_limit",
      60_000,
      { redis, env: ENV, now: NOW },
    );
    let snapshot = await getProviderCredentialsSnapshot({ redis, env: ENV });
    expect(snapshot.slots[0].health).toMatchObject({
      status: "cooldown",
      consecutiveFailures: 1,
      lastFailureReason: "rate_limit",
    });
    await recordProviderCredentialFailure(
      "anthropic",
      1,
      resolvedCredential.credentialId,
      "rate_limit",
      60_000,
      { redis, env: ENV, now: NOW },
    );
    snapshot = await getProviderCredentialsSnapshot({ redis, env: ENV });
    expect(snapshot.slots[0].health.consecutiveFailures).toBe(2);
    expect(
      [...redis.expirations.entries()].some(
        ([key, ttl]) => key.endsWith(":health:1") && ttl === 2_592_000,
      ),
    ).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(apiKey);

    await recordProviderCredentialSuccess(
      "anthropic",
      1,
      resolvedCredential.credentialId,
      { redis, env: ENV, now: NOW },
    );
    const disabled = await upsertProviderCredential(
      {
        provider: "anthropic",
        slot: 1,
        enabled: false,
        expectedRevision: created.revision,
      },
      { redis, env: ENV, now: NOW },
    );
    expect(await resolveProviderCredentials("anthropic", { redis, env: ENV }))
      .toEqual([]);

    snapshot = await deleteProviderCredential(
      {
        provider: "anthropic",
        slot: 1,
        expectedRevision: disabled.revision,
      },
      { redis, env: ENV },
    );
    expect(snapshot.slots[0].isConfigured).toBe(false);
  });

  it("rejects stale health writes after a same-slot key replacement", async () => {
    const first = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-first-aba-credential-123456",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const [oldCredential] = await resolveProviderCredentials("openai", {
      redis,
      env: ENV,
    });
    const replaced = await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-second-aba-credential-123456",
        expectedRevision: first.revision,
      },
      { redis, env: ENV, now: NOW },
    );
    expect(replaced.slots[0].credentialId).not.toBe(oldCredential.credentialId);

    await expect(
      recordProviderCredentialFailure(
        "openai",
        1,
        oldCredential.credentialId,
        "auth",
        60_000,
        { redis, env: ENV, now: NOW },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_CREDENTIAL_NOT_FOUND" });
    const snapshot = await getProviderCredentialsSnapshot({ redis, env: ENV });
    expect(snapshot.slots[0].health.status).toBe("unknown");
  });

  it("provides a credential-bound single-flight half-open probe lease", async () => {
    await upsertProviderCredential(
      {
        provider: "openai",
        slot: 1,
        apiKey: "sk-half-open-probe-credential-123456",
        expectedRevision: 0,
      },
      { redis, env: ENV, now: NOW },
    );
    const [credential] = await resolveProviderCredentials("openai", {
      redis,
      env: ENV,
    });
    const lease = await acquireProviderCredentialProbe(
      "openai",
      1,
      credential.credentialId,
      15,
      { redis, env: ENV },
    );
    expect(lease).not.toBeNull();
    expect(
      await acquireProviderCredentialProbe(
        "openai",
        1,
        credential.credentialId,
        15,
        { redis, env: ENV },
      ),
    ).toBeNull();
    expect(await releaseProviderCredentialProbe(lease!, { redis, env: ENV }))
      .toBe(true);
    expect(
      await acquireProviderCredentialProbe(
        "openai",
        1,
        credential.credentialId,
        15,
        { redis, env: ENV },
      ),
    ).not.toBeNull();
  });

  it("requires a canonical Base64-encoded 32-byte KEK", async () => {
    for (const secret of [
      "test-only-master-key-with-more-than-thirty-two-characters",
      Buffer.alloc(31, 1).toString("base64"),
      Buffer.alloc(33, 1).toString("base64"),
      Buffer.alloc(32, 1).toString("base64url"),
    ]) {
      await expect(
        getProviderCredentialsSnapshot({
          redis,
          env: { LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET: secret },
        }),
      ).rejects.toBeInstanceOf(ProviderCredentialsUnavailableError);
    }
  });
});

function legacyDocument(apiKey: string, slot: 1 | 2 | 3) {
  const key = Buffer.from(ENV.LAUNCHLENS_PROVIDER_KEY_ENCRYPTION_SECRET, "base64");
  const credentialId = "b".repeat(32);
  const fingerprint = createHmac("sha256", key)
    .update("launchlens-provider-key-fingerprint\0", "utf8")
    .update(apiKey, "utf8")
    .digest("hex")
    .slice(0, 20);
  const createdAt = "2026-07-14T08:00:00.000Z";
  const updatedAt = createdAt;
  const aad = [
    "launchlens-provider-credential",
    1,
    credentialId,
    "openai",
    slot,
    "1",
    fingerprint,
    createdAt,
    updatedAt,
  ].join(":");
  const iv = Buffer.alloc(12, 3);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  return {
    version: 1,
    revision: 1,
    credentials: [{
      credentialId,
      provider: "openai",
      slot,
      enabled: true,
      fingerprint,
      createdAt,
      updatedAt,
      encrypted: {
        algorithm: "aes-256-gcm",
        iv: iv.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        authTag: cipher.getAuthTag().toString("base64url"),
      },
    }],
  };
}
