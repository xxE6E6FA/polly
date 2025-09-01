import type { Id } from "@convex/_generated/dataModel";
import { getChatKey, useChatInputStore } from "@/stores/chat-input-store";
import type { Attachment } from "@/types";

export function appendAttachments(
  conversationId: string | null | undefined,
  attachments: Attachment[]
) {
  const key = getChatKey(conversationId ?? undefined);
  const setAttachments = useChatInputStore.getState().setAttachments;
  setAttachments(key, prev => [...prev, ...attachments]);
}

export function removeAttachmentAt(
  conversationId: string | null | undefined,
  index: number
) {
  const key = getChatKey(conversationId ?? undefined);
  const setAttachments = useChatInputStore.getState().setAttachments;
  const current = useChatInputStore.getState().attachmentsByKey[key] ?? [];
  if (index < 0 || index >= current.length) {
    return;
  }
  setAttachments(
    key,
    current.filter((_, i) => i !== index)
  );
}

export function setPersona(
  conversationId: string | null | undefined,
  id: Id<"personas"> | null
) {
  const key = getChatKey(conversationId ?? undefined);
  useChatInputStore.getState().setSelectedPersonaId(key, id);
}

export function setTemperature(
  conversationId: string | null | undefined,
  value: number | undefined
) {
  const key = getChatKey(conversationId ?? undefined);
  useChatInputStore.getState().setTemperature(key, value);
}
