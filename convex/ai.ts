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
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  publishedDate?: string;
  author?: string;
};

type ProviderType = "openai" | "anthropic" | "google" | "openrouter";

type StorageData = {
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  base64: string;
  mimeType: string;
};

// Constants
const CONFIG = {
  STREAM: {
    BATCH_SIZE: 50,
    BATCH_TIMEOUT: 100,
    CHECK_STOP_EVERY_N_CHUNKS: 3,
  },
  AES: {
    name: "AES-GCM",
    length: 256,
  },
  MIME_TYPES: {
    pdf: "application/pdf",
    text: "text/plain",
    image: "image/jpeg",
    default: "application/octet-stream",
  },
  PROVIDER_ENV_KEYS: {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  },
  REASONING_PATTERNS: [
    /<thinking>([\s\S]*?)<\/thinking>/,
    /<reasoning>([\s\S]*?)<\/reasoning>/,
    /^Thinking:\s*([\s\S]*?)(?:\n\n|$)/,
    /\[Reasoning\]([\s\S]*?)\[\/Reasoning\]/i,
  ],
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

// Unified storage converter
const convertStorageToData = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  fileType?: string
): Promise<StorageData> => {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new Error("File not found in storage");
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binaryString);

  const mimeType =
    blob.type ||
    CONFIG.MIME_TYPES[fileType as keyof typeof CONFIG.MIME_TYPES] ||
    CONFIG.MIME_TYPES.default;

  return { blob, arrayBuffer, base64, mimeType };
};

// Unified attachment converter
const convertAttachment = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string; name?: string },
  format: "dataUrl" | "aiSdk"
): Promise<string | { data: ArrayBuffer; mimeType: string }> => {
  try {
    const storageData = await convertStorageToData(
      ctx,
      attachment.storageId,
      attachment.type
    );

    if (format === "dataUrl") {
      return `data:${storageData.mimeType};base64,${storageData.base64}`;
    } else {
      return { data: storageData.arrayBuffer, mimeType: storageData.mimeType };
    }
  } catch (error) {
    console.error(`Error converting attachment to ${format}:`, error);
    throw error;
  }
};

// Convert message part to AI SDK format
const convertMessagePart = async (
  ctx: ActionCtx,
  part: any,
  provider: string
) => {
  const converters = {
    text: () => ({ type: "text" as const, text: part.text || "" }),

    image_url: async () => {
      if (part.attachment?.storageId) {
        try {
          const dataUrl = (await convertAttachment(
            ctx,
            part.attachment,
            "dataUrl"
          )) as string;
          return { type: "image" as const, image: dataUrl };
        } catch (error) {
          console.error(
            "Failed to convert Convex attachment, falling back to URL:",
            error
          );
        }
      }
      return { type: "image" as const, image: part.image_url?.url || "" };
    },

    file: async () => {
      // Check if this is a Convex storage attachment for PDF and provider supports it
      if (
        part.attachment?.storageId &&
        part.attachment.type === "pdf" &&
        (provider === "anthropic" || provider === "google")
      ) {
        try {
          const { data, mimeType } = (await convertAttachment(
            ctx,
            part.attachment,
            "aiSdk"
          )) as { data: ArrayBuffer; mimeType: string };
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
        text: `File: ${part.file?.filename || "Unknown"}\n${part.file?.file_data || ""}`,
      };
    },
  };

  const converter = converters[part.type as keyof typeof converters];
  return converter ? await converter() : { type: "text" as const, text: "" };
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
  const key = await crypto.subtle.importKey("raw", hash, CONFIG.AES, false, [
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
  const envKey = process.env[CONFIG.PROVIDER_ENV_KEYS[provider]];
  if (envKey) {
    return envKey;
  }

  // Throw appropriate error
  const errorMessage = userId
    ? `No API key found for ${provider}. Please add an API key in Settings.`
    : `Authentication required. Please sign in to use ${provider} models.`;

  throw new Error(errorMessage);
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

// Provider factory map
const createProviderModel = {
  openai: (apiKey: string, model: string) => createOpenAI({ apiKey })(model),
  anthropic: (apiKey: string, model: string) =>
    createAnthropic({ apiKey })(model),
  google: (apiKey: string, model: string, enableWebSearch?: boolean) =>
    createGoogleGenerativeAI({ apiKey })(model, {
      ...(enableWebSearch && { useSearchGrounding: true }),
    }),
  openrouter: async (
    apiKey: string,
    model: string,
    ctx: ActionCtx,
    userId?: Id<"users">,
    enableWebSearch?: boolean
  ) => {
    const openrouter = createOpenRouter({ apiKey });

    // Get user's OpenRouter sorting preference
    let sorting: "default" | "price" | "throughput" | "latency" = "default";
    if (userId) {
      try {
        const userSettings = await ctx.runQuery(
          api.userSettings.getUserSettings,
          { userId }
        );
        sorting = userSettings?.openRouterSorting ?? "default";
      } catch (error) {
        console.warn(
          "Failed to get user settings for OpenRouter sorting:",
          error
        );
      }
    }

    // Apply OpenRouter sorting shortcuts and web search
    let modifiedModel = applyOpenRouterSorting(model, sorting);
    if (enableWebSearch) {
      modifiedModel = `${modifiedModel}:online`;
    }

    return openrouter.chat(modifiedModel);
  },
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
  if (provider === "openrouter") {
    return createProviderModel.openrouter(
      apiKey,
      model,
      ctx,
      userId,
      enableWebSearch
    );
  }

  if (provider === "google") {
    return createProviderModel.google(apiKey, model, enableWebSearch);
  }

  const factory = createProviderModel[provider];
  if (!factory) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  return factory(apiKey, model);
};

// Check if model supports reasoning
const isReasoningModel = (provider: string, model: string): boolean => {
  const reasoningModels = {
    google: ["gemini-2.5"],
    anthropic: ["claude-opus-4", "claude-sonnet-4", "claude-3-7-sonnet"],
  };

  const providerModels =
    reasoningModels[provider as keyof typeof reasoningModels];
  return providerModels?.some(m => model.includes(m)) || false;
};

// Extract reasoning from text
const extractReasoning = (text: string): string => {
  for (const pattern of CONFIG.REASONING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return "";
};

// Citation extractor factory
const citationExtractors = {
  sources: (sources: any[]): Citation[] => {
    return sources
      .filter((source: any) => source.url && source.title)
      .map((source: any) => ({
        type: "url_citation" as const,
        url: source.url,
        title: source.title,
        snippet: source.snippet || source.description || "",
      }));
  },

  openrouter: (citations: any[]): Citation[] => {
    return citations.map((c: any) => ({
      type: "url_citation" as const,
      url: c.url,
      title: c.title || "Web Source",
      cited_text: c.text,
      snippet: c.snippet,
    }));
  },

  openrouterAnnotations: (annotations: any[]): Citation[] => {
    // Handle OpenRouter's web search annotations format
    return annotations
      .filter(
        (annotation: any) =>
          annotation.type === "url_citation" && annotation.url_citation
      )
      .map((annotation: any) => {
        const citation = annotation.url_citation;
        return {
          type: "url_citation" as const,
          url: citation.url,
          title: citation.title || "Web Source",
          snippet: citation.content || "",
          // The cited_text can be extracted from the message content using start/end indices
          cited_text: citation.content,
        };
      });
  },

  google: (chunks: any[]): Citation[] => {
    return chunks.map((chunk: any) => ({
      type: "url_citation" as const,
      url: chunk.web?.uri || "",
      title: chunk.web?.title || "Web Source",
      snippet: chunk.content,
    }));
  },
};

// Extract citations from provider metadata and/or sources
const extractCitations = (
  providerMetadata?: any,
  sources?: any[]
): Citation[] | undefined => {
  const citations: Citation[] = [];

  // Extract from different sources
  if (sources && Array.isArray(sources)) {
    citations.push(...citationExtractors.sources(sources));
  }

  if (providerMetadata?.openrouter?.citations) {
    citations.push(
      ...citationExtractors.openrouter(providerMetadata.openrouter.citations)
    );
  }

  // Check for OpenRouter annotations in provider metadata
  if (providerMetadata?.openrouter?.annotations) {
    citations.push(
      ...citationExtractors.openrouterAnnotations(
        providerMetadata.openrouter.annotations
      )
    );
  }

  if (providerMetadata?.google?.groundingChunks) {
    citations.push(
      ...citationExtractors.google(providerMetadata.google.groundingChunks)
    );
  }

  return citations.length > 0 ? citations : undefined;
};

// Extract citations from markdown links in text
const extractMarkdownCitations = (text: string): Citation[] => {
  const citations: Citation[] = [];
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    const [_, linkText, url] = match;

    // Skip if it's not a valid URL
    try {
      new URL(url);
    } catch {
      continue;
    }

    // Extract domain name for the title if the link text is a domain
    const domain = linkText
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    citations.push({
      type: "url_citation" as const,
      url: url,
      title: linkText || domain || "Web Source",
      // We don't have snippet data from markdown links
      snippet: "",
    });
  }

  return citations;
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
    if (this.chunkCounter % CONFIG.STREAM.CHECK_STOP_EVERY_N_CHUNKS === 0) {
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
      this.contentBuffer.length >= CONFIG.STREAM.BATCH_SIZE ||
      timeSinceLastUpdate >= CONFIG.STREAM.BATCH_TIMEOUT
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

    // Extract citations from provider metadata
    let citations = extractCitations(providerMetadata);

    // If using OpenRouter with web search and no citations found in metadata,
    // try extracting from markdown links in the response text
    if (!citations || citations.length === 0) {
      const markdownCitations = extractMarkdownCitations(text);
      if (markdownCitations.length > 0) {
        citations = markdownCitations;
      }
    }

    // Update only metadata (reasoning, citations, finish reason)
    await updateMessage(this.ctx, this.messageId, {
      reasoning: humanizedReasoning,
      finishReason: finishReason || "stop",
      citations,
    });

    // Enrich citations with metadata if we have any
    if (citations && citations.length > 0) {
      await this.ctx.scheduler.runAfter(
        0,
        internal.citationEnrichment.enrichMessageCitations,
        {
          messageId: this.messageId,
          citations,
        }
      );
    }

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

  async processStream(
    stream: AsyncIterable<any>,
    isFullStream = false
  ): Promise<void> {
    for await (const part of stream) {
      if (await this.checkIfStopped()) {
        throw new Error("StoppedByUser");
      }

      if (!this.ctx.runMutation) {
        await this.initializeStreaming();
      }

      if (isFullStream) {
        await this.handleFullStreamPart(part);
      } else {
        await this.appendToBuffer(part);
      }
    }

    await this.flushContentBuffer();
  }

  private async handleFullStreamPart(part: any): Promise<void> {
    if (part.type === "text-delta") {
      await this.appendToBuffer(part.textDelta || "");
    } else if (part.type === "reasoning") {
      await this.ctx.runMutation(internal.messages.internalAppendReasoning, {
        id: this.messageId,
        reasoningChunk: part.textDelta || "",
      });
    }
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

      // Try full stream for reasoning models, fall back to text stream
      if (supportsReasoning) {
        try {
          await streamHandler.processStream(result.fullStream, true);
        } catch (error) {
          if (error instanceof Error && error.message === "StoppedByUser") {
            throw error;
          }
          await streamHandler.processStream(result.textStream, false);
        }
      } else {
        await streamHandler.processStream(result.textStream, false);
      }

      // Handle Google search sources
      if (args.provider === "google" && args.enableWebSearch) {
        await handleGoogleSearchSources(ctx, result, args.messageId);
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

// Handle Google search sources
async function handleGoogleSearchSources(
  ctx: ActionCtx,
  result: any,
  messageId: Id<"messages">
): Promise<void> {
  try {
    // Wait for sources to be available
    const sources = await result.sources;
    if (sources && sources.length > 0) {
      // Get existing message to check for existing citations
      const message = await ctx.runQuery(api.messages.getById, {
        id: messageId,
      });

      // Merge sources with existing citations from providerMetadata
      const existingCitations = message?.citations || [];
      const sourceCitations = extractCitations(undefined, sources) || [];

      // Combine and deduplicate citations based on URL
      const citationMap = new Map<string, Citation>();
      [...existingCitations, ...sourceCitations].forEach(citation => {
        if (!citationMap.has(citation.url)) {
          citationMap.set(citation.url, citation);
        }
      });

      const mergedCitations = Array.from(citationMap.values());

      if (mergedCitations.length > 0) {
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: messageId,
          citations: mergedCitations,
        });

        // Enrich citations with metadata
        await ctx.scheduler.runAfter(
          0,
          internal.citationEnrichment.enrichMessageCitations,
          {
            messageId,
            citations: mergedCitations,
          }
        );
      }
    }
  } catch (error) {
    console.error("Failed to retrieve sources:", error);
  }
}

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
