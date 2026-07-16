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
      <output aria-label="staged-title">{t("providers.stagedTitle")}</output>
      <output aria-label="staged-body">{t("providers.stagedBody")}</output>
      <output aria-label="provider-stale-error">{t("providers.requestStale")}</output>
      <output aria-label="provider-rate-limit-error">{t("providers.requestRateLimited")}</output>
      <output aria-label="provider-key-error">{t("providers.keyInvalid")}</output>
      <output aria-label="provider-route-fallback">
        {t("providers.routeFallback", { slot: 2 })}
      </output>
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
    expect(screen.getByLabelText("staged-title").textContent).toBe(
      "暂存配置 · 现有环境密钥流量保持不变",
    );
    expect(screen.getByLabelText("staged-body").textContent).toContain(
      "LAUNCHLENS_PROVIDER_KEYRING_ENABLED=1",
    );
    expect(screen.getByLabelText("provider-stale-error").textContent).toBe(
      "这条凭据路由已变更或不存在。请刷新页面后重试。",
    );
    expect(screen.getByLabelText("provider-rate-limit-error").textContent).toBe(
      "服务商管理操作暂时受到限流。请稍候再试。",
    );
    expect(screen.getByLabelText("provider-key-error").textContent).toBe(
      "API 密钥必须为 16–512 个字符，且不能包含空白字符。",
    );
    expect(screen.getByLabelText("provider-route-fallback").textContent).toBe("路由 2");
    expect(localStorage.getItem("ll.locale")).toBe("zh-CN");
  });

  it("maps non-Chinese application locales to the English admin dictionary", async () => {
    localStorage.setItem("ll.locale", "ja");
    render(<LocaleProvider><Probe /></LocaleProvider>);

    await waitFor(() => expect(screen.getByLabelText("locale").textContent).toBe("en"));
    expect(screen.getByLabelText("overview-label").textContent).toBe("Overview");
    expect(screen.getByLabelText("staged-title").textContent).toBe(
      "Staged configuration · legacy traffic is unchanged",
    );
    expect(screen.getByLabelText("staged-body").textContent).toContain(
      "LAUNCHLENS_PROVIDER_KEYRING_ENABLED=1",
    );
    expect(screen.getByLabelText("provider-stale-error").textContent).toBe(
      "This credential route changed or no longer exists. Refresh the page and try again.",
    );
    expect(screen.getByLabelText("provider-rate-limit-error").textContent).toBe(
      "Provider administration is temporarily rate-limited. Wait a moment and try again.",
    );
    expect(screen.getByLabelText("provider-key-error").textContent).toBe(
      "API keys must be 16–512 characters and contain no whitespace.",
    );
    expect(screen.getByLabelText("provider-route-fallback").textContent).toBe("Route 2");
  });
});
