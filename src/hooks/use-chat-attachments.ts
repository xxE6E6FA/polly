import { getChatKey, useChatInputStore } from "@/stores/chat-input-store";
import type { Attachment, ConversationId } from "@/types";
import { useClearOnConversationChange } from "./use-clear-on-conversation-change";

export function useChatAttachments(conversationId?: ConversationId) {
  const key = getChatKey(conversationId as unknown as string);
  const hookCache = useChatAttachments as unknown as {
    emptyAttachments?: readonly Attachment[];
  };
  if (!hookCache.emptyAttachments) {
    hookCache.emptyAttachments = Object.freeze([]) as readonly Attachment[];
  }
  const Empty: readonly Attachment[] = hookCache.emptyAttachments;
  const attachments = useChatInputStore(
    s => (s.attachmentsByKey[key] as readonly Attachment[] | undefined) ?? Empty
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
