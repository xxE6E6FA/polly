import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { Citation } from "../../types";
import {
  incrementUserMessageStats,
} from "../conversation_utils";
import { scheduleRunAfter } from "../scheduler";
import { getAuthenticatedUserWithDataForAction } from "../shared_utils";

export async function savePrivateConversationHandler(
  ctx: ActionCtx,
  args: {
    messages: Array<{
      role: string;
      content: string;
      createdAt: number;
      model?: string;
      provider?: string;
      reasoning?: string;
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
      citations?: Citation[];
      metadata?: {
        tokenCount?: number;
        finishReason?: string;
        duration?: number;
        stopped?: boolean;
      };
    }>;
    title?: string;
    personaId?: Id<"personas">;
  }
): Promise<Id<"conversations">> {
  // Get authenticated user - this is the correct pattern for actions
  const { user } = await getAuthenticatedUserWithDataForAction(ctx);

  // Block anonymous users from saving private conversations
  if (user.isAnonymous) {
    throw new Error("Anonymous users cannot save private conversations.");
  }
  // Generate a title from the first user message or use provided title
  const conversationTitle = args.title || "New conversation";

  // Create the conversation (without any initial messages since we'll add them manually)
  const conversationId = await ctx.runMutation(
    internal.conversations.createEmptyInternal,
    {
      title: conversationTitle,
      userId: user._id,
      personaId: args.personaId,
    }
  );

  // Extract model/provider from the first user message for stats tracking
  // Only increment stats once for the entire conversation, not per message
  const firstUserMessage = args.messages.find(msg => msg.role === "user");
  if (firstUserMessage?.model && firstUserMessage?.provider) {
    try {
      // Increment user message stats
      await incrementUserMessageStats(
        ctx,
        user._id,
        firstUserMessage.model,
        firstUserMessage.provider
      );
    } catch (error) {
      // If the model doesn't exist in the user's database, skip stats increment
      // This can happen when importing private conversations with models the user no longer has
      console.warn(
        `Skipping stats increment for model ${firstUserMessage.model}/${firstUserMessage.provider}: ${error}`
      );
    }
  }

  // Process and save all messages to the conversation
  for (const message of args.messages as Array<{
    role: string;
    content: string;
    createdAt: number;
    model?: string;
    provider?: string;
    reasoning?: string;
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
    citations?: Citation[];
    metadata?: {
      tokenCount?: number;
      finishReason?: string;
      duration?: number;
      stopped?: boolean;
    };
  }>) {
    // Skip empty messages and system messages (these are not user-facing)
    if (
      !message.content ||
      message.content.trim() === "" ||
      message.role === "system" ||
      message.role === "context"
    ) {
      continue;
    }

    // Ensure attachment urls are never undefined
    const processedAttachments = message.attachments?.map(a => ({
      ...a,
      url: a.url || "",
    }));

    await ctx.runMutation(api.messages.create, {
      conversationId,
      role: message.role,
      content: message.content,
      model: message.model,
      provider: message.provider,
      reasoning: message.reasoning,
      attachments: processedAttachments,
      metadata: message.metadata,
      isMainBranch: true,
    });

    // If the message has citations, we need to update it after creation
    // since citations aren't in the create args
    if (message.citations && message.citations.length > 0) {
      const createdMessages = await ctx.runQuery(
        api.messages.getAllInConversation,
        { conversationId }
      );
      const lastMessage = createdMessages[createdMessages.length - 1];
      if (lastMessage) {
        await ctx.runMutation(internal.messages.internalUpdate, {
          id: lastMessage._id,
          citations: message.citations,
        });
      }
    }
  }

  // Mark conversation as not streaming since all messages are already complete
  await ctx.runMutation(internal.conversations.internalPatch, {
    id: conversationId,
    updates: { isStreaming: false },
    setUpdatedAt: true,
  });

  // Schedule title generation if not provided
  if (!args.title) {
    const firstMessage = args.messages?.[0];
    if (firstMessage && typeof firstMessage.content === "string") {
      await scheduleRunAfter(ctx, 100, api.titleGeneration.generateTitle, {
        conversationId,
        message: firstMessage.content,
      });
    }
  }

  return conversationId;
}
