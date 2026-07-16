import { describe, expect, it } from "vitest";
import {
  MINIMAX_DEFAULT_MODEL,
  openAICompatibleRequestOptions,
  resolveOpenAICompatibleEndpointProfile,
} from "./openai-compatible-profile";

describe("OpenAI-compatible endpoint profiles", () => {
  it("recognizes official MiniMax API hosts", () => {
    expect(MINIMAX_DEFAULT_MODEL).toBe("MiniMax-M3");
    expect(resolveOpenAICompatibleEndpointProfile("https://api.minimaxi.com/v1").id)
      .toBe("minimax");
    expect(resolveOpenAICompatibleEndpointProfile("https://api.minimax.io/v1").id)
      .toBe("minimax");
  });

  it("preserves the generic Ark and DeepSeek request contract", () => {
    for (const baseUrl of [
      "https://ark.cn-beijing.volces.com/api/plan/v3",
      "https://api.deepseek.com",
    ]) {
      expect(openAICompatibleRequestOptions(baseUrl, {
        temperature: 0,
        maxOutputTokens: 64,
        jsonObject: true,
      })).toEqual({
        temperature: 0,
        max_tokens: 64,
        response_format: { type: "json_object" },
      });
    }
  });
});
