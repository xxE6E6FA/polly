import type { Id } from "../../_generated/dataModel";

export type StreamingActionResult = {
  userMessageId?: Id<"messages">;
  assistantMessageId: Id<"messages">;
};

export type MessageActionArgs = {
  conversationId: Id<"conversations">;
  model: string;
  provider: string;
};

export type ConversationDoc = {
  _id: Id<"conversations">;
  _creationTime: number;
  userId: Id<"users">;
  title: string;
  personaId?: Id<"personas">;
  sourceConversationId?: Id<"conversations">;
  isStreaming?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  createdAt: number;
  updatedAt: number;
};

export type MessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  conversationId: Id<"conversations">;
  role: "user" | "assistant" | "system" | "context";
  content: string;
  model?: string;
  provider?: string;
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
  }>;
  metadata?: {
    reasoningMode?: boolean;
    webSearchEnabled?: boolean;
    webSearchQuery?: string;
    webSearchUrls?: string[];
    temperature?: number;
  };
  createdAt: number;
  updatedAt: number;
};

export type ApiMessageDoc = {
  _id: Id<"messages">;
  _creationTime: number;
  conversationId: Id<"conversations">;
  role: string;
  content: string;
  model?: string;
  provider?: string;
  attachments?: Array<{
    type: "image" | "pdf" | "text";
    url: string;
    name: string;
    size: number;
    content?: string;
    thumbnail?: string;
  }>;
  metadata?: {
    reasoningMode?: boolean;
    webSearchEnabled?: boolean;
    webSearchQuery?: string;
    webSearchUrls?: string[];
    temperature?: number;
  };
  createdAt: number;
  updatedAt: number;
};

export type ProcessedChunk = {
  messages?: ApiMessageDoc[];
  summary?: string;
  isMetaSummary?: boolean;
  chunkIndex?: number;
  originalMessageCount?: number;
};