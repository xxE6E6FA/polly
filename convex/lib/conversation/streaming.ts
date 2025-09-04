import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { ConvexError } from "convex/values";
import { api } from "../../_generated/api";
 
import { getAuthUserId } from "@convex-dev/auth/server";
import type { StreamingActionResult, MessageActionArgs } from "./types";
import { createMessage, incrementUserMessageStats } from "./message_handling";

// Process attachments for storage
export const processAttachmentsForStorage = async (
  _ctx: ActionCtx, // Reserved for future use
  attachments: Array<{
    storageId?: Id<"_storage">;
    url?: string;
    name: string;
    type: "image" | "pdf" | "text";
    size: number;
    content?: string;
    thumbnail?: string;
  }>
): Promise<
  Array<{
    storageId?: Id<"_storage">;
    url: string;
    name: string;
    type: "image" | "pdf" | "text";
    size: number;
    content?: string;
    thumbnail?: string;
    mimeType?: string;
  }>
> => {
  // For now, just pass through the attachments ensuring url is set
  // In a real implementation, you might want to process or validate them
  return attachments.map(attachment => ({
    ...attachment,
    url: attachment.url || "", // Ensure url is never undefined
  }));
};

// (buildContextMessages and handleStreamingError removed; not used in HTTP streaming path)

// Create executeStreamingAction for retry functionality
export const executeStreamingActionForRetry = async (
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">;
    model: string;
    provider: string;
    conversation: any; // Doc<"conversations">
    contextMessages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    useWebSearch: boolean;
    reasoningConfig?: any;
  }
): Promise<StreamingActionResult> => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new ConvexError("Not authenticated");
  }

  const { conversationId, model, provider } = args;

  // Create streaming assistant message
  const assistantMessageId = await createMessage(ctx, {
    conversationId,
    role: "assistant",
    content: "", // Empty content for streaming
    model,
    provider: provider as "openai" | "anthropic" | "google" | "groq" | "openrouter" | "replicate" | "elevenlabs",
    metadata: {
      status: "pending",
    },
  });

  // Set conversation as streaming
  await ctx.runMutation(api.conversations.setStreaming, {
    conversationId,
    isStreaming: true,
  });

  // Increment user stats
  await incrementUserMessageStats(ctx, userId, model, provider);

  return {
    assistantMessageId,
  };
};

export {
  type StreamingActionResult,
  type MessageActionArgs,
};
