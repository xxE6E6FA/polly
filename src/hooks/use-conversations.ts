import { useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";

import { storeAnonymousUserId } from "./use-user";
import { api } from "../../convex/_generated/api";
import { type Id } from "../../convex/_generated/dataModel";
import { clearConversationCache } from "../lib/conversation-cache";
import { type Attachment, type ConversationId, type UserId } from "../types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";

// Interface for createConversation parameters

export type CreateConversationParams = {
  firstMessage: string;
  sourceConversationId?: ConversationId;
  personaId?: Id<"personas"> | null;
  userId?: UserId;
  attachments?: Attachment[];
  useWebSearch?: boolean;
  personaPrompt?: string | null;
  generateTitle?: boolean;
  reasoningConfig?: ReasoningConfig;
};

// Function to clean attachments for Convex by removing fields not in the schema
function cleanAttachmentsForConvex(attachments?: Attachment[]) {
  if (!attachments) return undefined;

  return attachments.map(attachment => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mimeType, ...cleanAttachment } = attachment;
    return cleanAttachment;
  });
}

// Simplified hook using the single new conversation action

export function useCreateConversation() {
  const createNewConversation = useAction(
    api.conversations.createNewConversation
  );
  const queryClient = useQueryClient();

  const createConversation = async ({
    firstMessage,
    sourceConversationId,
    personaId,
    userId,
    attachments,
    useWebSearch,
    personaPrompt,
    generateTitle = true,
    reasoningConfig,
  }: CreateConversationParams) => {
    try {
      const result = await createNewConversation({
        userId,
        firstMessage,
        sourceConversationId,
        ...(personaId && { personaId }),
        ...(personaPrompt && { personaPrompt }),
        attachments: cleanAttachmentsForConvex(attachments),
        useWebSearch,
        generateTitle,
        reasoningConfig,
      });

      // If a new user was created, store the ID in localStorage
      if (result.isNewUser) {
        storeAnonymousUserId(result.userId);
      }

      // Invalidate conversation cache for both TanStack Query
      queryClient.invalidateQueries({ queryKey: ["conversations"] });

      // Clear our localStorage cache to force reload from server
      clearConversationCache();

      return result.conversationId;
    } catch (error) {
      const { toast } = await import("sonner");
      toast.error("Failed to create conversation", {
        description: "Unable to start a new conversation. Please try again.",
      });
      throw error;
    }
  };

  return {
    createNewConversation: createConversation,
  };
}

// Utility functions for error handling
export const conversationErrorHandlers = {
  async handleDelete(operation: () => Promise<unknown>) {
    try {
      const result = await operation();
      const { toast } = await import("sonner");
      toast.success("Conversation deleted", {
        description: "The conversation has been permanently removed.",
      });
      return result;
    } catch (error) {
      const { toast } = await import("sonner");
      toast.error("Failed to delete conversation", {
        description: "Unable to delete conversation. Please try again.",
      });
      throw error;
    }
  },

  async handleShare(operation: () => Promise<unknown>) {
    try {
      return await operation();
    } catch (error) {
      const { toast } = await import("sonner");
      toast.error("Failed to share conversation", {
        description: "Unable to share conversation. Please try again.",
      });
      throw error;
    }
  },
};
