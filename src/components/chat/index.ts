/**
 * @module chat
 * @description Chat interface components for conversations
 *
 * ## Main Components
 * - ChatHeader: Top header with title, actions, sharing
 * - ChatMessage: Individual message display
 * - VirtualizedChatMessages: Scrollable virtualized message list
 * - ChatZeroState: Empty conversation welcome state
 * - ChatOutline: Table of contents sidebar
 *
 * ## Submodules
 * - input/: Chat input field, attachments, pickers
 * - message/: Message bubbles, actions, image gallery
 * - unified-chat-view/: Full chat view composition
 *
 * @example
 * import { ChatHeader, VirtualizedChatMessages } from "@/components/chat";
 */

// Main chat components
export { ChatHeader } from "./chat-header";
export { ChatMessage } from "./chat-message";
export { ChatOutline } from "./chat-outline";
export { ChatZeroState } from "./chat-zero-state";
export { CitationAvatarStack } from "./citation-avatar-stack";

// Citations
export { Citations } from "./citations";
export { CitationsGallery } from "./citations-gallery";
export { ContextMessage } from "./context-message";
export type { ChatInputRef } from "./input";
// Re-export submodules
export { ChatInput } from "./input";
export { PrivateModeHeader } from "./private-mode-header";
export { PrivateToggle } from "./private-toggle";
export { SimplePrompts } from "./prompts-ticker";
// Supporting components
export { Reasoning } from "./reasoning";
export { SearchQuery } from "./search-query";
export { UnifiedChatView } from "./unified-chat-view";
export { VirtualizedChatMessages } from "./virtualized-chat-messages";
