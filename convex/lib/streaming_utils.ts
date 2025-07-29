/**
 * Utilities for managing streaming state across conversations and messages
 */

import type { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import type { DataModel, Id } from "../_generated/dataModel";
import { log } from "./logger";

type AnyCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

/**
 * Check if a conversation is currently streaming by examining its messages
 */
export async function isConversationStreaming(
  ctx: AnyCtx, 
  conversationId: Id<"conversations">
): Promise<boolean> {
  // Get the most recent assistant message in the conversation
  const recentMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
    .filter(q => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();

  if (!recentMessage) {
    return false;
  }

  // A message is considered streaming if it has no finishReason and no error status
  const metadata = recentMessage.metadata as any;
  return !metadata?.finishReason && !metadata?.stopped && recentMessage.status !== "error";
}

/**
 * Find the currently streaming message in a conversation
 */
export async function findStreamingMessage(
  ctx: AnyCtx,
  conversationId: Id<"conversations">
): Promise<{ id: string; isStreaming: boolean } | null> {
  const recentMessage = await ctx.db
    .query("messages")
    .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
    .filter(q => q.eq(q.field("role"), "assistant"))
    .order("desc")
    .first();

  if (!recentMessage) {
    return null;
  }

  const metadata = recentMessage.metadata as any;
  const isStreaming = !metadata?.finishReason && !metadata?.stopped && recentMessage.status !== "error";
  
  return isStreaming ? { id: recentMessage._id, isStreaming: true } : null;
}

/**
 * Storage for active streaming operations (in-memory, per-deployment)
 * Note: This is a fallback - the main stop mechanism should use message status
 */
const activeStreams = new Map<string, AbortController>();

export function setStreamActive(conversationId: string, abortController: AbortController) {
  activeStreams.set(conversationId, abortController);
}

export function abortStream(conversationId: string): boolean {
  // Only log if there are issues, not successful operations
  const controller = activeStreams.get(conversationId);
  if (controller) {
    controller.abort();
    activeStreams.delete(conversationId);
    return true;
  }
  // Only log when stream is not found (potential issue)
      log.debug(`No active stream found for conversation: ${conversationId}`);
  return false;
}

export function clearStream(conversationId: string) {
  activeStreams.delete(conversationId);
}

export function isStreamActive(conversationId: string): boolean {
  return activeStreams.has(conversationId);
}
