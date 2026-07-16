"use client";

import { useState, type FormEvent } from "react";
import {
  type ProviderCredentialSlot,
  type ProviderCredentialTestResult,
  type ProviderSlot,
} from "./admin-client";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import {
  classifyProviderAdminError,
  type ProviderAdminErrorKey,
} from "./provider-admin-error";
import {
  AdminIcon,
  StatusBadge,
  formatAdminTime,
} from "./AdminPrimitives";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; result: ProviderCredentialTestResult }
  | {
      status: "error";
      result?: ProviderCredentialTestResult;
      errorKey?: ProviderAdminErrorKey;
    };

export interface ProviderCredentialDraft {
  slot: ProviderSlot;
  apiKey: string;
  baseUrl: string;
  model: string | null;
  enabled: boolean;
}

export function ProviderCredentialCard({
  slot,
  locale,
  t,
  pending,
  writeDisabled,
  removeDisabled,
  onSave,
  onTest,
  onRemove,
}: {
  slot: ProviderCredentialSlot;
  locale: AdminLocale;
  t: AdminTranslator;
  pending: boolean;
  writeDisabled: boolean;
  removeDisabled: boolean;
  onSave: (input: ProviderCredentialDraft) => Promise<boolean>;
  onTest: (slot: ProviderSlot) => Promise<ProviderCredentialTestResult>;
  onRemove: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(slot.baseUrl);
  const [model, setModel] = useState(slot.model ?? "");
  const [enabled, setEnabled] = useState(slot.isConfigured ? slot.enabled : true);
  const [baseUrlTouched, setBaseUrlTouched] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  const normalizedBaseUrl = baseUrl.trim();
  const normalizedModel = model.trim();
  const validBaseUrl = isValidProviderBaseUrl(normalizedBaseUrl);
  const validNewKey = isValidProviderApiKey(apiKey);
  const hasKeyDraft = apiKey.length > 0;
  const keyDraftInvalid = hasKeyDraft && !validNewKey;
  const routeChanged =
    normalizedBaseUrl !== slot.baseUrl ||
    normalizedModel !== (slot.model ?? "");
  const enabledChanged = slot.isConfigured && enabled !== slot.enabled;
  const routeNeedsBinding = slot.isConfigured && !slot.isRouteBound;
  const hasUnsavedChanges =
    hasKeyDraft || routeChanged || enabledChanged || routeNeedsBinding;
  const keyDraftIsValid = !hasKeyDraft || validNewKey;
  const testing = testState.status === "testing";
  const interactionPending = pending || testing;
  const canSave = slot.isConfigured
    ? validBaseUrl && keyDraftIsValid && (
        validNewKey || routeChanged || enabledChanged || routeNeedsBinding
      )
    : validBaseUrl && validNewKey;
  const canTest =
    slot.isConfigured &&
    !hasUnsavedChanges &&
    !pending &&
    !writeDisabled &&
    !testing;
  const healthTone =
    slot.health.status === "healthy"
      ? "positive"
      : slot.health.status === "degraded"
        ? "warning"
        : slot.health.status === "cooldown"
          ? "danger"
          : "neutral";

  function resetTestState() {
    if (testState.status !== "idle") setTestState({ status: "idle" });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBaseUrlTouched(true);
    setKeyTouched(true);
    if (!canSave) return;
    const saved = await onSave({
      slot: slot.slot,
      apiKey,
      baseUrl: normalizedBaseUrl,
      model: normalizedModel || null,
      enabled,
    });
    if (saved) {
      setApiKey("");
      setKeyTouched(false);
      setTestState({ status: "idle" });
    }
  }

  async function testConnection() {
    if (!canTest) return;
    setTestState({ status: "testing" });
    try {
      const result = await onTest(slot.slot);
      setTestState(
        result.ok
          ? { status: "success", result }
          : { status: "error", result },
      );
    } catch (error) {
      setTestState({
        status: "error",
        errorKey: classifyProviderAdminError(error),
      });
    }
  }

  const testGuidance = !slot.isConfigured || hasUnsavedChanges
    ? t("providers.testSaveFirst")
    : !slot.enabled
      ? t("providers.testDisabledSafe")
      : null;

  return (
    <article
      className={slot.isConfigured ? "ops-key-card is-configured" : "ops-key-card"}
      aria-labelledby={`provider-priority-${slot.slot} provider-route-title-${slot.slot}`}
    >
      <header className="ops-key-card-header">
        <div className="ops-key-priority">
          <span>{String(slot.slot).padStart(2, "0")}</span>
          <div>
            <p id={`provider-priority-${slot.slot}`}>
              {t("providers.slot", { slot: slot.slot })}
            </p>
            <h3 id={`provider-route-title-${slot.slot}`}>
              {slot.slot === 1
                ? t("providers.primary")
                : t("providers.fallback", { slot: slot.slot - 1 })}
            </h3>
          </div>
        </div>
        <StatusBadge tone={slot.isConfigured ? "info" : "neutral"}>
          {slot.isConfigured ? t("providers.configured") : t("providers.notConfigured")}
        </StatusBadge>
      </header>

      <div className="ops-route-summary">
        <div>
          <span>{t("providers.route")}</span>
          <strong>{formatEndpointName(normalizedBaseUrl, slot.slot, t)}</strong>
        </div>
        <code title={normalizedBaseUrl}>{normalizedBaseUrl || t("providers.notConfigured")}</code>
      </div>

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

      <form
        className="ops-key-form"
        onSubmit={submit}
        noValidate
        aria-labelledby={`provider-priority-${slot.slot} provider-route-title-${slot.slot}`}
      >
        <div className="ops-route-fields">
          <label className="ops-field" htmlFor={`provider-base-url-${slot.slot}`}>
            <span>{t("providers.baseUrl")}</span>
            <input
              id={`provider-base-url-${slot.slot}`}
              name={`provider-base-url-${slot.slot}`}
              type="url"
              inputMode="url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                resetTestState();
              }}
              onBlur={() => setBaseUrlTouched(true)}
              placeholder={t("providers.baseUrlPlaceholder")}
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={2048}
              disabled={interactionPending || writeDisabled}
              aria-invalid={baseUrlTouched && !validBaseUrl}
              aria-describedby={`provider-base-url-help-${slot.slot}${baseUrlTouched && !validBaseUrl ? ` provider-base-url-error-${slot.slot}` : ""}`}
            />
          </label>
          <p id={`provider-base-url-help-${slot.slot}`} className="ops-field-help">
            {t("providers.baseUrlHelp")}
          </p>
          {baseUrlTouched && !validBaseUrl ? (
            <p id={`provider-base-url-error-${slot.slot}`} className="ops-field-error" role="alert">
              {t("providers.baseUrlInvalid")}
            </p>
          ) : null}

          <label className="ops-field" htmlFor={`provider-model-${slot.slot}`}>
            <span>{t("providers.model")}</span>
            <input
              id={`provider-model-${slot.slot}`}
              name={`provider-model-${slot.slot}`}
              type="text"
              value={model}
              onChange={(event) => {
                setModel(event.target.value);
                resetTestState();
              }}
              placeholder={t("providers.modelPlaceholder")}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={200}
              disabled={interactionPending || writeDisabled}
              aria-describedby={`provider-model-help-${slot.slot}`}
            />
          </label>
          <p id={`provider-model-help-${slot.slot}`} className="ops-field-help">
            {t("providers.modelHelp")}
          </p>
        </div>

        <label htmlFor={`provider-key-${slot.slot}`}>{t("providers.key")}</label>
        <input
          id={`provider-key-${slot.slot}`}
          name={`provider-key-${slot.slot}`}
          type="password"
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
            resetTestState();
          }}
          onBlur={() => setKeyTouched(true)}
          placeholder={t("providers.keyPlaceholder")}
          autoComplete="new-password"
          spellCheck={false}
          minLength={16}
          maxLength={512}
          disabled={interactionPending || writeDisabled}
          aria-invalid={keyTouched && keyDraftInvalid}
          aria-describedby={`provider-key-help-${slot.slot}${keyTouched && keyDraftInvalid ? ` provider-key-error-${slot.slot}` : ""}`}
        />
        <p id={`provider-key-help-${slot.slot}`}>{t("providers.keyHelp")}</p>
        {keyTouched && keyDraftInvalid ? (
          <p
            id={`provider-key-error-${slot.slot}`}
            className="ops-field-error"
            role="alert"
          >
            {t("providers.keyInvalid")}
          </p>
        ) : null}

        <label className="ops-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              resetTestState();
            }}
            disabled={interactionPending || writeDisabled}
          />
          <span aria-hidden="true" />
          {t("providers.toggle")}
        </label>

        <div className="ops-key-actions">
          <button
            className="ops-button ops-button-primary"
            type="submit"
            disabled={!canSave || interactionPending || writeDisabled}
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
          <button
            className={`ops-button ops-button-secondary ops-test-button${testState.status === "testing" ? " is-testing" : ""}`}
            type="button"
            onClick={() => void testConnection()}
            disabled={!canTest}
            aria-describedby={testGuidance ? `provider-test-guidance-${slot.slot}` : undefined}
          >
            <AdminIcon name={testState.status === "success" ? "check" : "refresh"} />
            {testState.status === "testing" ? t("providers.testing") : t("providers.test")}
          </button>
          {slot.isConfigured ? (
            <button
              className="ops-text-button ops-text-danger"
              type="button"
              onClick={onRemove}
              disabled={interactionPending || removeDisabled}
            >
              {t("providers.remove")}
            </button>
          ) : null}
        </div>

        {testGuidance ? (
          <p id={`provider-test-guidance-${slot.slot}`} className="ops-test-guidance">
            {testGuidance}
          </p>
        ) : null}

        <ConnectionTestState
          state={testState}
          fallbackEndpoint={slot.baseUrl}
          fallbackModel={slot.model}
          t={t}
        />
      </form>
    </article>
  );
}

function ConnectionTestState({
  state,
  fallbackEndpoint,
  fallbackModel,
  t,
}: {
  state: TestState;
  fallbackEndpoint: string;
  fallbackModel: string | null;
  t: AdminTranslator;
}) {
  const isError = state.status === "error";
  const isSuccess = state.status === "success";
  const result = isSuccess || isError ? state.result : undefined;
  const label = state.status === "testing"
    ? t("providers.testing")
    : isSuccess
      ? t("providers.testSuccess")
      : isError
        ? t("providers.testFailure")
        : t("providers.testIdle");
  const tone = isSuccess ? "positive" : isError ? "danger" : "neutral";
  const detail = isError
    ? state.errorKey
      ? t(state.errorKey)
      : formatFailureReason(state.result?.reason, t)
    : null;

  return (
    <section
      className={`ops-connection-test is-${state.status}`}
      aria-live="polite"
      aria-busy={state.status === "testing"}
    >
      <header>
        <span>{t("providers.test")}</span>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </header>
      {state.status !== "idle" ? (
        <dl>
          <div>
            <dt>{t("providers.testEndpoint")}</dt>
            <dd><code>{result?.endpoint ?? fallbackEndpoint}</code></dd>
          </div>
          <div>
            <dt>{t("providers.testModel")}</dt>
            <dd><code>{result?.model ?? fallbackModel ?? t("providers.globalModel")}</code></dd>
          </div>
          {result ? (
            <div>
              <dt>{t("providers.testDuration")}</dt>
              <dd>{t("providers.testDurationValue", { duration: Math.max(0, Math.round(result.durationMs)) })}</dd>
            </div>
          ) : null}
          {result?.httpStatus ? (
            <div>
              <dt>{t("providers.testHttpStatus")}</dt>
              <dd>{result.httpStatus}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {detail ? <p role="alert">{detail}</p> : null}
    </section>
  );
}

function isValidProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function formatEndpointName(
  baseUrl: string,
  slot: ProviderSlot,
  t: AdminTranslator,
): string {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "api.minimaxi.com") return "MiniMax";
    if (host === "ark.cn-beijing.volces.com") return "Volcengine Ark";
    if (host === "api.deepseek.com") return "DeepSeek";
    if (host === "api.anthropic.com") return "Anthropic";
    return host;
  } catch {
    return t("providers.routeFallback", { slot });
  }
}

function isValidProviderApiKey(value: string): boolean {
  return (
    value.length >= 16 &&
    value.length <= 512 &&
    value.trim() === value &&
    !/[\s\u0000-\u001f\u007f]/u.test(value)
  );
}

function formatFailureReason(
  reason: ProviderCredentialTestResult["reason"],
  t: AdminTranslator,
): string {
  switch (reason) {
    case "auth":
      return t("providers.testFailureAuth");
    case "rate_limit":
      return t("providers.testFailureRateLimit");
    case "network":
      return t("providers.testFailureNetwork");
    case "server":
      return t("providers.testFailureServer");
    case "invalid_response":
      return t("providers.testFailureResponse");
    default:
      return t("providers.testFailureUnknown");
  }
}
