/**
 * Private chat hook using AI SDK v5 directly
 * Manages message state and streaming outside of Convex
 */

import type { Id } from "@convex/_generated/dataModel";
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { createSmoothStreamTransform } from "@shared/streaming-utils";
import { type ModelMessage, streamText } from "ai";
import { useCallback, useRef, useState } from "react";
import { usePrivateApiKeys } from "@/lib/ai/private-api-keys";
import { convertChatMessagesToCoreMessages } from "@/lib/ai/private-message-utils";
import type { Attachment, ChatMessage, ReasoningConfig } from "@/types";

type MessageStatus = "idle" | "submitted" | "streaming" | "error";

type PrivateChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  reasoning?: string;
  createdAt: number;
  status?: "thinking" | "streaming" | "done" | "error";
  model?: string;
  provider?: string;
};

function isReasoningDelta(chunk: {
  type?: string;
  text?: string;
}): chunk is { type: "reasoning-delta"; text: string } {
  return chunk.type === "reasoning-delta" && typeof chunk.text === "string";
}

export function usePrivateChat(options?: {
  modelId?: string;
  provider?: string;
  supportsReasoning?: boolean;
  personaId?: Id<"personas"> | null;
  systemPrompt?: string;
  temperature?: number;
  reasoningConfig?: ReasoningConfig;
}) {
  const [messages, setMessages] = useState<PrivateChatMessage[]>([]);
  const [status, setStatus] = useState<MessageStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reasoningRef = useRef<string>("");

  const { getApiKey } = usePrivateApiKeys();

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus("idle");
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Attachment[],
      overrides?: {
        modelId?: string;
        provider?: string;
        personaId?: Id<"personas"> | null;
        systemPrompt?: string;
        temperature?: number;
        reasoningConfig?: ReasoningConfig;
      }
    ) => {
      const effectiveModelId = overrides?.modelId || options?.modelId;
      const effectiveProvider = overrides?.provider || options?.provider;
      const effectiveSystemPrompt =
        overrides?.systemPrompt || options?.systemPrompt;
      const effectiveTemperature =
        overrides?.temperature ?? options?.temperature;
      const effectiveReasoningConfig =
        overrides?.reasoningConfig || options?.reasoningConfig;

      if (!(effectiveModelId && effectiveProvider)) {
        throw new Error("Model ID and provider are required");
      }

      const apiKey = await getApiKey(
        effectiveProvider as
          | "openai"
          | "anthropic"
          | "google"
          | "groq"
          | "openrouter"
          | "replicate"
          | "elevenlabs",
        effectiveModelId
      );

      if (!apiKey) {
        throw new Error(`No API key found for provider: ${effectiveProvider}`);
      }

      abortControllerRef.current = new AbortController();
      reasoningRef.current = "";

      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;

      const userMessage: PrivateChatMessage = {
        id: userMessageId,
        role: "user",
        content,
        attachments,
        createdAt: Date.now(),
      };

      const assistantMessage: PrivateChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        reasoning: undefined,
        createdAt: Date.now(),
        status: "thinking",
        model: effectiveModelId,
        provider: effectiveProvider,
      };

      setMessages(prev => [...prev, userMessage, assistantMessage]);
      setStatus("submitted");

      try {
        const languageModel = createBasicLanguageModel(
          effectiveProvider,
          effectiveModelId,
          apiKey
        );

        const currentMessages = [...messages, userMessage];
        const chatMessagesForConversion: ChatMessage[] = currentMessages
          .filter(msg => msg.role !== "system")
          .map(msg => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            attachments: msg.attachments,
            createdAt: msg.createdAt,
            status: msg.status,
            reasoning: msg.reasoning,
            model: msg.model,
            provider: msg.provider,
            conversationId: "private" as Id<"conversations">,
            userId: "anonymous" as Id<"users">,
            isMainBranch: true,
            citations: [],
            metadata: {
              finishReason: "stop",
            },
          }));

        const coreMessages: ModelMessage[] = convertChatMessagesToCoreMessages(
          chatMessagesForConversion,
          effectiveSystemPrompt
        );

        const reasoningOptions = getProviderReasoningConfig(
          {
            modelId: effectiveModelId,
            provider: effectiveProvider,
            supportsReasoning: options?.supportsReasoning ?? false,
          },
          effectiveReasoningConfig
        );

        const streamOptions = {
          model: languageModel,
          messages: coreMessages,
          temperature: effectiveTemperature,
          abortSignal: abortControllerRef.current.signal,
          ...reasoningOptions,
        };

        const result = streamText({
          ...streamOptions,
          experimental_transform: createSmoothStreamTransform(),
          onChunk: ({ chunk }) => {
            if (isReasoningDelta(chunk)) {
              reasoningRef.current += chunk.text;
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? {
                        ...msg,
                        reasoning: reasoningRef.current,
                        status: "streaming",
                      }
                    : msg
                )
              );
            }
          },
        });

        setStatus("streaming");

        let fullContent = "";
        for await (const chunk of result.textStream) {
          if (abortControllerRef.current.signal.aborted) {
            break;
          }

          fullContent += chunk;
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: fullContent,
                    reasoning: reasoningRef.current || undefined,
                    status: "streaming",
                  }
                : msg
            )
          );
        }

        if (!abortControllerRef.current.signal.aborted) {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: fullContent,
                    reasoning: reasoningRef.current || undefined,
                    status: "done",
                  }
                : msg
            )
          );
          setStatus("idle");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus("idle");
          return;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus("error");

        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  status: "error",
                }
              : msg
          )
        );
      } finally {
        abortControllerRef.current = null;
      }
    },
    [messages, options, getApiKey]
  );

  const regenerate = useCallback(
    async (overrides?: {
      modelId?: string;
      provider?: string;
      personaId?: Id<"personas"> | null;
      systemPrompt?: string;
      temperature?: number;
      reasoningConfig?: ReasoningConfig;
    }) => {
      if (messages.length === 0) {
        return;
      }

      let lastUserMessageIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === "user") {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex === -1) {
        return;
      }

      const messagesToKeep = messages.slice(0, lastUserMessageIndex + 1);
      setMessages(messagesToKeep);

      const lastUserMessage = messagesToKeep[lastUserMessageIndex];
      if (!lastUserMessage) {
        return;
      }
      await sendMessage(
        lastUserMessage.content,
        lastUserMessage.attachments,
        overrides
      );
    },
    [messages, sendMessage]
  );

  const setMessagesState = useCallback((newMessages: PrivateChatMessage[]) => {
    setMessages(newMessages);
  }, []);

  return {
    messages,
    sendMessage,
    stop,
    status,
    error,
    regenerate,
    setMessages: setMessagesState,
  };
}
