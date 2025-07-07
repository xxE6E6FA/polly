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

// Simple provider warmup cache - no class needed
const warmedUpProviders = new Set<AIProviderType>();

function createOptimizedFetch() {
  return (url: RequestInfo | URL, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      priority: "high" as RequestPriority,
      headers: {
        ...options?.headers,
        "Accept-Encoding": "gzip, deflate, br",
      },
    });
  };
}

function createLanguageModel(
  provider: AIProviderType,
  modelId: string,
  apiKey: string
): LanguageModel {
  const optimizedFetch = createOptimizedFetch();

  switch (provider) {
    case "openai":
      return createOpenAI({
        apiKey,
        fetch: optimizedFetch,
      })(modelId);

    case "anthropic":
      return createAnthropic({
        apiKey,
        fetch: optimizedFetch,
      })(modelId);

    case "google":
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        fetch: optimizedFetch,
      })(modelId);

    case "openrouter": {
      const openrouter = createOpenRouter({
        apiKey,
        fetch: optimizedFetch,
      });
      return openrouter.chat(modelId);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function warmUpProvider(provider: AIProviderType, apiKey: string) {
  if (warmedUpProviders.has(provider)) {
    return;
  }

  try {
    const warmUpEndpoints: Record<AIProviderType, string> = {
      google: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      openai: "https://api.openai.com/v1/models",
      anthropic: "https://api.anthropic.com/v1/models",
      openrouter: "https://openrouter.ai/api/v1/models",
    };

    const endpoint = warmUpEndpoints[provider];
    if (!endpoint) {
      return;
    }

    const headers: HeadersInit = {
      "Accept-Encoding": "gzip, deflate, br",
    };

    if (provider === "openai") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (provider === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (provider === "openrouter") {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["HTTP-Referer"] = window.location.origin;
      headers["X-Title"] = "Polly Chat";
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      keepalive: true,
      priority: "high" as RequestPriority,
    });

    if (response.ok || response.status === 401) {
      warmedUpProviders.add(provider);
    }
  } catch (_error) {
    // Silently ignore warm-up errors
  }
}

// Simplified streaming function using Anthropic native client
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
  const apiKey = apiKeys[provider];

  if (!apiKey) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  // Warm up provider if needed
  if (!warmedUpProviders.has(provider)) {
    await warmUpProvider(provider, apiKey);
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
      maxTokens: options?.maxTokens || 8192,
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

// Main streaming function - functional approach
export async function streamChat(
  request: ChatStreamRequest,
  abortController: AbortController = new AbortController()
): Promise<void> {
  const { model } = request;
  const provider = model.provider as AIProviderType;

  // Use Anthropic native client for reasoning models
  if (provider === "anthropic" && model.supportsReasoning) {
    await streamWithAnthropicNative(request, abortController);
  } else {
    await streamWithAISDK(request, abortController);
  }
}

// Simple utility for provider warmup
export function preWarmProvider(
  provider: AIProviderType,
  apiKey: string
): Promise<void> {
  return warmUpProvider(provider, apiKey);
}

// Legacy class wrapper for backward compatibility
export class ClientAIService {
  private currentAbortController: AbortController | null = null;

  async streamChat(request: ChatStreamRequest): Promise<void> {
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    try {
      await streamChat(request, abortController);
    } finally {
      this.currentAbortController = null;
    }
  }

  stopStreaming(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  static preWarmProvider(
    provider: AIProviderType,
    apiKey: string
  ): Promise<void> {
    return preWarmProvider(provider, apiKey);
  }
}
