// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminTranslator } from "./admin-i18n";
import { AdminShell } from "./AdminShell";

const t: AdminTranslator = (key) => key;

describe("AdminShell mobile navigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 900px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(cleanup);

  function renderShell(onViewChange = vi.fn()) {
    render(
      <AdminShell
        activeView="overview"
        onViewChange={onViewChange}
        locale="en"
        setLocale={vi.fn()}
        lastUpdatedAt={null}
        sessionError={null}
        signOutPending={false}
        onSignOut={vi.fn()}
        t={t}
      >
        <p>active content</p>
      </AdminShell>,
    );
    return onViewChange;
  }

  it("keeps the closed drawer inert and transfers focus on open and Escape close", async () => {
    renderShell();
    const sidebar = document.querySelector<HTMLElement>(".ops-sidebar");
    const workspace = document.querySelector<HTMLElement>(".ops-workspace");
    const menu = screen.getByRole("button", { name: "header.openNav" });

    await waitFor(() => {
      expect(sidebar?.getAttribute("aria-hidden")).toBe("true");
      expect(sidebar?.hasAttribute("inert")).toBe(true);
    });

    fireEvent.click(menu);
    const close = await screen.findByRole("button", { name: "header.closeNav" });
    await waitFor(() => {
      expect(sidebar?.getAttribute("aria-hidden")).toBe("false");
      expect(sidebar?.hasAttribute("inert")).toBe(false);
      expect(workspace?.getAttribute("aria-hidden")).toBe("true");
      expect(workspace?.hasAttribute("inert")).toBe(true);
      expect(document.activeElement).toBe(close);
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(sidebar?.getAttribute("aria-hidden")).toBe("true");
      expect(sidebar?.hasAttribute("inert")).toBe(true);
      expect(workspace?.hasAttribute("inert")).toBe(false);
      expect(document.activeElement).toBe(menu);
    });
  });

  it("traps drawer focus and restores the trigger after selecting a section", async () => {
    const onViewChange = renderShell();
    const menu = screen.getByRole("button", { name: "header.openNav" });
    fireEvent.click(menu);
    const close = await screen.findByRole("button", { name: "header.closeNav" });
    const diagnosticsLink = screen.getByRole("link", { name: "header.diagnostics" });

    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(diagnosticsLink);

    const research = screen.getByRole("button", { name: /nav\.research/ });
    fireEvent.click(research);
    expect(onViewChange).toHaveBeenCalledWith("research");
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });
});
