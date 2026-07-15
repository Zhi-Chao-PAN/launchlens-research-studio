// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminLogin } from "./AdminLogin";
import type { AdminTranslator } from "./admin-i18n";

const t: AdminTranslator = (key) => key;

describe("AdminLogin", () => {
  afterEach(cleanup);

  it("submits the token once, clears the field, and never writes browser storage", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const setLocale = vi.fn();
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <AdminLogin
        locale="en"
        setLocale={setLocale}
        t={t}
        pending={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );

    const token = screen.getByLabelText("auth.token") as HTMLInputElement;
    expect(token.type).toBe("password");
    expect(token.name).toBe("admin-token");
    expect(token.autocomplete).toBe("current-password");

    fireEvent.change(token, { target: { value: "admin-once-only" } });
    fireEvent.submit(token.closest("form") as HTMLFormElement);

    expect(onSubmit).toHaveBeenCalledWith("admin-once-only");
    expect(token.value).toBe("");
    expect(storageSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(setLocale).toHaveBeenCalledWith("zh-CN");
    storageSpy.mockRestore();
  });

  it("exposes inline errors through an alert role", () => {
    render(
      <AdminLogin
        locale="zh-CN"
        setLocale={vi.fn()}
        t={t}
        pending={false}
        error="auth.invalid"
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("auth.invalid");
  });
});

