import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { type LanguageModel, streamText } from "ai";
import type { AIProviderType, ChatStreamRequest } from "@/types";
import { AnthropicClient } from "./anthropic-client";
import {
  ClientStreamHandler,
  convertToCoreMessages,
} from "./client-stream-handler";
import { getUserFriendlyErrorMessage } from "./errors";

export type { AIProviderType };

function createLanguageModel(
  provider: AIProviderType,
  modelId: string,
  apiKey: string
): LanguageModel {
  // Provider is already mapped by the time it reaches here
  // No need for additional Polly mapping

  switch (provider) {
    case "openai":
      return createOpenAI({
        apiKey,
      })(modelId);

    case "anthropic":
      return createAnthropic({
        apiKey,
      })(modelId);

    case "google":
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
      })(modelId);

    case "openrouter": {
      const openrouter = createOpenRouter({
        apiKey,
      });
      return openrouter.chat(modelId);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function streamWithAnthropicNative(
  request: ChatStreamRequest,
  abortController: AbortController
): Promise<void> {
  const { messages, model, apiKeys, options, callbacks } = request;
  const apiKey = apiKeys.anthropic;

  if (!apiKey) {
    throw new Error("No API key configured for Anthropic");
  }

  const anthropicClient = new AnthropicClient(apiKey);

  try {
    await anthropicClient.streamChat({
      messages,
      model: model.modelId,
      apiKey,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      topP: options?.topP,
      reasoningConfig: options?.reasoningConfig,
      abortSignal: abortController.signal,
      callbacks,
    });
  } catch (error) {
    const friendlyError = new Error(getUserFriendlyErrorMessage(error));
    callbacks.onError(friendlyError);
    throw friendlyError;
  }
}

// Simplified streaming function using AI SDK
async function streamWithAISDK(
  request: ChatStreamRequest,
  abortController: AbortController
): Promise<void> {
  const { messages, model, apiKeys, options, callbacks } = request;
  const provider = model.provider as AIProviderType;

  // Provider is already mapped by the time it reaches here
  const apiKey = apiKeys[provider];

  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  const streamHandler = new ClientStreamHandler(callbacks);
  streamHandler.setAbortController(abortController);

  try {
    const coreMessages = convertToCoreMessages(messages);
    const languageModel = createLanguageModel(provider, model.modelId, apiKey);

    const providerOptions = getProviderReasoningConfig(
      {
        modelId: model.modelId,
        provider: model.provider,
        supportsReasoning: model.supportsReasoning,
      },
      options?.reasoningConfig
    );

    const result = streamText({
      model: languageModel,
      messages: coreMessages,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens || -1,
      topP: options?.topP,
      frequencyPenalty: options?.frequencyPenalty,
      presencePenalty: options?.presencePenalty,
      abortSignal: abortController.signal,
      providerOptions,
      onFinish: ({ text, finishReason, reasoning, providerMetadata }) => {
        streamHandler.handleFinish(
          text,
          finishReason,
          reasoning,
          providerMetadata
        );
      },
    });

    const streamPromise = model.supportsReasoning
      ? streamHandler.processFullStream(result.fullStream).catch(error => {
          if (error instanceof Error && !error.name.includes("Abort")) {
            return streamHandler.processTextStream(result.textStream);
          }
          throw error;
        })
      : streamHandler.processTextStream(result.textStream);

    await streamPromise;
  } catch (error) {
    const friendlyError = new Error(getUserFriendlyErrorMessage(error));
    callbacks.onError(friendlyError);
    throw friendlyError;
  }
}

export async function streamChat(
  request: ChatStreamRequest,
  abortController: AbortController = new AbortController()
): Promise<void> {
  const { model } = request;
  const provider = model.provider as AIProviderType;

  // Provider is already mapped by the time it reaches here
  // No need for additional Polly mapping

  // Use Anthropic native client for reasoning models
  if (
    provider === "anthropic" &&
    AnthropicClient.supportsNativeReasoning(model.modelId)
  ) {
    await streamWithAnthropicNative(request, abortController);
  } else {
    await streamWithAISDK(request, abortController);
  }
}
