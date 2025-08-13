/**
 * Browser-side AI streaming for private chats
 * Uses client-stored API keys and streams directly from browser to AI providers
 */
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { smoothStream, streamText } from "ai";
import type { APIKeys, ChatStreamRequest } from "@/types";

export async function streamChat(
  request: ChatStreamRequest,
  abortController: AbortController = new AbortController()
): Promise<void> {
  // biome-ignore lint/suspicious/noConsole: Debugging stream interruption
  console.log(
    "[browser-streaming] streamChat called with abortController:",
    abortController
  );
  const { model, apiKeys, messages, options, callbacks } = request;
  const provider = model.provider;
  const apiKey = apiKeys[provider as keyof APIKeys];

  if (!apiKey) {
    throw new Error(`No API key found for provider: ${provider}`);
  }

  // Add abort signal listener
  abortController.signal.addEventListener("abort", () => {
    // Signal received - abort processing will be handled by the stream loop
  });

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
      // provider-dependent extras (ignored by others)
      // We cast narrowly to the extended options interface
      topK: (options as { topK?: number } | undefined)?.topK,
      repetitionPenalty: (options as { repetitionPenalty?: number } | undefined)
        ?.repetitionPenalty,
      abortSignal: abortController.signal,
      ...reasoningOptions, // Merge reasoning-specific options
    };

    const result = streamText({
      ...streamOptions,
      // biome-ignore lint/style/useNamingConvention: AI SDK uses this naming
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
      }),
    });

    // biome-ignore lint/suspicious/noConsole: Debugging stream interruption
    console.log("[browser-streaming] Starting text stream processing");
    for await (const chunk of result.textStream) {
      if (abortController.signal.aborted) {
        // biome-ignore lint/suspicious/noConsole: Debugging stream interruption
        console.log(
          "[browser-streaming] Abort detected in stream loop, breaking"
        );
        break;
      }
      callbacks.onContent(chunk);
    }
    // biome-ignore lint/suspicious/noConsole: Debugging stream interruption
    console.log("[browser-streaming] Text stream processing completed");

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
    if (error instanceof Error && error.name === "AbortError") {
      // Stream was aborted - this is expected behavior
    }
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error(String(error)));
    }
    throw error;
  }
}
