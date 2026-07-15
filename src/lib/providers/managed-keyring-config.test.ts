import { describe, expect, it } from "vitest";
import {
  isManagedKeyringEnabled,
  resolveManagedKeyringProvider,
} from "./managed-keyring-config";

describe("managed keyring runtime configuration", () => {
  it("normalizes the enabled flag and dedicated provider", () => {
    const env = {
      LAUNCHLENS_PROVIDER_KEYRING_ENABLED: " 1 ",
      LAUNCHLENS_PROVIDER_KEYRING_PROVIDER: "  AnThRoPiC  ",
    };

    expect(isManagedKeyringEnabled(env)).toBe(true);
    expect(resolveManagedKeyringProvider(env)).toBe("anthropic");
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
  });
});
