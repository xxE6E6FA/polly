import { v } from "convex/values";
import { action, ActionCtx } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { streamText, CoreMessage, LanguageModel } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { humanizeString } from "humanize-ai-lib";

// Helper types
type StreamMessage = {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<{
        type: "text" | "image_url" | "file";
        text?: string;
        image_url?: { url: string };
        file?: { filename: string; file_data: string };
        attachment?: {
          storageId: Id<"_storage">;
          type: string;
          name: string;
        };
      }>;
};

type Citation = {
  type: "url_citation";
  url: string;
  title: string;
  cited_text?: string;
  snippet?: string;
};

type ProviderType = "openai" | "anthropic" | "google" | "openrouter";

// Constants
const STREAM_CONFIG = {
  BATCH_SIZE: 50,
  BATCH_TIMEOUT: 100,
  CHECK_STOP_EVERY_N_CHUNKS: 3,
} as const;

const AES_CONFIG = {
  name: "AES-GCM",
  length: 256,
} as const;

const MIME_TYPES = {
  pdf: "application/pdf",
  text: "text/plain",
  default: "application/octet-stream",
} as const;

// Helper to humanize text
const humanizeText = (text: string): string => {
  const result = humanizeString(text, {
    transformHidden: true,
    transformTrailingWhitespace: true,
    transformNbs: true,
    transformDashes: true,
    transformQuotes: true,
    transformOther: true,
    keyboardOnly: false,
  });
  return result.count > 0 ? result.text : text;
};

// Helper functions
const updateMessage = async (
  ctx: ActionCtx,
  messageId: Id<"messages">,
  updates: {
    content?: string;
    reasoning?: string;
    finishReason?: string;
    citations?: Citation[];
  }
) => {
  // Get current message to preserve existing metadata
  const currentMessage = await ctx.runQuery(api.messages.getById, {
    id: messageId,
  });

  // Merge metadata to preserve existing fields like stopped
  const metadata = updates.finishReason
    ? {
        ...(currentMessage?.metadata || {}),
        finishReason: updates.finishReason,
      }
    : currentMessage?.metadata;

  await ctx.runMutation(internal.messages.internalUpdate, {
    id: messageId,
    content: updates.content,
    reasoning: updates.reasoning || undefined,
    metadata: metadata,
    citations: updates.citations?.length ? updates.citations : undefined,
  });
};

const clearConversationStreaming = async (
  ctx: ActionCtx,
  messageId: Id<"messages">
) => {
  const message = await ctx.runMutation(internal.messages.internalGetById, {
    id: messageId,
  });

  if (message?.conversationId) {
    await ctx.runMutation(api.conversations.setStreamingState, {
      id: message.conversationId,
      isStreaming: false,
    });
  }
};

// Generic storage to data converter
const convertStorageToData = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  errorContext: string
): Promise<{ blob: Blob; arrayBuffer: ArrayBuffer; base64: string }> => {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    console.error(`${errorContext}: File not found in storage:`, storageId);
    throw new Error("File not found in storage");
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binaryString);

  return { blob, arrayBuffer, base64 };
};

// Helper to convert Convex storage attachments to data URLs
const convertConvexImageToDataUrl = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string }
): Promise<string> => {
  try {
    console.log("Converting Convex image to data URL:", attachment);
    const { blob, base64 } = await convertStorageToData(
      ctx,
      attachment.storageId,
      "Converting image"
    );
    const mimeType = blob.type || "image/jpeg";
    console.log("Successfully converted image, MIME type:", mimeType);
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Error converting Convex image to data URL:", error);
    throw error;
  }
};

// Helper to convert Convex storage files to AI SDK file format
const convertConvexFileToAISDKFormat = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string; name: string }
): Promise<{ data: ArrayBuffer; mimeType: string }> => {
  try {
    console.log("Converting Convex file to AI SDK format:", attachment);
    const { blob, arrayBuffer } = await convertStorageToData(
      ctx,
      attachment.storageId,
      "Converting file"
    );
    const mimeType =
      blob.type ||
      MIME_TYPES[attachment.type as keyof typeof MIME_TYPES] ||
      MIME_TYPES.default;
    console.log("Successfully converted file, MIME type:", mimeType);
    return { data: arrayBuffer, mimeType };
  } catch (error) {
    console.error("Error converting Convex file to AI SDK format:", error);
    throw error;
  }
};

// Convert message part to AI SDK format
const convertMessagePart = async (
  ctx: ActionCtx,
  part: any,
  provider: string
) => {
  if (part.type === "text") {
    return { type: "text" as const, text: part.text || "" };
  }

  if (part.type === "image_url" && part.image_url) {
    // Handle Convex storage attachments for all providers
    if (part.attachment?.storageId) {
      try {
        console.log(
          `Converting Convex storage attachment to base64 for ${provider}:`,
          part.attachment
        );
        const dataUrl = await convertConvexImageToDataUrl(ctx, part.attachment);
        return { type: "image" as const, image: dataUrl };
      } catch (error) {
        console.error(
          "Failed to convert Convex attachment, falling back to URL:",
          error
        );
        return { type: "image" as const, image: part.image_url.url };
      }
    }
    console.log(`Using image URL directly for provider ${provider}`);
    return { type: "image" as const, image: part.image_url.url };
  }

  if (part.type === "file" && part.file) {
    // Check if this is a Convex storage attachment for PDF and provider supports it
    if (
      part.attachment?.storageId &&
      part.attachment.type === "pdf" &&
      (provider === "anthropic" || provider === "google")
    ) {
      try {
        console.log(
          `Converting Convex PDF to AI SDK format for ${provider}:`,
          part.attachment
        );
        const { data, mimeType } = await convertConvexFileToAISDKFormat(
          ctx,
          part.attachment
        );
        return { type: "file" as const, data, mimeType };
      } catch (error) {
        console.error(
          "Failed to convert Convex PDF, falling back to text:",
          error
        );
      }
    }
    // Fallback to text format
    return {
      type: "text" as const,
      text: `File: ${part.file.filename}\n${part.file.file_data}`,
    };
  }

  return { type: "text" as const, text: "" };
};

// Convert our message format to AI SDK format
const convertMessages = async (
  ctx: ActionCtx,
  messages: StreamMessage[],
  provider: string
): Promise<CoreMessage[]> => {
  return Promise.all(
    messages.map(async (msg): Promise<CoreMessage> => {
      if (typeof msg.content === "string") {
        return {
          role: msg.role,
          content: msg.content,
        } as CoreMessage;
      }

      // Handle multi-modal content
      const parts = await Promise.all(
        msg.content.map(part => convertMessagePart(ctx, part, provider))
      );

      return {
        role: msg.role,
        content: parts,
      } as CoreMessage;
    })
  );
};

// Decrypt API key helper
const serverDecryptApiKey = async (
  encryptedKey: number[],
  initializationVector: number[]
): Promise<string> => {
  const encryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET;
  if (!encryptionSecret) {
    throw new Error(
      "API_KEY_ENCRYPTION_SECRET environment variable is required"
    );
  }

  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(encryptionSecret);
  const hash = await crypto.subtle.digest("SHA-256", keyMaterial);
  const key = await crypto.subtle.importKey("raw", hash, AES_CONFIG, false, [
    "encrypt",
    "decrypt",
  ]);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(initializationVector) },
    key,
    new Uint8Array(encryptedKey)
  );

  return new TextDecoder().decode(decrypted);
};

// Get environment API key
const getEnvironmentApiKey = (provider: string): string | null => {
  const keyMap: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GEMINI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };
  return keyMap[provider] || null;
};

// Get API key for user or environment
const getApiKey = async (
  ctx: ActionCtx,
  provider: ProviderType,
  userId?: Id<"users">
): Promise<string> => {
  if (userId) {
    // Authenticated user - get their API key directly
    const apiKeyRecord = await ctx.runQuery(
      internal.apiKeys.getEncryptedApiKeyData,
      { userId, provider }
    );

    if (apiKeyRecord?.encryptedKey && apiKeyRecord?.initializationVector) {
      return serverDecryptApiKey(
        apiKeyRecord.encryptedKey,
        apiKeyRecord.initializationVector
      );
    }
  }

  // Fall back to environment variable
  const envKey = getEnvironmentApiKey(provider);
  if (envKey) {
    return envKey;
  }

  // Throw appropriate error
  if (userId) {
    throw new Error(
      `No API key found for ${provider}. Please add an API key in Settings.`
    );
  } else {
    throw new Error(
      `Authentication required. Please sign in to use ${provider} models.`
    );
  }
};

// Apply OpenRouter sorting shortcuts
const applyOpenRouterSorting = (
  modelId: string,
  sorting: "default" | "price" | "throughput" | "latency"
): string => {
  if (sorting === "default") {
    return modelId;
  }

  // Remove any existing shortcuts
  const cleanModelId = modelId.replace(/:nitro$|:floor$/g, "");

  // Apply new shortcut
  const sortingMap = {
    price: ":floor",
    throughput: ":nitro",
    latency: "",
  };

  return `${cleanModelId}${sortingMap[sorting] || ""}`;
};

// Create language model based on provider
const createLanguageModel = async (
  ctx: ActionCtx,
  provider: ProviderType,
  model: string,
  apiKey: string,
  userId?: Id<"users">,
  enableWebSearch?: boolean
): Promise<LanguageModel> => {
  const providerFactories = {
    openai: () => createOpenAI({ apiKey })(model),
    anthropic: () => createAnthropic({ apiKey })(model),
    google: () => createGoogleGenerativeAI({ apiKey })(model),
    openrouter: async () => {
      const openrouter = createOpenRouter({ apiKey });

      // Get user's OpenRouter sorting preference
      let sorting: "default" | "price" | "throughput" | "latency" = "default";
      if (userId) {
        try {
          const userSettings = await ctx.runQuery(
            api.userSettings.getUserSettings,
            {
              userId,
            }
          );
          sorting = userSettings?.openRouterSorting ?? "default";
        } catch (error) {
          console.warn(
            "Failed to get user settings for OpenRouter sorting:",
            error
          );
        }
      }

      // Apply OpenRouter sorting shortcuts
      let modifiedModel = applyOpenRouterSorting(model, sorting);

      // Add web search if enabled
      if (enableWebSearch) {
        modifiedModel = `${modifiedModel}:online`;
      }

      return openrouter.chat(modifiedModel);
    },
  };

  const factory = providerFactories[provider];
  if (!factory) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return factory();
};

// Check if model supports reasoning
const isReasoningModel = (provider: string, model: string): boolean => {
  return (
    (provider === "google" && model.includes("gemini-2.5")) ||
    (provider === "anthropic" &&
      (model.includes("claude-opus-4") ||
        model.includes("claude-sonnet-4") ||
        model.includes("claude-3-7-sonnet")))
  );
};

// Extract reasoning from text
const extractReasoning = (text: string): string => {
  const reasoningPatterns = [
    /<thinking>([\s\S]*?)<\/thinking>/,
    /<reasoning>([\s\S]*?)<\/reasoning>/,
    /^Thinking:\s*([\s\S]*?)(?:\n\n|$)/,
    /\[Reasoning\]([\s\S]*?)\[\/Reasoning\]/i,
  ];

  for (const pattern of reasoningPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  return "";
};

// Extract citations from provider metadata
const extractCitations = (providerMetadata: any): Citation[] | undefined => {
  // Handle OpenRouter citations
  const openrouterCitations = providerMetadata?.openrouter?.citations;
  if (openrouterCitations) {
    return openrouterCitations.map((c: any) => ({
      type: "url_citation" as const,
      url: c.url,
      title: c.title || "Web Source",
      cited_text: c.text,
      snippet: c.snippet,
    }));
  }

  // Handle Google search grounding citations
  const googleChunks = providerMetadata?.google?.groundingChunks;
  if (googleChunks) {
    return googleChunks.map((chunk: any) => ({
      type: "url_citation" as const,
      url: chunk.web?.uri || "",
      title: chunk.web?.title || "Web Source",
      snippet: chunk.content,
    }));
  }

  return undefined;
};

// Stream content handler
class StreamHandler {
  private contentBuffer = "";
  private lastUpdate = Date.now();
  private chunkCounter = 0;
  private wasStopped = false;
  private abortController?: AbortController;

  constructor(
    private ctx: ActionCtx,
    private messageId: Id<"messages">
  ) {}

  setAbortController(abortController: AbortController) {
    this.abortController = abortController;
  }

  async checkIfStopped(): Promise<boolean> {
    this.chunkCounter++;
    if (this.chunkCounter % STREAM_CONFIG.CHECK_STOP_EVERY_N_CHUNKS === 0) {
      const message = await this.ctx.runQuery(api.messages.getById, {
        id: this.messageId,
      });
      if (message?.metadata?.stopped) {
        this.wasStopped = true;
        this.abortController?.abort();
        return true;
      }
    }
    return false;
  }

  async flushContentBuffer(): Promise<void> {
    if (this.contentBuffer.length > 0) {
      const humanizedContent = humanizeText(this.contentBuffer);
      await this.ctx.runMutation(internal.messages.internalAppendContent, {
        id: this.messageId,
        contentChunk: humanizedContent,
      });
      this.contentBuffer = "";
      this.lastUpdate = Date.now();
    }
  }

  async appendToBuffer(text: string): Promise<void> {
    this.contentBuffer += text;

    const timeSinceLastUpdate = Date.now() - this.lastUpdate;
    if (
      this.contentBuffer.length >= STREAM_CONFIG.BATCH_SIZE ||
      timeSinceLastUpdate >= STREAM_CONFIG.BATCH_TIMEOUT
    ) {
      await this.flushContentBuffer();
    }
  }

  async initializeStreaming(): Promise<void> {
    await this.ctx.runMutation(internal.messages.internalUpdate, {
      id: this.messageId,
      content: "",
    });
  }

  async handleFinish(
    text: string,
    finishReason: string | null | undefined,
    reasoning: string | null | undefined,
    providerMetadata: any
  ): Promise<void> {
    if (this.wasStopped) {
      return;
    }

    // Extract reasoning if embedded in content
    let extractedReasoning = reasoning || extractReasoning(text);

    // Humanize reasoning if it exists
    const humanizedReasoning = extractedReasoning
      ? humanizeText(extractedReasoning)
      : undefined;

    // Extract citations
    const citations = extractCitations(providerMetadata);

    // Update only metadata (reasoning, citations, finish reason)
    await updateMessage(this.ctx, this.messageId, {
      reasoning: humanizedReasoning,
      finishReason: finishReason || "stop",
      citations,
    });

    await clearConversationStreaming(this.ctx, this.messageId);
  }

  async handleStop(): Promise<void> {
    await this.flushContentBuffer();
    await this.ctx.runMutation(internal.messages.internalUpdate, {
      id: this.messageId,
      metadata: {
        finishReason: "stop",
        stopped: true,
      },
    });
    await clearConversationStreaming(this.ctx, this.messageId);
  }
}

// Main streaming action
export const streamResponse = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(
          v.literal("user"),
          v.literal("assistant"),
          v.literal("system")
        ),
        content: v.union(
          v.string(),
          v.array(
            v.object({
              type: v.union(
                v.literal("text"),
                v.literal("image_url"),
                v.literal("file")
              ),
              text: v.optional(v.string()),
              image_url: v.optional(v.object({ url: v.string() })),
              file: v.optional(
                v.object({ filename: v.string(), file_data: v.string() })
              ),
              attachment: v.optional(
                v.object({
                  storageId: v.id("_storage"),
                  type: v.string(),
                  name: v.string(),
                })
              ),
            })
          )
        ),
      })
    ),
    messageId: v.id("messages"),
    model: v.string(),
    provider: v.string(),
    userId: v.optional(v.id("users")),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    enableWebSearch: v.optional(v.boolean()),
    webSearchMaxResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let abortController: AbortController | undefined;
    const streamHandler = new StreamHandler(ctx, args.messageId);
    let hasStartedStreaming = false;

    try {
      // Get API key
      const apiKey = await getApiKey(
        ctx,
        args.provider as ProviderType,
        args.userId
      );

      // Convert messages to AI SDK format
      const messages = await convertMessages(ctx, args.messages, args.provider);

      // Create language model
      const model = await createLanguageModel(
        ctx,
        args.provider as ProviderType,
        args.model,
        apiKey,
        args.userId,
        args.enableWebSearch
      );

      // Create abort controller for stopping
      abortController = new AbortController();
      streamHandler.setAbortController(abortController);

      // Stream the response
      const result = streamText({
        model,
        messages,
        temperature: args.temperature,
        maxTokens: args.maxTokens,
        topP: args.topP,
        frequencyPenalty: args.frequencyPenalty,
        presencePenalty: args.presencePenalty,
        abortSignal: abortController.signal,
        // Enable Google thinking for reasoning models
        ...(args.provider === "google" &&
          args.model.includes("gemini-2.5") && {
            providerOptions: {
              google: {
                thinkingConfig: {
                  includeThoughts: true,
                },
              },
            },
          }),
        onFinish: async ({
          text,
          finishReason,
          reasoning,
          providerMetadata,
        }) => {
          await streamHandler.handleFinish(
            text,
            finishReason,
            reasoning,
            providerMetadata
          );
        },
      });

      // Handle streaming
      const supportsReasoning = isReasoningModel(args.provider, args.model);

      const processStream = async (
        stream: AsyncIterable<any>,
        isFullStream = false
      ) => {
        for await (const part of stream) {
          if (await streamHandler.checkIfStopped()) {
            throw new Error("StoppedByUser");
          }

          if (!hasStartedStreaming) {
            hasStartedStreaming = true;
            await streamHandler.initializeStreaming();
          }

          if (isFullStream) {
            if (part.type === "text-delta") {
              await streamHandler.appendToBuffer(part.textDelta || "");
            } else if (part.type === "reasoning") {
              await ctx.runMutation(internal.messages.internalAppendReasoning, {
                id: args.messageId,
                reasoningChunk: part.textDelta || "",
              });
            }
          } else {
            await streamHandler.appendToBuffer(part);
          }
        }

        await streamHandler.flushContentBuffer();
      };

      // Try full stream for reasoning models, fall back to text stream
      if (supportsReasoning) {
        try {
          await processStream(result.fullStream, true);
        } catch (error) {
          if (error instanceof Error && error.message === "StoppedByUser") {
            throw error;
          }
          console.log(
            "Full stream not available, falling back to text stream:",
            error
          );
          await processStream(result.textStream, false);
        }
      } else {
        await processStream(result.textStream, false);
      }
    } catch (error) {
      if (error instanceof Error && error.message === "StoppedByUser") {
        await streamHandler.handleStop();
        return;
      }

      await updateMessage(ctx, args.messageId, {
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        finishReason: "error",
      });
      await clearConversationStreaming(ctx, args.messageId);
      throw error;
    } finally {
      // Clean up abort controller
      abortController = undefined;
    }
  },
});

export const stopStreaming = action({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.messages.internalUpdate, {
      id: args.messageId,
      metadata: { finishReason: "stop", stopped: true },
    });
    await clearConversationStreaming(ctx, args.messageId);
  },
});
