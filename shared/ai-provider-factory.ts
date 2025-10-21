import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const createProviderModel = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  anthropic: (apiKey: string, model: string) =>
    createAnthropic({ apiKey })(model),
  google: (apiKey: string, model: string) =>
    createGoogleGenerativeAI({ apiKey })(model),
  groq: (apiKey: string, model: string) => createGroq({ apiKey })(model),
  openrouter: (apiKey: string, model: string) => {
    const provider = createOpenRouter({
      apiKey,
      headers: {
        "HTTP-Referer": "https://polly.ai", // Required for OpenRouter
        "X-Title": "Polly Chat", // Optional but good practice
      },
    });
    return provider(model);
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
