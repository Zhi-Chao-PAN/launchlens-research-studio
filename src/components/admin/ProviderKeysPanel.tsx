"use client";

import { useState, type FormEvent } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/toast/ToastContext";
import {
  AdminApiError,
  getProviderCredentials,
  isUnauthorized,
  removeProviderCredential,
  saveProviderCredential,
  type ProviderCredentialSlot,
  type ProviderName,
  type ProviderSlot,
} from "./admin-client";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import {
  AdminIcon,
  EmptyState,
  RefreshButton,
  ResourceState,
  SectionIntro,
  StatusBadge,
  formatAdminTime,
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

export function ProviderKeysPanel({
  locale,
  t,
  onUnauthorized,
  onUpdated,
}: {
  locale: AdminLocale;
  t: AdminTranslator;
  onUnauthorized: () => void;
  onUpdated: (timestamp: number) => void;
}) {
  const { showToast } = useToast();
  const { askConfirm, dialog } = useConfirm();
  const [pendingSlot, setPendingSlot] = useState<ProviderSlot | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const resource = useAdminResource(getProviderCredentials, {
    onUnauthorized,
    onUpdated,
    resourceKey: "provider-credentials",
  });
  const snapshot = resource.data;
  const provider = snapshot?.runtimeProvider ?? null;
  const providerMismatch = Boolean(
    snapshot?.slots.some(
      (slot) =>
        slot.isConfigured &&
        (!provider || slot.provider !== provider),
    ),
  );

  async function handleSave(input: {
    slot: ProviderSlot;
    apiKey: string;
    enabled: boolean;
  }): Promise<boolean> {
    if (!snapshot || !provider || providerMismatch) return false;
    setPendingSlot(input.slot);
    setActionError(null);
    try {
      const next = await saveProviderCredential({
        provider,
        slot: input.slot,
        expectedRevision: snapshot.revision,
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        enabled: input.enabled,
      });
      resource.replace(next);
      onUpdated(Date.now());
      showToast(t("providers.saved", { slot: input.slot }), "success");
      return true;
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return false;
      }
      if (
        error instanceof AdminApiError &&
        error.code === "PROVIDER_CREDENTIALS_REVISION_CONFLICT"
      ) {
        setActionError(t("providers.conflict"));
        await resource.refresh();
      } else if (
        error instanceof AdminApiError &&
        error.code === "PROVIDER_KEYRING_PROVIDER_MISMATCH"
      ) {
        setActionError(t("providers.providerMismatch"));
        await resource.refresh();
      } else if (
        error instanceof AdminApiError &&
        error.code === "PROVIDER_KEYRING_RUNTIME_PROVIDER_UNAVAILABLE"
      ) {
        setActionError(t("providers.runtimeProviderUnavailable"));
        await resource.refresh();
      } else if (error instanceof AdminApiError && error.status === 503) {
        setActionError(t("providers.unavailable"));
      } else {
        setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
      }
      return false;
    } finally {
      setPendingSlot(null);
    }
  }

  function confirmRemove(slot: ProviderCredentialSlot) {
    if (!snapshot || !slot.provider) return;
    askConfirm(
      t("providers.removeTitle"),
      t("providers.removeBody"),
      async () => {
        setPendingSlot(slot.slot);
        setActionError(null);
        try {
          const next = await removeProviderCredential({
            provider: slot.provider as ProviderName,
            slot: slot.slot,
            expectedRevision: snapshot.revision,
          });
          resource.replace(next);
          onUpdated(Date.now());
          showToast(t("providers.removed", { slot: slot.slot }), "success");
        } catch (error) {
          if (isUnauthorized(error)) {
            onUnauthorized();
            return;
          }
          if (
            error instanceof AdminApiError &&
            error.code === "PROVIDER_CREDENTIALS_REVISION_CONFLICT"
          ) {
            setActionError(t("providers.conflict"));
            await resource.refresh();
          } else {
            setActionError(error instanceof Error ? error.message : t("common.operationFailed"));
          }
        } finally {
          setPendingSlot(null);
        }
      },
      {
        confirmLabel: t("providers.remove"),
        cancelLabel: t("common.cancel"),
        tone: "danger",
      },
    );
  }

  return (
    <section className="ops-view" aria-labelledby="providers-title">
      <SectionIntro
        eyebrow={t("providers.eyebrow")}
        titleId="providers-title"
        title={t("providers.title")}
        description={t("providers.description")}
        actions={
          <RefreshButton
            t={t}
            pending={resource.isRefreshing}
            disabled={resource.isRateLimited}
            onClick={() => void resource.refresh()}
          />
        }
      />
      <ResourceState
        error={resource.error}
        loading={resource.isLoading}
        retryAfterUntil={resource.retryAfterUntil}
        onRetry={() => void resource.refresh()}
        t={t}
      />
      {actionError ? (
        <div className="ops-inline-state ops-inline-state-error" role="alert">
          <AdminIcon name="warning" />
          <span>{actionError}</span>
        </div>
      ) : null}

      {!resource.isLoading && snapshot && providerMismatch ? (
        <div className="ops-inline-state ops-inline-state-error" role="alert">
          <AdminIcon name="warning" />
          <span>{t("providers.providerMismatch")}</span>
        </div>
      ) : null}

      {!resource.isLoading && snapshot && !provider && !providerMismatch ? (
        <div className="ops-inline-state ops-inline-state-error" role="alert">
          <AdminIcon name="warning" />
          <span>{t("providers.runtimeProviderUnavailable")}</span>
        </div>
      ) : null}

      {!resource.isLoading && snapshot ? (
        <>
          <section className="ops-provider-control" aria-labelledby="provider-control-title">
            <div>
              <p className="ops-panel-index">01</p>
              <h2 id="provider-control-title">{t("providers.flow")}</h2>
              <span>{t("providers.revision", { revision: snapshot.revision })}</span>
            </div>
            <label className="ops-field" htmlFor="provider-name">
              <span>{t("providers.activeProvider")}</span>
              <output id="provider-name" className="ops-readonly-value">
                {provider ? formatProviderName(provider) : t("providers.notConfigured")}
              </output>
            </label>
          </section>

          <ol className="ops-key-sequence" aria-label={t("providers.flow")}>
            {snapshot.slots.map((slot, index) => (
              <li key={`${snapshot.revision}-${slot.slot}`}>
                <SlotEditor
                  slot={slot}
                  locale={locale}
                  t={t}
                  pending={pendingSlot === slot.slot}
                  writeDisabled={
                    !provider ||
                    providerMismatch ||
                    (pendingSlot !== null && pendingSlot !== slot.slot)
                  }
                  removeDisabled={pendingSlot !== null && pendingSlot !== slot.slot}
                  onSave={handleSave}
                  onRemove={() => confirmRemove(slot)}
                />
                {index < snapshot.slots.length - 1 ? (
                  <div className="ops-key-connector" aria-hidden="true">
                    <span />
                    <AdminIcon name="arrow" />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {!resource.isLoading && !snapshot && !resource.error ? (
        <EmptyState title={t("providers.unavailable")} />
      ) : null}
      {dialog}
    </section>
  );
}

function SlotEditor({
  slot,
  locale,
  t,
  pending,
  writeDisabled,
  removeDisabled,
  onSave,
  onRemove,
}: {
  slot: ProviderCredentialSlot;
  locale: AdminLocale;
  t: AdminTranslator;
  pending: boolean;
  writeDisabled: boolean;
  removeDisabled: boolean;
  onSave: (input: { slot: ProviderSlot; apiKey: string; enabled: boolean }) => Promise<boolean>;
  onRemove: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(slot.isConfigured ? slot.enabled : true);
  const enabledChanged = slot.isConfigured && enabled !== slot.enabled;
  const validNewKey = apiKey.length >= 16;
  const canSave = slot.isConfigured ? validNewKey || (apiKey.length === 0 && enabledChanged) : validNewKey;
  const healthTone =
    slot.health.status === "healthy"
      ? "positive"
      : slot.health.status === "degraded"
        ? "warning"
        : slot.health.status === "cooldown"
          ? "danger"
          : "neutral";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    const saved = await onSave({ slot: slot.slot, apiKey, enabled });
    if (saved) setApiKey("");
  }

  return (
    <article className={slot.isConfigured ? "ops-key-card is-configured" : "ops-key-card"}>
      <header className="ops-key-card-header">
        <div className="ops-key-priority">
          <span>{String(slot.slot).padStart(2, "0")}</span>
          <div>
            <p>{t("providers.slot", { slot: slot.slot })}</p>
            <strong>
              {slot.slot === 1
                ? t("providers.primary")
                : t("providers.fallback", { slot: slot.slot - 1 })}
            </strong>
          </div>
        </div>
        <StatusBadge tone={slot.isConfigured ? "info" : "neutral"}>
          {slot.isConfigured ? t("providers.configured") : t("providers.notConfigured")}
        </StatusBadge>
      </header>

      <div className="ops-key-health">
        <div>
          <span>{t("providers.health")}</span>
          <StatusBadge tone={healthTone}>{t(`providers.status.${slot.health.status}`)}</StatusBadge>
        </div>
        <dl>
          <div>
            <dt>{t("providers.lastSuccess")}</dt>
            <dd>{formatAdminTime(slot.health.lastSuccessAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("providers.lastFailure")}</dt>
            <dd>{formatAdminTime(slot.health.lastFailureAt, locale)}</dd>
          </div>
          <div>
            <dt>{t("providers.failures")}</dt>
            <dd>{slot.health.consecutiveFailures}</dd>
          </div>
        </dl>
        {slot.health.cooldownUntil ? (
          <p className="ops-key-cooldown">
            {t("providers.cooldown", { time: formatAdminTime(slot.health.cooldownUntil, locale) })}
          </p>
        ) : null}
      </div>

      {slot.credentialId ? (
        <p className="ops-credential-id">
          <span>{t("providers.credentialId")}</span>
          <code>{slot.credentialId.slice(0, 12)}</code>
        </p>
      ) : null}

      <form className="ops-key-form" onSubmit={submit}>
        <label htmlFor={`provider-key-${slot.slot}`}>{t("providers.key")}</label>
        <input
          id={`provider-key-${slot.slot}`}
          name={`provider-key-${slot.slot}`}
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={t("providers.keyPlaceholder")}
          autoComplete="new-password"
          spellCheck={false}
          minLength={16}
          maxLength={512}
          disabled={pending || writeDisabled}
          aria-describedby={`provider-key-help-${slot.slot}`}
        />
        <p id={`provider-key-help-${slot.slot}`}>{t("providers.keyHelp")}</p>
        <label className="ops-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            disabled={pending || writeDisabled}
          />
          <span aria-hidden="true" />
          {t("providers.toggle")}
        </label>
        <div className="ops-key-actions">
          <button
            className="ops-button ops-button-primary"
            type="submit"
            disabled={!canSave || pending || writeDisabled}
          >
            <AdminIcon name="key" />
            {pending
              ? t("common.saving")
              : slot.isConfigured && apiKey
                ? t("providers.replace")
                : slot.isConfigured
                  ? t("common.save")
                  : t("providers.add")}
          </button>
          {slot.isConfigured ? (
            <button
              className="ops-text-button ops-text-danger"
              type="button"
              onClick={onRemove}
              disabled={pending || removeDisabled}
            >
              {t("providers.remove")}
            </button>
          ) : null}
        </div>
      </form>
    </article>
  );
}

function formatProviderName(provider: ProviderName): string {
  return provider === "openai" ? "OpenAI compatible" : "Anthropic";
}
