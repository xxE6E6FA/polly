import type { Id } from "@convex/_generated/dataModel";
import { PersonaPicker } from "@/components/persona-picker";
import { usePrivateMode } from "@/contexts/private-mode-context";
import { useChatPermissions } from "@/hooks/use-chat-permissions";
import { useUser } from "@/hooks/use-user";
import { useUserSettings } from "@/hooks/use-user-settings";
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
  const { canSendMessage } = useChatPermissions();
  const userInfo = useUser();
  const userSettings = useUserSettings(userInfo.user?._id);
  const { isPrivateMode } = usePrivateMode();

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
      compact
      selectedPersonaId={selectedPersonaId}
      tooltip={
        <div className="text-xs">
          <div className="mb-1 font-medium">AI Personas</div>
          <p>
            Choose a specialized AI assistant with a unique personality and
            expertise
          </p>
        </div>
      }
      onPersonaSelect={onPersonaSelect}
    />
  );
}
