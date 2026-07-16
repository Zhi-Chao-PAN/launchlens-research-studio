"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/toast/ToastContext";
import {
  AdminApiError,
  getProviderCredentials,
  isUnauthorized,
  removeProviderCredential,
  saveProviderCredential,
  testProviderCredential,
  type ProviderCredentialTestResult,
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
} from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";
import {
  ProviderCredentialCard,
  type ProviderCredentialDraft,
} from "./ProviderCredentialCard";
import {
  classifyProviderAdminError,
  type ProviderAdminErrorKey,
} from "./provider-admin-error";

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
  const [actionError, setActionError] = useState<ProviderAdminErrorKey | null>(null);
  const resource = useAdminResource(getProviderCredentials, {
    onUnauthorized,
    onUpdated,
    resourceKey: "provider-credentials",
  });
  const snapshot = resource.data;
  const targetProvider = snapshot?.targetProvider ?? null;
  const providerMismatch = Boolean(
    snapshot?.slots.some(
      (slot) =>
        slot.isConfigured &&
        (!targetProvider || slot.provider !== targetProvider),
    ),
  );

  async function handleSave(input: ProviderCredentialDraft): Promise<boolean> {
    if (!snapshot || !targetProvider || providerMismatch) return false;
    setPendingSlot(input.slot);
    setActionError(null);
    try {
      const next = await saveProviderCredential({
        provider: targetProvider,
        slot: input.slot,
        expectedRevision: snapshot.revision,
        ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        baseUrl: input.baseUrl,
        model: input.model,
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
      setActionError(classifyProviderAdminError(error));
      if (
        error instanceof AdminApiError &&
        [
          "PROVIDER_CREDENTIALS_REVISION_CONFLICT",
          "PROVIDER_KEYRING_PROVIDER_MISMATCH",
          "PROVIDER_KEYRING_RUNTIME_PROVIDER_UNAVAILABLE",
        ].includes(error.code ?? "")
      ) {
        await resource.refresh();
      }
      return false;
    } finally {
      setPendingSlot(null);
    }
  }

  async function handleTest(slot: ProviderSlot): Promise<ProviderCredentialTestResult> {
    const credential = snapshot?.slots.find((candidate) => candidate.slot === slot);
    if (!targetProvider || providerMismatch || !snapshot || !credential?.credentialId) {
      throw new AdminApiError(t("providers.unavailable"), { status: 503 });
    }
    try {
      return await testProviderCredential({
        provider: targetProvider,
        slot,
        credentialId: credential.credentialId,
        expectedRevision: snapshot.revision,
      });
    } catch (error) {
      if (isUnauthorized(error)) onUnauthorized();
      throw error;
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
          setActionError(classifyProviderAdminError(error));
          if (
            error instanceof AdminApiError &&
            error.code === "PROVIDER_CREDENTIALS_REVISION_CONFLICT"
          ) {
            await resource.refresh();
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
          <span>{t(actionError)}</span>
        </div>
      ) : null}

      {!resource.isLoading && snapshot && providerMismatch ? (
        <div className="ops-inline-state ops-inline-state-error" role="alert">
          <AdminIcon name="warning" />
          <span>{t("providers.providerMismatch")}</span>
        </div>
      ) : null}

      {!resource.isLoading && snapshot && !targetProvider && !providerMismatch ? (
        <div className="ops-inline-state ops-inline-state-error" role="alert">
          <AdminIcon name="warning" />
          <span>{t("providers.targetProviderUnavailable")}</span>
        </div>
      ) : null}

      {!resource.isLoading &&
      snapshot &&
      targetProvider &&
      !snapshot.keyringEnabled ? (
        <div className="ops-inline-state" role="status">
          <AdminIcon name="warning" />
          <div>
            <strong>{t("providers.stagedTitle")}</strong>
            <p>{t("providers.stagedBody")}</p>
          </div>
        </div>
      ) : null}

      {!resource.isLoading && snapshot ? (
        <>
          <section className="ops-provider-control" aria-labelledby="provider-control-title">
            <div>
              <p className="ops-panel-index">01</p>
              <h2 id="provider-control-title">{t("providers.flow")}</h2>
              <span>
                {t("providers.revision", { revision: snapshot.revision })}
                {" · "}
                {t(
                  snapshot.keyringEnabled
                    ? "providers.activationActive"
                    : "providers.activationStaged",
                )}
              </span>
              <p className="ops-provider-flow-help">{t("providers.flowHelp")}</p>
            </div>
            <label className="ops-field" htmlFor="provider-name">
              <span>{t("providers.targetProvider")}</span>
              <output id="provider-name" className="ops-readonly-value">
                {targetProvider
                  ? formatProviderName(targetProvider)
                  : t("providers.notConfigured")}
              </output>
            </label>
          </section>

          <ol className="ops-key-sequence" aria-label={t("providers.flow")}>
            {snapshot.slots.map((slot, index) => (
              <li key={`${snapshot.revision}-${slot.slot}`}>
                <ProviderCredentialCard
                  slot={slot}
                  locale={locale}
                  t={t}
                  pending={pendingSlot === slot.slot}
                  writeDisabled={
                    !targetProvider ||
                    providerMismatch ||
                    (pendingSlot !== null && pendingSlot !== slot.slot)
                  }
                  removeDisabled={pendingSlot !== null && pendingSlot !== slot.slot}
                  onSave={handleSave}
                  onTest={handleTest}
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

function formatProviderName(provider: ProviderName): string {
  return provider === "openai" ? "OpenAI compatible" : "Anthropic";
}
