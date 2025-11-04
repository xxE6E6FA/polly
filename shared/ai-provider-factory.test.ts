import { describe, expect, mock, test } from "bun:test";

const createMockModel = (
  providerString: string,
  modelId: string,
  apiKey: string
) => ({
  modelId,
  config: {
    provider: providerString,
    fetch: undefined,
    fileIdPrefixes: ["file-"],
    headers: () => ({}),
    url: () => "",
  },
  specificationVersion: "v2",
  supportedUrls: {
    "application/pdf": [/^https?:\/\/.*$/],
    "image/*": [/^https?:\/\/.*$/],
  },
});

mock.module("@ai-sdk/openai", () => ({
  createOpenAI:
    ({ apiKey }: any) =>
    (model: string) =>
      createMockModel("openai.responses", model, apiKey),
}));

mock.module("@ai-sdk/anthropic", () => ({
  createAnthropic:
    ({ apiKey }: any) =>
    (model: string) =>
      createMockModel("anthropic.messages", model, apiKey),
}));

mock.module("@ai-sdk/google", () => ({
  createGoogleGenerativeAI:
    ({ apiKey }: any) =>
    (model: string) =>
      createMockModel("google.generative-ai", model, apiKey),
}));

mock.module("@ai-sdk/groq", () => ({
  createGroq:
    ({ apiKey }: any) =>
    (model: string) =>
      createMockModel("groq.chat", model, apiKey),
}));

mock.module("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: (opts: any) => {
    return (model: string) =>
      createMockModel("openrouter.chat", model, opts.apiKey);
  },
}));

import {
  createBasicLanguageModel,
  createProviderModel,
} from "./ai-provider-factory";

describe("ai-provider-factory", () => {
  test("creates models for each supported provider", () => {
    const apiKey = "k";
    const model = "m";

    const openaiModel = createBasicLanguageModel(
      "openai",
      model,
      apiKey
    ) as any;
    expect(openaiModel.modelId).toBe(model);
    expect(openaiModel.config.provider).toBe("openai.responses");
    expect(openaiModel.specificationVersion).toBe("v2");

    const anthropicModel = createBasicLanguageModel(
      "anthropic",
      model,
      apiKey
    ) as any;
    expect(anthropicModel.modelId).toBe(model);
    expect(anthropicModel.config.provider).toBe("anthropic.messages");
    expect(anthropicModel.specificationVersion).toBe("v2");

    const googleModel = createBasicLanguageModel(
      "google",
      model,
      apiKey
    ) as any;
    expect(googleModel.modelId).toBe(model);
    expect(googleModel.config.provider).toBe("google.generative-ai");
    expect(googleModel.specificationVersion).toBe("v2");

    const groqModel = createBasicLanguageModel("groq", model, apiKey) as any;
    expect(groqModel.modelId).toBe(model);
    expect(groqModel.config.provider).toBe("groq.chat");
    expect(groqModel.specificationVersion).toBe("v2");

    const openrouterModel = createBasicLanguageModel(
      "openrouter",
      model,
      apiKey
    ) as any;
    expect(openrouterModel.modelId).toBe(model);
    expect(openrouterModel.config.provider).toBe("openrouter.chat");
    expect(openrouterModel.specificationVersion).toBe("v2");
  });

  test("throws on unsupported provider", () => {
    expect(() => createBasicLanguageModel("unknown", "m", "k")).toThrow(
      /Unsupported provider: unknown/
    );
  });

  test("exposes direct factory mapping", () => {
    const res = createProviderModel.openai("k", "m") as any;
    expect(res.modelId).toBe("m");
    expect(res.config.provider).toBe("openai.responses");
  });
});
