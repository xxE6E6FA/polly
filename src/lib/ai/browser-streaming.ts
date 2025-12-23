/**
 * Browser-side AI streaming for private chats
 * Uses client-stored API keys and streams directly from browser to AI providers
 */
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { convertMessageForAI } from "@shared/message-conversion";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import {
  createReasoningChunkHandler,
  createSmoothStreamTransform,
  isAbortError,
  normalizeStreamingOptions,
} from "@shared/streaming-utils";
import { type ModelMessage, streamText } from "ai";
import type { APIKeys, ChatStreamRequest, StreamTokenUsage } from "@/types";

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

  abortController.signal.addEventListener("abort", () => {
    // Signal received - abort processing will be handled by the stream loop
  });

  try {
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

    const convertedMessages = messages.map(msg =>
      convertMessageForAI(msg)
    ) as ModelMessage[];

    // Normalize streaming options using shared utility
    const normalizedOptions = normalizeStreamingOptions({
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      topK: (options as { topK?: number } | undefined)?.topK,
      repetitionPenalty: (options as { repetitionPenalty?: number } | undefined)
        ?.repetitionPenalty,
    });

    // Track token usage from onFinish handler
    let capturedTokenUsage: StreamTokenUsage | undefined;
    let capturedFinishReason = "stop";

    const result = streamText({
      model: languageModel,
      messages: convertedMessages,
      ...normalizedOptions,
      ...reasoningOptions,
      abortSignal: abortController.signal,
      experimental_transform: createSmoothStreamTransform(),
      onChunk: createReasoningChunkHandler(callbacks.onReasoning),
      onFinish: ({ usage, finishReason }) => {
        capturedFinishReason = finishReason || "stop";
        if (usage) {
          capturedTokenUsage = {
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            totalTokens: usage.totalTokens ?? 0,
            // AI SDK v6: Use new detailed token fields, fallback to deprecated fields
            reasoningTokens:
              usage.outputTokenDetails?.reasoningTokens ??
              usage.reasoningTokens,
            cachedInputTokens:
              usage.inputTokenDetails?.cacheReadTokens ??
              usage.cachedInputTokens,
          };
        }
      },
      // AI SDK v6: Handle errors during streaming without crashing
      onError: ({ error }) => {
        console.error("Stream error in onError callback:", error);
      },
      // AI SDK v6: Handle stream abort for cleanup
      onAbort: () => {
        // Abort is handled via the for-await loop break
      },
    });

    let wasAborted = false;
    for await (const chunk of result.textStream) {
      if (abortController.signal.aborted) {
        wasAborted = true;
        break;
      }
      callbacks.onContent(chunk);
    }

    callbacks.onFinish(
      wasAborted ? "stop" : capturedFinishReason,
      capturedTokenUsage
    );
  } catch (error) {
    // Use shared abort error check
    if (isAbortError(error)) {
      callbacks.onFinish("stop");
      return;
    }
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error(String(error)));
    }
    throw error;
  }
}
