import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import type { APIKeys, ChatStreamRequest } from "@/types";

function createLanguageModel(
  provider: string,
  modelId: string,
  apiKey: string
) {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "openrouter":
      return createOpenRouter({ apiKey })(modelId);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export async function streamChat(
  request: ChatStreamRequest,
  abortController: AbortController = new AbortController()
): Promise<void> {
  const { model, apiKeys, messages, options, callbacks } = request;
  const provider = model.provider;
  const apiKey = apiKeys[provider as keyof APIKeys];

  if (!apiKey) {
    throw new Error(`No API key found for provider: ${provider}`);
  }

  try {
    const languageModel = createLanguageModel(provider, model.modelId, apiKey);

    const result = streamText({
      model: languageModel,
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens || -1,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      abortSignal: abortController.signal,
    });

    for await (const chunk of result.textStream) {
      callbacks.onContent(chunk);
    }

    callbacks.onFinish("stop");
  } catch (error) {
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error(String(error)));
    }
    throw error;
  }
}
