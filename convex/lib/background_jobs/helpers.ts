import { ConvexError, type Infer } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import {
  backgroundJobManifestSchema,
  backgroundJobResultSchema,
} from "../schemas";

// Export conversation type definitions
export type ExportAttachment = {
  type: "image" | "pdf" | "text" | "audio" | "video";
  url: string;
  name: string;
  size: number;
  content?: string;
  thumbnail?: string;
  mimeType?: string;
  storageId?: Id<"_storage">;
  textFileId?: Id<"_storage">;
  extractedText?: string;
  generatedImage?: {
    isGenerated: boolean;
    source: string;
    model?: string;
    prompt?: string;
  };
};

export type ExportConversation = {
  conversation: {
    title: string;
    createdAt: number;
    updatedAt: number;
    isArchived: boolean | undefined;
    isPinned: boolean | undefined;
  };
  messages: Array<{
    role: "user" | "assistant" | "system" | "context";
    content: string;
    createdAt: number;
    model: string | undefined;
    provider: string | undefined;
    reasoning: string | undefined;
    attachments?: ExportAttachment[];
    citations?:
      | Array<{
          title: string;
          url: string;
          text?: string;
          author?: string;
          publishedDate?: string;
          image?: string;
          description?: string;
          cited_text?: string;
          snippet?: string;
          favicon?: string;
          siteName?: string;
          type?: string;
        }>
      | undefined;
  }>;
};

// Shared type definitions for create job arguments
export type CreateJobArgs = {
  jobId: string;
  type:
    | "export"
    | "import"
    | "bulk_archive"
    | "bulk_delete"
    | "conversation_summary"
    | "data_migration"
    | "model_migration"
    | "backup";
  category?:
    | "data_transfer"
    | "bulk_operations"
    | "ai_processing"
    | "maintenance";
  totalItems: number;
  title?: string;
  description?: string;
  payload?: unknown;
  priority?: "low" | "normal" | "high" | "urgent";
  conversationIds?: Id<"conversations">[];
  includeAttachments?: boolean;
};

// Shared handler function for creating background jobs
export async function handleCreateBackgroundJob(
  ctx: MutationCtx,
  args: CreateJobArgs,
  userId: Id<"users">,
) {
  // Auto-assign category based on type if not provided
  let category = args.category;
  if (!category) {
    if (args.type === "export" || args.type === "import") {
      category = "data_transfer";
    } else if (args.type === "bulk_archive" || args.type === "bulk_delete") {
      category = "bulk_operations";
    } else if (
      args.type === "conversation_summary" ||
      args.type === "model_migration"
    ) {
      category = "ai_processing";
    } else {
      category = "maintenance";
    }
  }

  const jobId = await ctx.db.insert("backgroundJobs", {
    jobId: args.jobId,
    userId,
    type: args.type,
    category,
    status: "scheduled",
    totalItems: args.totalItems,
    processedItems: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: args.title,
    description: args.description,
    payload: args.payload,
    priority: args.priority || "normal",
    retryCount: 0,
    maxRetries: 3,
    conversationIds: args.conversationIds,
    includeAttachments: args.includeAttachments,
  });

  return jobId;
}

// Shared handler function for updating job status
export async function handleUpdateJobStatus(
  ctx: MutationCtx,
  args: {
    jobId: string;
    status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
    error?: string;
  },
) {
  const job = await ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    throw new ConvexError("Background job not found");
  }

  const updates: {
    status: "scheduled" | "processing" | "completed" | "failed" | "cancelled";
    error?: string;
    updatedAt: number;
    startedAt?: number;
    completedAt?: number;
  } = {
    status: args.status,
    updatedAt: Date.now(),
  };

  if (args.status === "processing" && !job.startedAt) {
    updates.startedAt = Date.now();
  }

  if (args.status === "completed" || args.status === "failed") {
    updates.completedAt = Date.now();
  }

  if (args.error) {
    updates.error = args.error;
  }

  await ctx.db.patch("backgroundJobs", job._id, updates);
}

// Shared handler function for updating job progress
export async function handleUpdateJobProgress(
  ctx: MutationCtx,
  args: {
    jobId: string;
    processedItems: number;
    totalItems?: number;
  },
) {
  const job = await ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    throw new ConvexError("Background job not found");
  }

  const updates: {
    processedItems: number;
    updatedAt: number;
    totalItems?: number;
  } = {
    processedItems: args.processedItems,
    updatedAt: Date.now(),
  };

  if (args.totalItems !== undefined) {
    updates.totalItems = args.totalItems;
  }

  await ctx.db.patch("backgroundJobs", job._id, updates);
}

// Shared handler function for saving export result
export async function handleSaveExportResult(
  ctx: MutationCtx,
  args: {
    jobId: string;
    manifest: Infer<typeof backgroundJobManifestSchema>;
    fileStorageId: Id<"_storage">;
    status: "completed" | "failed";
  },
) {
  const job = await ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    throw new ConvexError("Background job not found");
  }

  await ctx.db.patch("backgroundJobs", job._id, {
    manifest: args.manifest,
    fileStorageId: args.fileStorageId,
    status: args.status,
    completedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// Shared handler function for saving import result
export async function handleSaveImportResult(
  ctx: MutationCtx,
  args: {
    jobId: string;
    result: Infer<typeof backgroundJobResultSchema>;
    status: "completed" | "failed";
    error?: string;
  },
) {
  const job = await ctx.db
    .query("backgroundJobs")
    .filter((q) => q.eq(q.field("jobId"), args.jobId))
    .first();

  if (!job) {
    throw new ConvexError("Background job not found");
  }

  const updates: {
    status: "completed" | "failed";
    updatedAt: number;
    completedAt: number;
    result: Infer<typeof backgroundJobResultSchema>;
    error?: string;
  } = {
    status: args.status,
    updatedAt: Date.now(),
    completedAt: Date.now(),
    result: args.result,
  };

  if (args.error) {
    updates.error = args.error;
  }

  await ctx.db.patch("backgroundJobs", job._id, updates);
}

// Function to create Convex export data structure
export const createConvexExportData = (
  conversations: ExportConversation[],
  includeAttachments: boolean,
  embedAttachmentsInJson = true,
) => {
  // Calculate attachment statistics
  let totalAttachments = 0;
  const attachmentTypes = new Map<string, number>();
  let totalAttachmentSize = 0;

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.attachments) {
        for (const attachment of message.attachments) {
          totalAttachments++;
          attachmentTypes.set(
            attachment.type,
            (attachmentTypes.get(attachment.type) || 0) + 1,
          );
          totalAttachmentSize += attachment.size || 0;
        }
      }
    }
  }

  const manifest = {
    totalConversations: conversations.length,
    totalMessages: conversations.reduce(
      (sum, conv) => sum + conv.messages.length,
      0,
    ),
    totalAttachments,
    attachmentTypes: Object.fromEntries(attachmentTypes),
    totalAttachmentSizeBytes: totalAttachmentSize,
    conversationDateRange:
      conversations.length > 0
        ? {
            earliest: Math.min(
              ...conversations.map((c) => c.conversation.createdAt),
            ),
            latest: Math.max(
              ...conversations.map((c) => c.conversation.updatedAt),
            ),
          }
        : { earliest: Date.now(), latest: Date.now() },
    conversationTitles: conversations
      .slice(0, 10)
      .map((c) => c.conversation.title),
    includeAttachments,
    version: "1.0.0",
  };

  return {
    source: "Polly",
    version: "1.0.0",
    exportedAt: Date.now(),
    manifest,
    conversations: conversations.map((conv) => ({
      title: conv.conversation.title,
      createdAt: conv.conversation.createdAt,
      updatedAt: conv.conversation.updatedAt,
      isArchived: conv.conversation.isArchived,
      isPinned: conv.conversation.isPinned,
      messages: conv.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        model: msg.model,
        provider: msg.provider,
        reasoning: msg.reasoning,
        attachments:
          includeAttachments && msg.attachments
            ? msg.attachments.map((attachment) => {
                if (embedAttachmentsInJson) {
                  // Include all attachment data when embedding in JSON
                  return attachment as ExportAttachment;
                }
                // Exclude storage references and content when not embedding
                const {
                  storageId: _,
                  textFileId: __,
                  content: ___,
                  ...rest
                } = attachment;
                return rest as Omit<
                  ExportAttachment,
                  "storageId" | "textFileId" | "content"
                >;
              })
            : undefined,
        citations: msg.citations,
      })),
    })),
  };
};
