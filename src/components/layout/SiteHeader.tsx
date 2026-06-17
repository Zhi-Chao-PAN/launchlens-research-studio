"use client";

import Link from "next/link";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationCenter } from "@/components/ui/NotificationCenter";

interface SiteHeaderProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
}

export function SiteHeader({ title, showBack, backHref = "/" }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="site-header-left">
          {showBack ? (
            <Link href={backHref} className="site-logo">
              <span className="site-logo-icon">⬅</span>
              <span className="site-logo-text">Back</span>
            </Link>
          ) : (
            <Link href="/" className="site-logo">
              <span className="site-logo-icon">🔬</span>
              <span className="site-logo-text">LaunchLens</span>
            </Link>
          )}
          {title && <span className="site-header-title">{title}</span>}
        </div>
        <nav className="site-nav">
          <Link href="/" className="site-nav-item">Home</Link>
          <Link href="/history" className="site-nav-item">History</Link>
          <Link href="/templates" className="site-nav-item">Templates</Link>
          <Link href="/batch" className="site-nav-item">Batch</Link>
          <Link href="/compare" className="site-nav-item">Compare</Link>
        </nav>
        <div className="site-header-right">
          <NotificationCenter />
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
