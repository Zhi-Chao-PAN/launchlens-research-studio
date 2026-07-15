"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  checkAdminSession,
  createAdminSession,
  deleteAdminSession,
} from "./admin-client";
import {
  useAdminI18n,
  type AdminAuthErrorKey,
} from "./admin-i18n";
import { AdminLogin } from "./AdminLogin";
import { AdminShell, type AdminView } from "./AdminShell";
import { OverviewPanel } from "./OverviewPanel";
import { ResearchPanel } from "./ResearchPanel";
import { ProviderKeysPanel } from "./ProviderKeysPanel";
import { SecurityPanel } from "./SecurityPanel";
import { SystemPanel } from "./SystemPanel";

type AuthState = "checking" | "anonymous" | "authenticated";

export function AdminConsole() {
  const { locale, setLocale, t } = useAdminI18n();
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authPending, setAuthPending] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [authError, setAuthError] = useState<AdminAuthErrorKey | null>(null);
  const [activeView, setActiveView] = useState<AdminView>("overview");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void checkAdminSession()
      .then((authenticated) => {
        if (!active) return;
        setAuthState(authenticated ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (!active) return;
        setAuthState("anonymous");
        setAuthError("auth.unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  const endSession = useCallback(() => {
    setAuthState("anonymous");
    setAuthError("auth.expired");
    setLastUpdatedAt(null);
  }, []);

  async function handleLogin(token: string) {
    if (!token.trim()) {
      setAuthError("auth.required");
      return;
    }
    setAuthPending(true);
    setAuthError(null);
    try {
      await createAdminSession(token);
      setAuthState("authenticated");
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        setAuthError("auth.invalid");
      } else {
        setAuthError("auth.unavailable");
      }
    } finally {
      setAuthPending(false);
    }
  }

  async function handleSignOut() {
    if (signOutPending) return;
    setSignOutPending(true);
    setAuthError(null);
    try {
      await deleteAdminSession();
      setAuthState("anonymous");
      setAuthError(null);
      setLastUpdatedAt(null);
    } catch {
      // The session cookie is HttpOnly, so a failed server-side deletion means
      // the session is still active. Keep the authenticated shell visible.
      setAuthError("auth.signOutFailed");
    } finally {
      setSignOutPending(false);
    }
  }

  if (authState === "checking") {
    return (
      <main id="main-content" className="ops-session-check" aria-busy="true">
        <span className="ops-brand-mark" aria-hidden="true">LL</span>
        <p>{t("auth.checking")}</p>
        <span className="ops-session-line" aria-hidden="true" />
      </main>
    );
  }

  if (authState === "anonymous") {
    return (
      <AdminLogin
        locale={locale}
        setLocale={setLocale}
        t={t}
        pending={authPending}
        error={authError}
        onSubmit={handleLogin}
      />
    );
  }

  return (
    <AdminShell
      activeView={activeView}
      onViewChange={setActiveView}
      locale={locale}
      setLocale={setLocale}
      lastUpdatedAt={lastUpdatedAt}
      sessionError={authError ? t(authError) : null}
      signOutPending={signOutPending}
      onSignOut={() => void handleSignOut()}
      t={t}
    >
      {activeView === "overview" ? (
        <OverviewPanel t={t} onUnauthorized={endSession} onUpdated={setLastUpdatedAt} />
      ) : null}
      {activeView === "research" ? (
        <ResearchPanel locale={locale} t={t} onUnauthorized={endSession} onUpdated={setLastUpdatedAt} />
      ) : null}
      {activeView === "providers" ? (
        <ProviderKeysPanel locale={locale} t={t} onUnauthorized={endSession} onUpdated={setLastUpdatedAt} />
      ) : null}
      {activeView === "security" ? (
        <SecurityPanel locale={locale} t={t} onUnauthorized={endSession} onUpdated={setLastUpdatedAt} />
      ) : null}
      {activeView === "system" ? (
        <SystemPanel t={t} onUnauthorized={endSession} onUpdated={setLastUpdatedAt} />
      ) : null}
    </AdminShell>
  );
}
