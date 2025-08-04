import { type CoreMessage, streamText, generateText } from "ai";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx, internalAction } from "../_generated/server";
import {
  type Citation,
  type MessagePart,
  type StorageData,
  type StreamMessage,
} from "../types";
import { buildContextMessages } from "../lib/conversation_utils";
import {
  reasoningConfigForActionSchema,
  modelForInternalActionsSchema,
} from "../lib/schemas";
import { CONFIG } from "./config";
import {
  createLanguageModel,
  getProviderStreamOptions,
} from "./server_streaming";
import { getApiKey } from "./encryption";
import { getUserFriendlyErrorMessage } from "./error_handlers";
import {
  createAdaptiveBatchingState,
  addChunk,
  flushBuffer,
  finalizeBatching,
} from "./server_utils";
import { setStreamActive, clearStream } from "../lib/streaming_utils";
import { log } from "../lib/logger";
import { processAttachmentsForLLM } from "../lib/process_attachments";

// Web search imports
import {
  generateSearchNeedAssessment,
  generateSearchStrategy,
  parseSearchNeedAssessment,
  parseSearchStrategy,
  type SearchDecisionContext,
} from "./search_detection";
import { performWebSearch } from "./exa";

// Unified storage converter
export const convertStorageToData = async (
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
  const base64 = Buffer.from(uint8Array).toString("base64");

  const mimeType =
    blob.type ||
    CONFIG.MIME_TYPES[fileType as keyof typeof CONFIG.MIME_TYPES] ||
    CONFIG.MIME_TYPES.default;

  return { blob, arrayBuffer, base64, mimeType };
};

// Unified attachment converter
export const convertAttachment = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string; name?: string },
  format: "dataUrl" | "aiSdk"
): Promise<string | { data: ArrayBuffer; mimeType: string }> => {
  const storageData = await convertStorageToData(
    ctx,
    attachment.storageId,
    attachment.type
  );

  if (format === "dataUrl") {
    return `data:${storageData.mimeType};base64,${storageData.base64}`;
  }

  return { data: storageData.arrayBuffer, mimeType: storageData.mimeType };
};

// Convert message part to AI SDK format
export const convertMessagePart = async (
  ctx: ActionCtx,
  part: MessagePart,
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
        } catch {
          // Failed to convert Convex attachment, falling back to URL
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
        } catch {
          // Failed to convert Convex PDF, falling back to text
        }
      }
      
      // For PDFs that don't have native support, use extracted text if available
      if (part.attachment?.type === "pdf") {
        // Check for in-memory extracted text first
        if (part.attachment.extractedText) {
          return {
            type: "text" as const,
            text: part.attachment.extractedText,
          };
        }
        
        // Check for stored extracted text
        if (part.attachment.textFileId) {
          try {
            const storageData = await convertStorageToData(
              ctx,
              part.attachment.textFileId,
              "text/plain"
            );
            return {
              type: "text" as const,
              text: new TextDecoder().decode(storageData.arrayBuffer),
            };
          } catch (error) {
            console.warn("Failed to retrieve stored extracted text:", error);
          }
        }
      }
      
      // Fallback to text format
      return {
        type: "text" as const,
        text: `File: ${part.file?.filename || "Unknown"}\n${
          part.file?.file_data || ""
        }`,
      };
    },
  };

  const converter = converters[part.type as keyof typeof converters];
  return converter ? await converter() : { type: "text" as const, text: "" };
};

// Convert our message format to AI SDK format
export const convertMessages = async (
  ctx: ActionCtx,
  messages: StreamMessage[],
  provider: string
): Promise<CoreMessage[]> => {
  const promises = messages.map((msg): Promise<CoreMessage> => {
    if (typeof msg.content === "string") {
      return Promise.resolve({
        role: msg.role,
        content: msg.content,
      } as CoreMessage);
    }

    // Handle multi-modal content
    return Promise.all(
      msg.content.map((part) => convertMessagePart(ctx, part, provider))
    ).then(
      (parts) =>
        ({
          role: msg.role,
          content: parts,
        } as CoreMessage)
    );
  });

  return Promise.all(promises);
};

// Update message helper
export const updateMessage = async (
  ctx: ActionCtx,
  messageId: Id<"messages">,
  updates: {
    content?: string;
    reasoning?: string;
    finishReason?: string;
    citations?: Citation[];
  }
) => {
  try {
    // Get current message to preserve existing metadata
    const currentMessage = await ctx.runQuery(api.messages.getById, {
      id: messageId,
    });

    // If message doesn't exist, silently return
    if (!currentMessage) {
      return;
    }

    // Merge metadata to preserve existing fields like stopped
    const metadata = updates.finishReason
      ? {
          ...(currentMessage.metadata || {}),
          finishReason: updates.finishReason,
        }
      : currentMessage.metadata;

    await ctx.runMutation(internal.messages.internalAtomicUpdate, {
      id: messageId,
      content: updates.content,
      reasoning: updates.reasoning || undefined,
      metadata,
      citations: updates.citations?.length ? updates.citations : undefined,
    });
  } catch (error) {
    // If the update fails because the message was deleted, log and continue
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("nonexistent document"))
    ) {
      return;
    }
    // Re-throw other errors
    throw error;
  }
};

// Clear conversation streaming state
export const clearConversationStreaming = async (
  ctx: ActionCtx,
  messageId: Id<"messages">
) => {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // Use query instead of mutation to get message data
      const message = await ctx.runQuery(api.messages.getById, {
        id: messageId,
      });

      if (message?.conversationId) {
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: message.conversationId,
          updates: { isStreaming: false },
          setUpdatedAt: true,
        });
      }

      // Success - exit retry loop
      return;
    } catch (error) {
      attempts++;

      // If it's a write conflict and we have retries left, wait and try again
      if (
        attempts < maxAttempts &&
        error instanceof Error &&
        error.message.includes("Documents read from or written to")
      ) {
        // Exponential backoff: 50ms, 100ms, 200ms
        const delay = 50 * Math.pow(2, attempts - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Final attempt failed or different error type
      // Don't log write conflicts as warnings since they're expected
      if (
        !(
          error instanceof Error &&
          error.message.includes("Documents read from or written to")
        )
      ) {
        // Failed to clear streaming state
      }
      return; // Give up gracefully
    }
  }
};

export const streamResponse = internalAction({
  args: {
    messageId: v.id("messages"),
    conversationId: v.id("conversations"),
    model: modelForInternalActionsSchema, // Full model object instead of strings
    personaId: v.optional(v.id("personas")),
    reasoningConfig: v.optional(reasoningConfigForActionSchema),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    useWebSearch: v.boolean(), // Determined by calling action based on user auth
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log(
      "[stream_generation] Starting streaming:",
      args.model.modelId,
      "messageId:",
      args.messageId,
      "conversationId:",
      args.conversationId
    );

    // Check if conversation is still supposed to be streaming
    // Use internal query since scheduled actions don't have user context
    const conversation = await ctx.runQuery(internal.conversations.internalGet, {
      id: args.conversationId,
    });
    
    console.log(
      "[stream_generation] Conversation streaming state check:",
      "conversation.isStreaming =", conversation?.isStreaming,
      "conversation exists =", !!conversation
    );
    
    if (!conversation?.isStreaming) {
      console.log(
        "[stream_generation] Conversation already marked as not streaming, exiting early"
      );
      return;
    }

    // Use the search availability determined by the calling action
    const isSearchEnabled = args.useWebSearch;

    // Create AbortController for proper stream interruption
    const abortController = new AbortController();

    // Register this stream as active for stop functionality
    setStreamActive(args.conversationId, abortController);

    // Optimized streaming state tracking
    let isStreamingStopped = false;

    // Set up abort signal listener to update the flags
    abortController.signal.addEventListener("abort", () => {
      console.log(
        "[stream_generation] Abort signal received for conversation:",
        args.conversationId,
        "messageId:",
        args.messageId
      );
      console.log("[stream_generation] Setting isStreamingStopped to true");
      isStreamingStopped = true;
    });

    // Create a robust abort checker function that checks both memory and database
    let lastAbortLogTime = 0;
    const checkAbort = async () => {
      // Check in-memory flags first (fastest)
      const memoryAborted = abortController.signal.aborted || isStreamingStopped;
      
      // If memory flags indicate abort, return immediately without database query
      if (memoryAborted) {
        return true;
      }
      
      // Only check database if memory flags are clean
      // Use internal query since scheduled actions don't have user context
      const conversation = await ctx.runQuery(internal.conversations.internalGet, {
        id: args.conversationId,
      });
      const dbAborted = !conversation?.isStreaming;
      
      if (dbAborted) {
        // Only log once per second to prevent spam
        const now = Date.now();
        if (now - lastAbortLogTime > 1000) {
          console.log(
            "[stream_generation] checkAbort: Stream should be stopped.",
            "signal.aborted:", abortController.signal.aborted,
            "isStreamingStopped:", isStreamingStopped,
            "conversation.isStreaming:", conversation?.isStreaming
          );
          lastAbortLogTime = now;
        }
      }
      return dbAborted;
    };

    // Clean up function
    const cleanup = () => {
      clearStream(args.conversationId);
    };

    // Initialize content tracking variables
    let fullContent = "";

    // Enhanced error handling
    const handleStreamError = async (error: any) => {
      log.error("Stream generation error", error);

      // Don't treat abort as error - it's intentional user action
      if (
        error.name === "AbortError" ||
        abortController.signal.aborted ||
        isStreamingStopped
      ) {
        log.info("Stream was interrupted by user");

        // Properly finalize the message as stopped
        try {
          await ctx.runMutation(internal.messages.updateContent, {
            messageId: args.messageId,
            content: fullContent || "",
            reasoning: undefined,
            finishReason: "stop",
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          });

          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId: args.messageId,
            status: "done",
          });
        } catch (updateError) {
          log.error(
            "Failed to finalize stopped message:",
            updateError
          );
        }

        return;
      }

      const errorMessage = getUserFriendlyErrorMessage(error);

      try {
        await ctx.runMutation(internal.messages.updateContent, {
          messageId: args.messageId,
          content: errorMessage,
          finishReason: "error",
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        });

        await ctx.runMutation(internal.messages.updateMessageStatus, {
          messageId: args.messageId,
          status: "error",
        });
      } catch (updateError) {
        log.error(
          "Failed to update error state:",
          updateError
        );
      }
    };

    try {
      // Get persona system prompt if available
      let systemPrompt = "You are a helpful AI assistant."; // Default
      if (args.personaId) {
        const persona = await ctx.runQuery(api.personas.get, {
          id: args.personaId,
        });
        if (persona?.prompt) {
          systemPrompt = persona.prompt;
          log.debug(`Using persona: ${persona.name}`);
        }
      }

            // Get conversation context
      const contextResult = await buildContextMessages(ctx, {
        conversationId: args.conversationId,
        personaId: args.personaId,
      });

      const { contextMessages } = contextResult;
      log.debug(
        `Built context with ${contextMessages.length} messages`
      );

      // Process attachments for the latest user message with PDF text extraction and progress updates
      // This happens here so we can show "Reading PDF..." status in the assistant message
      let processedContextMessages = contextMessages;
      
      // Find the latest user message that has file attachments
      const latestUserMessage = contextMessages.find(msg => {
        if (msg.role !== "user" || typeof msg.content === "string") return false;
        return Array.isArray(msg.content) && msg.content.some(part => 
          part.type === "file" && part.attachment?.storageId
        );
      });



      if (latestUserMessage && Array.isArray(latestUserMessage.content)) {
        log.debug("Processing attachments for latest user message");
        
        // Extract attachments from content parts
        const attachmentParts = latestUserMessage.content.filter(part => 
          part.type === "file" && part.attachment?.storageId
        );
        

        
        if (attachmentParts.length > 0) {
          // Convert content parts to attachment format for processing
          const attachments = attachmentParts.map(part => ({
            type: part.attachment?.type === "pdf" ? "pdf" as const : "text" as const,
            url: "",
            name: part.attachment?.name || part.file?.filename || "unknown",
            size: 0,
            storageId: part.attachment?.storageId,
            content: part.file?.file_data,
            // Preserve PDF-specific fields for text extraction
            extractedText: part.attachment?.extractedText,
            textFileId: part.attachment?.textFileId,
          }));

          // Debug logging to verify attachment conversion
          attachments.forEach(att => {
            if (att.type === "pdf") {
              console.log(`[Message Processing] PDF attachment ${att.name}: extractedText=${!!att.extractedText} (${att.extractedText?.length || 0} chars), textFileId=${!!att.textFileId}`);
            }
          });



          const processedAttachments = await processAttachmentsForLLM(
            ctx,
            attachments,
            args.model.provider,
            args.model.modelId,
            args.model.supportsFiles ?? false,
            args.messageId // Pass assistant messageId for progress updates
          );



          // Update the content parts with processed attachments
          const updatedContent = latestUserMessage.content.map(part => {
            if (part.type === "file" && part.attachment?.storageId) {
              const processedAttachment = processedAttachments?.find((att: any) => 
                att.storageId === part.attachment?.storageId
              );
              if (processedAttachment) {
                return {
                  ...part,
                  file: {
                    filename: processedAttachment.name,
                    file_data: processedAttachment.content || "",
                  },
                };
              }
            }
            return part;
          });

          // Update the context messages with processed content
          processedContextMessages = contextMessages.map(msg => 
            msg === latestUserMessage 
              ? { ...msg, content: updatedContent }
              : msg
          );
        }
      }

      log.debug("Search enabled:", isSearchEnabled, "determined by calling action");

      // Override the system message with the persona prompt
      if (processedContextMessages.length > 0 && processedContextMessages[0].role === "system") {
        processedContextMessages[0].content = systemPrompt;
      } else {
        // Prepend system message if not present
        processedContextMessages.unshift({
          role: "system",
          content: systemPrompt,
        });
      }

      // Use the model object properties
      const effectiveProvider = args.model.provider;
      const effectiveModel = args.model.modelId;

      log.debug(
        `Using model: ${effectiveModel}/${effectiveProvider}`
      );

      // Get API key for the effective provider
      const apiKey = await getApiKey(
        ctx,
        effectiveProvider as any,
        effectiveModel,
        args.conversationId
      );

      // Create language model with user's selected model
      const model = await createLanguageModel(
        ctx,
        effectiveProvider as any,
        effectiveModel,
        apiKey
      );

      // Perform web search if enabled and needed
      if (isSearchEnabled) {
        log.debug("Starting search detection process");
        
        const userMessages = contextMessages.filter(msg => msg.role === "user");
        const latestUserMessage = userMessages[userMessages.length - 1];
        
        if (latestUserMessage && typeof latestUserMessage.content === "string") {
          try {
            // Step 1: Check if search is needed using LLM
            const searchContext: SearchDecisionContext = {
              userQuery: latestUserMessage.content,
              conversationHistory: contextMessages.slice(-5).filter(msg => msg.role !== "system").map(msg => ({
                role: msg.role as "user" | "assistant",
                content: typeof msg.content === "string" ? msg.content : "[multimodal content]",
                hasSearchResults: false, // TODO: Track this properly
              })),
            };

            const needAssessmentPrompt = generateSearchNeedAssessment(searchContext);
            
            // Use built-in Gemini for search detection to ensure we have API keys
            const searchDetectionApiKey = await getApiKey(ctx, "google", "gemini-2.0-flash-exp", args.conversationId);
            const searchDetectionModel = await createLanguageModel(
              ctx,
              "google",
              "gemini-2.0-flash-exp", 
              searchDetectionApiKey
            );
            
            log.debug("Calling LLM for search need assessment using built-in Gemini");
            const { text: needAssessmentResponse } = await generateText({
              model: searchDetectionModel,
              prompt: needAssessmentPrompt,
              temperature: 0.1, // Low temperature for consistent decision making
            });

            const searchNeed = parseSearchNeedAssessment(needAssessmentResponse);
            log.debug("Search needed:", !searchNeed.canAnswerConfidently);

            // Step 2: If search is needed, determine search strategy
            if (!searchNeed.canAnswerConfidently) {
              const searchStrategyPrompt = generateSearchStrategy(searchContext);
              
              log.debug("Calling LLM for search strategy using built-in Gemini");
              const { text: strategyResponse } = await generateText({
                model: searchDetectionModel,
                prompt: searchStrategyPrompt,
                temperature: 0.1,
              });

              const searchDecision = parseSearchStrategy(strategyResponse, latestUserMessage.content);
                              log.debug("Search strategy:", searchDecision.searchType, "for query:", searchDecision.suggestedQuery);

              // Step 3: Get EXA API key - TODO: Add EXA as a proper provider type
              const exaApiKey = process.env.EXA_API_KEY;
                              if (!exaApiKey) {
                  log.debug("No EXA API key configured, skipping web search");
                  log.debug("To enable web search, add EXA_API_KEY environment variable");
              } else {
                // NOW set status to searching since we're actually about to perform web search
                await ctx.runMutation(internal.messages.updateMessageStatus, {
                  messageId: args.messageId,
                  status: "searching",
                });

                // Set search metadata with actual strategy now that we're searching
                await ctx.runMutation(internal.messages.updateAssistantContent, {
                  messageId: args.messageId,
                  metadata: {
                    searchQuery: searchDecision.suggestedQuery || latestUserMessage.content,
                    searchFeature: searchDecision.searchType, // "answer", "similar", "search"
                    searchCategory: searchDecision.category, // "company", "news", etc.
                  },
                });

                                  log.debug("Performing EXA search");
                const searchResult = await performWebSearch(exaApiKey, {
                  query: searchDecision.suggestedQuery || latestUserMessage.content,
                  searchType: searchDecision.searchType,
                  category: searchDecision.category,
                  maxResults: 12, // TODO: Make this configurable
                });

                // Step 4: Add search results to context
                if (searchResult.citations.length > 0) {
                                      log.debug("Adding", searchResult.citations.length, "search results to context");
                  
                  // Create a system message with search results
                  const searchResultsMessage = {
                    role: "system" as const,
                    content: `🚨 CRITICAL CITATION REQUIREMENTS 🚨

Based on the user's query, I have searched the web and found relevant information. You MUST cite sources for any information derived from these search results.

SEARCH RESULTS:
${searchResult.context}

AVAILABLE SOURCES FOR CITATION:
${searchResult.citations.map((citation, idx) => 
  `[${idx + 1}] ${citation.title} - ${citation.url}`
).join('\n')}

When using information from these search results, you MUST include citations in the format [1], [2], etc. corresponding to the source numbers above.`,
                  };

                  // Insert search results after system message but before conversation
                  contextMessages.splice(1, 0, searchResultsMessage);
                  
                  // Update message with citations for UI display
                  await ctx.runMutation(internal.messages.updateAssistantContent, {
                    messageId: args.messageId,
                    citations: searchResult.citations,
                  });
                  
                                      log.debug("Search results added to context successfully");
                } else {
                  log.debug("No search results found");
                  
                  // Update with empty citations array to show search was attempted
                  await ctx.runMutation(internal.messages.updateAssistantContent, {
                    messageId: args.messageId,
                    citations: [], // Empty array indicates search was done but found nothing
                  });
                }
              }
            } else {
              log.debug("LLM determined search is not needed");
            }
                      } catch (error) {
              log.error("Error during search process:", error);
            
            // Clear search metadata since search failed
            await ctx.runMutation(internal.messages.updateAssistantContent, {
              messageId: args.messageId,
              metadata: {
                searchQuery: undefined,
                searchFeature: undefined,
                searchCategory: undefined,
              },
            });
            
            // Continue without search - don't break the conversation flow
          } finally {
            // Reset status to thinking after search is complete (success or failure)
            // Keep search metadata for citations display, but SearchQuery won't show due to status change
            await ctx.runMutation(internal.messages.updateMessageStatus, {
              messageId: args.messageId,
              status: "thinking",
            });
          }
        } else {
          log.debug("No suitable user message found for search");
        }
      }

      // Convert messages to AI SDK format using processed context messages
      const convertedMessages = await convertMessages(
        ctx,
        processedContextMessages,
        effectiveProvider as any
      );

      // Get reasoning-specific stream options (simplified logging)
      // Only pass reasoning config if enabled
      const enabledReasoningConfig = args.reasoningConfig?.enabled
        ? {
            effort: args.reasoningConfig.effort,
            maxTokens: args.reasoningConfig.maxTokens,
          }
        : undefined;

      const streamOptions = await getProviderStreamOptions(
        ctx,
        effectiveProvider as any,
        effectiveModel,
        enabledReasoningConfig,
        args.model // Pass the full model object instead of undefined
      );

      // Prepare generation options with proper abortSignal
      const generationOptions: any = {
        model,
        messages: convertedMessages,
        abortSignal: abortController.signal,
        ...streamOptions, // Merge reasoning options
      };

      // Only include optional parameters if they are valid
      if (args.temperature !== undefined)
        generationOptions.temperature = args.temperature;
      if (args.maxTokens && args.maxTokens > 0)
        generationOptions.maxTokens = args.maxTokens;
      if (args.topP !== undefined) generationOptions.topP = args.topP;
      if (args.frequencyPenalty !== undefined)
        generationOptions.frequencyPenalty = args.frequencyPenalty;
      if (args.presencePenalty !== undefined)
        generationOptions.presencePenalty = args.presencePenalty;

      // Set initial status to thinking
      await ctx.runMutation(internal.messages.updateMessageStatus, {
        messageId: args.messageId,
        status: "thinking",
      });

      log.streamStart(args.model.modelId, args.model.provider, args.messageId);

      // OPTIMIZED STREAMING: Adaptive batching for better performance
      let contentBatcher = createAdaptiveBatchingState(
        args.messageId + ":content",
        10, // Initial batch size
        100 // Initial update interval (ms)
      );

      // Create reasoning batcher for real-time reasoning streaming
      let reasoningBatcher = createAdaptiveBatchingState(
        args.messageId + ":reasoning",
        5, // Smaller batch size for reasoning
        50 // Faster updates for reasoning
      );

      // Generate streaming response using AI SDK with onChunk for incremental reasoning
      const result = streamText({
        ...generationOptions,
        onChunk: async ({ chunk }) => {
          // Check for abort signal before processing any chunk
          if (await checkAbort()) {
                      if (!isStreamingStopped) {
            log.streamAbort(`Stream ${args.messageId.slice(-8)} stopped`);
            isStreamingStopped = true;
          }
            return; // Exit gracefully instead of throwing error
          }

          // Only log reasoning chunks, not every text chunk to reduce noise
          if (chunk.type === "reasoning" && chunk.textDelta) {
            log.streamReasoning(args.messageId, chunk.textDelta);

            // Double-check abort before processing reasoning
            if (await checkAbort()) {
                          if (!isStreamingStopped) {
              log.streamAbort("Reasoning processing stopped");
              isStreamingStopped = true;
            }
              return; // Exit gracefully instead of throwing error
            }

            const reasoningBatchResult = addChunk(
              reasoningBatcher,
              chunk.textDelta
            );
            reasoningBatcher = reasoningBatchResult.state;
            if (
              reasoningBatchResult.shouldFlush &&
              reasoningBatchResult.content
            ) {
              // Triple-check abort before sending to frontend
              if (await checkAbort()) {
                if (!isStreamingStopped) {
                  log.streamAbort("Reasoning update blocked");
                  isStreamingStopped = true;
                }
                return; // Exit gracefully instead of throwing error
              }

              try {
                await ctx.runMutation(
                  internal.messages.updateAssistantContent,
                  {
                    messageId: args.messageId,
                    appendReasoning: reasoningBatchResult.content,
                    status: "streaming",
                  }
                );
              } catch (updateError) {
                log.streamError("Reasoning update failed", updateError);
              }
            }
          }
        },
      });

      // Set status to streaming when we start receiving chunks
      await ctx.runMutation(internal.messages.updateMessageStatus, {
        messageId: args.messageId,
        status: "streaming",
      });



      // Process text content stream (this also ensures completion)
      let chunkCount = 0;
      for await (const chunk of result.textStream) {
        chunkCount++;
        // Check both abort conditions and the flag set by onChunk
        if (isStreamingStopped || await checkAbort()) {
          if (!isStreamingStopped) {
            log.streamAbort(`Text processing stopped at chunk ${chunkCount}`);
            isStreamingStopped = true;
          }
          break;
        }

        fullContent += chunk;

        const batchResult = addChunk(contentBatcher, chunk);
        contentBatcher = batchResult.state;
        if (batchResult.shouldFlush && batchResult.content) {
          try {
            await ctx.runMutation(internal.messages.updateAssistantContent, {
              messageId: args.messageId,
              appendContent: batchResult.content,
              status: "streaming",
            });
          } catch (updateError) {
            log.streamError("Content update failed", updateError);
          }
        }
      }

      log.streamComplete(args.messageId, chunkCount, fullContent.length);

      // Check if we got no content - this might indicate safety filter blocking
      if (chunkCount === 0 && fullContent.length === 0) {
        log.streamError(
          `No content from ${args.model.provider}/${args.model.modelId} - possibly blocked by safety filters`
        );

        // Set an appropriate error message for the user
        const errorMessage = "The AI provider returned no content. Please try again or rephrase your request.";

        await ctx.runMutation(internal.messages.updateContent, {
          messageId: args.messageId,
          content: errorMessage,
          finishReason: "error",
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        });

        await ctx.runMutation(internal.messages.updateMessageStatus, {
          messageId: args.messageId,
          status: "error",
        });

        return;
      }

      // Reasoning is now handled incrementally via onChunk callback above

      // Final flush of any remaining content
      const finalFlushResult = flushBuffer(contentBatcher);
      const finalContent = finalFlushResult.content;

      if (finalContent.length > 0 && !isStreamingStopped) {
        try {
          await ctx.runMutation(internal.messages.updateAssistantContent, {
            messageId: args.messageId,
            appendContent: finalContent,
            status: "streaming",
          });
        } catch (updateError) {
          log.streamError("Final content update failed", updateError);
        }
      }

      // Finalize performance monitoring
      finalizeBatching(contentBatcher);
      finalizeBatching(reasoningBatcher);

      // Only finalize if not stopped (check both memory, database, and abort flag)
      const finalAbortCheck = isStreamingStopped || await checkAbort();
      if (!finalAbortCheck) {
        log.info(`Stream finalized: ${args.messageId.slice(-8)} completed`);
      } else {
        log.info(`Stream gracefully stopped: ${args.messageId.slice(-8)} was interrupted`);
        // Immediately mark conversation as not streaming when interrupted
        console.log(
          "[stream_generation] Stream was interrupted, marking conversation as not streaming immediately"
        );
        try {
          await ctx.runMutation(internal.conversations.internalPatch, {
            id: args.conversationId,
            updates: { isStreaming: false },
          });
          console.log("[stream_generation] Conversation marked as not streaming due to interruption");
        } catch (error) {
          console.warn("Failed to immediately clear streaming state:", error);
        }
      }
      
      if (!finalAbortCheck) {

        // Finalize the message with complete content and metadata
        await ctx.runMutation(internal.messages.updateContent, {
          messageId: args.messageId,
          content: fullContent,
          finishReason: "stop",
          usage: {
            promptTokens: 0, // We don't have usage info from streaming
            completionTokens: 0,
            totalTokens: 0,
          },
        });

        // Set final status to done
        await ctx.runMutation(internal.messages.updateMessageStatus, {
          messageId: args.messageId,
          status: "done",
        });
      }
    } catch (error: any) {
      await handleStreamError(error);
    } finally {
      // Always clean up
      cleanup();

      // Always ensure conversation is no longer streaming
      console.log(
        "[stream_generation] Cleaning up: setting conversation isStreaming to false for",
        args.conversationId
      );
      try {
        await ctx.runMutation(internal.conversations.internalPatch, {
          id: args.conversationId,
          updates: { isStreaming: false },
        });
        console.log("[stream_generation] Successfully marked conversation as not streaming");
      } catch (cleanupError) {
        console.warn(
          "[stream_generation] Failed to clear streaming state:",
          cleanupError
        );
      }
    }

    return null;
  },
});

