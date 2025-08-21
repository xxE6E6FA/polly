/**
 * Browser-side AI streaming for private chats
 * Uses client-stored API keys and streams directly from browser to AI providers
 */
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { type CoreMessage, smoothStream, streamText } from "ai";
import type { APIKeys, Attachment, ChatStreamRequest } from "@/types";

/**
 * Converts Attachment objects to AI SDK compatible format
 */
function convertAttachmentsForAI(
  attachments: Attachment[] | undefined
): Array<{ type: string; data?: string; text?: string }> {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments.map(attachment => {
    switch (attachment.type) {
      case "image": {
        if (!attachment.content) {
          throw new Error(`Image attachment ${attachment.name} has no content`);
        }
        // Convert base64 to data URL format expected by AI SDK
        const mimeType = attachment.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${attachment.content}`;
        return {
          type: "image",
          data: dataUrl,
        };
      }

      case "text":
        if (!attachment.content) {
          throw new Error(`Text attachment ${attachment.name} has no content`);
        }
        return {
          type: "text",
          text: attachment.content,
        };

      case "pdf": {
        // For PDFs, use extracted text if available, otherwise use the base64 content
        const pdfText = attachment.extractedText || attachment.content;
        if (!pdfText) {
          throw new Error(`PDF attachment ${attachment.name} has no content`);
        }
        return {
          type: "text",
          text: pdfText,
        };
      }

      default:
        throw new Error(`Unsupported attachment type: ${attachment.type}`);
    }
  });
}

/**
 * Converts message with attachments to AI SDK message format
 */
function convertMessageForAI(message: {
  role: string;
  content: string;
  attachments?: Attachment[];
}) {
  const attachments = convertAttachmentsForAI(message.attachments);

  if (attachments.length === 0) {
    // No attachments, return simple text message
    return {
      role: message.role,
      content: message.content,
    };
  }

  // Combine text content with attachments
  const contentParts: Array<
    string | { type: string; data?: string; text?: string }
  > = [];

  // Add text content if present
  if (message.content.trim()) {
    contentParts.push(message.content);
  }

  // Add attachments
  contentParts.push(...attachments);

  return {
    role: message.role,
    content: contentParts,
  };
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

    // Convert messages to AI SDK format with proper attachment handling
    const convertedMessages = messages.map(msg =>
      convertMessageForAI(msg)
    ) as CoreMessage[];

    const streamOptions = {
      model: languageModel,
      messages: convertedMessages,
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
      ...reasoningOptions, // Merge reasoning-specific options (includes groq providerOptions when applicable)
    };

    const result = streamText({
      ...streamOptions,
      // biome-ignore lint/style/useNamingConvention: AI SDK uses this naming
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
      }),
      // Stream reasoning deltas concurrently with text
      onChunk: ({ chunk }) => {
        // Reasoning deltas arrive with type "reasoning" in the AI SDK
        if (
          callbacks.onReasoning &&
          (chunk as { type?: string }).type === "reasoning" &&
          (chunk as { textDelta?: string }).textDelta
        ) {
          callbacks.onReasoning((chunk as { textDelta: string }).textDelta);
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

    // Reasoning is handled live via onChunk above

    // Always call onFinish to ensure the message metadata is updated
    callbacks.onFinish(wasAborted ? "stop" : "stop");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // Stream was aborted - this is expected behavior
      // Still call onFinish to mark the message as stopped
      callbacks.onFinish("stop");
      return; // Don't throw for abort errors
    }
    if (error instanceof Error) {
      callbacks.onError(error);
    } else {
      callbacks.onError(new Error(String(error)));
    }
    throw error;
  }
}
