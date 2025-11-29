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
export { mapServerMessageToChatMessage, useChat } from "./use-chat";
export { useChatAttachments } from "./use-chat-attachments";
export { useChatFullscreen } from "./use-chat-fullscreen";
export { useChatInputPreservation } from "./use-chat-input-preservation";
export { useChatMessages } from "./use-chat-messages";
export { useChatScopedState } from "./use-chat-scoped-state";
export { useChatStateMachine } from "./use-chat-state-machine";
export { useClearOnConversationChange } from "./use-clear-on-conversation-change";
export { useGenerationMode, useImageParams } from "./use-generation";
export { usePrivateChat } from "./use-private-chat";
export { selectReasoningConfig, useReasoningConfig } from "./use-reasoning";

// =============================================================================
// Model Hooks
// =============================================================================

export { useConversationModelOverride } from "./use-conversation-model-override";
export { useEnabledImageModels } from "./use-enabled-image-models";
export { useLastGeneratedImageSeed } from "./use-last-generated-image-seed";
export { useModelCatalog, useModelTitle } from "./use-model-catalog";
export { useReplicateApiKey } from "./use-replicate-api-key";
export { useReplicateSchema } from "./use-replicate-schema";
export { useSelectModel } from "./use-select-model";
export { useSelectedModel } from "./use-selected-model";

// =============================================================================
// Conversation Hooks
// =============================================================================

export { useConversationSelection } from "./use-conversation-selection";
export { usePaginatedConversations } from "./use-paginated-conversations";

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
export { useListSort } from "./use-list-sort";
export { useMediaQuery } from "./use-media-query";
export { useOnline } from "./use-online";
export { useTextSelection } from "./use-text-selection";
export { useVirtualizedPaginatedQuery } from "./use-virtualized-paginated-query";

// =============================================================================
// Settings Hooks
// =============================================================================

export { useTheme } from "./use-theme";
export { useUserSettings } from "./use-user-settings";

// =============================================================================
// Data Hooks
// =============================================================================

export { useBackgroundJobs } from "./use-background-jobs";
export { useBulkActions } from "./use-bulk-actions";
export { useMessageSentCount } from "./use-message-sent-count";
