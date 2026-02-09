import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import type { ConversationId } from "@/types";

type UseDeleteConversationOptions = {
  currentConversationId?: ConversationId;
};

/**
 * Centralized hook for deleting conversations with proper redirect handling.
 *
 * Coordinates: navigate away if needed → delete → invalidate cache.
 * Does NOT include toasts — callers handle their own UX.
 */
export function useDeleteConversation(options?: UseDeleteConversationOptions) {
  const currentConversationId = options?.currentConversationId;
  const navigate = useNavigate();
  const removeConversation = useMutation(api.conversations.remove);
  const bulkRemoveConversations = useMutation(api.conversations.bulkRemove);

  const navigateAwayIfNeeded = useCallback(
    async (idsBeingDeleted: ConversationId[]) => {
      if (!currentConversationId) {
        return;
      }

      const isCurrentBeingDeleted = idsBeingDeleted.includes(
        currentConversationId
      );
      if (!isCurrentBeingDeleted) {
        return;
      }

      navigate(ROUTES.HOME);
      // Yield to let React Router commit the navigation before mutating
      await new Promise<void>(resolve => {
        setTimeout(resolve, 0);
      });
    },
    [currentConversationId, navigate]
  );

  const deleteConversation = useCallback(
    async (id: ConversationId) => {
      await navigateAwayIfNeeded([id]);
      await removeConversation({ id: id as Id<"conversations"> });
      del(CACHE_KEYS.conversations);
    },
    [navigateAwayIfNeeded, removeConversation]
  );

  const deleteConversations = useCallback(
    async (ids: ConversationId[]) => {
      await navigateAwayIfNeeded(ids);
      await bulkRemoveConversations({
        ids: ids as Id<"conversations">[],
      });
      del(CACHE_KEYS.conversations);
    },
    [navigateAwayIfNeeded, bulkRemoveConversations]
  );

  return { deleteConversation, deleteConversations };
}
