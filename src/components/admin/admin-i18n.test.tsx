// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { useAdminI18n } from "./admin-i18n";

function Probe() {
  const { locale, setLocale, t } = useAdminI18n();
  return (
    <div>
      <output aria-label="locale">{locale}</output>
      <output aria-label="overview-label">{t("nav.overview")}</output>
      <button type="button" onClick={() => setLocale("zh-CN")}>中文</button>
      <button type="button" onClick={() => setLocale("en")}>English</button>
    </div>
  );
}

describe("admin i18n", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("uses the shared LocaleProvider and persists an explicit Chinese selection", async () => {
    render(<LocaleProvider><Probe /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    expect(screen.getByLabelText("locale").textContent).toBe("zh-CN");
    expect(screen.getByLabelText("overview-label").textContent).toBe("总览");
    expect(localStorage.getItem("ll.locale")).toBe("zh-CN");
  });

  it("maps non-Chinese application locales to the English admin dictionary", async () => {
    localStorage.setItem("ll.locale", "ja");
    render(<LocaleProvider><Probe /></LocaleProvider>);

    await waitFor(() => expect(screen.getByLabelText("locale").textContent).toBe("en"));
    expect(screen.getByLabelText("overview-label").textContent).toBe("Overview");
  });
});

