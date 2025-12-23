import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createProviderModel = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  anthropic: (apiKey: string, model: string) =>
    createAnthropic({ apiKey })(model),
  google: (apiKey: string, model: string) =>
    createGoogleGenerativeAI({ apiKey })(model),
  groq: (apiKey: string, model: string) => createGroq({ apiKey })(model),
  openrouter: (apiKey: string, model: string) => {
    // Use OpenAI-compatible provider for OpenRouter (AI SDK v6 compatible)
    const provider = createOpenAICompatible({
      name: "openrouter",
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer": "https://polly.ai",
        "X-Title": "Polly Chat",
      },
    });
    return provider.chatModel(model);
  },
};

export function createBasicLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string
) {
  const factory =
    createProviderModel[provider as keyof typeof createProviderModel];
  if (!factory) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return factory(apiKey, modelId);
}
