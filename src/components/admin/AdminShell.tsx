"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AdminIcon,
  formatAdminTime,
  type AdminIconName,
} from "./AdminPrimitives";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";

export type AdminView =
  | "overview"
  | "research"
  | "providers"
  | "security"
  | "system";

const navItems: Array<{
  id: AdminView;
  icon: AdminIconName;
  label: Parameters<AdminTranslator>[0];
  hint: Parameters<AdminTranslator>[0];
}> = [
  { id: "overview", icon: "overview", label: "nav.overview", hint: "nav.overviewHint" },
  { id: "research", icon: "research", label: "nav.research", hint: "nav.researchHint" },
  { id: "providers", icon: "providers", label: "nav.providers", hint: "nav.providersHint" },
  { id: "security", icon: "security", label: "nav.security", hint: "nav.securityHint" },
  { id: "system", icon: "system", label: "nav.system", hint: "nav.systemHint" },
];

export function AdminShell({
  activeView,
  onViewChange,
  locale,
  setLocale,
  lastUpdatedAt,
  sessionError,
  signOutPending,
  onSignOut,
  t,
  children,
}: {
  activeView: AdminView;
  onViewChange: (view: AdminView) => void;
  locale: AdminLocale;
  setLocale: (locale: AdminLocale) => void;
  lastUpdatedAt: number | null;
  sessionError: string | null;
  signOutPending: boolean;
  onSignOut: () => void;
  t: AdminTranslator;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousOpenRef = useRef(false);
  const current = navItems.find((item) => item.id === activeView) ?? navItems[0];

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const syncViewport = () => {
      setIsMobileViewport(query.matches);
      if (!query.matches) setMobileNavOpen(false);
    };
    syncViewport();
    query.addEventListener("change", syncViewport);
    return () => query.removeEventListener("change", syncViewport);
  }, []);

  useLayoutEffect(() => {
    if (!isMobileViewport) {
      previousOpenRef.current = false;
      return;
    }
    if (mobileNavOpen) {
      closeButtonRef.current?.focus();
    } else if (previousOpenRef.current) {
      menuButtonRef.current?.focus();
    }
    previousOpenRef.current = mobileNavOpen;
  }, [isMobileViewport, mobileNavOpen]);

  useEffect(() => {
    if (!isMobileViewport || !mobileNavOpen) return;
    const handleDrawerKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(sidebarRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sidebarRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !sidebarRef.current?.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDrawerKeyDown);
    return () => window.removeEventListener("keydown", handleDrawerKeyDown);
  }, [isMobileViewport, mobileNavOpen]);

  function selectView(view: AdminView) {
    onViewChange(view);
    setMobileNavOpen(false);
  }

  return (
    <div className="ops-shell">
      <button
        className={mobileNavOpen ? "ops-nav-scrim is-open" : "ops-nav-scrim"}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => setMobileNavOpen(false)}
      />
      <aside
        ref={sidebarRef}
        className={mobileNavOpen ? "ops-sidebar is-open" : "ops-sidebar"}
        aria-hidden={isMobileViewport ? !mobileNavOpen : undefined}
        aria-modal={isMobileViewport && mobileNavOpen ? "true" : undefined}
        aria-label={isMobileViewport ? t("nav.label") : undefined}
        inert={isMobileViewport && !mobileNavOpen ? true : undefined}
        role={isMobileViewport ? "dialog" : undefined}
      >
        <div className="ops-sidebar-brand">
          <span className="ops-brand-mark" aria-hidden="true">LL</span>
          <div>
            <p>{t("brand.eyebrow")}</p>
            <strong>{t("brand.console")}</strong>
          </div>
          <button
            ref={closeButtonRef}
            className="ops-icon-button ops-sidebar-close"
            type="button"
            aria-label={t("header.closeNav")}
            onClick={() => setMobileNavOpen(false)}
          >
            <AdminIcon name="close" />
          </button>
        </div>
        <div className="ops-environment">
          <span className="ops-live-dot" aria-hidden="true" />
          {t("brand.environment")}
        </div>
        <nav className="ops-nav" aria-label={t("nav.label")}>
          {navItems.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={activeView === item.id ? "ops-nav-item is-active" : "ops-nav-item"}
              aria-current={activeView === item.id ? "page" : undefined}
              onClick={() => selectView(item.id)}
            >
              <span className="ops-nav-index" aria-hidden="true">0{index + 1}</span>
              <AdminIcon name={item.icon} />
              <span>
                <strong>{t(item.label)}</strong>
                <small>{t(item.hint)}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="ops-sidebar-footer">
          <Link href="/" className="ops-sidebar-link">
            <AdminIcon name="external" />
            {t("header.studio")}
          </Link>
          <Link href="/diagnostics" className="ops-sidebar-link">
            <AdminIcon name="system" />
            {t("header.diagnostics")}
          </Link>
        </div>
      </aside>

      <div
        className="ops-workspace"
        aria-hidden={isMobileViewport && mobileNavOpen ? true : undefined}
        inert={isMobileViewport && mobileNavOpen ? true : undefined}
      >
        <header className="ops-topbar">
          <div className="ops-topbar-location">
            <button
              ref={menuButtonRef}
              className="ops-icon-button ops-menu-button"
              type="button"
              aria-label={t("header.openNav")}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <AdminIcon name="menu" />
            </button>
            <AdminIcon name={current.icon} />
            <span>{t(current.label)}</span>
          </div>
          <div className="ops-topbar-actions">
            <p className="ops-last-refresh">
              <span>{t("header.lastRefresh")}</span>
              <strong>{lastUpdatedAt ? formatAdminTime(lastUpdatedAt, locale) : t("header.never")}</strong>
            </p>
            <div className="ops-language" role="group" aria-label={t("header.language")}>
              <button
                type="button"
                aria-pressed={locale === "zh-CN"}
                className={locale === "zh-CN" ? "is-active" : ""}
                onClick={() => setLocale("zh-CN")}
              >
                中
              </button>
              <button
                type="button"
                aria-pressed={locale === "en"}
                className={locale === "en" ? "is-active" : ""}
                onClick={() => setLocale("en")}
              >
                EN
              </button>
            </div>
            <button
              className="ops-button ops-button-quiet ops-signout"
              type="button"
              aria-label={t("header.signOut")}
              aria-busy={signOutPending}
              disabled={signOutPending}
              onClick={onSignOut}
            >
              <AdminIcon name="logout" />
              <span>{signOutPending ? t("header.signingOut") : t("header.signOut")}</span>
            </button>
          </div>
        </header>
        {sessionError ? (
          <div className="ops-shell-alert" role="alert">
            <AdminIcon name="warning" />
            <span>{sessionError}</span>
          </div>
        ) : null}
        <main id="main-content" className="ops-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}
