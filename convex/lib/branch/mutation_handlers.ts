import { getAuthUserId } from "../auth";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../_generated/server";
import { createUserFileEntriesHandler } from "../file_storage/mutation_handlers";
import {
  buildContextMessages,
  executeStreamingActionForRetry,
} from "../conversation_utils";

// Internal mutation: clone messages into a new conversation preserving metadata and timestamps
export async function internalCloneMessagesHandler(
  ctx: MutationCtx,
  args: {
    targetConversationId: Id<"conversations">;
    sourceMessages: Array<{
      _id: Id<"messages">;
      role: string;
      content: string;
      status?:
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done"
        | "error";
      statusText?: string;
      reasoning?: string;
      model?: string;
      provider?: string;
      reasoningConfig?: { enabled: boolean };
      parentId?: Id<"messages">;
      branchId?: string;
      sourceConversationId?: Id<"conversations">;
      useWebSearch?: boolean;
      attachments?: Array<{
        type: "image" | "pdf" | "text" | "audio" | "video";
        url: string;
        name: string;
        size: number;
        content?: string;
        thumbnail?: string;
        storageId?: Id<"_storage">;
        mimeType?: string;
      }>;
      citations?: Array<{
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
      }>;
      metadata?: {
        tokenCount?: number;
        finishReason?: string;
        duration?: number;
        stopped?: boolean;
      };
      imageGeneration?: {
        replicateId?: string;
        status?: string;
        output?: string[];
        error?: string;
        metadata?: {
          duration?: number;
          model?: string;
          prompt?: string;
          params?: {
            aspectRatio?: string;
            steps?: number;
            guidanceScale?: number;
            seed?: number;
            negativePrompt?: string;
            count?: number;
          };
        };
      };
      createdAt: number;
      completedAt?: number;
    }>;
  }
) {
  // Get target conversation to extract userId
  const targetConversation = await ctx.db.get(
    "conversations",
    args.targetConversationId
  );
  if (!targetConversation) {
    throw new Error("Target conversation not found");
  }

  const idMap = new Map<string, Id<"messages">>();
  let messageCount = 0;

  for (const m of args.sourceMessages) {
    const newId = await ctx.db.insert("messages", {
      conversationId: args.targetConversationId,
      userId: targetConversation.userId,
      role: m.role,
      content: m.content,
      status: m.status,
      statusText: m.statusText,
      reasoning: m.reasoning,
      model: m.model,
      provider: m.provider,
      reasoningConfig: m.reasoningConfig,
      parentId: m.parentId
        ? (idMap.get(m.parentId as unknown as string) as
            | Id<"messages">
            | undefined)
        : undefined,
      isMainBranch: true,
      branchId: m.branchId,
      sourceConversationId: m.sourceConversationId,
      useWebSearch: m.useWebSearch,
      attachments: m.attachments,
      citations: m.citations,
      metadata: m.metadata,
      imageGeneration: m.imageGeneration,
      createdAt: m.createdAt,
      completedAt: m.completedAt,
    });
    idMap.set(m._id as unknown as string, newId);
    messageCount++;

    // Create userFiles entries if message has attachments
    if (m.attachments && m.attachments.length > 0) {
      await createUserFileEntriesHandler(ctx, {
        userId: targetConversation.userId,
        messageId: newId,
        conversationId: args.targetConversationId,
        attachments: m.attachments,
      });
    }
  }

  // Update conversation's messageCount
  if (messageCount > 0) {
    await ctx.db.patch("conversations", args.targetConversationId, {
      messageCount: (targetConversation.messageCount || 0) + messageCount,
    });
  }
}

export async function createBranchHandler(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    messageId: Id<"messages">;
  }
): Promise<{
  conversationId: Id<"conversations">;
  assistantMessageId?: Id<"messages">;
}> {
  // Ensure to user owns conversation
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }

  const conversation = await ctx.runQuery(api.conversations.get, {
    id: args.conversationId,
  });
  if (!conversation) {
    throw new Error("Conversation not found");
  }
  if (conversation.userId !== userId) {
    throw new Error("Access denied");
  }

  // Get all messages in source conversation
  const allMessages = await ctx.runQuery(
    internal.messages.getAllInConversationInternal,
    {
      conversationId: args.conversationId,
    }
  );
  const branchIndex = allMessages.findIndex(
    (m: Doc<"messages">) => m._id === args.messageId
  );
  if (branchIndex === -1) {
    throw new Error("Message not found in conversation");
  }

  const upToBranch = allMessages.slice(0, branchIndex + 1);

  // Determine root conversation and branch grouping id
  const rootConversationId = (conversation.rootConversationId ||
    conversation._id) as Id<"conversations">;
  const branchGroupId = conversation.branchId || rootConversationId; // fall back to root id as stable group key

  // Create target conversation (empty) and then patch root + branch metadata
  const newConversationId = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      title: conversation.title || "New conversation",
      userId,
      personaId: conversation.personaId,
    }
  );

  // Patch new conversation with branch metadata
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: newConversationId,
    updates: {
      parentConversationId: conversation._id,
      branchFromMessageId: args.messageId,
      branchId: String(branchGroupId),
      rootConversationId,
      // Keep not streaming by default
      isStreaming: false,
    },
    setUpdatedAt: true,
  });

  // Ensure root has rootConversationId and branchId set for grouping
  if (!(conversation.rootConversationId && conversation.branchId)) {
    try {
      await ctx.runMutation(internal.conversations.internalPatch, {
        id: rootConversationId,
        updates: {
          rootConversationId: rootConversationId,
          branchId: String(branchGroupId),
        },
        setUpdatedAt: false,
      });
    } catch (e) {
      console.warn("Failed to backfill root conversation branching fields", e);
    }
  }

  // Sanitize messages to match validator: drop extra fields like _creationTime, conversationId, isMainBranch
  const sanitized = upToBranch.map((d: Doc<"messages">) => ({
    _id: d._id as Id<"messages">,
    role: d.role,
    content: d.content,
    status: d.status,
    statusText: d.statusText, // optional
    reasoning: d.reasoning,
    model: d.model,
    provider: d.provider,
    reasoningConfig: d.reasoningConfig,
    parentId: d.parentId ? (d.parentId as Id<"messages">) : undefined,
    branchId: d.branchId,
    sourceConversationId: d.sourceConversationId
      ? (d.sourceConversationId as Id<"conversations">)
      : undefined,
    useWebSearch: d.useWebSearch,
    attachments: d.attachments,
    citations: d.citations,
    metadata: d.metadata,
    imageGeneration: d.imageGeneration,
    createdAt: d.createdAt,
    completedAt: d.completedAt,
  }));

  // Copy messages up to branch point using internal mutation (preserves timestamps)
  await ctx.runMutation(internal.branches.internalCloneMessages, {
    targetConversationId: newConversationId,
    sourceMessages: sanitized,
  });

  // If last message at branch point is a user message, create an assistant placeholder and mark streaming
  let assistantMessageId: Id<"messages"> | undefined;
  const lastAtBranch = upToBranch[upToBranch.length - 1];
  if (lastAtBranch && lastAtBranch.role === "user") {
    // Prefer last used model in the source conversation; fallback to selected model
    const last = await ctx.runQuery(api.messages.getLastUsedModel, {
      conversationId: args.conversationId,
    });
    let modelId: string | undefined = last?.modelId;
    let provider: string | undefined = last?.provider;
    if (!(modelId && provider)) {
      const selected = await ctx.runQuery(
        api.userModels.getUserSelectedModel,
        {}
      );
      modelId = selected?.modelId;
      provider = selected?.provider as string | undefined;
    }
    if (modelId && provider) {
      // Get model capabilities for proper attachment processing
      const modelInfo = await ctx.runQuery(api.userModels.getModelByID, {
        modelId,
        provider,
      });

      // Build context messages from the cloned conversation (includes attachments)
      const { contextMessages } = await buildContextMessages(ctx, {
        conversationId: newConversationId,
        personaId: conversation.personaId,
        modelCapabilities: {
          supportsImages: modelInfo?.supportsImages ?? false,
          supportsFiles: modelInfo?.supportsFiles ?? false,
        },
        provider,
        modelId,
      });

      const result = await executeStreamingActionForRetry(ctx, {
        conversationId: newConversationId,
        model: modelId,
        provider,
        conversation: { personaId: conversation.personaId },
        contextMessages,
        useWebSearch: true,
      });
      assistantMessageId = result.assistantMessageId as Id<"messages">;
    }
  }

  return { conversationId: newConversationId, assistantMessageId };
}
