import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  getAuthenticatedUser,
  validateConversationAccess,
} from "../shared_utils";

/**
 * Get attachments for a single message from userFiles table
 * This is the primary query for the full migration from messages.attachments
 */
export async function getMessageAttachmentsHandler(
  ctx: QueryCtx,
  args: { messageId: Id<"messages"> }
) {
  // Check authentication
  await getAuthenticatedUser(ctx);

  // Get the message to find its conversation
  const message = await ctx.db.get("messages", args.messageId);
  if (!message) {
    throw new Error("Message not found");
  }

  // Check access to the conversation
  await validateConversationAccess(ctx, message.conversationId, false);

  const userFiles = await ctx.db
    .query("userFiles")
    .withIndex("by_message", q => q.eq("messageId", args.messageId))
    .collect();

  // Convert userFiles to attachment format
  const attachments = await Promise.all(
    userFiles.map(async file => {
      // Generate URL from storageId
      const url = (await ctx.storage.getUrl(file.storageId)) ?? "";

      return {
        type: file.type,
        url,
        name: file.name,
        size: file.size,
        content: file.content,
        thumbnail: file.thumbnail,
        storageId: file.storageId,
        mimeType: file.mimeType,
        textFileId: file.textFileId,
        extractedText: file.extractedText,
        extractionError: file.extractionError,
        generatedImage: file.isGenerated
          ? {
              isGenerated: true,
              source: file.generatedImageSource ?? "unknown",
              model: file.generatedImageModel,
              prompt: file.generatedImagePrompt,
            }
          : undefined,
      };
    })
  );

  return attachments;
}

/**
 * Get attachments for multiple messages in a single query (batched)
 * More efficient than calling getMessageAttachments multiple times
 */
export async function getBatchMessageAttachmentsHandler(
  ctx: QueryCtx,
  args: { messageIds: Id<"messages">[] }
) {
  // Check authentication
  await getAuthenticatedUser(ctx);

  // Fetch all messages to verify access
  const messages = await Promise.all(
    args.messageIds.map(id => ctx.db.get("messages", id))
  );

  // Verify access for every message's conversation
  const conversationIds = new Set<Id<"conversations">>();
  for (const message of messages) {
    if (!message) {
      throw new Error("One or more messages not found");
    }
    conversationIds.add(message.conversationId);
  }

  // Check access to all conversations
  for (const conversationId of conversationIds) {
    await validateConversationAccess(ctx, conversationId, false);
  }

  // Fetch all userFiles for these messages
  const allFiles = await Promise.all(
    args.messageIds.map(async messageId => {
      const files = await ctx.db
        .query("userFiles")
        .withIndex("by_message", q => q.eq("messageId", messageId))
        .collect();
      return { messageId, files };
    })
  );

  // Build a map of messageId -> attachments
  const attachmentsByMessage: Record<
    string,
    Awaited<ReturnType<typeof buildAttachmentFromFile>>[]
  > = {};

  for (const { messageId, files } of allFiles) {
    const attachments = await Promise.all(
      files.map(file => buildAttachmentFromFile(ctx, file))
    );

    attachmentsByMessage[messageId] = attachments;
  }

  return attachmentsByMessage;
}

async function buildAttachmentFromFile(
  ctx: QueryCtx,
  file: {
    storageId: Id<"_storage">;
    type: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
    mimeType?: string;
    textFileId?: Id<"_storage">;
    extractedText?: string;
    extractionError?: string;
    isGenerated: boolean;
    generatedImageSource?: string;
    generatedImageModel?: string;
    generatedImagePrompt?: string;
  }
) {
  const url = (await ctx.storage.getUrl(file.storageId)) ?? "";

  return {
    type: file.type,
    url,
    name: file.name,
    size: file.size,
    content: file.content,
    thumbnail: file.thumbnail,
    storageId: file.storageId,
    mimeType: file.mimeType,
    textFileId: file.textFileId,
    extractedText: file.extractedText,
    extractionError: file.extractionError,
    generatedImage: file.isGenerated
      ? {
          isGenerated: true,
          source: file.generatedImageSource ?? "unknown",
          model: file.generatedImageModel,
          prompt: file.generatedImagePrompt,
        }
      : undefined,
  };
}
