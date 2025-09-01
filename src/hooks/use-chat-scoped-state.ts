import type { Id } from "@convex/_generated/dataModel";
import { useMemo } from "react";
import { getChatKey, useChatInputStore } from "@/stores/chat-input-store";
import type { Attachment } from "@/types";

export function useChatScopedState(conversationId?: string | null) {
  const key = useMemo(
    () => getChatKey(conversationId ?? undefined),
    [conversationId]
  );

  const attachments = useChatInputStore(s => s.attachmentsByKey[key] ?? []);
  const setAttachmentsForKey = useChatInputStore(s => s.setAttachments);

  const temperature = useChatInputStore(s => s.temperatureByKey[key]);
  const setTemperatureForKey = useChatInputStore(s => s.setTemperature);

  const selectedPersonaId = useChatInputStore(
    s => s.selectedByKey[key] ?? null
  );
  const setSelectedPersonaIdForKey = useChatInputStore(
    s => s.setSelectedPersonaId
  );

  return {
    key,
    attachments,
    setAttachmentsForKey: (
      value: Attachment[] | ((prev: Attachment[]) => Attachment[])
    ) => setAttachmentsForKey(key, value),
    temperature,
    setTemperatureForKey: (value: number | undefined) =>
      setTemperatureForKey(key, value),
    selectedPersonaId,
    setSelectedPersonaIdForKey: (id: Id<"personas"> | null) =>
      setSelectedPersonaIdForKey(key, id),
  };
}
