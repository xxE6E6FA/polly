import { describe, expect, test } from "bun:test";
import { createBasicLanguageModel } from "./ai-provider-factory";

describe("createBasicLanguageModel", () => {
  test("creates OpenAI model", () => {
    const model = createBasicLanguageModel("openai", "gpt-4o", "test-api-key");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o");
    expect(model.provider).toContain("openai");
  });

  test("creates Anthropic model", () => {
    const model = createBasicLanguageModel(
      "anthropic",
      "claude-3-5-sonnet-20241022",
      "test-api-key"
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("claude-3-5-sonnet-20241022");
    expect(model.provider).toContain("anthropic");
  });

  test("creates Google model", () => {
    const model = createBasicLanguageModel(
      "google",
      "gemini-2.0-flash-exp",
      "test-api-key"
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gemini-2.0-flash-exp");
    expect(model.provider).toContain("google");
  });

  test("creates Groq model", () => {
    const model = createBasicLanguageModel(
      "groq",
      "llama-3.3-70b-versatile",
      "test-api-key"
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("llama-3.3-70b-versatile");
    expect(model.provider).toContain("groq");
  });

  test("creates OpenRouter model", () => {
    const model = createBasicLanguageModel(
      "openrouter",
      "anthropic/claude-3.5-sonnet",
      "test-api-key"
    );
    expect(model).toBeDefined();
    expect(model.modelId).toBe("anthropic/claude-3.5-sonnet");
    expect(model.provider).toContain("openrouter");
  });

  test("throws error for unsupported provider", () => {
    expect(() =>
      createBasicLanguageModel("invalid-provider", "model", "key")
    ).toThrow("Unsupported provider: invalid-provider");
  });

  test("throws error for empty provider", () => {
    expect(() => createBasicLanguageModel("", "model", "key")).toThrow();
  });

  test("all models have required properties", () => {
    const providers = ["openai", "anthropic", "google", "groq", "openrouter"];
    const models = [
      "gpt-4o",
      "claude-3-5-sonnet-20241022",
      "gemini-2.0-flash-exp",
      "llama-3.3-70b-versatile",
      "anthropic/claude-3.5-sonnet",
    ];

    for (let i = 0; i < providers.length; i++) {
      const model = createBasicLanguageModel(
        providers[i],
        models[i],
        "test-key"
      );

      expect(model.modelId).toBeDefined();
      expect(model.provider).toBeDefined();
      expect(typeof model.doStream).toBe("function");
      expect(typeof model.doGenerate).toBe("function");
    }
  });
});
