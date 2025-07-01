import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { type LanguageModel } from "ai";

import {
  ClientStreamHandler,
  convertToCoreMessages,
  type StreamCallbacks,
} from "./client-stream-handler";
import { getUserFriendlyErrorMessage } from "./errors";
import { type APIKeys, type Attachment } from "@/types";
import {
  getProviderReasoningConfig,
  supportsReasoning,
} from "./provider-reasoning-config";
import {
  type ReasoningConfig as SharedReasoningConfig,
  type ProviderStreamOptions,
} from "../../../convex/lib/shared/reasoning_config";
import { AnthropicClient } from "./anthropic-client";

export type AIProvider = "openai" | "anthropic" | "google" | "openrouter";

export type StreamOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  enableWebSearch?: boolean;
  reasoningConfig?: SharedReasoningConfig;
};

export type ChatStreamRequest = {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: Attachment[];
  }>;
  model: string;
  provider: AIProvider;
  apiKeys: APIKeys;
  options?: StreamOptions;
  callbacks: StreamCallbacks;
};

function createLanguageModel(
  provider: AIProvider,
  model: string,
  apiKey: string,
  enableWebSearch?: boolean
): LanguageModel {
  const optimizedFetch = (url: RequestInfo | URL, options?: RequestInit) => {
    return fetch(url, {
      ...options,
      priority: "high" as RequestPriority,
      headers: {
        ...options?.headers,
        "Accept-Encoding": "gzip, deflate, br",
      },
    });
  };

  switch (provider) {
    case "openai":
      return createOpenAI({
        apiKey,
        fetch: optimizedFetch,
      })(model);

    case "anthropic":
      return createAnthropic({
        apiKey,
        fetch: optimizedFetch,
      })(model);

    case "google":
      return createGoogleGenerativeAI({
        apiKey,
        baseURL: "https://generativelanguage.googleapis.com/v1beta",
        fetch: optimizedFetch,
      })(model, {
        ...(enableWebSearch && { useSearchGrounding: true }),
      });

    case "openrouter": {
      const openrouter = createOpenRouter({
        apiKey,
        fetch: optimizedFetch,
      });
      let modifiedModel = model;
      if (enableWebSearch) {
        modifiedModel = `${model}:online`;
      }
      return openrouter.chat(modifiedModel);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function getProviderStreamOptions(
  provider: AIProvider,
  model: string,
  options?: StreamOptions
): ProviderStreamOptions {
  const { reasoningConfig } = options || {};
  return getProviderReasoningConfig(provider, model, reasoningConfig);
}

export class ClientAIService {
  private currentStreamHandler: ClientStreamHandler | null = null;
  private currentAbortController: AbortController | null = null;
  private static warmedUpProviders = new Set<AIProvider>();

  static preWarmProvider(provider: AIProvider, apiKey: string): Promise<void> {
    return this.warmUpProvider(provider, apiKey);
  }

  private static async warmUpProvider(provider: AIProvider, apiKey: string) {
    if (this.warmedUpProviders.has(provider)) return;

    try {
      const warmUpEndpoints: Record<AIProvider, string> = {
        google: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        openai: "https://api.openai.com/v1/models",
        anthropic: "https://api.anthropic.com/v1/models",
        openrouter: "https://openrouter.ai/api/v1/models",
      };

      const endpoint = warmUpEndpoints[provider];
      if (!endpoint) return;

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
        this.warmedUpProviders.add(provider);
      }
    } catch (_error) {
      // Silently ignore warm-up errors
    }
  }

  async streamChat(request: ChatStreamRequest): Promise<void> {
    const { messages, model, provider, apiKeys, options, callbacks } = request;

    const apiKey = apiKeys[provider];
    if (!apiKey) {
      throw new Error(`No API key configured for provider: ${provider}`);
    }

    if (provider === "anthropic" && supportsReasoning(provider, model)) {
      const anthropicClient = new AnthropicClient(apiKey);
      const abortController = new AbortController();
      this.currentAbortController = abortController;

      try {
        await anthropicClient.streamChat({
          messages,
          model,
          apiKey,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          topP: options?.topP,
          reasoningConfig: options?.reasoningConfig,
          abortSignal: abortController.signal,
          callbacks,
        });
        return;
      } catch (error) {
        const friendlyError = new Error(getUserFriendlyErrorMessage(error));
        callbacks.onError(friendlyError);
        throw friendlyError;
      } finally {
        this.currentAbortController = null;
      }
    }

    if (!ClientAIService.warmedUpProviders.has(provider)) {
      await ClientAIService.warmUpProvider(provider, apiKey);
    }

    const streamHandler = new ClientStreamHandler(callbacks);
    const abortController = new AbortController();
    streamHandler.setAbortController(abortController);
    this.currentAbortController = abortController;

    this.currentStreamHandler = streamHandler;

    try {
      const coreMessages = convertToCoreMessages(messages);

      const languageModel = createLanguageModel(
        provider,
        model,
        apiKey,
        options?.enableWebSearch
      );

      const providerOptions = getProviderStreamOptions(
        provider,
        model,
        options
      );

      const modelSupportsReasoning = supportsReasoning(provider, model);

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

      const streamPromise = modelSupportsReasoning
        ? streamHandler.processFullStream(result.fullStream).catch(error => {
            if (error instanceof Error && !error.name.includes("Abort")) {
              return streamHandler.processTextStream(result.textStream);
            } else {
              throw error;
            }
          })
        : streamHandler.processTextStream(result.textStream);

      await streamPromise;
    } catch (error) {
      const friendlyError = new Error(getUserFriendlyErrorMessage(error));
      callbacks.onError(friendlyError);
      throw friendlyError;
    } finally {
      this.currentStreamHandler = null;
      this.currentAbortController = null;
    }
  }

  stopStreaming(): void {
    if (this.currentStreamHandler) {
      this.currentStreamHandler.stop();
      this.currentStreamHandler = null;
    }
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }
}
