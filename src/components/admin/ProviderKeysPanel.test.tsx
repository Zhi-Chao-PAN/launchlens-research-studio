// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast/ToastContext";
import type { AdminTranslator } from "./admin-i18n";
import type { ProviderCredentialsSnapshot } from "./admin-client";

const { getSnapshotMock, saveCredentialMock, removeCredentialMock, testCredentialMock } = vi.hoisted(() => ({
  getSnapshotMock: vi.fn(),
  saveCredentialMock: vi.fn(),
  removeCredentialMock: vi.fn(),
  testCredentialMock: vi.fn(),
}));

vi.mock("./admin-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./admin-client")>();
  return {
    ...actual,
    getProviderCredentials: getSnapshotMock,
    saveProviderCredential: saveCredentialMock,
    removeProviderCredential: removeCredentialMock,
    testProviderCredential: testCredentialMock,
  };
});

import { ProviderKeysPanel } from "./ProviderKeysPanel";
import { AdminApiError } from "./admin-client";

const t: AdminTranslator = (key, params) => {
  if (key === "providers.slot") return `Priority ${params?.slot}`;
  if (key === "providers.saved") return `Saved ${params?.slot}`;
  if (key === "providers.removed") return `Removed ${params?.slot}`;
  if (key === "providers.revision") return `Revision ${params?.revision}`;
  if (key === "providers.fallback") return `Fallback ${params?.slot}`;
  return key;
};

const prefixedTranslator = (prefix: "en" | "zh"): AdminTranslator =>
  (key, params) => {
    const suffix = params?.slot === undefined ? "" : `:${params.slot}`;
    return `${prefix}:${key}${suffix}`;
  };

const baseHealth = {
  status: "unknown" as const,
  consecutiveFailures: 0,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastFailureReason: null,
  cooldownUntil: null,
};

const snapshot: ProviderCredentialsSnapshot = {
  version: 1,
  revision: 4,
  runtimeProvider: "openai",
  targetProvider: "openai",
  keyringEnabled: true,
  slots: [
    {
      slot: 1,
      isConfigured: true,
      isRouteBound: true,
      provider: "openai",
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
      enabled: true,
      credentialId: "cred_primary_opaque",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      health: baseHealth,
    },
    {
      slot: 2,
      isConfigured: false,
      isRouteBound: false,
      provider: null,
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      model: "doubao-seed-evolving",
      enabled: false,
      credentialId: null,
      createdAt: null,
      updatedAt: null,
      health: baseHealth,
    },
    {
      slot: 3,
      isConfigured: false,
      isRouteBound: false,
      provider: null,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      enabled: false,
      credentialId: null,
      createdAt: null,
      updatedAt: null,
      health: baseHealth,
    },
  ],
};

describe("ProviderKeysPanel", () => {
  beforeEach(() => {
    getSnapshotMock.mockReset().mockResolvedValue(snapshot);
    saveCredentialMock.mockReset().mockResolvedValue({ ...snapshot, revision: 5 });
    removeCredentialMock.mockReset();
    testCredentialMock.mockReset().mockResolvedValue({
      ok: true,
      slot: 1,
      provider: "openai",
      baseUrl: "https://api.minimaxi.com/v1",
      endpoint: "https://api.minimaxi.com/v1/chat/completions",
      model: "MiniMax-M3",
      durationMs: 482,
      testedAt: "2026-07-16T00:00:00.000Z",
    });
  });

  afterEach(cleanup);

  it("renders the target provider as read-only and saves fallback slot 2 with the current CAS revision", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    expect(screen.getByText("Priority 2")).toBeTruthy();
    expect(screen.getByText("Priority 3")).toBeTruthy();
    expect(screen.getByLabelText("providers.targetProvider").textContent).toBe("OpenAI compatible");
    expect(screen.queryByRole("combobox")).toBeNull();

    const keyInputs = screen.getAllByLabelText("providers.key") as HTMLInputElement[];
    fireEvent.change(keyInputs[1], { target: { value: "sk-second-fallback-secret" } });
    const addButtons = screen.getAllByRole("button", { name: /providers.add/ });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(saveCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 2,
        expectedRevision: 4,
        apiKey: "sk-second-fallback-secret",
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        model: "doubao-seed-evolving",
        enabled: true,
      });
    });
  });

  it("uses the target provider for an empty vault", async () => {
    const emptySnapshot: ProviderCredentialsSnapshot = {
      ...snapshot,
      revision: 0,
      runtimeProvider: "anthropic",
      targetProvider: "anthropic",
      slots: snapshot.slots.map((slot) => ({
        ...slot,
        isConfigured: false,
        provider: null,
        baseUrl: "https://api.anthropic.com",
        model: null,
        enabled: false,
        credentialId: null,
      })),
    };
    getSnapshotMock.mockResolvedValue(emptySnapshot);
    saveCredentialMock.mockResolvedValue({ ...emptySnapshot, revision: 1 });

    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    expect(screen.getByLabelText("providers.targetProvider").textContent).toBe("Anthropic");
    const keyInputs = screen.getAllByLabelText("providers.key") as HTMLInputElement[];
    fireEvent.change(keyInputs[0], { target: { value: "sk-ant-primary-runtime-secret" } });
    fireEvent.click(screen.getAllByRole("button", { name: /providers.add/ })[0]);

    await waitFor(() => {
      expect(saveCredentialMock).toHaveBeenCalledWith({
        provider: "anthropic",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-ant-primary-runtime-secret",
        baseUrl: "https://api.anthropic.com",
        model: null,
        enabled: true,
      });
    });
  });

  it("keeps staged credentials writable while clearly marking them as inactive", async () => {
    const stagedSnapshot: ProviderCredentialsSnapshot = {
      ...snapshot,
      runtimeProvider: null,
      targetProvider: "openai",
      keyringEnabled: false,
    };
    getSnapshotMock.mockResolvedValue(stagedSnapshot);
    saveCredentialMock.mockResolvedValue({ ...stagedSnapshot, revision: 5 });

    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("providers.stagedTitle");
    expect(screen.getByText("providers.stagedBody")).toBeTruthy();
    expect(screen.getByLabelText("providers.targetProvider").textContent).toBe(
      "OpenAI compatible",
    );

    const keyInputs = screen.getAllByLabelText("providers.key") as HTMLInputElement[];
    expect(keyInputs[1].disabled).toBe(false);
    fireEvent.change(keyInputs[1], {
      target: { value: "sk-staged-second-fallback-secret" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /providers.add/ })[0]);

    await waitFor(() => {
      expect(saveCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 2,
        expectedRevision: 4,
        apiKey: "sk-staged-second-fallback-secret",
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        model: "doubao-seed-evolving",
        enabled: true,
      });
    });
  });

  it("locks writes for historical provider mismatches but still permits cleanup", async () => {
    const mismatchedSnapshot: ProviderCredentialsSnapshot = {
      ...snapshot,
      runtimeProvider: "anthropic",
      targetProvider: "anthropic",
    };
    getSnapshotMock.mockResolvedValue(mismatchedSnapshot);
    removeCredentialMock.mockResolvedValue({
      ...mismatchedSnapshot,
      revision: 5,
      slots: mismatchedSnapshot.slots.map((slot) =>
        slot.slot === 1
          ? { ...slot, isConfigured: false, provider: null, credentialId: null }
          : slot,
      ),
    });

    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("providers.providerMismatch");
    expect((screen.getAllByLabelText("providers.key")[0] as HTMLInputElement).disabled).toBe(true);
    const removeButton = screen.getByRole("button", { name: "providers.remove" });
    expect((removeButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(removeButton);
    const confirmButtons = screen.getAllByRole("button", { name: "providers.remove" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(removeCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 1,
        expectedRevision: 4,
      });
    });
    expect(saveCredentialMock).not.toHaveBeenCalled();
  });

  it("shows all three provider Base URLs and the confirmed slot-specific model defaults", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const baseUrls = screen.getAllByLabelText("providers.baseUrl") as HTMLInputElement[];
    expect(baseUrls.map((input) => input.value)).toEqual([
      "https://api.minimaxi.com/v1",
      "https://ark.cn-beijing.volces.com/api/plan/v3",
      "https://api.deepseek.com",
    ]);
    const models = screen.getAllByLabelText("providers.model") as HTMLInputElement[];
    expect(models.map((input) => input.value)).toEqual([
      "MiniMax-M3",
      "doubao-seed-evolving",
      "deepseek-v4-flash",
    ]);
  });

  it("saves a Base URL and optional model as part of the same fallback route", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const baseUrls = screen.getAllByLabelText("providers.baseUrl");
    const models = screen.getAllByLabelText("providers.model");
    fireEvent.change(baseUrls[1], {
      target: { value: "https://ark.cn-beijing.volces.com/api/plan/v3" },
    });
    fireEvent.change(models[1], { target: { value: "ep-user-supplied-model-id" } });
    const keys = screen.getAllByLabelText("providers.key");
    fireEvent.change(keys[1], { target: { value: "sk-ark-fallback-secret-value" } });
    fireEvent.click(screen.getAllByRole("button", { name: /providers.add/ })[0]);

    await waitFor(() => {
      expect(saveCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 2,
        expectedRevision: 4,
        apiKey: "sk-ark-fallback-secret-value",
        baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
        model: "ep-user-supplied-model-id",
        enabled: true,
      });
    });
  });

  it("lets an administrator bind a legacy key-only route without re-entering the key", async () => {
    const legacySnapshot: ProviderCredentialsSnapshot = {
      ...snapshot,
      slots: snapshot.slots.map((slot) =>
        slot.slot === 1 ? { ...slot, isRouteBound: false } : slot,
      ),
    };
    getSnapshotMock.mockResolvedValue(legacySnapshot);
    saveCredentialMock.mockResolvedValue({
      ...legacySnapshot,
      revision: 5,
      slots: legacySnapshot.slots.map((slot) =>
        slot.slot === 1 ? { ...slot, isRouteBound: true } : slot,
      ),
    });

    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const testButtons = screen.getAllByRole("button", {
      name: "providers.test",
    }) as HTMLButtonElement[];
    expect(testButtons[0].disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));

    await waitFor(() => {
      expect(saveCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 1,
        expectedRevision: 4,
        baseUrl: "https://api.minimaxi.com/v1",
        model: "MiniMax-M3",
        enabled: true,
      });
    });
  });

  it("tests only a saved unchanged route and reports the exact endpoint, model, and latency", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const testButtons = screen.getAllByRole("button", { name: "providers.test" }) as HTMLButtonElement[];
    expect(testButtons[0].disabled).toBe(false);
    expect(testButtons[1].disabled).toBe(true);
    expect(testButtons[2].disabled).toBe(true);
    fireEvent.click(testButtons[0]);

    await waitFor(() => {
      expect(testCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 1,
        credentialId: "cred_primary_opaque",
        expectedRevision: 4,
      });
    });
    expect(await screen.findByText("providers.testSuccess")).toBeTruthy();
    expect(screen.getByText("https://api.minimaxi.com/v1/chat/completions")).toBeTruthy();
    expect(screen.getByText("MiniMax-M3")).toBeTruthy();
    expect(screen.getByText("providers.testDurationValue")).toBeTruthy();
  });

  it("blocks misleading connection tests while a route has unsaved changes", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    fireEvent.change(screen.getAllByLabelText("providers.model")[0], {
      target: { value: "draft-model" },
    });
    const testButtons = screen.getAllByRole("button", { name: "providers.test" }) as HTMLButtonElement[];
    expect(testButtons[0].disabled).toBe(true);
    expect(screen.getAllByText("providers.testSaveFirst").length).toBeGreaterThan(0);
    expect(testCredentialMock).not.toHaveBeenCalled();
  });

  it("announces connection-test loading and a provider authentication failure", async () => {
    let resolveTest!: (value: unknown) => void;
    testCredentialMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTest = resolve;
      }),
    );
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    fireEvent.click(screen.getAllByRole("button", { name: "providers.test" })[0]);
    expect(screen.getAllByText("providers.testing").length).toBeGreaterThan(0);

    await act(async () => {
      resolveTest({
        ok: false,
        slot: 1,
        provider: "openai",
        baseUrl: "https://api.minimaxi.com/v1",
        endpoint: "https://api.minimaxi.com/v1/chat/completions",
        model: "MiniMax-M3",
        durationMs: 233,
        testedAt: "2026-07-16T00:00:00.000Z",
        httpStatus: 401,
        reason: "auth",
      });
    });

    expect(await screen.findByText("providers.testFailure")).toBeTruthy();
    expect(screen.getByText("providers.testFailureAuth")).toBeTruthy();
    expect(screen.getByText("https://api.minimaxi.com/v1/chat/completions")).toBeTruthy();
    expect(screen.getByText("MiniMax-M3")).toBeTruthy();
    expect(screen.getByText("providers.testHttpStatus")).toBeTruthy();
    expect(screen.getByText("401")).toBeTruthy();
  });

  it.each([
    {
      label: "provider mismatch code",
      error: new AdminApiError("provider must match the managed keyring runtime provider.", {
        status: 409,
        code: "PROVIDER_KEYRING_PROVIDER_MISMATCH",
      }),
      expected: "providers.providerMismatch",
    },
    {
      label: "stale credential code",
      error: new AdminApiError("Provider credential was not found or is disabled.", {
        status: 404,
        code: "PROVIDER_CREDENTIAL_NOT_FOUND",
      }),
      expected: "providers.requestStale",
    },
    {
      label: "rate-limit status",
      error: new AdminApiError("Too many admin requests.", {
        status: 429,
      }),
      expected: "providers.requestRateLimited",
    },
    {
      label: "service error code",
      error: new AdminApiError("Unable to test provider connection.", {
        status: 500,
        code: "INTERNAL_ERROR",
      }),
      expected: "providers.requestServiceError",
    },
  ])("localizes a connection-test $label without exposing its backend message", async ({ error, expected }) => {
    testCredentialMock.mockRejectedValue(error);
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    fireEvent.click(screen.getAllByRole("button", { name: "providers.test" })[0]);

    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(error.message)).toBeNull();
  });

  it("uses a safe localized fallback for an unknown non-API connection-test error", async () => {
    const error = new Error("socket diagnostics must not reach the interface");
    testCredentialMock.mockRejectedValue(error);
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    fireEvent.click(screen.getAllByRole("button", { name: "providers.test" })[0]);

    expect(await screen.findByText("common.operationFailed")).toBeTruthy();
    expect(screen.queryByText(error.message)).toBeNull();
  });

  it("can verify a saved disabled route without enabling it", async () => {
    const disabledFallback: ProviderCredentialsSnapshot = {
      ...snapshot,
      slots: snapshot.slots.map((slot) =>
        slot.slot === 2
          ? {
              ...slot,
              isConfigured: true,
              isRouteBound: true,
              provider: "openai" as const,
              enabled: false,
              credentialId: "cred_disabled_ark",
            }
          : slot,
      ),
    };
    getSnapshotMock.mockResolvedValue(disabledFallback);
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 2");
    const testButtons = screen.getAllByRole("button", { name: "providers.test" }) as HTMLButtonElement[];
    expect(testButtons[1].disabled).toBe(false);
    expect(screen.getByText("providers.testDisabledSafe")).toBeTruthy();
    fireEvent.click(testButtons[1]);

    await waitFor(() => {
      expect(testCredentialMock).toHaveBeenCalledWith({
        provider: "openai",
        slot: 2,
        credentialId: "cred_disabled_ark",
        expectedRevision: 4,
      });
    });
  });

  it("gives every credential card and form a slot-specific accessible name", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(3);
    expect(cards[0].getAttribute("aria-labelledby")).toBe(
      "provider-priority-1 provider-route-title-1",
    );
    const heading = within(cards[0]).getByRole("heading", {
      level: 3,
      name: "providers.primary",
    });
    expect(heading.id).toBe("provider-route-title-1");
    expect(cards[0].querySelector("form")?.getAttribute("aria-labelledby")).toBe(
      "provider-priority-1 provider-route-title-1",
    );
  });

  it("explains an invalid short API key inline instead of silently disabling save", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const key = screen.getAllByLabelText("providers.key")[0] as HTMLInputElement;
    fireEvent.change(key, { target: { value: "too-short" } });
    fireEvent.blur(key);

    expect(key.getAttribute("aria-invalid")).toBe("true");
    expect(key.getAttribute("aria-describedby")).toContain("provider-key-error-1");
    expect(screen.getByText("providers.keyInvalid")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "providers.replace" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.change(key, { target: { value: "sk-valid-provider-key-value" } });
    expect(key.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByText("providers.keyInvalid")).toBeNull();
  });

  it("localizes the route-summary fallback when a draft URL cannot be parsed", async () => {
    const routeTranslator: AdminTranslator = (key, params) =>
      key === "providers.routeFallback"
        ? `本地化路由 ${params?.slot}`
        : t(key, params);
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="zh-CN"
          t={routeTranslator}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    fireEvent.change(screen.getAllByLabelText("providers.baseUrl")[0], {
      target: { value: "not-a-url" },
    });
    expect(screen.getByText("本地化路由 1")).toBeTruthy();
  });

  it("keeps save errors safe and retranslates them after a locale switch", async () => {
    const rawMessage = "baseUrl must be a safe HTTPS provider endpoint.";
    saveCredentialMock.mockRejectedValue(
      new AdminApiError(rawMessage, {
        status: 422,
        code: "PROVIDER_CREDENTIAL_VALIDATION_ERROR",
      }),
    );
    const onUnauthorized = vi.fn();
    const onUpdated = vi.fn();
    const renderPanel = (locale: "en" | "zh-CN") => (
      <ToastProvider>
        <ProviderKeysPanel
          locale={locale}
          t={prefixedTranslator(locale === "en" ? "en" : "zh")}
          onUnauthorized={onUnauthorized}
          onUpdated={onUpdated}
        />
      </ToastProvider>
    );
    const view = render(renderPanel("en"));

    await screen.findByText("en:providers.slot:1");
    fireEvent.change(screen.getAllByLabelText("en:providers.model")[0], {
      target: { value: "draft-model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "en:common.save" }));

    expect(await screen.findByText("en:providers.requestInvalid")).toBeTruthy();
    expect(screen.queryByText(rawMessage)).toBeNull();
    view.rerender(renderPanel("zh-CN"));
    expect(await screen.findByText("zh:providers.requestInvalid")).toBeTruthy();
    expect(screen.queryByText("en:providers.requestInvalid")).toBeNull();
  });

  it("keeps remove failures safe when the thrown error is not an AdminApiError", async () => {
    const rawMessage = "redis diagnostics must not reach the interface";
    removeCredentialMock.mockRejectedValue(new Error(rawMessage));
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    fireEvent.click(screen.getByRole("button", { name: "providers.remove" }));
    const removeButtons = screen.getAllByRole("button", { name: "providers.remove" });
    fireEvent.click(removeButtons[removeButtons.length - 1]);

    expect(await screen.findByText("common.operationFailed")).toBeTruthy();
    expect(screen.queryByText(rawMessage)).toBeNull();
  });

  it("retranslates a connection-test request error without another request", async () => {
    testCredentialMock.mockRejectedValue(
      new AdminApiError("Too many admin requests.", { status: 429 }),
    );
    const renderPanel = (locale: "en" | "zh-CN") => (
      <ToastProvider>
        <ProviderKeysPanel
          locale={locale}
          t={prefixedTranslator(locale === "en" ? "en" : "zh")}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>
    );
    const view = render(renderPanel("en"));

    await screen.findByText("en:providers.slot:1");
    fireEvent.click(screen.getAllByRole("button", { name: "en:providers.test" })[0]);
    expect(await screen.findByText("en:providers.requestRateLimited")).toBeTruthy();
    expect(testCredentialMock).toHaveBeenCalledTimes(1);

    view.rerender(renderPanel("zh-CN"));
    expect(await screen.findByText("zh:providers.requestRateLimited")).toBeTruthy();
    expect(screen.queryByText("en:providers.requestRateLimited")).toBeNull();
    expect(testCredentialMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-HTTPS Base URL inline", async () => {
    render(
      <ToastProvider>
        <ProviderKeysPanel
          locale="en"
          t={t}
          onUnauthorized={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>,
    );

    await screen.findByText("Priority 1");
    const baseUrl = screen.getAllByLabelText("providers.baseUrl")[0] as HTMLInputElement;
    fireEvent.change(baseUrl, { target: { value: "http://api.example.test/v1?token=leak" } });
    fireEvent.blur(baseUrl);
    expect(baseUrl.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("providers.baseUrlInvalid")).toBeTruthy();
  });
});
