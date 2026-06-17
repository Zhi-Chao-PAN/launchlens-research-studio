"use client";

import { useNetworkState } from "@/lib/hooks/use-network-state";

export function NetworkStatus() {
  const { isOnline, effectiveType } = useNetworkState();

  if (isOnline) return null;

  return (
    <div className="network-status-banner offline">
      <span className="network-status-icon">📡</span>
      <span className="network-status-text">
        You are offline. Some features may not work.
      </span>
      {effectiveType && (
        <span className="network-status-detail">
          Connection: {effectiveType}
        </span>
      )}
    </div>
  );
}

export function NetworkBadge() {
  const { isOnline, effectiveType } = useNetworkState();

  if (isOnline && effectiveType !== "slow-2g" && effectiveType !== "2g") {
    return null;
  }

  const badgeClass = isOnline ? "slow" : "offline";

  return (
    <span className={"network-badge " + badgeClass}>
      <span className="network-badge-dot" />
      {isOnline ? "Slow connection" : "Offline"}
    </span>
  );
}
