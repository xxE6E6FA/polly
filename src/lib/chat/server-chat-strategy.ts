import { type ChatStrategy, type ChatStrategyOptions } from "./types";
import { type Attachment, type ChatMessage } from "@/types";
import { type ReasoningConfig } from "@/components/reasoning-config-select";
import { type Id } from "../../../convex/_generated/dataModel";

// Strategy for server-persisted chat (Convex backend)
export class ServerChatStrategy implements ChatStrategy {
  constructor(
    private options: ChatStrategyOptions & {
      isStreaming: boolean;
      isLoading: boolean;
      hasStreamingContent: boolean;
      sendMessageFn: (
        content: string,
        attachments?: Attachment[],
        useWebSearch?: boolean,
        personaId?: Id<"personas"> | null,
        reasoningConfig?: ReasoningConfig
      ) => Promise<void>;
      stopGenerationFn: () => void;
      deleteMessageFn: (messageId: string) => Promise<void>;
      editMessageFn: (messageId: string, content: string) => Promise<void>;
    }
  ) {}

  sendMessage(
    content: string,
    attachments?: Attachment[],
    useWebSearch?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig,
    _personaPrompt?: string | null
  ): Promise<void> {
    return this.options.sendMessageFn(
      content,
      attachments,
      useWebSearch,
      personaId,
      reasoningConfig
    );
  }

  stopGeneration(): void {
    this.options.stopGenerationFn();
  }

  deleteMessage(messageId: string): Promise<void> {
    return this.options.deleteMessageFn(messageId);
  }

  editMessage(messageId: string, content: string): Promise<void> {
    return this.options.editMessageFn(messageId, content);
  }

  getMessages(): ChatMessage[] {
    // Not used in regular mode - messages are accessed directly from useChat
    return [];
  }

  isStreaming(): boolean {
    return this.options.isStreaming;
  }

  isLoading(): boolean {
    return this.options.isLoading;
  }

  hasStreamingContent(): boolean {
    return this.options.hasStreamingContent;
  }

  cleanup(): void {
    // No special cleanup needed for Convex strategy
    // The parent component handles Convex subscription cleanup
  }
}
