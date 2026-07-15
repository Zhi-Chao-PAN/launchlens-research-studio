"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AdminApiError,
  isRateLimited as isRateLimitError,
  isUnauthorized,
} from "./admin-client";

const DEFAULT_POLL_INTERVAL_MS = 30_000;

export interface AdminResourceState<T> {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isRateLimited: boolean;
  retryAfterUntil: number | null;
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
  replace: (next: T) => void;
}

export function useAdminResource<T>(
  load: () => Promise<T>,
  options: {
    onUnauthorized: () => void;
    onUpdated?: (timestamp: number) => void;
    pollIntervalMs?: number;
    resourceKey?: string;
  },
): AdminResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryAfterUntil, setRetryAfterUntil] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const loadRef = useRef(load);
  const unauthorizedRef = useRef(options.onUnauthorized);
  const updatedRef = useRef(options.onUpdated);
  const mountedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const retryAfterRef = useRef(0);
  const retryStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadRef.current = load;
    unauthorizedRef.current = options.onUnauthorized;
    updatedRef.current = options.onUpdated;
  }, [load, options.onUnauthorized, options.onUpdated]);

  const run = useCallback(async () => {
    if (retryAfterRef.current > Date.now()) return;
    if (inFlightRef.current) return inFlightRef.current;
    const operation = (async () => {
      setIsRefreshing(true);
      try {
        const result = await loadRef.current();
        if (!mountedRef.current) return;
        setData(result);
        setError(null);
        const updatedAt = Date.now();
        setLastUpdatedAt(updatedAt);
        updatedRef.current?.(updatedAt);
        retryAfterRef.current = 0;
        setRetryAfterUntil(null);
        if (retryStateTimerRef.current) {
          clearTimeout(retryStateTimerRef.current);
          retryStateTimerRef.current = null;
        }
      } catch (caught) {
        if (!mountedRef.current) return;
        if (isUnauthorized(caught)) {
          unauthorizedRef.current();
          return;
        }
        const nextError =
          caught instanceof Error
            ? caught
            : new Error("Unknown administrator request error");
        setError(nextError);
        if (isRateLimitError(caught)) {
          const retryUntil = Date.now() + (caught.retryAfterMs ?? 30_000);
          retryAfterRef.current = retryUntil;
          setRetryAfterUntil(retryUntil);
          if (retryStateTimerRef.current) clearTimeout(retryStateTimerRef.current);
          const releaseRetryBlock = () => {
            const remaining = retryAfterRef.current - Date.now();
            if (remaining > 0) {
              retryStateTimerRef.current = setTimeout(releaseRetryBlock, remaining);
              return;
            }
            retryAfterRef.current = 0;
            retryStateTimerRef.current = null;
            if (mountedRef.current) setRetryAfterUntil(null);
          };
          retryStateTimerRef.current = setTimeout(
            releaseRetryBlock,
            Math.max(0, retryUntil - Date.now()),
          );
        }
      } finally {
        if (mountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    })();
    inFlightRef.current = operation;
    try {
      await operation;
    } finally {
      inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void run();

    const interval = Math.max(
      DEFAULT_POLL_INTERVAL_MS,
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      const delay = Math.max(interval, retryAfterRef.current - Date.now());
      timer = setTimeout(async () => {
        const backoffRemaining = retryAfterRef.current - Date.now();
        if (document.visibilityState === "visible" && backoffRemaining <= 0) {
          await run();
        }
        schedule();
      }, delay);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void run();
    };
    schedule();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      if (timer) clearTimeout(timer);
      if (retryStateTimerRef.current) {
        clearTimeout(retryStateTimerRef.current);
        retryStateTimerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [options.pollIntervalMs, options.resourceKey, run]);

  const replace = useCallback((next: T) => {
    setData(next);
    setError(null);
    setLastUpdatedAt(Date.now());
    retryAfterRef.current = 0;
    setRetryAfterUntil(null);
    if (retryStateTimerRef.current) {
      clearTimeout(retryStateTimerRef.current);
      retryStateTimerRef.current = null;
    }
  }, []);

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    isRateLimited: retryAfterUntil !== null,
    retryAfterUntil,
    lastUpdatedAt,
    refresh: run,
    replace,
  };
}

export function getRetrySeconds(
  error: Error | null,
  retryAfterUntil: number | null,
): number | null {
  if (
    !(error instanceof AdminApiError) ||
    error.status !== 429 ||
    retryAfterUntil === null
  ) {
    return null;
  }
  return Math.max(1, Math.ceil((error.retryAfterMs ?? 30_000) / 1000));
}
