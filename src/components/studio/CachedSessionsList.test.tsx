// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CachedSessionsList } from "./CachedSessionsList";

const { cachedSession } = vi.hoisted(() => ({
  cachedSession: {
    id: "session-1",
    query: "AI meal planning for students",
    completedAt: "2026-07-13T00:00:00.000Z",
    citationCount: 4,
    agentStatuses: {
      "market-sizer": { status: "done" },
      "competitor-analyst": { status: "done" },
      "pain-detective": { status: "done" },
      "pricing-scout": { status: "done" },
      "channel-scout": { status: "done" },
      synthesis: { status: "done" },
    },
  },
}));

vi.mock("@/lib/research/session-cache", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/research/session-cache")>();
  return {
    ...original,
    listCachedSessions: vi.fn(() => [cachedSession]),
    deleteCachedSession: vi.fn(),
  };
});

describe("CachedSessionsList hydration", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("uses the same empty snapshot on the server and the first client render", async () => {
    const serverMarkup = renderToString(
      <CachedSessionsList refreshKey={0} onSelect={vi.fn()} onClear={vi.fn()} />,
    );
    expect(serverMarkup).toBe("");

    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.appendChild(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const root = hydrateRoot(
      container,
      <CachedSessionsList refreshKey={0} onSelect={vi.fn()} onClear={vi.fn()} />,
    );
    await act(async () => undefined);

    expect(container.querySelector("[data-testid='cached-sessions']")).not.toBeNull();
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match/i);

    await act(async () => root.unmount());
  });
});
