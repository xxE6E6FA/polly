/**
 * Browser-side AI streaming for private chats
 * Uses client-stored API keys and streams directly from browser to AI providers
 */
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { convertMessageForAI } from "@shared/message-conversion";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { type ModelMessage, smoothStream, streamText } from "ai";
import type { APIKeys, ChatStreamRequest } from "@/types";

function isReasoningDelta(chunk: {
  type?: string;
  text?: string;
}): chunk is { type: "reasoning-delta"; text: string } {
  return chunk.type === "reasoning-delta" && typeof chunk.text === "string";
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

    const streamOptions = {
      model: languageModel,
      messages: convertedMessages,
      temperature: options?.temperature,
      maxOutputTokens: options?.maxTokens || -1,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      topK: (options as { topK?: number } | undefined)?.topK,
      repetitionPenalty: (options as { repetitionPenalty?: number } | undefined)
        ?.repetitionPenalty,
      abortSignal: abortController.signal,
      ...reasoningOptions,
    };

    const result = streamText({
      ...streamOptions,
      // biome-ignore lint/style/useNamingConvention: AI SDK property
      experimental_transform: smoothStream({
        delayInMs: 8,
        chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
      }),
      onChunk: ({ chunk }) => {
        if (callbacks.onReasoning && isReasoningDelta(chunk)) {
          callbacks.onReasoning(chunk.text);
        }
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

    callbacks.onFinish(wasAborted ? "stop" : "stop");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
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
