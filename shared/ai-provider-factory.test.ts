import { describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI:
    ({ apiKey }: any) =>
    (model: string) => ({ provider: "openai", apiKey, model }),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic:
    ({ apiKey }: any) =>
    (model: string) => ({ provider: "anthropic", apiKey, model }),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI:
    ({ apiKey }: any) =>
    (model: string) => ({ provider: "google", apiKey, model }),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq:
    ({ apiKey }: any) =>
    (model: string) => ({ provider: "groq", apiKey, model }),
}));

vi.mock("@openrouter/ai-sdk-provider", () => {
  let lastOptions: any;
  return {
    createOpenRouter: (opts: any) => {
      lastOptions = opts;
      return (model: string) => ({
        provider: "openrouter",
        apiKey: opts.apiKey,
        model,
        headers: opts.headers,
      });
    },
    getLastOptions: () => lastOptions,
  };
});

import * as OpenRouterMock from "@openrouter/ai-sdk-provider";
import {
  createBasicLanguageModel,
  createProviderModel,
} from "./ai-provider-factory";

describe("ai-provider-factory", () => {
  it("creates models for each supported provider", () => {
    const apiKey = "k";
    const model = "m";

    expect(createBasicLanguageModel("openai", model, apiKey)).toEqual({
      provider: "openai",
      apiKey,
      model,
    });
    expect(createBasicLanguageModel("anthropic", model, apiKey)).toEqual({
      provider: "anthropic",
      apiKey,
      model,
    });
    expect(createBasicLanguageModel("google", model, apiKey)).toEqual({
      provider: "google",
      apiKey,
      model,
    });
    expect(createBasicLanguageModel("groq", model, apiKey)).toEqual({
      provider: "groq",
      apiKey,
      model,
    });
    const openrouterModel = createBasicLanguageModel(
      "openrouter",
      model,
      apiKey
    ) as any;
    expect(openrouterModel).toMatchObject({
      provider: "openrouter",
      apiKey,
      model,
    });

    const opts = (OpenRouterMock as any).getLastOptions();
    expect(opts.apiKey).toBe(apiKey);
    // Ensure headers wired as intended
    expect(opts.headers["HTTP-Referer"]).toBe("https://polly.ai");
    expect(opts.headers["X-Title"]).toBe("Polly Chat");
  });

  it("throws on unsupported provider", () => {
    expect(() => createBasicLanguageModel("unknown", "m", "k")).toThrow(
      /Unsupported provider: unknown/
    );
  });

  it("exposes direct factory mapping", () => {
    const res = createProviderModel.openai("k", "m");
    expect(res).toEqual({ provider: "openai", apiKey: "k", model: "m" });
  });
});
