/**
 * Hook to track network connectivity and connection quality.
 */

import { useState, useEffect, useCallback } from "react";

interface NetworkState {
  isOnline: boolean;
  since: number | null;
  downlink: number | null;
  effectiveType: string | null;
  rtt: number | null;
  saveData: boolean;
}

// Minimal type for Network Information API
interface NetworkInformation extends EventTarget {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
}

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformation;
};

function getConnection(): NetworkInformation | undefined {
  const nav = navigator as NavigatorWithConnection;
  return nav.connection;
}

export function readState(nav?: Navigator & { connection?: { downlink?: number; effectiveType?: string; rtt?: number; saveData?: boolean }; onLine?: boolean }, now: number = Date.now()): NetworkState {
  // SSR: there is no window, so we cannot read navigator.onLine.
  const navObj = nav ?? (typeof window !== "undefined" && typeof navigator !== "undefined" ? navigator : undefined);
  if (!navObj) {
    return { isOnline: true, since: null, downlink: null, effectiveType: null, rtt: null, saveData: false };
  }
  const conn = (navObj as NavigatorWithConnection).connection;
  return {
    isOnline: navObj.onLine !== false,
    since: now,
    downlink: conn?.downlink ?? null,
    effectiveType: conn?.effectiveType ?? null,
    rtt: conn?.rtt ?? null,
    saveData: conn?.saveData ?? false,
  };
}

export function useNetworkState(): NetworkState {
  const [state, setState] = useState<NetworkState>(() => readState());

  const handleOnline = useCallback(() => {
    setState({ ...readState(), isOnline: true });
  }, []);

  const handleOffline = useCallback(() => {
    setState({ ...readState(), isOnline: false });
  }, []);

  const handleConnectionChange = useCallback(() => {
    setState(readState());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const conn = getConnection();
    if (conn) {
      conn.addEventListener("change", handleConnectionChange);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (conn) {
        conn.removeEventListener("change", handleConnectionChange);
      }
    };
  }, [handleOnline, handleOffline, handleConnectionChange]);

  return state;
}

/**
 * Hook to show a toast/notification when network status changes.
 * Shows toast when going offline, hides shortly after coming back online.
 */
export function useOfflineToast(): boolean {
  const { isOnline } = useNetworkState();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      Promise.resolve().then(() => setShow(true));
      return;
    }
    const timer = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(timer);
  }, [isOnline]);

  return show;
}

