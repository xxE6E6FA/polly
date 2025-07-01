import { type ChatStrategy, type ChatStrategyOptions } from "./types";
import { type Attachment, type ChatMessage } from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";
import { type Id } from "../../../convex/_generated/dataModel";

type ServerChatStrategyOptions = ChatStrategyOptions & {
  isLoading: boolean;
  isStreaming: boolean;
  sendMessage: (
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaPrompt?: string | null,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  stopGeneration: () => void;
  deleteMessage: (messageId: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  messages: ChatMessage[];
};

// Strategy for server-persisted chat (Convex backend)
export class ServerChatStrategy implements ChatStrategy {
  constructor(private options: ServerChatStrategyOptions) {}

  sendMessage(
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    personaPrompt?: string | null
  ): Promise<void> {
    return this.options.sendMessage(
      content,
      attachments,
      useWebSearch,
      personaPrompt,
      personaId,
      reasoningConfig
    );
  }

  stopGeneration(): void {
    this.options.stopGeneration();
  }

  deleteMessage(messageId: string): Promise<void> {
    return this.options.deleteMessage(messageId);
  }

  editMessage(messageId: string, content: string): Promise<void> {
    return this.options.editMessage(messageId, content);
  }

  getMessages(): ChatMessage[] {
    // Not used in regular mode - messages are accessed directly from useChat
    return this.options.messages;
  }

  isStreaming(): boolean {
    return this.options.isStreaming;
  }

  isLoading(): boolean {
    return this.options.isLoading;
  }

  cleanup(): void {
    // No special cleanup needed for Convex strategy
    // The parent component handles Convex subscription cleanup
  }
}
