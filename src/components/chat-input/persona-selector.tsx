import type { Id } from "@convex/_generated/dataModel";
import { PersonaPicker } from "@/components/persona-picker";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useUserData } from "@/hooks/use-user-data";
import { useUserSettings } from "@/hooks/use-user-settings";
import { isUserSettings } from "@/lib/type-guards";
import type { ConversationId } from "@/types";

interface PersonaSelectorProps {
  conversationId?: ConversationId;
  hasExistingMessages?: boolean;
  selectedPersonaId?: Id<"personas"> | null;
  onPersonaSelect: (id: Id<"personas"> | null) => void;
}

export function PersonaSelector({
  conversationId,
  hasExistingMessages,
  selectedPersonaId = null,
  onPersonaSelect,
}: PersonaSelectorProps) {
  const userData = useUserData();
  const canSendMessage = userData?.canSendMessage ?? false;
  const userSettingsRaw = useUserSettings(userData?.user?._id);
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
    />
  );
}
