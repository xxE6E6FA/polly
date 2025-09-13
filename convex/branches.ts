import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { executeStreamingActionForRetry } from "./lib/conversation_utils";
import { log } from "./lib/logger";
import {
  attachmentSchema,
  extendedMessageMetadataSchema,
  imageGenerationSchema,
  messageStatusSchema,
  reasoningConfigSchema,
  webCitationSchema,
} from "./lib/schemas";

// Internal mutation: clone messages into a new conversation preserving metadata and timestamps
export const internalCloneMessages = internalMutation({
  args: {
    targetConversationId: v.id("conversations"),
    sourceMessages: v.array(
      v.object({
        _id: v.id("messages"),
        role: v.string(),
        content: v.string(),
        status: v.optional(messageStatusSchema),
        statusText: v.optional(v.string()),
        reasoning: v.optional(v.string()),
        model: v.optional(v.string()),
        provider: v.optional(v.string()),
        reasoningConfig: v.optional(reasoningConfigSchema),
        parentId: v.optional(v.id("messages")),
        branchId: v.optional(v.string()),
        sourceConversationId: v.optional(v.id("conversations")),
        useWebSearch: v.optional(v.boolean()),
        attachments: v.optional(v.array(attachmentSchema)),
        citations: v.optional(v.array(webCitationSchema)),
        metadata: v.optional(extendedMessageMetadataSchema),
        imageGeneration: v.optional(imageGenerationSchema),
        createdAt: v.number(),
        completedAt: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const idMap = new Map<string, Id<"messages">>();
    for (const m of args.sourceMessages) {
      const newId = await ctx.db.insert("messages", {
        conversationId: args.targetConversationId,
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
    }
  },
});

export const createBranch = action({
  args: {
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    assistantMessageId: v.optional(v.id("messages")),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    conversationId: Id<"conversations">;
    assistantMessageId?: Id<"messages">;
  }> => {
    // Ensure the user owns the conversation
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
        log.warn("Failed to backfill root conversation branching fields", e);
      }
    }

    // Sanitize messages to match validator: drop extra fields like _creationTime, conversationId, isMainBranch
    const sanitized = upToBranch.map((d: Doc<"messages">) => ({
      _id: d._id,
      role: d.role,
      content: d.content,
      status: d.status,
      statusText: d.statusText, // optional
      reasoning: d.reasoning,
      model: d.model,
      provider: d.provider,
      reasoningConfig: d.reasoningConfig,
      parentId: d.parentId,
      branchId: d.branchId,
      sourceConversationId: d.sourceConversationId,
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

    // If the last message at branch point is a user message, create an assistant placeholder and mark streaming
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
        const result = await executeStreamingActionForRetry(ctx, {
          conversationId: newConversationId,
          model: modelId,
          provider,
          conversation: { personaId: conversation.personaId },
          contextMessages: [],
          useWebSearch: true,
        });
        assistantMessageId = result.assistantMessageId as Id<"messages">;
      }
    }

    return { conversationId: newConversationId, assistantMessageId };
  },
});

export const getBranches = query({
  args: {
    rootConversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    // Return all conversations in the branch group, including root
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_root_updated", q =>
        q.eq("rootConversationId", args.rootConversationId)
      )
      .order("asc")
      .collect();

    // If none, include root if exists (backfill scenario)
    if (!conversations.length) {
      const root = await ctx.db.get(args.rootConversationId);
      return root ? [root] : [];
    }

    // Attach a lightweight preview: first user message after the branch point (when present)
    const results = [] as Array<
      Doc<"conversations"> & {
        previewText?: string | null;
        divergeSnippet?: string | null;
        messagesAfter?: number;
      }
    >;
    for (const conv of conversations) {
      let preview: string | null = null;
      let divergeSnippet: string | null = null;
      let messagesAfter: number | undefined;
      try {
        const msgs = await ctx.db
          .query("messages")
          .withIndex("by_conversation", q => q.eq("conversationId", conv._id))
          .order("asc")
          .collect();
        if (conv.branchFromMessageId) {
          // Find first message created after the branch point
          const branchSource = await ctx.db.get(conv.branchFromMessageId);
          if (branchSource) {
            const firstAfter = msgs.find(
              m => m.createdAt > branchSource.createdAt
            );
            const firstUserAfter = msgs.find(
              m => m.createdAt > branchSource.createdAt && m.role === "user"
            );
            divergeSnippet =
              firstUserAfter?.content || firstAfter?.content || null;
            preview = divergeSnippet;
            // Count how many messages exist after the branch point
            messagesAfter = msgs.filter(
              m => m.createdAt > branchSource.createdAt
            ).length;
          }
        }
        if (!preview) {
          // Fallback to last user message
          const lastUser = [...msgs].reverse().find(m => m.role === "user");
          preview = lastUser?.content || null;
        }
      } catch {
        preview = null;
      }
      results.push({
        ...conv,
        previewText: preview,
        divergeSnippet,
        messagesAfter,
      });
    }
    return results;
  },
});

// (Optional helpers removed; using existing conversations internal mutations instead.)
