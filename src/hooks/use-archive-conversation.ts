import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import type { ConversationId } from "@/types";

type UseArchiveConversationOptions = {
  currentConversationId?: ConversationId;
};

/**
 * Centralized hook for archiving conversations with proper redirect handling.
 *
 * Coordinates: navigate away if needed → archive → invalidate cache.
 * Does NOT include toasts — callers handle their own UX.
 */
export function useArchiveConversation(
  options?: UseArchiveConversationOptions
) {
  const navigate = useNavigate();
  const patchConversation = useMutation(api.conversations.patch);

  const archiveConversation = useCallback(
    async (id: ConversationId) => {
      const currentId = options?.currentConversationId;
      if (currentId && (currentId as string) === (id as string)) {
        navigate(ROUTES.HOME);
        await new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        });
      }

      await patchConversation({
        id: id as Id<"conversations">,
        updates: { isArchived: true },
      });
      del(CACHE_KEYS.conversations);
    },
    [options?.currentConversationId, navigate, patchConversation]
  );

  const unarchiveConversation = useCallback(
    async (id: ConversationId) => {
      await patchConversation({
        id: id as Id<"conversations">,
        updates: { isArchived: false },
      });
      del(CACHE_KEYS.conversations);
    },
    [patchConversation]
  );

  return { archiveConversation, unarchiveConversation };
}
