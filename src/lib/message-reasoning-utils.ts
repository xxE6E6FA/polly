import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { ConversationId, ReasoningConfig } from "@/types";

/**
 * Hook to get the reasoning config from the last user message in a conversation
 */
export function useLastMessageReasoningConfig(
  conversationId?: ConversationId
): ReasoningConfig | null {
  // Get the last few messages from the conversation
  const messages = useQuery(
    api.messages.list,
    conversationId
      ? {
          conversationId,
          paginationOpts: { numItems: 10, cursor: null },
        }
      : "skip"
  );

  if (!messages) {
    return null;
  }

  // Handle paginated result
  const messagesList = Array.isArray(messages) ? messages : messages.page;

  if (!messagesList) {
    return null;
  }

  // Find the last user message with a reasoning config
  const lastUserMessage = messagesList
    .filter((msg: Doc<"messages">) => msg.role === "user")
    .reverse()
    .find((msg: Doc<"messages">) => msg.reasoningConfig);

  return (lastUserMessage as Doc<"messages">)?.reasoningConfig || null;
}

/**
 * Get default reasoning config
 */
export function getDefaultReasoningConfig(): ReasoningConfig {
  return {
    enabled: false,
    effort: "medium",
  };
}
