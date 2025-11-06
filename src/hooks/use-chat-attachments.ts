import { useMemo } from "react";
import { getChatKey, useChatInputStore } from "@/stores/chat-input-store";
import type { Attachment, ConversationId } from "@/types";
import { useClearOnConversationChange } from "./use-clear-on-conversation-change";

export function useChatAttachments(conversationId?: ConversationId) {
  const key = getChatKey(conversationId as unknown as string);
  const emptyAttachments = useMemo(() => [] as const, []);
  const attachments = useChatInputStore(
    s =>
      (s.attachmentsByKey[key] as readonly Attachment[] | undefined) ??
      emptyAttachments
  );
  const set = useChatInputStore(s => s.setAttachments);
  const clearKey = useChatInputStore(s => s.clearAttachmentsKey);

  useClearOnConversationChange(key, clearKey);

  return {
    attachments,
    setAttachments: (
      next: Attachment[] | ((prev: Attachment[]) => Attachment[])
    ) => set(key, next),
    clearAttachments: () => clearKey(key),
  } as const;
}
