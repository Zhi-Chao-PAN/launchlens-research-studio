import { describe, expect, it } from "vitest";
import {
  isManagedKeyringEnabled,
  resolveManagedKeyringProvider,
  resolveManagedKeyringTargetProvider,
} from "./managed-keyring-config";

describe("managed keyring runtime configuration", () => {
  it("normalizes the enabled flag and dedicated provider", () => {
    const env = {
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: " 1 ",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "  AnThRoPiC  ",
    };

    expect(isManagedKeyringEnabled(env)).toBe(true);
    expect(resolveManagedKeyringTargetProvider(env)).toBe("anthropic");
    expect(resolveManagedKeyringProvider(env)).toBe("anthropic");
  });

  it("allows a target provider to be staged without activating the keyring", () => {
    const env = {
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "0",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: " openai ",
    };

    expect(resolveManagedKeyringTargetProvider(env)).toBe("openai");
    expect(resolveManagedKeyringProvider(env)).toBeNull();
  });

  it("uses the legacy provider setting only as a configured-keyring fallback", () => {
    expect(
      resolveManagedKeyringProvider({
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
        LAUNCHLENS_PROVIDER: " OPENAI ",
      }),
    ).toBe("openai");
  });

  it("returns null while disabled or when the configured provider is unsupported", () => {
    expect(
      resolveManagedKeyringProvider({
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "0",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "openai",
      }),
    ).toBeNull();
    expect(
      resolveManagedKeyringProvider({
        LAUNCHLENS_PROVIDER_KEYRING_ENABLED: "1",
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "gemini",
        LAUNCHLENS_PROVIDER: "openai",
      }),
    ).toBeNull();
    expect(
      resolveManagedKeyringTargetProvider({
        LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "gemini",
        LAUNCHLENS_PROVIDER: "openai",
      }),
    ).toBeNull();
  });
});
