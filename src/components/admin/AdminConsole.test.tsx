// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

const {
  checkAdminSessionMock,
  createAdminSessionMock,
  deleteAdminSessionMock,
} = vi.hoisted(() => ({
  checkAdminSessionMock: vi.fn(),
  createAdminSessionMock: vi.fn(),
  deleteAdminSessionMock: vi.fn(),
}));

vi.mock("./admin-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./admin-client")>();
  return {
    ...actual,
    checkAdminSession: checkAdminSessionMock,
    createAdminSession: createAdminSessionMock,
    deleteAdminSession: deleteAdminSessionMock,
  };
});

vi.mock("./AdminShell", () => ({
  AdminShell: ({
    children,
    onSignOut,
    sessionError,
    signOutPending,
  }: {
    children: ReactNode;
    onSignOut: () => void;
    sessionError: string | null;
    signOutPending: boolean;
  }) => (
    <div data-testid="admin-shell">
      <button type="button" disabled={signOutPending} onClick={onSignOut}>
        shell-sign-out
      </button>
      {sessionError ? <p role="alert">{sessionError}</p> : null}
      {children}
    </div>
  ),
}));

vi.mock("./OverviewPanel", () => ({ OverviewPanel: () => <div /> }));
vi.mock("./AnalyticsPanel", () => ({ AnalyticsPanel: () => <div /> }));
vi.mock("./ResearchPanel", () => ({ ResearchPanel: () => <div /> }));
vi.mock("./ProviderKeysPanel", () => ({ ProviderKeysPanel: () => <div /> }));
vi.mock("./SecurityPanel", () => ({ SecurityPanel: () => <div /> }));
vi.mock("./SystemPanel", () => ({ SystemPanel: () => <div /> }));

import { AdminApiError } from "./admin-client";
import { AdminConsole } from "./AdminConsole";

function renderConsole() {
  return render(
    <LocaleProvider>
      <AdminConsole />
    </LocaleProvider>,
  );
}

describe("AdminConsole", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("ll.locale", "en");
    checkAdminSessionMock.mockReset();
    createAdminSessionMock.mockReset();
    deleteAdminSessionMock.mockReset();
  });

  afterEach(cleanup);

  it("keeps the authenticated shell and reports an error when server sign-out fails", async () => {
    checkAdminSessionMock.mockResolvedValue(true);
    deleteAdminSessionMock.mockRejectedValue(new Error("network unavailable"));
    renderConsole();

    await screen.findByTestId("admin-shell");
    fireEvent.click(screen.getByRole("button", { name: "shell-sign-out" }));

    expect(
      await screen.findByText(
        "Sign-out failed. Your secure session is still active; try again.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("admin-shell")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Administrator sign in" })).toBeNull();
  });

  it("shows the login screen only after server sign-out succeeds", async () => {
    checkAdminSessionMock.mockResolvedValue(true);
    deleteAdminSessionMock.mockResolvedValue(undefined);
    renderConsole();

    await screen.findByTestId("admin-shell");
    fireEvent.click(screen.getByRole("button", { name: "shell-sign-out" }));

    expect(
      await screen.findByRole("heading", { name: "Administrator sign in" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("admin-shell")).toBeNull();
  });

  it("stores an auth error key so changing locale retranslates the current error", async () => {
    checkAdminSessionMock.mockResolvedValue(false);
    createAdminSessionMock.mockRejectedValue(
      new AdminApiError("Unauthorized", { status: 401 }),
    );
    renderConsole();

    const token = await screen.findByLabelText("Admin token");
    fireEvent.change(token, { target: { value: "invalid-admin-token" } });
    fireEvent.submit(token.closest("form") as HTMLFormElement);

    expect(
      await screen.findByText(
        "The token is invalid or does not have admin access.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    await waitFor(() => {
      expect(
        screen.getByText("令牌无效或不具备管理员权限。"),
      ).toBeTruthy();
    });
    expect(
      screen.queryByText("The token is invalid or does not have admin access."),
    ).toBeNull();
  });
});
