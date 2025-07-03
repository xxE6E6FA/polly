import { storeAnonymousUserId } from "./use-user";
import { api } from "../../convex/_generated/api";
import { clearConversationCache } from "../lib/conversation-cache";
import {
  type Attachment,
  type ConversationId,
  type CreateConversationParams,
  type CreateConversationResult,
  type CreateConversationArgs,
} from "@/types";
import { useConvexActionOptimized } from "./use-convex-cache";

// Helper to clean attachments for Convex
function cleanAttachmentsForConvex(attachments?: Attachment[]) {
  return attachments?.map(attachment => ({
    type: attachment.type,
    url: attachment.url,
    name: attachment.name,
    size: attachment.size,
    content: attachment.content,
    storageId: attachment.storageId,
    mimeType: attachment.mimeType,
  }));
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

  async handleArchive(operation: () => Promise<unknown>) {
    try {
      const result = await operation();
      const { toast } = await import("sonner");
      toast.success("Conversation archived", {
        description: "The conversation has been moved to archive.",
      });
      return result;
    } catch (error) {
      const { toast } = await import("sonner");
      toast.error("Failed to archive conversation", {
        description: "Unable to archive conversation. Please try again.",
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

// Simplified hook using the optimized action pattern
export function useCreateConversation() {
  const { executeAsync: createNewConversation, isLoading } =
    useConvexActionOptimized<CreateConversationResult, CreateConversationArgs>(
      api.conversations.createNewConversation,
      {
        invalidateQueries: ["conversations"],
        dispatchEvents: ["conversation-created"],
        onSuccess: result => {
          // If a new user was created, store the ID in localStorage
          if (result.isNewUser) {
            storeAnonymousUserId(result.userId);
          }

          // Clear our localStorage cache to force reload from server
          clearConversationCache();
        },
        onError: async error => {
          console.error("Failed to create conversation:", error);
          const { toast } = await import("sonner");
          toast.error("Failed to create conversation", {
            description: "Unable to create new conversation. Please try again.",
          });
        },
      }
    );

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
    contextSummary,
  }: CreateConversationParams): Promise<ConversationId> => {
    const result = await createNewConversation({
      userId,
      firstMessage,
      sourceConversationId,
      personaId: personaId || undefined,
      personaPrompt: personaPrompt || undefined,
      attachments: cleanAttachmentsForConvex(attachments),
      useWebSearch,
      generateTitle,
      reasoningConfig:
        reasoningConfig?.enabled && reasoningConfig.maxTokens
          ? {
              enabled: reasoningConfig.enabled,
              effort: reasoningConfig.effort || "medium",
              maxTokens: reasoningConfig.maxTokens,
            }
          : undefined,
      contextSummary,
    });

    return result.conversationId;
  };

  return {
    createConversation,
    isLoading,
  };
}
