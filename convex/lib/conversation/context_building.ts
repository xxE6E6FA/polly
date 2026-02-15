import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { api } from "../../_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  getPersonaPrompt,
  mergeSystemPrompts,
} from "./message_handling";
import { getBaselineInstructions } from "../../constants";
import { processAttachmentsForLLM } from "../process_attachments";
import {
  buildHierarchicalContextMessages,
} from "./hierarchical_context";

// Re-export all hierarchical context utilities for backward compatibility
export {
  buildHierarchicalContextMessages,
  buildHierarchicalContext,
  buildFinalContext,
  buildContextContent,
  buildAIInstructions,
  buildSummaryGuidance,
} from "./hierarchical_context";

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
    /** Pre-fetched messages to avoid redundant queries */
    prefetchedMessages?: Array<{
      _id: any;
      role: string;
      content: string;
      _creationTime: number;
      attachments?: any[];
      [key: string]: any;
    }>;
    /** Pre-resolved model info to avoid redundant queries */
    prefetchedModelInfo?: { contextLength?: number };
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

    // Use pre-fetched messages or fetch if not provided
    const allMessages =
      args.prefetchedMessages ??
      (await ctx.runQuery(api.messages.getAllInConversation, {
        conversationId: args.conversationId,
      }));

    // Slice messages up to the includeUpToIndex if specified
    const messagesToInclude =
      args.includeUpToIndex !== undefined
        ? allMessages.slice(0, args.includeUpToIndex + 1)
        : allMessages;

    // Build hierarchical context if needed, passing pre-fetched data
    const contextSystemMessages = await buildHierarchicalContextMessages(
      ctx,
      args.conversationId,
      userId,
      undefined, // model ID not needed for retry context
      50, // recent message count
      allMessages, // Pass pre-fetched messages to avoid another query
      args.prefetchedModelInfo, // Pass model info if available
    );

    // Get persona prompt if specified
    const personaPrompt = await getPersonaPrompt(ctx, args.personaId);

    // Build system messages
    const systemMessages = [];

    // Add baseline instructions with persona
    const baselineInstructions = getBaselineInstructions("default", "UTC");
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
