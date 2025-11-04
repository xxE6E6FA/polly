import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import JSZip from "jszip";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import type { ExportAttachment, ExportConversation } from "./backgroundJobs";
import { createConvexExportData } from "./backgroundJobs";
import { scheduleRunAfter } from "./lib/scheduler";

// Schedule a background export job
export const scheduleBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    includeAttachmentContent: v.optional(v.boolean()),
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    // Generate export metadata
    const metadata = generateExportMetadata(
      args.conversationIds,
      args.includeAttachmentContent ?? false
    );

    // Create export job record with enhanced metadata
    await ctx.runMutation(internal.backgroundJobs.internalCreate, {
      jobId: args.jobId,
      userId,
      type: "export",
      totalItems: args.conversationIds.length,
      title: metadata.title,
      description: metadata.description,
      conversationIds: args.conversationIds,
      includeAttachments: args.includeAttachmentContent,
    });

    // Schedule the export processing
    await scheduleRunAfter(
      ctx,
      100,
      api.conversationExport.processBackgroundExport,
      {
        conversationIds: args.conversationIds,
        jobId: args.jobId,
        includeAttachments: args.includeAttachmentContent ?? false,
        userId,
      }
    );

    return { jobId: args.jobId, status: "scheduled" };
  },
});

// Process a scheduled export job
export const processBackgroundExport = action({
  args: {
    conversationIds: v.array(v.id("conversations")),
    jobId: v.string(),
    includeAttachments: v.boolean(),
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ success: boolean; exportedCount: number }> => {
    try {
      // Update status to processing
      await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
        jobId: args.jobId,
        status: "processing",
      });

      // Update initial progress
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: 0,
        totalItems: args.conversationIds.length,
      });

      // Get export data using internal query
      const exportData: ExportConversation[] = await ctx.runQuery(
        internal.backgroundJobs.getExportData,
        {
          conversationIds: args.conversationIds,
          userId: args.userId,
          includeAttachments: args.includeAttachments,
        }
      );

      const hydratedExportData = await hydrateExportDataWithAttachments(
        ctx,
        exportData,
        args.includeAttachments
      );

      if (exportData.length === 0) {
        throw new Error("No conversations found for export");
      }

      // Update progress after data retrieval
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: Math.floor(args.conversationIds.length * 0.5),
        totalItems: args.conversationIds.length,
      });

      // Create the export data structure using the regular function
      const convexExportData = createConvexExportData(
        hydratedExportData,
        args.includeAttachments,
        false // Don't embed attachments in JSON when creating ZIP
      );

      // Update progress before file creation
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: Math.floor(args.conversationIds.length * 0.8),
        totalItems: args.conversationIds.length,
      });

      let fileStorageId: Id<"_storage">;
      let fileSizeBytes: number;

      if (args.includeAttachments) {
        // Create ZIP file with JSON and attachments
        const zip = new JSZip();

        // Add the JSON file
        const exportJson = JSON.stringify(convexExportData, null, 2);
        zip.file("export.json", exportJson);

        // Add attachment files
        for (const conversation of hydratedExportData) {
          for (const message of conversation.messages) {
            if (message.attachments) {
              for (const attachment of message.attachments) {
                let binaryData: Uint8Array | null = null;

                // Ensure unique filenames to avoid conflicts
                const timestamp = Date.now();
                const extension = attachment.name.split(".").pop();
                const baseName = attachment.name.replace(/\.[^/.]+$/, "");
                const fileName = `${baseName}_${timestamp}.${extension}`;

                if (
                  attachment.content &&
                  typeof attachment.content === "string"
                ) {
                  if (attachment.type === "text") {
                    // For text attachments, content is the actual text
                    binaryData = new TextEncoder().encode(attachment.content);
                  } else {
                    // For binary attachments, content should be base64
                    try {
                      binaryData = Uint8Array.from(
                        atob(attachment.content),
                        c => c.charCodeAt(0)
                      );
                    } catch (error) {
                      console.warn(
                        "Failed to decode base64 content for attachment",
                        {
                          name: attachment.name,
                          type: attachment.type,
                          error,
                        }
                      );
                    }
                  }
                } else if (attachment.storageId) {
                  // Fetch from storage if not already in content
                  try {
                    const blob = await ctx.storage.get(attachment.storageId);
                    if (blob) {
                      const arrayBuffer = await blob.arrayBuffer();
                      binaryData = new Uint8Array(arrayBuffer);
                    }
                  } catch (error) {
                    console.warn(
                      "Failed to fetch attachment from storage during ZIP creation",
                      {
                        name: attachment.name,
                        storageId: attachment.storageId,
                        error,
                      }
                    );
                  }
                }

                if (binaryData) {
                  // Create a folder structure: attachments/conversation_title/filename
                  const safeConversationTitle = conversation.conversation.title
                    .replace(/[^a-zA-Z0-9\s-_]/g, "")
                    .replace(/\s+/g, "_")
                    .substring(0, 50);

                  zip.file(
                    `attachments/${safeConversationTitle}/${fileName}`,
                    binaryData
                  );

                  // Also add extracted text for PDFs if available
                  if (attachment.type === "pdf" && attachment.extractedText) {
                    const textFileName = `${baseName}_extracted_text_${timestamp}.txt`;
                    const textData = new TextEncoder().encode(
                      attachment.extractedText
                    );
                    zip.file(
                      `attachments/${safeConversationTitle}/${textFileName}`,
                      textData
                    );
                  }
                }
              }
            }
          }
        }

        // Generate ZIP file
        const zipBlob = await zip.generateAsync({ type: "blob" });
        fileSizeBytes = zipBlob.size;

        // Store the ZIP file
        fileStorageId = await ctx.storage.store(
          new Blob([zipBlob], { type: "application/zip" })
        );
      } else {
        // Convert to JSON string
        const exportJson = JSON.stringify(convexExportData, null, 2);
        fileSizeBytes = new Blob([exportJson]).size;

        // Store the export file
        fileStorageId = await ctx.storage.store(
          new Blob([exportJson], { type: "application/json" })
        );
      }

      // Update final progress
      await ctx.runMutation(internal.backgroundJobs.internalUpdateProgress, {
        jobId: args.jobId,
        processedItems: args.conversationIds.length,
        totalItems: args.conversationIds.length,
      });

      // Update manifest with file size
      const updatedManifest = {
        ...convexExportData.manifest,
        fileSizeBytes,
      };

      // Save the export result
      await ctx.runMutation(internal.backgroundJobs.internalSaveExportResult, {
        jobId: args.jobId,
        manifest: updatedManifest,
        fileStorageId,
        status: "completed",
      });

      return { success: true, exportedCount: exportData.length };
    } catch (error) {
      await ctx.runMutation(internal.backgroundJobs.internalUpdateStatus, {
        jobId: args.jobId,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },
});

export function hydrateExportDataWithAttachments(
  ctx: ActionCtx,
  conversations: ExportConversation[],
  includeAttachments: boolean
): Promise<ExportConversation[]> {
  if (!includeAttachments) {
    return Promise.resolve(conversations);
  }

  return Promise.all(
    conversations.map(async conversation => ({
      ...conversation,
      messages: await Promise.all(
        conversation.messages.map(async message => {
          if (!message.attachments || message.attachments.length === 0) {
            return message;
          }

          const enrichedAttachments = await Promise.all(
            message.attachments.map(attachment =>
              hydrateAttachmentForExport(ctx, attachment)
            )
          );

          return {
            ...message,
            attachments: enrichedAttachments,
          };
        })
      ),
    }))
  );
}

async function hydrateAttachmentForExport(
  ctx: ActionCtx,
  attachment: ExportAttachment
): Promise<ExportAttachment> {
  const { storageId, textFileId } = attachment;

  let content = attachment.content;
  let extractedText = attachment.extractedText;
  let url = attachment.url;
  const mimeType = inferMimeType(attachment);

  let binaryBase64: string | undefined;

  // Handle storage-based attachments
  if (storageId) {
    try {
      const blob = await ctx.storage.get(storageId);
      if (blob) {
        const arrayBuffer = await blob.arrayBuffer();
        binaryBase64 = arrayBufferToBase64(arrayBuffer);

        // For text attachments, try to get the text content
        if (attachment.type === "text" && !content) {
          try {
            content = await blob.text();
          } catch (error) {
            console.warn("Failed to read text content from storage", {
              name: attachment.name,
              storageId,
              error,
            });
          }
        }
      } else {
        console.warn("Attachment blob missing during export", {
          name: attachment.name,
          storageId,
        });
      }
    } catch (error) {
      console.warn("Failed to read attachment blob during export", {
        name: attachment.name,
        storageId,
        error,
      });
    }
  }

  // Use binary data as content if no content is available
  if (!content && binaryBase64) {
    content = binaryBase64;
  }

  // Handle text file extraction for PDFs
  if (textFileId && !extractedText) {
    try {
      const textBlob = await ctx.storage.get(textFileId);
      if (textBlob) {
        extractedText = await textBlob.text();
      }
    } catch (error) {
      console.warn("Failed to read attachment text blob during export", {
        name: attachment.name,
        textFileId,
        error,
      });
    }
  }

  // Handle inline content for different attachment types
  const inlineBinaryBase64 =
    !storageId &&
    attachment.type !== "text" &&
    typeof content === "string" &&
    attachment.mimeType
      ? content
      : undefined;

  const base64ForDataUrl =
    binaryBase64 ??
    inlineBinaryBase64 ??
    (attachment.type === "text" && typeof content === "string"
      ? encodeTextToBase64(content)
      : undefined);

  // Build URL for the attachment
  if (!url) {
    if (base64ForDataUrl) {
      url = buildDataUrl(mimeType, base64ForDataUrl);
    } else if (storageId) {
      url = (await ctx.storage.getUrl(storageId)) ?? "";
    }
  } else if (binaryBase64 && !url.startsWith("data:")) {
    url = buildDataUrl(mimeType, binaryBase64);
  }

  const sanitized: ExportAttachment = {
    type: attachment.type,
    name: attachment.name,
    size: attachment.size,
    url: url || "",
    thumbnail: attachment.thumbnail,
    content,
    mimeType,
    extractedText,
    generatedImage: attachment.generatedImage,
    storageId: attachment.storageId, // Keep storage reference for debugging
    textFileId: attachment.textFileId, // Keep text file reference for debugging
  };

  return sanitized;
}

function inferMimeType(attachment: ExportAttachment): string {
  if (attachment.mimeType) {
    return attachment.mimeType;
  }

  if (attachment.type === "image") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "svg":
        return "image/svg+xml";
      default:
        return "image/png";
    }
  }

  if (attachment.type === "pdf") {
    return "application/pdf";
  }

  if (attachment.type === "text") {
    return "text/plain; charset=utf-8";
  }

  return "application/octet-stream";
}

function buildDataUrl(mimeType: string, base64Content: string): string {
  return `data:${mimeType};base64,${base64Content}`;
}

function encodeTextToBase64(content: string): string {
  if (typeof TextEncoder !== "undefined") {
    return uint8ArrayToBase64(new TextEncoder().encode(content));
  }

  // Fallback encoder for environments without TextEncoder (should be rare)
  const utf8: number[] = [];
  for (let i = 0; i < content.length; i++) {
    const codePoint = content.charCodeAt(i);
    if (codePoint < 0x80) {
      utf8.push(codePoint);
    } else if (codePoint < 0x800) {
      utf8.push(0xc0 | (codePoint >> 6));
      utf8.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      // Handle surrogate pairs
      const next = content.charCodeAt(++i);
      const combined = 0x10000 + ((codePoint & 0x3ff) << 10) + (next & 0x3ff);
      utf8.push(0xf0 | (combined >> 18));
      utf8.push(0x80 | ((combined >> 12) & 0x3f));
      utf8.push(0x80 | ((combined >> 6) & 0x3f));
      utf8.push(0x80 | (combined & 0x3f));
    } else {
      utf8.push(0xe0 | (codePoint >> 12));
      utf8.push(0x80 | ((codePoint >> 6) & 0x3f));
      utf8.push(0x80 | (codePoint & 0x3f));
    }
  }
  return uint8ArrayToBase64(Uint8Array.from(utf8));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }

  let base64 = "";
  let i = 0;
  const len = bytes.length;
  const getByte = (index: number) => {
    const value = bytes[index];
    if (value === undefined) {
      throw new Error(`Unexpected missing byte at index ${index}`);
    }
    return value;
  };

  for (; i + 2 < len; i += 3) {
    const byte1 = getByte(i);
    const byte2 = getByte(i + 1);
    const byte3 = getByte(i + 2);
    base64 += BASE64_CHARS[byte1 >> 2];
    base64 += BASE64_CHARS[((byte1 & 0x03) << 4) | (byte2 >> 4)];
    base64 += BASE64_CHARS[((byte2 & 0x0f) << 2) | (byte3 >> 6)];
    base64 += BASE64_CHARS[byte3 & 0x3f];
  }

  const remaining = len - i;

  if (remaining === 1) {
    const byte = getByte(i);
    base64 += BASE64_CHARS[byte >> 2];
    base64 += BASE64_CHARS[(byte & 0x03) << 4];
    base64 += "==";
  } else if (remaining === 2) {
    const byte1 = getByte(i);
    const byte2 = getByte(i + 1);
    base64 += BASE64_CHARS[byte1 >> 2];
    base64 += BASE64_CHARS[((byte1 & 0x03) << 4) | (byte2 >> 4)];
    base64 += BASE64_CHARS[(byte2 & 0x0f) << 2];
    base64 += "=";
  }

  return base64;
}

// Helper function to generate export metadata
function generateExportMetadata(
  conversationIds: string[],
  includeAttachments: boolean
) {
  const dateStr = new Date().toLocaleDateString();
  const count = conversationIds.length;
  const title =
    count === 1
      ? `Export Conversation - ${dateStr}`
      : `Export ${count} Conversations - ${dateStr}`;
  const description = `Export of ${count} conversation${
    count !== 1 ? "s" : ""
  } on ${dateStr}${includeAttachments ? " (with attachments)" : ""}`;

  return { title, description };
}
