/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { selectProvider } from "./provider-registry";
import { mockResearchProvider } from "./mock-provider-adapter";

describe("selectProvider", () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    env = {} as NodeJS.ProcessEnv;
  });
  it("returns mock when no api key is set", () => {
    expect(selectProvider(env).id).toBe("mock");
    expect(selectProvider(env).isMock).toBe(true);
  });
  it("returns mock when LAUNCHLENS_PROVIDER=mock even with api key", () => {
    env.LAUNCHLENS_PROVIDER = "mock";
    env.OPENAI_API_KEY = "sk-test";
    expect(selectProvider(env).id).toBe("mock");
  });
  it("returns openai when api key is present", () => {
    env.OPENAI_API_KEY = "sk-test";
    const p = selectProvider(env);
    expect(p.id).toBe("openai");
    expect(p.isMock).toBe(false);
  });
  it("respects LAUNCHLENS_OPENAI_KEY as alias", () => {
    env.LAUNCHLENS_OPENAI_KEY = "sk-alt";
    expect(selectProvider(env).id).toBe("openai");
  });
  it("mock provider returns valid AgentOutput", async () => {
    const out = await mockResearchProvider.generate("market-sizer", {
      query: "AI tutor",
      keywords: ["education", "AI"],
    });
    expect(out.agent).toBe("market-sizer");
    expect(Array.isArray(out.citations)).toBe(true);
  });
});
