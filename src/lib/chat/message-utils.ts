/**
 * Shared utilities for message handling across components and hooks
 */
import type { Doc } from "convex/_generated/dataModel";
import { hasPageArray } from "@/lib/type-guards";
import type { ChatMessage, ConversationId } from "@/types";

// Type guard for message metadata
export function isMessageMetadata(x: unknown): x is {
  finishReason?: string;
  stopped?: boolean;
  tokenCount?: number;
  reasoningTokenCount?: number;
  duration?: number;
  searchQuery?: string;
  searchFeature?: string;
  searchCategory?: string;
  status?: "pending" | "error";
} {
  return (
    x === null ||
    x === undefined ||
    (typeof x === "object" && !Array.isArray(x))
  );
}

/**
 * Convert server message document to ChatMessage format
 */
export function convertServerMessage(msg: Doc<"messages">): ChatMessage {
  return {
    id: msg._id,
    role: msg.role as ChatMessage["role"],
    content: msg.content,
    status: msg.status,
    reasoning: msg.reasoning,
    model: msg.model,
    provider: msg.provider,
    parentId: msg.parentId,
    isMainBranch: msg.isMainBranch,
    sourceConversationId: msg.sourceConversationId as
      | ConversationId
      | undefined,
    useWebSearch: msg.useWebSearch,
    attachments: msg.attachments as ChatMessage["attachments"],
    citations: msg.citations as ChatMessage["citations"],
    metadata: isMessageMetadata(msg.metadata)
      ? (msg.metadata as ChatMessage["metadata"])
      : undefined,
    imageGeneration: msg.imageGeneration as ChatMessage["imageGeneration"],
    createdAt: msg.createdAt || msg._creationTime,
  };
}

/**
 * Extract messages array from Convex query result (handles paginated and direct arrays)
 */
export function extractMessagesArray(
  convexMessages: unknown
): Doc<"messages">[] {
  if (!convexMessages) {
    return [];
  }

  if (Array.isArray(convexMessages)) {
    return convexMessages as Doc<"messages">[];
  }
  if (hasPageArray(convexMessages)) {
    return convexMessages.page as Doc<"messages">[];
  }
  return [];
}

/**
 * Convert server messages to ChatMessage format
 */
export function convertServerMessages(convexMessages: unknown): ChatMessage[] {
  const messagesArray = extractMessagesArray(convexMessages);
  return messagesArray.map(convertServerMessage);
}

/**
 * Check if a message is currently streaming
 */
export function isMessageStreaming(
  message: Doc<"messages"> | ChatMessage,
  isGenerating = false
): boolean {
  if ("_id" in message) {
    // Server message
    const metadata = isMessageMetadata(message.metadata)
      ? message.metadata
      : null;
    return (
      message.role === "assistant" &&
      !metadata?.finishReason &&
      !metadata?.stopped
    );
  }

  // Chat message
  return (
    message.role === "assistant" &&
    (!message.metadata?.finishReason ||
      message.metadata?.finishReason === "streaming") &&
    isGenerating
  );
}

/**
 * Find streaming message in messages array
 */
export function findStreamingMessage(
  convexMessages: unknown
): { id: string; isStreaming: boolean } | null {
  const messagesArray = extractMessagesArray(convexMessages);

  const streamingMessage = messagesArray.find(msg => isMessageStreaming(msg));

  return streamingMessage
    ? { id: streamingMessage._id, isStreaming: true }
    : null;
}
