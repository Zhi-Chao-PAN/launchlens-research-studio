// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentCard } from "./AgentCard";

describe("AgentCard cancelled-session presentation", () => {
  it("shows unfinished agents as stopped and removes the running animation", () => {
    render(
      <AgentCard
        agentId="market-sizer"
        state={{
          status: "running",
          progress: 40,
          currentStep: "Gathering sources",
          degraded: false,
        }}
        cancelled
      />,
    );

    expect(screen.getByText("Stopped")).toBeTruthy();
    expect(screen.queryByText("Researching")).toBeNull();
    expect(screen.queryByText("Gathering sources")).toBeNull();
  });

  it("preserves completed agents when the enclosing session is cancelled", () => {
    render(
      <AgentCard
        agentId="market-sizer"
        state={{
          status: "done",
          progress: 100,
          currentStep: "Complete",
          degraded: false,
        }}
        cancelled
      />,
    );

    expect(screen.getByText("Complete")).toBeTruthy();
    expect(screen.queryByText("Stopped")).toBeNull();
  });
});
