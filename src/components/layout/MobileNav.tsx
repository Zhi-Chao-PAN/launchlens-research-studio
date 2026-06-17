"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "??" },
  { href: "/history", label: "History", icon: "??" },
  { href: "/templates", label: "Templates", icon: "??" },
  { href: "/batch", label: "Batch", icon: "?" },
  { href: "/compare", label: "Compare", icon: "??" },
  { href: "/admin", label: "Admin", icon: "??" },
];

export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    void Promise.resolve().then(() => {
      setIsOpen(false);
    });
  }, [pathname]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <button
        className={"mobile-nav-toggle " + (isOpen ? "open" : "")}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
      >
        <span />
        <span />
        <span />
      </button>

      {isOpen && (
        <>
          <div className="mobile-nav-backdrop" onClick={() => setIsOpen(false)} />
          <nav className="mobile-nav">
            <div className="mobile-nav-header">
              <span className="mobile-nav-logo">?? LaunchLens</span>
              <button
                className="mobile-nav-close"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ?
              </button>
            </div>
            <div className="mobile-nav-items">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    "mobile-nav-item " +
                    (pathname === item.href ? "active" : "")
                  }
                >
                  <span className="mobile-nav-icon">{item.icon}</span>
                  <span className="mobile-nav-label">{item.label}</span>
                </Link>
              ))}
            </div>
            <div className="mobile-nav-footer">
              <span className="mobile-nav-version">Research Studio</span>
            </div>
          </nav>
        </>
      )}
    </>
  );
}