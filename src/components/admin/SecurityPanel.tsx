"use client";

import { useState } from "react";
import type { AdminLocale, AdminTranslator } from "./admin-i18n";
import { SectionIntro } from "./AdminPrimitives";
import { SecurityTokens } from "./SecurityTokens";
import { SecurityAudit } from "./SecurityAudit";
import { SecurityAlerts } from "./SecurityAlerts";

type SecurityView = "tokens" | "audit" | "alerts";

const tabs: Array<{
  id: SecurityView;
  label: "security.tokens" | "security.audit" | "security.alerts";
}> = [
  { id: "tokens", label: "security.tokens" },
  { id: "audit", label: "security.audit" },
  { id: "alerts", label: "security.alerts" },
];

export function SecurityPanel({
  locale,
  t,
  onUnauthorized,
  onUpdated,
}: {
  locale: AdminLocale;
  t: AdminTranslator;
  onUnauthorized: () => void;
  onUpdated: (timestamp: number) => void;
}) {
  const [active, setActive] = useState<SecurityView>("tokens");

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    setActive(next.id);
    document.getElementById(`security-tab-${next.id}`)?.focus();
  }

  return (
    <section className="ops-view" aria-labelledby="security-title">
      <SectionIntro
        eyebrow={t("security.eyebrow")}
        titleId="security-title"
        title={t("security.title")}
        description={t("security.description")}
      />
      <div className="ops-subtabs" role="tablist" aria-label={t("security.tabsLabel")}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            id={`security-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            aria-controls={`security-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className={active === tab.id ? "is-active" : ""}
            onClick={() => setActive(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            <span aria-hidden="true">0{index + 1}</span>
            {t(tab.label)}
          </button>
        ))}
      </div>

      <div
        id={`security-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`security-tab-${active}`}
        className="ops-security-panel"
      >
        {active === "tokens" ? (
          <SecurityTokens locale={locale} t={t} onUnauthorized={onUnauthorized} onUpdated={onUpdated} />
        ) : null}
        {active === "audit" ? (
          <SecurityAudit locale={locale} t={t} onUnauthorized={onUnauthorized} onUpdated={onUpdated} />
        ) : null}
        {active === "alerts" ? (
          <SecurityAlerts locale={locale} t={t} onUnauthorized={onUnauthorized} onUpdated={onUpdated} />
        ) : null}
      </div>
    </section>
  );
}
