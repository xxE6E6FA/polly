import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { useUserSettings } from "@/hooks/use-user-settings";
import { isUserSettings } from "@/lib/type-guards";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useUserDataContext } from "@/providers/user-data-context";
import { getChatKey, useChatInputStore } from "@/stores/chat-input-store";
import type {
  AIModel,
  Attachment,
  ConversationId,
  GenerationMode,
  ImageGenerationParams,
  ReasoningConfig,
} from "@/types";

/**
 * Unified hook for all chat input state management
 * Consolidates conversation-scoped and global state in one place
 */
export function useChatInputState(conversationId?: ConversationId) {
  const { user, canSendMessage } = useUserDataContext();
  const { isPrivateMode } = usePrivateMode();
  const userSettingsRaw = useUserSettings();

  // Get conversation key for scoped state
  const key = useMemo(
    () => getChatKey(conversationId ?? undefined),
    [conversationId]
  );

  // === Conversation-Scoped State ===
  const attachments = useChatInputStore(s => s.attachmentsByKey[key] ?? []);
  const setAttachmentsForKey = useChatInputStore(s => s.setAttachments);
  const clearAttachmentsForKey = useChatInputStore(s => s.clearAttachmentsKey);

  const temperature = useChatInputStore(s => s.temperatureByKey[key]);
  const setTemperatureForKey = useChatInputStore(s => s.setTemperature);

  const selectedPersonaId = useChatInputStore(
    s => s.selectedByKey[key] ?? null
  );
  const setSelectedPersonaIdForKey = useChatInputStore(
    s => s.setSelectedPersonaId
  );

  // === Global State ===
  const selectedModel = useChatInputStore(s => s.selectedModel);
  const setSelectedModel = useChatInputStore(s => s.setSelectedModel);

  const reasoningConfig = useChatInputStore(s => s.reasoningConfig);
  const setReasoningConfig = useChatInputStore(s => s.setReasoningConfig);

  const generationMode = useChatInputStore(s => s.generationMode);
  const setGenerationMode = useChatInputStore(s => s.setGenerationMode);

  const imageParams = useChatInputStore(s => s.imageParams);
  const setImageParams = useChatInputStore(s => s.setImageParams);

  const negativePromptEnabled = useChatInputStore(s => s.negativePromptEnabled);
  const setNegativePromptEnabled = useChatInputStore(
    s => s.setNegativePromptEnabled
  );

  // === Derived State & Visibility Logic ===
  const userSettings = isUserSettings(userSettingsRaw) ? userSettingsRaw : null;
  const personasEnabled = userSettings?.personasEnabled !== false;

  // === Wrapped Setters with Key Binding ===
  const setAttachments = useCallback(
    (value: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
      setAttachmentsForKey(key, value);
    },
    [key, setAttachmentsForKey]
  );

  const clearAttachments = useCallback(() => {
    clearAttachmentsForKey(key);
  }, [key, clearAttachmentsForKey]);

  const setTemperature = useCallback(
    (value: number | undefined) => {
      setTemperatureForKey(key, value);
    },
    [key, setTemperatureForKey]
  );

  const setSelectedPersonaId = useCallback(
    (id: Id<"personas"> | null) => {
      setSelectedPersonaIdForKey(key, id);
    },
    [key, setSelectedPersonaIdForKey]
  );

  return {
    // Conversation-scoped state
    attachments,
    setAttachments,
    clearAttachments,
    temperature,
    setTemperature,
    selectedPersonaId,
    setSelectedPersonaId,

    // Global state
    selectedModel,
    setSelectedModel,
    reasoningConfig,
    setReasoningConfig,
    generationMode,
    setGenerationMode,
    imageParams,
    setImageParams,
    negativePromptEnabled,
    setNegativePromptEnabled,

    // Derived state
    personasEnabled,
    canSendMessage,
    isPrivateMode,
    user,

    // Internal key for advanced usage
    _key: key,
  };
}

/**
 * Hook for managing chat input UI controls visibility
 * Determines which pickers should be shown based on context
 */
export function useChatInputControls(
  conversationId?: ConversationId,
  hasExistingMessages?: boolean
) {
  const { isPrivateMode, personasEnabled, user } =
    useChatInputState(conversationId);

  // Show persona selector only when starting a new conversation
  const isNewConversation = isPrivateMode && !hasExistingMessages;
  const isNewRegularConversation = !(isPrivateMode || conversationId);
  const shouldShowPersonaSelector =
    isNewConversation || isNewRegularConversation;

  const canShowPersonaSelector = user && personasEnabled;
  const showPersonaSelector =
    canShowPersonaSelector && shouldShowPersonaSelector;

  return {
    showPersonaSelector,
    showTemperaturePicker: true, // Always available
    showReasoningPicker: true, // Always available (filtered by model support)
    showModelPicker: true, // Always available
    showGenerationModeToggle: true, // Always available
  };
}
