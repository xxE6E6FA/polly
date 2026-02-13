import type { Id } from "@convex/_generated/dataModel";
import { useChatInputControls } from "@/hooks/chat-ui";
import type { ConversationId } from "@/types";
import { PersonaPicker } from "./pickers/persona-picker";

interface PersonaSelectorProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect: (id: Id<"personas"> | null) => void;
  disabled?: boolean;
}

export function PersonaSelector({
  conversationId,
  hasExistingMessages = false,
  selectedPersonaId = null,
  onPersonaSelect,
  disabled = false,
}: PersonaSelectorProps) {
  const { showPersonaSelector } = useChatInputControls(conversationId);

  if (!showPersonaSelector) {
    return null;
  }

  return (
    <PersonaPicker
      compact={true}
      selectedPersonaId={selectedPersonaId}
      onPersonaSelect={onPersonaSelect}
      disabled={disabled}
      hasExistingMessages={hasExistingMessages}
    />
  );
}
