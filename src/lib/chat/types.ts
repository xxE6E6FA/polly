/**
 * Chat strategy pattern types
 *
 * Defines the interface for different chat implementations:
 * - LocalChatStrategy: Client-side only, no server persistence
 * - ServerChatStrategy: Convex-backed, real-time sync
 */

import {
  type Attachment,
  type ChatMessage,
  type ConversationId,
} from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";
import { type Id } from "../../../convex/_generated/dataModel";

export interface ChatStrategy {
  // Message operations
  sendMessage(
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    personaPrompt?: string | null
  ): Promise<void>;

  stopGeneration(): void;
  deleteMessage(messageId: string): Promise<void>;
  editMessage(messageId: string, content: string): Promise<void>;

  // State getters
  getMessages(): ChatMessage[];
  isStreaming(): boolean;
  isLoading(): boolean;
  hasStreamingContent(): boolean;

  // Lifecycle
  initialize?(): void;
  cleanup?(): void;
}

export interface ChatStrategyOptions {
  conversationId?: ConversationId;
  userId?: Id<"users">;
  onError?: (error: Error) => void;
  onConversationCreate?: (conversationId: ConversationId) => void;
  onStreamingStateChange?: (isStreaming: boolean) => void;
  initialMessage?: string;
  initialAttachments?: Attachment[];
  initialUseWebSearch?: boolean;
  initialPersonaId?: Id<"personas">;
  initialReasoningConfig?: ReasoningConfig;
}

export type ChatMode = "regular" | "private";
