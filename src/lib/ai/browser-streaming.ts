/**
 * Browser-side AI streaming for private chats
 * Uses client-stored API keys and streams directly from browser to AI providers
 */
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { streamText } from "ai";
import type { APIKeys, ChatStreamRequest } from "@/types";

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
    // Get reasoning configuration for this provider
    const reasoningOptions = getProviderReasoningConfig(
      {
        modelId: model.modelId,
        provider: model.provider,
        supportsReasoning: model.supportsReasoning,
      },
      options?.reasoningConfig
    );

    const languageModel = createBasicLanguageModel(
      provider,
      model.modelId,
      apiKey
    );

    const streamOptions = {
      model: languageModel,
      messages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens || -1,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      abortSignal: abortController.signal,
      ...reasoningOptions, // Merge reasoning-specific options
    };

    const result = streamText(streamOptions);

    for await (const chunk of result.textStream) {
      callbacks.onContent(chunk);
    }

    // Handle reasoning if available (AI SDK native support)
    try {
      // @ts-expect-error - experimental_reasoningStream is not yet in the official type
      if (result.experimental_reasoningStream && callbacks.onReasoning) {
        // @ts-expect-error - experimental_reasoningStream is not yet in the official type
        for await (const reasoningChunk of result.experimental_reasoningStream) {
          callbacks.onReasoning(reasoningChunk);
        }
      }
    } catch (reasoningError) {
      console.warn("Failed to process reasoning:", reasoningError);
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
