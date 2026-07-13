import type { ReactNode } from "react";

import { canonicalizeSafeExternalUrl } from "@/lib/security/safe-external-url";

interface SafeExternalLinkProps {
  href: unknown;
  children: ReactNode;
  className?: string;
}

/**
 * Render an untrusted report URL as an external link only after it passes the
 * shared outbound-link policy. Rejected URLs remain readable without becoming
 * navigable.
 */
export function SafeExternalLink({
  href,
  children,
  className,
}: SafeExternalLinkProps) {
  const safeHref = canonicalizeSafeExternalUrl(href);

  if (!safeHref) {
    return <span className={className}>{children}</span>;
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
