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

/**
 * Update an attachment's storageId after background upload completes.
 * Matches by filename and size to find the correct attachment.
 */
export function updateAttachmentStorageId(
  conversationId: string | null | undefined,
  fileName: string,
  fileSize: number,
  storageId: Id<"_storage">,
  store?: ChatInputStoreApi
) {
  const key = getChatKey(conversationId ?? undefined);
  const targetStore = store ?? getChatInputStore();
  targetStore.setState(current => {
    const prev = current.attachmentsByKey[key];
    if (!Array.isArray(prev)) {
      return current;
    }

    // Find the attachment by name and size (without storageId)
    const index = prev.findIndex(
      att => att.name === fileName && att.size === fileSize && !att.storageId
    );

    if (index === -1) {
      return current;
    }

    // Update the attachment with the storageId
    const existingAttachment = prev[index];
    if (!existingAttachment) {
      return current;
    }

    const next = [...prev];
    // Clear base64 content for audio/video — it's only needed for immediate display
    // and would exceed Convex's 1 MiB field limit for larger files
    const shouldClearContent =
      existingAttachment.type === "audio" ||
      existingAttachment.type === "video";
    next[index] = {
      ...existingAttachment,
      storageId,
      ...(shouldClearContent ? { content: undefined } : {}),
    };

    return {
      ...current,
      attachmentsByKey: {
        ...current.attachmentsByKey,
        [key]: next,
      },
    };
  }, true);
}
