/**
 * PDF Status Management - Clean separation of PDF processing status from message content
 */

import type { ActionCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * Update assistant message with PDF reading status
 */
export async function updatePdfReadingStatus(
  ctx: ActionCtx,
  messageId: Id<"messages">,
  filename: string,
  progress?: number
): Promise<void> {
  let statusText: string;
  
  if (progress !== undefined && progress < 100) {
    statusText = `Reading "${filename}" (${Math.round(progress)}%)...`;
  } else if (progress === 100) {
    statusText = `Finished reading "${filename}"`;
  } else {
    statusText = `Reading "${filename}"...`;
  }

  await ctx.runMutation(internal.messages.updateAssistantStatus, {
    messageId,
    status: "reading_pdf",
    statusText,
  });
}

/**
 * Clear PDF reading status and set to thinking
 */
export async function clearPdfReadingStatus(
  ctx: ActionCtx,
  messageId: Id<"messages">
): Promise<void> {
  await ctx.runMutation(internal.messages.updateAssistantStatus, {
    messageId,
    status: "thinking",
    statusText: undefined,
  });
}

/**
 * Update to streaming status (when AI response starts)
 */
export async function startStreamingStatus(
  ctx: ActionCtx,
  messageId: Id<"messages">
): Promise<void> {
  await ctx.runMutation(internal.messages.updateAssistantStatus, {
    messageId,
    status: "streaming",
    statusText: undefined,
  });
}