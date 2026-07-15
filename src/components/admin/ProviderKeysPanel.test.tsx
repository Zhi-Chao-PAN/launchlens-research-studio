// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast/ToastContext";
import type { AdminTranslator } from "./admin-i18n";
import type { ProviderCredentialsSnapshot } from "./admin-client";

const { getSnapshotMock, saveCredentialMock, removeCredentialMock } = vi.hoisted(() => ({
  getSnapshotMock: vi.fn(),
  saveCredentialMock: vi.fn(),
  removeCredentialMock: vi.fn(),
}));

vi.mock("./admin-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./admin-client")>();
  return {
    ...actual,
    getProviderCredentials: getSnapshotMock,
    saveProviderCredential: saveCredentialMock,
    removeProviderCredential: removeCredentialMock,
  };
});

import { ProviderKeysPanel } from "./ProviderKeysPanel";

const t: AdminTranslator = (key, params) => {
  if (key === "providers.slot") return `Priority ${params?.slot}`;
  if (key === "providers.saved") return `Saved ${params?.slot}`;
  if (key === "providers.removed") return `Removed ${params?.slot}`;
  if (key === "providers.revision") return `Revision ${params?.revision}`;
  if (key === "providers.fallback") return `Fallback ${params?.slot}`;
  return key;
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
  slots: [
    {
      slot: 1,
      isConfigured: true,
      provider: "openai",
      enabled: true,
      credentialId: "cred_primary_opaque",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      health: baseHealth,
    },
    {
      slot: 2,
      isConfigured: false,
      provider: null,
      enabled: false,
      credentialId: null,
      createdAt: null,
      updatedAt: null,
      health: baseHealth,
    },
    {
      slot: 3,
      isConfigured: false,
      provider: null,
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
  });

  afterEach(cleanup);

  it("renders the runtime provider as read-only and saves fallback slot 2 with the current CAS revision", async () => {
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
    expect(screen.getByLabelText("providers.activeProvider").textContent).toBe("OpenAI compatible");
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
        enabled: true,
      });
    });
  });

  it("uses the runtime provider for an empty vault", async () => {
    const emptySnapshot: ProviderCredentialsSnapshot = {
      ...snapshot,
      revision: 0,
      runtimeProvider: "anthropic",
      slots: snapshot.slots.map((slot) => ({
        ...slot,
        isConfigured: false,
        provider: null,
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
    expect(screen.getByLabelText("providers.activeProvider").textContent).toBe("Anthropic");
    const keyInputs = screen.getAllByLabelText("providers.key") as HTMLInputElement[];
    fireEvent.change(keyInputs[0], { target: { value: "sk-ant-primary-runtime-secret" } });
    fireEvent.click(screen.getAllByRole("button", { name: /providers.add/ })[0]);

    await waitFor(() => {
      expect(saveCredentialMock).toHaveBeenCalledWith({
        provider: "anthropic",
        slot: 1,
        expectedRevision: 0,
        apiKey: "sk-ant-primary-runtime-secret",
        enabled: true,
      });
    });
  });

  it("locks writes for historical provider mismatches but still permits cleanup", async () => {
    const mismatchedSnapshot: ProviderCredentialsSnapshot = {
      ...snapshot,
      runtimeProvider: "anthropic",
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
});
