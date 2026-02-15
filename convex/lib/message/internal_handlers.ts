import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { withRetry } from "../../ai/error_handlers";
import { createUserFileEntriesHandler } from "../file_storage/mutation_handlers";
import { getStorageIdsSafeToDelete } from "../file_storage/helpers";
import type {
  attachmentSchema,
  extendedMessageMetadataSchema,
  messageStatusSchema,
  providerSchema,
  reasoningPartSchema,
  toolCallSchema,
  ttsAudioCacheEntrySchema,
  webCitationSchema,
} from "../schemas";
import type { Infer } from "convex/values";

export async function internalUpdateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"messages">;
    content?: string;
    reasoning?: string;
    model?: string;
    provider?: Infer<typeof providerSchema>;
    citations?: Infer<typeof webCitationSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
    toolCalls?: Infer<typeof toolCallSchema>[];
    attachments?: Infer<typeof attachmentSchema>[];
    reasoningParts?: Infer<typeof reasoningPartSchema>[];
    appendContent?: string;
    appendReasoning?: string;
    clearMetadataFields?: string[];
  }
) {
  const { id, appendContent, appendReasoning, clearMetadataFields, ...rest } =
    args;

  return await withRetry(async () => {
    // Check if message exists before patching
    const message = await ctx.db.get("messages", id);
    if (!message) {
      return; // Return silently instead of throwing
    }

    // Don't overwrite error status - if message already has an error, skip metadata updates
    if (message.status === "error" && rest.metadata) {
      // Still allow non-metadata updates (like model/provider changes)
      const { metadata: _metadata, ...nonMetadataUpdates } = rest;
      if (Object.keys(nonMetadataUpdates).length > 0) {
        const updates: Partial<Doc<"messages">> = { ...nonMetadataUpdates };
        if (appendContent) {
          updates.content = (message.content || "") + appendContent;
        }
        if (appendReasoning) {
          updates.reasoning = (message.reasoning || "") + appendReasoning;
        }
        return await ctx.db.patch("messages", id, updates);
      }
      return;
    }

    const updates: Partial<Doc<"messages">> = { ...rest };
    if (appendContent) {
      updates.content = (message.content || "") + appendContent;
    }
    if (appendReasoning) {
      updates.reasoning = (message.reasoning || "") + appendReasoning;
    }

    // Handle explicit metadata field deletions by merging with existing metadata
    // and setting fields to undefined (which Convex will delete from the document)
    if (clearMetadataFields && clearMetadataFields.length > 0) {
      const existingMetadata = (message.metadata || {}) as Record<
        string,
        unknown
      >;
      const newMetadata: Record<string, unknown> = {
        ...existingMetadata,
        ...(rest.metadata || {}),
      };
      for (const field of clearMetadataFields) {
        newMetadata[field] = undefined;
      }
      updates.metadata = newMetadata as typeof message.metadata;
    }

    return await ctx.db.patch("messages", id, updates);
  });
}

export async function updateContentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    content: string;
    reasoning?: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
    };
    providerMessageId?: string;
    timestamp?: string;
    warnings?: string[];
    citations?: Infer<typeof webCitationSchema>[];
    timeToFirstTokenMs?: number;
    tokensPerSecond?: number;
  }
) {
  const {
    messageId,
    usage,
    finishReason,
    tokenUsage,
    providerMessageId,
    timestamp,
    warnings,
    citations,
    timeToFirstTokenMs,
    tokensPerSecond,
    ...updates
  } = args;

  // Check if message exists before patching
  const message = await ctx.db.get("messages", messageId);
  if (!message) {
    return false; // Message not found
  }

  // Don't overwrite error status - if message already has an error, skip metadata updates
  if (message.status === "error") {
    return false;
  }

  // If message is already done/stopped and we are NOT just finishing it (i.e. we are still streaming content),
  // then we should stop.
  // If finishReason is provided in args, we are finishing it.
  // If message.metadata?.finishReason is already set, it was stopped by user.
  if (message.metadata?.finishReason && !finishReason) {
    return false; // Stopped by user
  }

  // Build the update object
  const updateData: Record<string, unknown> = {
    ...updates,
    completedAt: Date.now(),
  };

  if (citations) {
    updateData.citations = citations;
  }

  if (finishReason) {
    updateData.status = "done";
    updateData.metadata = {
      ...(message.metadata || {}),
      finishReason,
      ...(usage && { usage }),
      ...(tokenUsage && { tokenUsage }),
      ...(providerMessageId && { providerMessageId }),
      ...(timestamp && { timestamp }),
      ...(warnings && { warnings }),
      ...(timeToFirstTokenMs && { timeToFirstTokenMs }),
      ...(tokensPerSecond && { tokensPerSecond }),
    };
  }

  await ctx.db.patch("messages", messageId, updateData);

  // Update rolling token estimate for assistant final content
  const updated = await ctx.db.get("messages", messageId);
  if (updated && updated.role === "assistant") {
    const delta = Math.max(1, Math.ceil((updates.content || "").length / 4));
    await withRetry(
      async () => {
        const freshConv = await ctx.db.get(
          "conversations",
          updated.conversationId
        );
        if (!freshConv) {
          return;
        }
        await ctx.db.patch("conversations", updated.conversationId, {
          tokenEstimate: Math.max(0, (freshConv.tokenEstimate || 0) + delta),
        });
      },
      5,
      25
    );
  }

  return true;
}

export async function setTtsAudioCacheHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    entries?: Infer<typeof ttsAudioCacheEntrySchema>[];
  }
) {
  await ctx.db.patch("messages", args.messageId, {
    ttsAudioCache: args.entries ?? undefined,
  });
}

export async function getAllInConversationInternalHandler(
  ctx: QueryCtx,
  args: { conversationId: Id<"conversations"> }
) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .order("asc")
    .collect();

  return await Promise.all(
    messages.map(async message => {
      if (message.attachments) {
        const resolvedAttachments = await Promise.all(
          message.attachments.map(async attachment => {
            if (attachment.storageId) {
              const url = await ctx.storage.getUrl(attachment.storageId);
              return {
                ...attachment,
                url: url || attachment.url, // Fallback to original URL if getUrl fails
              };
            }
            return attachment;
          })
        );
        return {
          ...message,
          attachments: resolvedAttachments,
        };
      }
      return message;
    })
  );
}

export async function internalAtomicUpdateHandler(
  ctx: MutationCtx,
  args: {
    id: Id<"messages">;
    content?: string;
    reasoning?: string;
    appendContent?: string;
    appendReasoning?: string;
    citations?: Infer<typeof webCitationSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
  }
) {
  const { id, appendContent, appendReasoning, ...updates } = args;

  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined)
  );

  if (!(appendContent || appendReasoning)) {
    if (Object.keys(filteredUpdates).length === 0) {
      return { shouldStop: false };
    }
    const message = await ctx.db.get("messages", id);
    if (!message) {
      return { shouldStop: false };
    }
    await ctx.db.patch("messages", id, filteredUpdates);
    const conversation = await ctx.db.get(
      "conversations",
      message.conversationId
    );
    return { shouldStop: !!conversation?.stopRequested };
  }

  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", id);
      if (!message) {
        throw new Error(`Message with id ${id} not found`);
      }

      const appendUpdates = { ...filteredUpdates };

      if (appendContent) {
        appendUpdates.content = (message.content || "") + appendContent;
      }
      if (appendReasoning) {
        appendUpdates.reasoning = (message.reasoning || "") + appendReasoning;
      }

      await ctx.db.patch("messages", id, appendUpdates);

      // Check if stop was requested - return signal to caller
      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      return { shouldStop: !!conversation?.stopRequested };
    },
    5,
    25
  );
}

export async function internalGetByIdHandler(
  ctx: MutationCtx,
  args: { id: Id<"messages"> }
) {
  return await ctx.db.get("messages", args.id);
}

export async function appendReasoningSegmentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    segmentIndex: number;
    text: string;
    startedAt: number;
  }
) {
  const { messageId, segmentIndex, text, startedAt } = args;
  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return { shouldStop: false };
      }

      const parts = message.reasoningParts ?? [];

      if (segmentIndex < parts.length) {
        // Append to existing segment
        const existing = parts[segmentIndex];
        if (existing) {
          parts[segmentIndex] = {
            text: existing.text + text,
            startedAt: existing.startedAt,
          };
        }
      } else {
        // Create new segment
        parts.push({ text, startedAt });
      }

      // Keep the flat `reasoning` string in sync for backward compat (search, export)
      const reasoning = parts.map(p => p.text).join("\n\n");

      await ctx.db.patch("messages", messageId, {
        reasoningParts: parts,
        reasoning,
      });

      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      return { shouldStop: !!conversation?.stopRequested };
    },
    5,
    25
  );
}

export async function addToolCallHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    toolCall: Infer<typeof toolCallSchema>;
  }
) {
  const { messageId, toolCall } = args;
  const message = await ctx.db.get("messages", messageId);
  if (!message) {
    console.warn(`addToolCall: Message ${messageId} not found`);
    return;
  }

  const existingCalls = message.toolCalls ?? [];
  // Check if tool call with same ID already exists
  if (existingCalls.some(tc => tc.id === toolCall.id)) {
    return; // Already added, skip
  }

  await ctx.db.patch("messages", messageId, {
    toolCalls: [...existingCalls, toolCall],
  });
}

export async function finalizeToolResultHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    toolCallId: string;
    toolStatus: "completed" | "error";
    toolError?: string;
    citations?: Infer<typeof webCitationSchema>[];
    messageStatus: Infer<typeof messageStatusSchema>;
  }
) {
  const { messageId, toolCallId, toolStatus, toolError, citations, messageStatus } = args;
  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        return;
      }

      // Update tool call status
      const toolCalls = message.toolCalls ?? [];
      const updatedCalls = toolCalls.map(tc => {
        if (tc.id === toolCallId) {
          return {
            ...tc,
            status: toolStatus,
            completedAt: Date.now(),
            ...(toolError && { error: toolError }),
          };
        }
        return tc;
      });

      // Single patch: tool calls + optional citations + message status
      await ctx.db.patch("messages", messageId, {
        toolCalls: updatedCalls,
        status: messageStatus,
        ...(citations && { citations }),
      });
    },
    5,
    25
  );
}

export async function internalGetByIdQueryHandler(
  ctx: QueryCtx,
  args: { id: Id<"messages"> }
) {
  return await ctx.db.get("messages", args.id);
}

export async function internalGetAllInConversationHandler(
  ctx: MutationCtx,
  args: { conversationId: Id<"conversations"> }
) {
  return await ctx.db
    .query("messages")
    .withIndex("by_conversation", q =>
      q.eq("conversationId", args.conversationId)
    )
    .order("asc")
    .collect();
}

export async function internalRemoveMultipleHandler(
  ctx: MutationCtx,
  args: { ids: Id<"messages">[] }
) {
  const messages = await Promise.all(
    args.ids.map(id => ctx.db.get("messages", id))
  );

  const conversationMessageCounts = new Map<Id<"conversations">, number>();
  const userMessageCounts = new Map<Id<"users">, number>();
  const storageDeletePromises: Promise<void>[] = [];
  const userFileDeletionPromises: Promise<void>[] = [];

  // Collect storageIds per conversation for batch reference checking
  const storageIdsByConversation = new Map<
    Id<"conversations">,
    Id<"_storage">[]
  >();
  const excludeMessageIds = new Set(args.ids);

  for (const message of messages) {
    if (message) {
      if (message.conversationId) {
        // Track message count per conversation for decrementing
        const currentConvCount =
          conversationMessageCounts.get(message.conversationId) || 0;
        conversationMessageCounts.set(
          message.conversationId,
          currentConvCount + 1
        );

        if (message.role === "user") {
          const conversation = await ctx.db.get(
            "conversations",
            message.conversationId
          );
          if (conversation) {
            const currentCount =
              userMessageCounts.get(conversation.userId) || 0;
            userMessageCounts.set(conversation.userId, currentCount + 1);
          }
        }

        // Collect storageIds for batch reference checking
        if (message.attachments) {
          for (const attachment of message.attachments) {
            if (attachment.storageId) {
              const existing =
                storageIdsByConversation.get(message.conversationId) || [];
              existing.push(attachment.storageId);
              storageIdsByConversation.set(message.conversationId, existing);
            }
          }
        }
      }
    }
  }

  // Batch check which storageIds are safe to delete (per conversation)
  const safeToDeleteByConversation = new Map<
    Id<"conversations">,
    Set<Id<"_storage">>
  >();
  for (const [conversationId, storageIds] of storageIdsByConversation) {
    const safeToDelete = await getStorageIdsSafeToDelete(
      ctx,
      storageIds,
      conversationId,
      excludeMessageIds
    );
    safeToDeleteByConversation.set(conversationId, safeToDelete);
  }

  // Now process storage deletions with reference counting
  for (const message of messages) {
    if (message?.attachments && message.conversationId) {
      const safeToDelete = safeToDeleteByConversation.get(
        message.conversationId
      );

      for (const attachment of message.attachments) {
        if (attachment.storageId) {
          const storageId = attachment.storageId;

          // Only delete storage if safe (not referenced by other messages)
          if (safeToDelete?.has(storageId)) {
            storageDeletePromises.push(
              ctx.storage.delete(storageId).catch(error => {
                console.warn(`Failed to delete file ${storageId}:`, error);
              })
            );
          }

          // Delete corresponding userFiles entry by messageId (works even if userId unavailable)
          // Note: We still delete the userFiles entry for THIS message even if storage is kept
          userFileDeletionPromises.push(
            (async () => {
              try {
                if (!storageId) {
                  return;
                }

                // Clean up by messageId to handle cases where userId is unavailable
                const userFileEntries = await ctx.db
                  .query("userFiles")
                  .withIndex("by_message", q =>
                    q.eq("messageId", message._id)
                  )
                  .collect();

                for (const entry of userFileEntries) {
                  if (entry.storageId === storageId) {
                    await ctx.db.delete("userFiles", entry._id);
                  }
                }
              } catch (error) {
                console.warn(
                  `Failed to delete userFile entry for storage ${storageId}:`,
                  error
                );
              }
            })()
          );
        }
      }
    }
  }

  const operations: Promise<void>[] = [];

  // Decrement messageCount for each affected conversation
  // Use withRetry to handle write conflicts with fresh reads
  for (const [conversationId, deletedCount] of conversationMessageCounts) {
    operations.push(
      withRetry(async () => {
        const conversation = await ctx.db.get(
          "conversations",
          conversationId
        );
        if (conversation) {
          await ctx.db.patch("conversations", conversationId, {
            isStreaming: false,
            messageCount: Math.max(
              0,
              (conversation.messageCount || deletedCount) - deletedCount
            ),
          });
        }
      }).catch(error => {
        console.warn(
          `Failed to update conversation state for ${conversationId}:`,
          error
        );
      })
    );
  }

  // Decrement user message counts with retry logic
  for (const [userId, messageCount] of userMessageCounts) {
    operations.push(
      withRetry(async () => {
        const user = await ctx.db.get("users", userId);
        if (user && "totalMessageCount" in user) {
          await ctx.db.patch("users", userId, {
            totalMessageCount: Math.max(
              0,
              (user.totalMessageCount || 0) - messageCount
            ),
          });
        }
      }).catch(error => {
        console.warn(
          `Failed to update user message count for ${userId}:`,
          error
        );
      })
    );
  }

  operations.push(
    ...args.ids.map(id =>
      ctx.db.delete("messages", id).catch(error => {
        console.warn(`Failed to delete message ${id}:`, error);
      })
    )
  );

  operations.push(...storageDeletePromises);
  operations.push(...userFileDeletionPromises);

  await Promise.all(operations);
}

export async function updateMessageStatusHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    status: Infer<typeof messageStatusSchema>;
  }
) {
  await withRetry(async () => {
    // Get current message to check if it's an assistant message
    const message = await ctx.db.get("messages", args.messageId);
    if (!message) {
      console.error(
        "[updateMessageStatus] Message not found:",
        args.messageId
      );
      return;
    }

    // Don't overwrite error status - if message already has an error, skip this update
    if (message.status === "error" && args.status !== "error") {
      return;
    }

    const updateData: {
      status:
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done";
      metadata?: Record<string, unknown>;
    } = {
      status: args.status,
    };

    // For assistant messages with status "done", ensure finishReason is set
    if (message.role === "assistant" && args.status === "done") {
      const currentMetadata = message.metadata || {};
      const finalFinishReason = currentMetadata.finishReason || "stop";
      updateData.metadata = {
        ...currentMetadata,
        finishReason: finalFinishReason,
      };
    }

    await ctx.db.patch("messages", args.messageId, updateData);
  });
}

export async function updateAssistantContentHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    content?: string;
    appendContent?: string;
    status?: Infer<typeof messageStatusSchema>;
    reasoning?: string;
    appendReasoning?: string;
    citations?: Infer<typeof webCitationSchema>[];
    metadata?: Infer<typeof extendedMessageMetadataSchema>;
  }
) {
  const { messageId, appendContent, appendReasoning, ...updates } = args;

  const filteredUpdates = Object.fromEntries(
    Object.entries(updates).filter(([_, value]) => value !== undefined)
  );

  // Never overwrite "done" status - once a message is done, it stays done
  let finalUpdates = filteredUpdates;
  if (args.status && args.status !== "done") {
    const currentMessage = await ctx.db.get("messages", messageId);
    if (currentMessage?.status === "done") {
      // Don't overwrite "done" status with any other status
      const { status: _, ...updatesWithoutStatus } = filteredUpdates;
      finalUpdates = updatesWithoutStatus;
    }
  }

  if (!(appendContent || appendReasoning)) {
    if (Object.keys(finalUpdates).length === 0) {
      return { shouldStop: false };
    }
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      return { shouldStop: false };
    }
    await ctx.db.patch("messages", messageId, finalUpdates);
    const conversation = await ctx.db.get(
      "conversations",
      message.conversationId
    );
    return { shouldStop: !!conversation?.stopRequested };
  }

  return await withRetry(
    async () => {
      const message = await ctx.db.get("messages", messageId);
      if (!message) {
        // Don't throw error, just return silently as the message might have been finalized
        return;
      }

      const appendUpdates = { ...finalUpdates };

      // Never overwrite "done" status in append operations either
      let finalAppendUpdates = appendUpdates;
      if (
        args.status &&
        args.status !== "done" &&
        message.status === "done"
      ) {
        const { status: _, ...updatesWithoutStatus } = appendUpdates;
        finalAppendUpdates = updatesWithoutStatus;
      }

      if (appendContent) {
        finalAppendUpdates.content = (message.content || "") + appendContent;
      }
      if (appendReasoning) {
        finalAppendUpdates.reasoning =
          (message.reasoning || "") + appendReasoning;
      }

      await ctx.db.patch("messages", messageId, finalAppendUpdates);

      // Check if stop was requested - return signal to caller
      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      return { shouldStop: !!conversation?.stopRequested };
    },
    5,
    25
  );
}

export async function updateAssistantStatusHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    status: Infer<typeof messageStatusSchema>;
    statusText?: string;
  }
) {
  const { messageId, status, statusText } = args;

  try {
    // Get current message to preserve existing metadata
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      console.error("[updateAssistantStatus] Message not found:", messageId);
      return;
    }

    // Build the update object
    const updateData: {
      status:
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done";
      statusText?: string;
      metadata?: Record<string, unknown>;
    } = {
      status: status as
        | "error"
        | "thinking"
        | "searching"
        | "reading_pdf"
        | "streaming"
        | "done",
      statusText,
    };

    // If setting status to "done", ensure finishReason is set for proper streaming detection
    if (status === "done") {
      const currentMetadata = message.metadata || {};
      const finalFinishReason = currentMetadata.finishReason || "stop";
      updateData.metadata = {
        ...currentMetadata,
        finishReason: finalFinishReason,
      };

      // Update finish reason for debugging
    }

    // Update the message status and statusText in database
    await ctx.db.patch("messages", messageId, updateData);
  } catch (error) {
    console.error(
      "[updateAssistantStatus] Message not found, messageId:",
      messageId,
      error
    );
    throw new ConvexError(
      `Message with id ${messageId} not found: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function updateMessageErrorHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    error: string;
  }
) {
  const { messageId, error } = args;
  try {
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      console.error("[updateMessageError] Message not found:", messageId);
      return;
    }

    await ctx.db.patch("messages", messageId, {
      status: "error",
      error,
      metadata: {
        ...message.metadata,
        finishReason: "error",
      },
    });
  } catch (error) {
    console.error(
      "[updateMessageError] Failed to update message error:",
      messageId,
      error
    );
  }
}

export async function addAttachmentsHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
    attachments: Infer<typeof attachmentSchema>[];
  }
) {
  const { messageId, attachments } = args;

  try {
    // Get current message to preserve existing attachments
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      return;
    }

    // Merge with existing attachments, deduplicating generated images by URL
    const existingAttachments = message.attachments || [];
    if (!attachments.length) {
      await ctx.db.patch("messages", messageId, {
        attachments: existingAttachments,
      });
      return;
    }

    // Track URLs for generated images already present
    const existingGeneratedUrls = new Set(
      existingAttachments
        .filter(
          a => a.type === "image" && a.generatedImage?.isGenerated && !!a.url
        )
        .map(a => a.url)
    );

    // Track which attachments are actually new (for creating userFiles entries)
    const newAttachments: typeof attachments = [];

    const merged: typeof existingAttachments = [...existingAttachments];
    for (const att of attachments) {
      // If this is a generated image and we already have an image with the same URL, skip it
      if (
        att.type === "image" &&
        att.generatedImage?.isGenerated &&
        att.url &&
        existingGeneratedUrls.has(att.url)
      ) {
        continue;
      }
      if (
        att.type === "image" &&
        att.generatedImage?.isGenerated &&
        att.url
      ) {
        existingGeneratedUrls.add(att.url);
      }
      merged.push(att);
      newAttachments.push(att);
    }

    const updatedAttachments = merged;

    await ctx.db.patch("messages", messageId, {
      attachments: updatedAttachments,
    });

    // Create userFiles entries for new attachments (enables file library features)
    // This is especially important for generated images which bypass the normal upload flow
    if (newAttachments.length > 0) {
      const conversation = await ctx.db.get(
        "conversations",
        message.conversationId
      );
      if (conversation) {
        await createUserFileEntriesHandler(ctx, {
          userId: conversation.userId,
          messageId,
          conversationId: message.conversationId,
          attachments: newAttachments,
        });
      }
    }
  } catch (error) {
    console.error("[addAttachments] Error:", error);
    throw new ConvexError(
      `Failed to add attachments to message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function clearImageGenerationAttachmentsHandler(
  ctx: MutationCtx,
  args: { messageId: Id<"messages"> }
) {
  const { messageId } = args;

  try {
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      return;
    }

    // Filter out image attachments that were generated by looking for the generatedImage metadata
    // Keep all non-image attachments and user-uploaded images
    const filteredAttachments = (message.attachments || []).filter(
      attachment => {
        if (attachment.type !== "image") {
          return true; // Keep all non-image attachments
        }

        // Check if this is a generated image by looking for the generatedImage metadata
        const hasGeneratedMetadata =
          attachment.generatedImage?.isGenerated === true;
        const shouldKeep = !hasGeneratedMetadata; // Keep only non-generated images

        return shouldKeep;
      }
    );

    await ctx.db.patch("messages", messageId, {
      attachments: filteredAttachments,
    });
  } catch (error) {
    console.error("[clearImageGenerationAttachments] Error:", error);
    throw new ConvexError(
      `Failed to clear image generation attachments for message ${messageId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function updateImageGenerationHandler(
  ctx: MutationCtx,
  args: {
    messageId: Id<"messages">;
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
  }
) {
  const { messageId, ...imageGenerationData } = args;

  // Use withRetry to handle write conflicts - re-reads message on each retry
  const message = await withRetry(async () => {
    // Get current message to preserve existing imageGeneration data
    const message = await ctx.db.get("messages", messageId);
    if (!message) {
      return null;
    }

    // Merge with existing imageGeneration data
    const currentImageGeneration = message.imageGeneration || {};
    const filteredImageGenerationData = Object.fromEntries(
      Object.entries(imageGenerationData).filter(
        ([_, value]) => value !== undefined
      )
    );

    // Deep merge metadata to preserve nested fields like params.aspectRatio
    const mergedMetadata =
      filteredImageGenerationData.metadata && currentImageGeneration.metadata
        ? {
            ...(typeof currentImageGeneration.metadata === "object" &&
            currentImageGeneration.metadata !== null &&
            !Array.isArray(currentImageGeneration.metadata)
              ? currentImageGeneration.metadata
              : {}),
            ...(typeof filteredImageGenerationData.metadata === "object" &&
            filteredImageGenerationData.metadata !== null &&
            !Array.isArray(filteredImageGenerationData.metadata)
              ? filteredImageGenerationData.metadata
              : {}),
            params: {
              ...(typeof currentImageGeneration.metadata === "object" &&
              currentImageGeneration.metadata !== null &&
              !Array.isArray(currentImageGeneration.metadata) &&
              currentImageGeneration.metadata.params
                ? currentImageGeneration.metadata.params
                : {}),
              ...(typeof filteredImageGenerationData.metadata === "object" &&
              filteredImageGenerationData.metadata !== null &&
              !Array.isArray(filteredImageGenerationData.metadata) &&
              filteredImageGenerationData.metadata.params
                ? filteredImageGenerationData.metadata.params
                : {}),
            },
          }
        : filteredImageGenerationData.metadata ||
          currentImageGeneration.metadata;

    const updatedImageGeneration = {
      ...currentImageGeneration,
      ...filteredImageGenerationData,
      ...(mergedMetadata &&
      typeof mergedMetadata === "object" &&
      !Array.isArray(mergedMetadata)
        ? { metadata: mergedMetadata }
        : {}),
    };

    // Update the message with new imageGeneration data
    const updateData: {
      imageGeneration: typeof updatedImageGeneration;
      status?: "done" | "error" | "streaming";
      metadata?: Record<string, unknown>;
    } = {
      imageGeneration: updatedImageGeneration,
    };

    // Update message status based on image generation status
    if (args.status === "succeeded") {
      updateData.status = "done";
      // Also update metadata to mark streaming as complete
      updateData.metadata = {
        ...message.metadata,
        finishReason: "stop",
      };
    } else if (args.status === "failed" || args.status === "canceled") {
      updateData.status = "error";
      // Also update metadata to mark streaming as complete
      updateData.metadata = {
        ...message.metadata,
        finishReason: "error",
      };
    } else if (args.status === "starting" || args.status === "processing") {
      // For retry: set message status back to streaming and clear previous finish state
      updateData.status = "streaming";
      // Clear any previous finishReason to allow isStreaming to return true
      updateData.metadata = {
        ...message.metadata,
        finishReason: undefined,
        stopped: undefined,
      };
    }

    await ctx.db.patch("messages", messageId, updateData);
    return message;
  });

  if (!message) {
    return;
  }

  // Handle conversation update separately with its own retry
  const terminalStatuses = new Set(["succeeded", "failed", "canceled"]);
  if (
    args.status &&
    terminalStatuses.has(args.status) &&
    message.conversationId
  ) {
    await withRetry(async () => {
      await ctx.db.patch("conversations", message.conversationId, {
        isStreaming: false,
        activeImageGeneration: undefined, // Clear tracking for OCC-free stop detection
      });
    }).catch(error => {
      console.warn(
        "[updateImageGeneration] Failed to clear conversation streaming state",
        {
          conversationId: message.conversationId,
          status: args.status,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    });
  }
}

export async function getByReplicateIdHandler(
  ctx: QueryCtx,
  args: { replicateId: string }
) {
  // Use index for efficient lookup instead of full table scan
  return await ctx.db
    .query("messages")
    .withIndex("by_replicate_id", q =>
      q.eq("imageGeneration.replicateId", args.replicateId)
    )
    .first();
}
