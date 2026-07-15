// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "./admin-client";
import type { AdminTranslator } from "./admin-i18n";
import { RefreshButton, ResourceState } from "./AdminPrimitives";
import { useAdminResource } from "./use-admin-resource";

const t: AdminTranslator = (key) => key;

function Harness({
  load,
  onUnauthorized = vi.fn(),
}: {
  load: () => Promise<string>;
  onUnauthorized?: () => void;
}) {
  const resource = useAdminResource(load, {
    onUnauthorized,
    resourceKey: "test-resource",
  });
  return (
    <>
      <output>{resource.data ?? (resource.isLoading ? "loading" : "empty")}</output>
      <RefreshButton
        t={t}
        pending={resource.isRefreshing}
        disabled={resource.isRateLimited}
        onClick={() => void resource.refresh()}
      />
      <ResourceState
        error={resource.error}
        loading={resource.isLoading}
        retryAfterUntil={resource.retryAfterUntil}
        onRetry={() => void resource.refresh()}
        t={t}
      />
    </>
  );
}

describe("useAdminResource", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("polls no faster than 30 seconds and pauses while the page is hidden", async () => {
    const load = vi.fn().mockResolvedValue("ready");
    render(<Harness load={load} />);
    await act(async () => Promise.resolve());

    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByText("ready")).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_999);
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(load).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(load).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("honors Retry-After for polling, manual refresh, retry, and visibility changes", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(
        new AdminApiError("Too many requests", {
          status: 429,
          retryAfterMs: 60_000,
        }),
      )
      .mockResolvedValue("recovered");
    render(<Harness load={load} />);
    await act(async () => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);
    const refresh = screen.getByRole("button", { name: "common.refresh" });
    const retry = screen.getByRole("button", { name: "common.retry" });
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
    expect((retry as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(refresh);
    fireEvent.click(retry);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect((refresh as HTMLButtonElement).disabled).toBe(true);
    expect((retry as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("recovered")).toBeTruthy();
  });

  it("ends the UI session on a 401", async () => {
    const onUnauthorized = vi.fn();
    const load = vi.fn().mockRejectedValue(
      new AdminApiError("Unauthorized", { status: 401 }),
    );
    render(<Harness load={load} onUnauthorized={onUnauthorized} />);
    await act(async () => Promise.resolve());

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
