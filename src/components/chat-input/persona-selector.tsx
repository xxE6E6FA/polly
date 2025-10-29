import type { Id } from "@convex/_generated/dataModel";
import { memo } from "react";
import { PersonaPicker } from "@/components/persona-picker";
import { useUserSettings } from "@/hooks/use-user-settings";
import { isUserSettings } from "@/lib/type-guards";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import type { ConversationId } from "@/types";

interface PersonaSelectorProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect: (id: Id<"personas"> | null) => void;
  disabled?: boolean;
}

const PersonaSelectorComponent = ({
  conversationId,
  hasExistingMessages,
  selectedPersonaId = null,
  onPersonaSelect,
  disabled = false,
}: PersonaSelectorProps) => {
  const { canSendMessage } = useUserDataContext();
  const userSettingsRaw = useUserSettings();
  const { isPrivateMode } = usePrivateMode();

  const userSettings = isUserSettings(userSettingsRaw) ? userSettingsRaw : null;
  const personasEnabled = userSettings?.personasEnabled !== false;

  // Show persona selector only when starting a new conversation
  const isNewConversation = isPrivateMode && !hasExistingMessages;
  const isNewRegularConversation = !(isPrivateMode || conversationId);
  const shouldShowPersonaSelector =
    isNewConversation || isNewRegularConversation;

  const canShowPersonaSelector = canSendMessage && personasEnabled;
  const showPersonaSelector =
    canShowPersonaSelector && shouldShowPersonaSelector;

  if (!showPersonaSelector) {
    return null;
  }

  return (
    <PersonaPicker
      compact={true}
      selectedPersonaId={selectedPersonaId}
      onPersonaSelect={onPersonaSelect}
      disabled={disabled}
    />
  );
};

export const PersonaSelector = memo(PersonaSelectorComponent);
