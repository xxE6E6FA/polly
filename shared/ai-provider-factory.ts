import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

export const createProviderModel = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  anthropic: (apiKey: string, model: string) => createAnthropic({ apiKey })(model),
  google: (apiKey: string, model: string) => createGoogleGenerativeAI({ apiKey })(model),
  openrouter: (apiKey: string, model: string) => createOpenRouter({ apiKey })(model),
};

export function createBasicLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string
) {
  const factory = createProviderModel[provider as keyof typeof createProviderModel];
  if (!factory) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return factory(apiKey, modelId);
}
