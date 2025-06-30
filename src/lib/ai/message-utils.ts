import { type ChatMessage, type Attachment } from "@/types";

/**
 * Utility functions for message state management
 * These help DRY up common message operations across hooks
 */

export const messageUtils = {
  /**
   * Add a message to the message list
   */
  addMessage: (
    messages: ChatMessage[],
    message: ChatMessage
  ): ChatMessage[] => [...messages, message],

  /**
   * Update a message by ID
   */
  updateMessage: (
    messages: ChatMessage[],
    messageId: string,
    updates: Partial<ChatMessage>
  ): ChatMessage[] =>
    messages.map(msg => (msg.id === messageId ? { ...msg, ...updates } : msg)),

  /**
   * Remove a message by ID
   */
  removeMessage: (messages: ChatMessage[], messageId: string): ChatMessage[] =>
    messages.filter(msg => msg.id !== messageId),

  /**
   * Update message content by ID
   */
  updateMessageContent: (
    messages: ChatMessage[],
    messageId: string,
    content: string
  ): ChatMessage[] =>
    messages.map(msg => (msg.id === messageId ? { ...msg, content } : msg)),

  /**
   * Create a user message
   */
  createUserMessage: (
    content: string,
    attachments?: Attachment[]
  ): ChatMessage => ({
    id: `private_user_${Date.now()}`,
    role: "user",
    content,
    isMainBranch: true,
    attachments,
    createdAt: Date.now(),
  }),

  /**
   * Create an assistant message placeholder
   */
  createAssistantMessage: (model?: string, provider?: string): ChatMessage => ({
    id: `private_assistant_${Date.now()}`,
    role: "assistant",
    content: "",
    isMainBranch: true,
    createdAt: Date.now(),
    model,
    provider,
  }),
};
