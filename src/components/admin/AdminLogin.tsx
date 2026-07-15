"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AdminIcon } from "./AdminPrimitives";
import type {
  AdminAuthErrorKey,
  AdminLocale,
  AdminTranslator,
} from "./admin-i18n";

export function AdminLogin({
  locale,
  setLocale,
  t,
  pending,
  error,
  onSubmit,
}: {
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  t: AdminTranslator;
  pending: boolean;
  error: AdminAuthErrorKey | null;
  onSubmit: (token: string) => Promise<void>;
}) {
  const [token, setToken] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = token;
    setToken("");
    await onSubmit(submitted);
  }

  return (
    <main id="main-content" className="ops-auth">
      <div className="ops-auth-language" role="group" aria-label={t("header.language")}>
        <button
          type="button"
          className={locale === "zh-CN" ? "is-active" : ""}
          aria-pressed={locale === "zh-CN"}
          onClick={() => setLocale("zh-CN")}
        >
          中文
        </button>
        <button
          type="button"
          className={locale === "en" ? "is-active" : ""}
          aria-pressed={locale === "en"}
          onClick={() => setLocale("en")}
        >
          EN
        </button>
      </div>
      <section className="ops-auth-panel" aria-labelledby="admin-login-title">
        <div className="ops-auth-brand">
          <span className="ops-brand-mark" aria-hidden="true">LL</span>
          <div>
            <p>{t("brand.eyebrow")}</p>
            <strong>{t("brand.console")}</strong>
          </div>
        </div>
        <div className="ops-auth-copy">
          <p className="ops-eyebrow">{t("brand.environment")}</p>
          <h1 id="admin-login-title">{t("auth.title")}</h1>
          <p>{t("auth.description")}</p>
        </div>
        <form className="ops-auth-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-token">{t("auth.token")}</label>
          <input
            id="admin-token"
            name="admin-token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={t("auth.tokenPlaceholder")}
            autoComplete="current-password"
            spellCheck={false}
            required
            disabled={pending}
          />
          {error ? <p className="ops-form-error" role="alert">{t(error)}</p> : null}
          <button className="ops-button ops-button-primary ops-auth-submit" type="submit" disabled={pending}>
            {pending ? t("auth.submitting") : t("auth.submit")}
            <AdminIcon name="arrow" />
          </button>
        </form>
        <Link className="ops-auth-back" href="/">
          <span aria-hidden="true">←</span>
          {t("auth.back")}
        </Link>
      </section>
      <aside className="ops-auth-context" aria-hidden="true">
        <div className="ops-auth-grid" />
        <p>01 / 03</p>
        <strong>{t("auth.contextObserve")}</strong>
        <span>{t("auth.contextObserveBody")}</span>
        <div className="ops-auth-rule" />
        <p>02 / 03</p>
        <strong>{t("auth.contextGovern")}</strong>
        <span>{t("auth.contextGovernBody")}</span>
      </aside>
    </main>
  );
}
