export type ManagedKeyringProvider = "openai" | "anthropic";

type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Returns whether the managed keyring is the configured credential authority.
 * Whitespace is ignored so all runtime consumers interpret the flag equally.
 */
export function isManagedKeyringEnabled(env: ProviderEnvironment): boolean {
  return normalize(env.LAUNCHLENS_PROVIDER_KEYRING_ENABLED) === "1";
}

/**
 * Resolves the provider whose credentials may be staged in the managed vault.
 *
 * This is deliberately independent from runtime activation: operators must be
 * able to provision and verify the three slots while legacy environment keys
 * continue serving traffic. An explicit but unsupported dedicated value still
 * fails closed instead of silently falling back to LAUNCHLENS_PROVIDER.
 */
export function resolveManagedKeyringTargetProvider(
  env: ProviderEnvironment,
): ManagedKeyringProvider | null {
  const provider =
    normalize(env.LAUNCHLENS_PROVIDER_KEYRING_PROVIDER) ||
    normalize(env.LAUNCHLENS_PROVIDER);
  return provider === "openai" || provider === "anthropic" ? provider : null;
}

/**
 * Resolves the single provider that the managed keyring may serve at runtime.
 *
 * The dedicated keyring setting wins; LAUNCHLENS_PROVIDER remains a backwards-
 * compatible fallback. Unsupported or missing values fail closed as `null`.
 */
export function resolveManagedKeyringProvider(
  env: ProviderEnvironment,
): ManagedKeyringProvider | null {
  if (!isManagedKeyringEnabled(env)) return null;
  return resolveManagedKeyringTargetProvider(env);
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
