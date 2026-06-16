/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { selectProvider } from "./provider-registry";
import { mockResearchProvider } from "./mock-provider-adapter";

describe("selectProvider", () => {
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    env = {} as NodeJS.ProcessEnv;
  });

  it("returns mock when no key set", () => {
    expect(selectProvider(env).id).toBe("mock");
  });

  it("returns mock when LAUNCHLENS_PROVIDER=mock even with keys", () => {
    env.LAUNCHLENS_PROVIDER = "mock";
    env.OPENAI_API_KEY = "sk-test";
    env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(selectProvider(env).id).toBe("mock");
  });

  it("auto-prefers Anthropic when ANTHROPIC_API_KEY is set", () => {
    env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(selectProvider(env).id).toBe("anthropic");
  });

  it("forces OpenAI when LAUNCHLENS_PROVIDER=openai even if Anthropic key is set", () => {
    env.LAUNCHLENS_PROVIDER = "openai";
    env.OPENAI_API_KEY = "sk-test";
    env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(selectProvider(env).id).toBe("openai");
  });

  it("forces Anthropic when LAUNCHLENS_PROVIDER=anthropic", () => {
    env.LAUNCHLENS_PROVIDER = "anthropic";
    env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(selectProvider(env).id).toBe("anthropic");
  });

  it("falls through to OpenAI when only OPENAI_API_KEY is set", () => {
    env.OPENAI_API_KEY = "sk-test";
    expect(selectProvider(env).id).toBe("openai");
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
