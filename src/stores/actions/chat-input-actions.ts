import type { Id } from "@convex/_generated/dataModel";
import {
  type ChatInputStoreApi,
  getChatInputStore,
  getChatKey,
} from "@/stores/chat-input-store";
import type { Attachment } from "@/types";

export function appendAttachments(
  conversationId: string | null | undefined,
  attachments: Attachment[],
  store?: ChatInputStoreApi
) {
  if (attachments.length === 0) {
    return;
  }

  const key = getChatKey(conversationId ?? undefined);
  const targetStore = store ?? getChatInputStore();
  targetStore.setState(current => {
    const prev = current.attachmentsByKey[key] ?? [];
    const next = [...prev, ...attachments];

    if (
      next.length === prev.length &&
      next.every((item, index) => item === prev[index])
    ) {
      return current;
    }

    return {
      ...current,
      attachmentsByKey: {
        ...current.attachmentsByKey,
        [key]: next,
      },
    };
  }, true);
}

export function removeAttachmentAt(
  conversationId: string | null | undefined,
  index: number,
  store?: ChatInputStoreApi
) {
  const key = getChatKey(conversationId ?? undefined);
  const targetStore = store ?? getChatInputStore();
  targetStore.setState(current => {
    const prev = current.attachmentsByKey[key];
    if (!Array.isArray(prev) || index < 0 || index >= prev.length) {
      return current;
    }

    const next = prev.filter((_, i) => i !== index);
    if (next.length === prev.length) {
      return current;
    }

    return {
      ...current,
      attachmentsByKey: {
        ...current.attachmentsByKey,
        [key]: next,
      },
    };
  }, true);
}

export function setPersona(
  conversationId: string | null | undefined,
  id: Id<"personas"> | null,
  store?: ChatInputStoreApi
) {
  const key = getChatKey(conversationId ?? undefined);
  (store ?? getChatInputStore()).getState().setSelectedPersonaId(key, id);
}

export function setTemperature(
  conversationId: string | null | undefined,
  value: number | undefined,
  store?: ChatInputStoreApi
) {
  const key = getChatKey(conversationId ?? undefined);
  (store ?? getChatInputStore()).getState().setTemperature(key, value);
}
