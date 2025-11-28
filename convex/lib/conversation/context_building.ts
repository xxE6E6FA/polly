import type { ActionCtx } from "../../_generated/server";
import { getUserEffectiveModelWithCapabilities } from "../model_resolution";
import type { Id } from "../../_generated/dataModel";
import type { ApiMessageDoc, ProcessedChunk } from "./types";
import {
  CONTEXT_CONFIG,
  processChunksWithStoredSummaries,
  createRecursiveMetaSummary,
  summarizeChunk,
  storeChunkSummary,
} from "./summarization";
import { api } from "../../_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  getPersonaPrompt,
  mergeSystemPrompts,
} from "../conversation/message_handling";
import { getBaselineInstructions } from "../../constants";
import { processAttachmentsForLLM } from "../process_attachments";

export const buildHierarchicalContextMessages = async (
  ctx: ActionCtx,
  conversationId: Id<"conversations">,
  userId?: Id<"users">,
  modelId?: string,
  recentMessageCount: number = 50,
): Promise<{ role: "system"; content: string }[]> => {
  try {
    // Get the model capabilities for context window optimization
    const modelInfo =
      modelId && userId
        ? await getUserEffectiveModelWithCapabilities(ctx, userId, modelId)
        : undefined;

    const allMessages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId,
    });

    if (!allMessages || allMessages.length === 0) {
      return [];
    }

    // Decide whether we need summarization based on token budget if we
    // know the model's context window; otherwise fall back to message count.
    const estimateTokens = (msgs: any[]): number =>
      msgs
        .filter((m) => m.role !== "system" && m.role !== "context")
        .reduce(
          (sum, m) =>
            sum + Math.max(1, Math.ceil((m.content || "").length / 4)),
          0,
        );

    let needsSummarization = false;
    if (modelInfo?.contextLength) {
      const minCap = CONTEXT_CONFIG.MIN_TOKEN_THRESHOLD ?? 100_000;
      const threshold = Math.min(modelInfo.contextLength, minCap);
      const tokenTotal = estimateTokens(allMessages as any);
      needsSummarization = tokenTotal > threshold;
    } else {
      needsSummarization =
        allMessages.length > CONTEXT_CONFIG.SUMMARY_THRESHOLD;
    }

    if (!needsSummarization) {
      return [];
    }

    // Split messages into those that need summarization and recent messages
    // Handle the special case of recentMessageCount === 0: summarize all messages
    const messagesToSummarize =
      recentMessageCount > 0
        ? allMessages.slice(0, -recentMessageCount)
        : allMessages.slice(0);
    const recentMessages =
      recentMessageCount > 0 ? allMessages.slice(-recentMessageCount) : [];

    if (messagesToSummarize.length === 0) {
      return [];
    }

    // Build hierarchical context from older messages
    const contextContent = await buildHierarchicalContext(
      ctx,
      conversationId as string,
      messagesToSummarize.map((msg: any) => ({
        ...msg,
        updatedAt: msg._creationTime, // Use creation time as updated time if not available
      })) as ApiMessageDoc[],
    );

    if (!contextContent || contextContent.trim().length === 0) {
      return [];
    }

    return [
      {
        role: "system" as const,
        content: contextContent,
      },
    ];
  } catch (error) {
    console.error(`Error building hierarchical context: ${error}`);
    return [];
  }
};

async function buildHierarchicalContext(
  ctx: ActionCtx,
  conversationId: string,
  messages: ApiMessageDoc[],
): Promise<string> {
  try {
    // Step 1: Process messages into chunks, using stored summaries where available
    let processedChunks = await processChunksWithStoredSummaries(
      ctx,
      conversationId,
      messages,
    );

    // Step 2: Summarize any chunks that still contain raw messages
    for (let i = 0; i < processedChunks.length; i++) {
      const chunk = processedChunks[i];
      if (!chunk?.messages || chunk.summary) {
        continue;
      }

      const summary = await summarizeChunk(chunk.messages);

      // Store the summary for future use
      if (chunk.chunkIndex !== undefined) {
        await storeChunkSummary(
          ctx,
          conversationId,
          chunk.chunkIndex,
          summary,
          chunk.originalMessageCount ?? chunk.messages.length,
          chunk,
        );
      }

      // Update the chunk to use the summary instead of raw messages
      processedChunks[i] = {
        summary,
        chunkIndex: chunk.chunkIndex,
        originalMessageCount: chunk.originalMessageCount,
      };
    }

    // Step 3: If we have too many chunk summaries, create meta-summaries recursively
    const summaries = processedChunks
      .map((chunk) => chunk?.summary)
      .filter((value): value is string => typeof value === "string");

    if (summaries.length > CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS) {
      processedChunks = await createRecursiveMetaSummary(
        ctx,
        conversationId,
        summaries,
      );
    }

    // Step 4: Build the final context content
    const summaryLayers =
      summaries.length === 0
        ? 0
        : Math.max(
            1,
            Math.ceil(summaries.length / CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS),
          );
    return await buildFinalContext(processedChunks, summaryLayers);
  } catch (error) {
    console.error(`Error in buildHierarchicalContext: ${error}`);
    throw error;
  }
}

async function buildFinalContext(
  processedChunks: ProcessedChunk[],
  summaryLayers: number,
): Promise<string> {
  if (processedChunks.length === 0) {
    return "";
  }

  // Build the context content with clear structure
  let contextContent = buildContextContent(processedChunks, summaryLayers);

  // Add intelligent instructions for the AI based on summarization depth
  contextContent += buildAIInstructions(summaryLayers);

  // Add specific guidance for using the rich summaries effectively
  if (summaryLayers > 1) {
    contextContent += buildSummaryGuidance();
  }

  return contextContent;
}

// Extract context content building into separate function
function buildContextContent(
  processedChunks: ProcessedChunk[],
  summaryLayers: number,
): string {
  let contextContent = "";

  if (summaryLayers > 3) {
    contextContent += `==== CONVERSATION CONTEXT (${processedChunks.length} Meta-Summaries) ====\n\n`;
    contextContent += `This is an extremely long conversation that has been summarized through multiple layers. Below are high-level meta-summaries that preserve the most important information:\n\n`;
  } else if (summaryLayers > 1) {
    contextContent += `==== CONVERSATION CONTEXT (${processedChunks.length} Summaries) ====\n\n`;
    contextContent += `This is a long conversation. Below are AI-generated summaries of earlier parts:\n\n`;
  } else {
    contextContent += `==== CONVERSATION CONTEXT ====\n\n`;
    contextContent += `Earlier conversation context:\n\n`;
  }

  // Add each summary with clear delineation
  processedChunks.forEach((chunk, index) => {
    if (chunk.summary) {
      const chunkType = chunk.isMetaSummary ? "Meta-Summary" : "Summary";
      const messageCount = chunk.originalMessageCount || 0;

      contextContent += `--- ${chunkType} ${index + 1} (covers ~${messageCount} messages) ---\n`;
      contextContent += `${chunk.summary}\n\n`;
    }
  });

  return contextContent;
}

// Extract AI instructions building into separate function
function buildAIInstructions(summaryLayers: number): string {
  if (summaryLayers > 3) {
    return `IMPORTANT: This conversation has been summarized through ${summaryLayers} layers due to extreme length. The AI-generated summaries above contain rich, structured information about earlier parts of the conversation.\n\nYour task: Use this context to maintain conversation continuity while focusing primarily on the recent messages below. If the user references something from earlier in the conversation, acknowledge the context from the summaries above and connect it to the current discussion.\n\n`;
  } else if (summaryLayers > 2) {
    return `Note: This conversation has been summarized through ${summaryLayers} layers. The AI-generated summaries above preserve key topics, questions, and insights in a structured format.\n\nYour task: Use this context to maintain conversation continuity while focusing on the recent messages below. Be aware of the broader context and reference relevant information from the summaries when appropriate.\n\n`;
  } else if (summaryLayers > 1) {
    return `Note: This conversation has been summarized to manage length. The AI-generated summaries above contain rich, structured information about earlier discussion points.\n\nYour task: Continue naturally from the recent messages below while being aware of the broader context. Use the summaries to understand what has already been discussed and avoid repetition.\n\n`;
  } else {
    return `Continue the conversation naturally from the recent messages below.\n\n`;
  }
}

// Extract summary guidance building into separate function
function buildSummaryGuidance(): string {
  return (
    `How to use the summaries above:\n` +
    `• Each summary is AI-generated and structured to preserve key information\n` +
    `• They maintain technical accuracy and domain-specific terminology\n` +
    `• They capture the logical flow and progression of ideas\n` +
    `• Use them to understand context, avoid repetition, and maintain continuity\n` +
    `• If the user references earlier topics, use the summaries to provide relevant context\n\n`
  );
}

// Build context messages for retry functionality
export const buildContextMessages = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    personaId?: Id<"personas"> | null;
    includeUpToIndex?: number;
    modelCapabilities?: {
      supportsImages: boolean;
      supportsFiles: boolean;
    };
    provider?: string;
    modelId?: string;
  },
): Promise<{
  contextMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}> => {
  try {
    // Get authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Get conversation messages up to the specified index
    const allMessages = await ctx.runQuery(api.messages.getAllInConversation, {
      conversationId: args.conversationId,
    });

    // Slice messages up to the includeUpToIndex if specified
    const messagesToInclude =
      args.includeUpToIndex !== undefined
        ? allMessages.slice(0, args.includeUpToIndex + 1)
        : allMessages;

    // Build hierarchical context if needed
    const contextSystemMessages = await buildHierarchicalContextMessages(
      ctx,
      args.conversationId,
      userId,
      undefined, // model ID not needed for retry context
      50, // recent message count
    );

    // Get persona prompt if specified
    const personaPrompt = await getPersonaPrompt(ctx, args.personaId);

    // Build system messages
    const systemMessages = [];

    // Add baseline instructions with persona
    const baselineInstructions = getBaselineInstructions("default");
    const mergedInstructions = mergeSystemPrompts(
      baselineInstructions,
      personaPrompt,
    );
    systemMessages.push({
      role: "system" as const,
      content: mergedInstructions,
    });

    // Convert included messages to the expected format
    // Process attachments in parallel for all messages
    const conversationMessagesPromises = messagesToInclude
      .filter((msg: any) => msg.role !== "system" && msg.role !== "context")
      .map(async (msg: any) => {
        // If message has attachments, format content as array of parts
        if (msg.attachments && msg.attachments.length > 0) {
          // Process attachments for LLM (handles PDF extraction if needed)
          let processedAttachments = msg.attachments;
          if (args.provider && args.modelId) {
            processedAttachments = await processAttachmentsForLLM(
              ctx,
              msg.attachments,
              args.provider,
              args.modelId,
              args.modelCapabilities?.supportsFiles ?? false,
              undefined, // messageId not needed for context building
            );
          }

          const parts: any[] = [];

          // Add text content as first part if present
          if (msg.content && msg.content.trim() !== "") {
            parts.push({ type: "text", text: msg.content });
          }

          // Add attachment parts using unified format
          // The message_converter will handle conversion to AI SDK format
          for (const attachment of processedAttachments || []) {
            parts.push({
              type: attachment.type, // "image" | "pdf" | "text"
              attachment,
            });
          }

          return {
            role: msg.role as "user" | "assistant",
            content: parts,
          };
        }

        // No attachments - return simple text content
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content,
        };
      });

    const conversationMessages = await Promise.all(
      conversationMessagesPromises,
    );

    // Filter out messages with empty content to avoid API errors
    // Anthropic requires non-empty text content blocks
    const validMessages = conversationMessages.filter((msg) => {
      if (typeof msg.content === "string") {
        return msg.content.trim() !== "";
      }
      if (Array.isArray(msg.content)) {
        // Filter out empty text blocks and check if any valid content remains
        const validParts = msg.content.filter((part: any) => {
          if (part.type === "text") {
            return part.text && part.text.trim() !== "";
          }
          return true; // Keep non-text parts (images, files)
        });
        return validParts.length > 0;
      }
      return false;
    });

    // Combine all messages: system + context + conversation
    const contextMessages = [
      ...systemMessages,
      ...contextSystemMessages,
      ...validMessages,
    ];

    return { contextMessages };
  } catch (error) {
    console.error(`Error building context messages for retry: ${error}`);
    throw error;
  }
};

export {
  buildHierarchicalContext,
  buildFinalContext,
  buildContextContent,
  buildAIInstructions,
  buildSummaryGuidance,
};
