import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";

export function useConversationLimit(conversationId?: Id<"conversations">) {
  const limitStatus = useQuery(
    api.conversations.getConversationLimitStatus,
    conversationId ? { conversationId } : "skip"
  );

  return {
    isAtLimit: limitStatus?.isAtLimit ?? false,
    isNearLimit: limitStatus?.isNearLimit ?? false,
    percentUsed: limitStatus?.percentUsed ?? 0,
    isLoading: limitStatus === undefined,
  };
}
