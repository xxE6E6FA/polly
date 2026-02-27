/**
 * @module hooks
 * @description Custom React hooks organized by domain
 *
 * ## Domains
 *
 * ### Chat
 * Core chat functionality: state, messages, streaming, attachments
 *
 * ### Models
 * AI model management: selection, catalog, image models
 *
 * ### UI
 * Generic UI utilities: debounce, media query, list selection
 *
 * ### Files
 * File upload and handling
 *
 * ### Data
 * Background jobs, bulk actions, mutations
 *
 * @example
 * import { useChat, useSelectedModel, useDebounce } from "@/hooks";
 */

// =============================================================================
// Chat Hooks
// =============================================================================

// Chat UI hooks
export { useChatInputDragDrop } from "./chat-ui/use-chat-input-drag-drop";
export { useChatInputImageGeneration } from "./chat-ui/use-chat-input-image-generation";
export {
  useChatInputControls,
  useChatInputState,
} from "./chat-ui/use-chat-input-state";
export { useChatInputSubmission } from "./chat-ui/use-chat-input-submission";
export { useKeyboardNavigation } from "./chat-ui/use-keyboard-navigation";
export { useSpeechInput } from "./chat-ui/use-speech-input";
export { useApiKeys } from "./use-api-keys";
export type { AssistantPhase } from "./use-assistant-display-phase";
export { useAssistantDisplayPhase } from "./use-assistant-display-phase";
export { mapServerMessageToChatMessage, useChat } from "./use-chat";
export { useChatAttachments } from "./use-chat-attachments";
export { useChatScopedState } from "./use-chat-scoped-state";
export { useChatViewState } from "./use-chat-view-state";
export { useClearOnConversationChange } from "./use-clear-on-conversation-change";
export { useGenerationMode, useImageParams } from "./use-generation";
export { usePrivateChat } from "./use-private-chat";
export { useReasoningConfig } from "./use-reasoning";
export { useSpeechInputContext } from "./use-speech-input-context";

// =============================================================================
// Model Hooks
// =============================================================================

export { useBreakpointColumns } from "./use-breakpoint-columns";
export { useConversationModelOverride } from "./use-conversation-model-override";
export { useEnabledImageModels } from "./use-enabled-image-models";
export { useLastGeneratedImageSeed } from "./use-last-generated-image-seed";
export { useModelCatalog, useModelTitle } from "./use-model-catalog";
export { useModelItemData } from "./use-model-item-data";
export { useReplicateApiKey } from "./use-replicate-api-key";
export { useReplicateSchema } from "./use-replicate-schema";
export { useSelectedModel } from "./use-selected-model";

// =============================================================================
// Profile Hooks
// =============================================================================

export { useActiveProfile } from "./use-active-profile";
export { useProfiles } from "./use-profiles";

// =============================================================================
// Conversation Hooks
// =============================================================================

export { useArchiveConversation } from "./use-archive-conversation";
export { useArchiveGeneration } from "./use-archive-generation";
export { useConversationImport } from "./use-conversation-import";
export { useConversationLimit } from "./use-conversation-limit";
export { useDeleteConversation } from "./use-delete-conversation";
export { usePaginatedConversations } from "./use-paginated-conversations";
export { useScrollToMessage } from "./use-scroll-to-message";

// =============================================================================
// File Hooks
// =============================================================================

export { useConvexFileUpload } from "./use-convex-file-upload";
export { useFileUpload } from "./use-file-upload";

// =============================================================================
// UI Utility Hooks
// =============================================================================

export { useDebounce } from "./use-debounce";
export {
  useConfirmationDialog,
  useNotificationDialog,
} from "./use-dialog-management";
export { useHoverLinger } from "./use-hover-linger";
export { useListSelection } from "./use-list-selection";
export { useMediaQuery } from "./use-media-query";
export { useOnline } from "./use-online";
export { useRequiredParam } from "./use-required-param";
export { useTextSelection } from "./use-text-selection";
export { useVirtualizedPaginatedQuery } from "./use-virtualized-paginated-query";
export type {
  DisplaySettings,
  ZenDisplaySettingsControls,
} from "./use-zen-display-settings";
export {
  DEFAULT_DISPLAY_SETTINGS,
  FONT_OPTIONS,
  FONT_SIZE_STEPS,
  LINE_HEIGHT_STEPS,
  useZenDisplaySettings,
  WIDTH_CLASSES,
} from "./use-zen-display-settings";

// =============================================================================
// Settings Hooks
// =============================================================================

export { useSettingsCarouselSync } from "./use-settings-carousel-sync";
export { useTheme } from "./use-theme";
export { useUserSettings } from "./use-user-settings";
export { useWordBasedUndo } from "./use-word-based-undo";

// =============================================================================
// Data Hooks
// =============================================================================

export { useBackgroundJobs } from "./use-background-jobs";
export { useBulkActions } from "./use-bulk-actions";
export { useMessageSentCount } from "./use-message-sent-count";
