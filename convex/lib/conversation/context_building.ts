import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { api, internal } from "../../_generated/api";
import { getAuthUserId } from "../auth";
import {
  getPersonaPrompt,
  mergeSystemPrompts,
} from "./message_handling";
import { buildMemoryContext } from "@shared/system-prompts";
import { getBaselineInstructions } from "../../constants";
import { processAttachmentsForLLM } from "../process_attachments";

type Memory = { content: string; category: string };

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
    /** Retrieved memories to inject into system prompt */
    memories?: Array<{ content: string; category: string }>;
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

    // Get persona prompt if specified
    const personaPrompt = await getPersonaPrompt(ctx, args.personaId);

    // Build system messages
    const systemMessages = [];

    // Add baseline instructions with persona
    const baselineInstructions = getBaselineInstructions("default", "UTC");
    const memoryContext = args.memories
      ? buildMemoryContext(args.memories)
      : undefined;
    const mergedInstructions = mergeSystemPrompts(
      baselineInstructions,
      personaPrompt,
      memoryContext,
    );
    systemMessages.push({
      role: "system" as const,
      content: mergedInstructions,
    });

    // Convert included messages — only process attachments for the last user message.
    // Older messages' attachments are stripped downstream anyway, so processing
    // them (PDF extraction, image processing) wastes 100-2000ms.
    const filteredMsgs = messagesToInclude.filter(
      (msg: any) => msg.role !== "system" && msg.role !== "context",
    );
    let lastUserIdx = -1;
    for (let i = filteredMsgs.length - 1; i >= 0; i--) {
      if (filteredMsgs[i]?.role === "user") {
        lastUserIdx = i;
        break;
      }
    }

    const conversationMessagesPromises = filteredMsgs.map(
      async (msg: any, idx: number) => {
        if (msg.attachments && msg.attachments.length > 0) {
          // Only process attachments for the last user message
          if (idx === lastUserIdx && args.provider && args.modelId) {
            const processedAttachments = await processAttachmentsForLLM(
              ctx,
              msg.attachments,
              args.provider,
              args.modelId,
              args.modelCapabilities?.supportsFiles ?? false,
              undefined,
            );

            const parts: any[] = [];
            if (msg.content && msg.content.trim() !== "") {
              parts.push({ type: "text", text: msg.content });
            }
            for (const attachment of processedAttachments || []) {
              parts.push({
                type: attachment.type,
                attachment,
              });
            }
            return {
              role: msg.role as "user" | "assistant",
              content: parts,
            };
          }

          // For older messages: return text-only content (skip attachment processing)
          return {
            role: msg.role as "user" | "assistant",
            content: msg.content || "",
          };
        }

        // No attachments - return simple text content
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content,
        };
      },
    );

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

    // Combine all messages: system + conversation
    const contextMessages = [
      ...systemMessages,
      ...validMessages,
    ];

    return { contextMessages };
  } catch (error) {
    console.error(`Error building context messages for retry: ${error}`);
    throw error;
  }
};

// ── Auth-free variant for use inside internalActions ─────────────────

/**
 * Build context messages without requiring auth context.
 * Used by `streamMessage` (an internalAction) where `getAuthUserId` is unavailable.
 * Accepts `userId` explicitly and uses internal queries.
 */
export const buildContextMessagesForStreaming = async (
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    conversationId: Id<"conversations">;
    personaId?: Id<"personas"> | null;
    includeUpToIndex?: number;
    modelCapabilities?: {
      supportsImages: boolean;
      supportsFiles: boolean;
    };
    provider?: string;
    modelId?: string;
    prefetchedModelInfo?: { contextLength?: number };
    memories?: Array<{ content: string; category: string }>;
  },
): Promise<{
  contextMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}> => {
  const { userId } = args;

  // Use internal query (no auth required)
  const allMessages = await ctx.runQuery(
    internal.messages.getAllInConversationInternal,
    { conversationId: args.conversationId },
  );

  const messagesToInclude =
    args.includeUpToIndex !== undefined
      ? allMessages.slice(0, args.includeUpToIndex + 1)
      : allMessages;

  // Retrieve memories in parallel with persona lookup.
  // If caller already provided memories, skip retrieval.
  let memories: Memory[] | undefined = args.memories;

  // Get persona prompt via internal query (no auth)
  let personaPrompt = "";

  const [personaResult, memoryResult] = await Promise.all([
    args.personaId
      ? ctx.runQuery(internal.personas.internalGetById, { id: args.personaId })
      : null,
    !memories
      ? (async (): Promise<Memory[]> => {
          try {
            const settings = await ctx.runQuery(
              internal.memory.getUserMemorySettings,
              { userId },
            );
            if (!settings?.memoryEnabled) return [];
            // Find last user message for semantic retrieval
            const lastUserMsg = [...messagesToInclude]
              .reverse()
              .find((m: any) => m.role === "user");
            if (!lastUserMsg?.content) return [];
            return await ctx.runAction(
              internal.memory_actions.retrieveMemories,
              { userId, messageContent: lastUserMsg.content },
            );
          } catch (error) {
            console.warn("[buildContextMessagesForStreaming] Memory retrieval failed:", error);
            return [];
          }
        })()
      : Promise.resolve([]),
  ]);

  personaPrompt = personaResult?.prompt || "";
  if (!args.memories && memoryResult.length > 0) {
    memories = memoryResult;
  }

  const systemMessages = [];
  const baselineInstructions = getBaselineInstructions("default", "UTC");
  const memoryContext = memories && memories.length > 0
    ? buildMemoryContext(memories)
    : undefined;
  const mergedInstructions = mergeSystemPrompts(
    baselineInstructions,
    personaPrompt,
    memoryContext,
  );
  systemMessages.push({
    role: "system" as const,
    content: mergedInstructions,
  });

  // Find the last user message index so we only process attachments for it.
  // Older messages' attachments are stripped by streamMessage anyway, so
  // processing them (PDF extraction, image processing) is wasted work.
  const filteredMessages = messagesToInclude.filter(
    (msg: any) => msg.role !== "system" && msg.role !== "context",
  );
  let lastUserMsgIdx = -1;
  for (let i = filteredMessages.length - 1; i >= 0; i--) {
    if (filteredMessages[i]?.role === "user") {
      lastUserMsgIdx = i;
      break;
    }
  }

  const conversationMessagesPromises = filteredMessages.map(
    async (msg: any, idx: number) => {
      if (msg.attachments && msg.attachments.length > 0) {
        // Only process attachments for the last user message
        if (idx === lastUserMsgIdx && args.provider && args.modelId) {
          const processedAttachments = await processAttachmentsForLLM(
            ctx,
            msg.attachments,
            args.provider,
            args.modelId,
            args.modelCapabilities?.supportsFiles ?? false,
            undefined,
          );

          const parts: any[] = [];
          if (msg.content && msg.content.trim() !== "") {
            parts.push({ type: "text", text: msg.content });
          }
          for (const attachment of processedAttachments || []) {
            parts.push({
              type: attachment.type,
              attachment,
            });
          }
          return {
            role: msg.role as "user" | "assistant",
            content: parts,
          };
        }

        // For older messages: return text-only content (skip attachment processing)
        return {
          role: msg.role as "user" | "assistant",
          content: msg.content || "",
        };
      }

      return {
        role: msg.role as "user" | "assistant",
        content: msg.content,
      };
    },
  );

  const conversationMessages = await Promise.all(
    conversationMessagesPromises,
  );

  const validMessages = conversationMessages.filter((msg) => {
    if (typeof msg.content === "string") {
      return msg.content.trim() !== "";
    }
    if (Array.isArray(msg.content)) {
      const validParts = msg.content.filter((part: any) => {
        if (part.type === "text") {
          return part.text && part.text.trim() !== "";
        }
        return true;
      });
      return validParts.length > 0;
    }
    return false;
  });

  return {
    contextMessages: [
      ...systemMessages,
      ...validMessages,
    ],
  };
};
