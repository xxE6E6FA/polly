import { getAuthUserId } from "../auth";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import type { ExportConversation } from "./helpers";

// Handler for getExportDownloadUrl query
export async function handleGetExportDownloadUrl(
  ctx: QueryCtx,
  args: { jobId: string },
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  const job = await ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    return null;
  }

  if (job.userId !== userId) {
    return null;
  }

  if (job.status !== "completed" || !job.fileStorageId) {
    return null;
  }

  const downloadUrl = await ctx.storage.getUrl(job.fileStorageId);

  return {
    downloadUrl,
    manifest: job.manifest,
  };
}

// Handler for listUserJobs query
export async function handleListUserJobs(
  ctx: QueryCtx,
  args: {
    limit?: number;
    type?:
      | "export"
      | "import"
      | "bulk_archive"
      | "bulk_delete"
      | "conversation_summary"
      | "data_migration"
      | "model_migration"
      | "backup"
      | "memory_scan";
    status?:
      | "scheduled"
      | "processing"
      | "completed"
      | "failed"
      | "cancelled";
  },
) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return [];
  }

  let query = ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("userId"), userId))
    .order("desc");

  if (args.type) {
    query = query.filter((q) => q.eq(q.field("type"), args.type));
  }

  if (args.status) {
    query = query.filter((q) => q.eq(q.field("status"), args.status));
  }

  const limit = args.limit || 50;
  return await query.take(limit);
}

// Handler for getExportData internal query
export async function handleGetExportData(
  ctx: QueryCtx,
  args: {
    conversationIds: Id<"conversations">[];
    userId: Id<"users">;
    includeAttachments?: boolean;
  },
): Promise<ExportConversation[]> {
  const conversations = await Promise.all(
    args.conversationIds.map(async (conversationId) => {
      const conversation = await ctx.db.get("conversations", conversationId);
      if (!conversation || conversation.userId !== args.userId) {
        return null;
      }

      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversationId),
        )
        .filter((q) => q.eq(q.field("isMainBranch"), true))
        .order("asc")
        .collect();

      return {
        conversation: {
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          isArchived: conversation.isArchived,
          isPinned: conversation.isPinned,
        },
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
          createdAt: message.createdAt,
          model: message.model,
          provider: message.provider,
          reasoning: message.reasoning,
          attachments:
            args.includeAttachments && Array.isArray(message.attachments)
              ? message.attachments.map((attachment) => ({
                  type: attachment.type,
                  url: attachment.url,
                  name: attachment.name,
                  size: attachment.size,
                  content: attachment.content,
                  thumbnail: attachment.thumbnail,
                  mimeType: attachment.mimeType,
                  storageId: attachment.storageId,
                  textFileId: attachment.textFileId,
                  extractedText: attachment.extractedText,
                  generatedImage: attachment.generatedImage,
                }))
              : undefined,
          citations: message.citations,
        })),
      } as ExportConversation;
    }),
  );

  return conversations.filter((conv) => conv !== null) as ExportConversation[];
}
