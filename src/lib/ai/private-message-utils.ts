/**
 * Message format conversion utilities for private chat
 * Converts between AI SDK message format and internal ChatMessage format
 */

import { convertMessageForAI } from "@shared/message-conversion";
import type { ModelMessage } from "ai";
import type { ChatMessage } from "@/types";

export function convertChatMessagesToCoreMessages(
  messages: ChatMessage[],
  systemPrompt?: string
): ModelMessage[] {
  const coreMessages: ModelMessage[] = [];

  if (systemPrompt) {
    coreMessages.push({
      role: "system",
      content: systemPrompt,
    });
  }

  for (const msg of messages) {
    if (msg.role === "user" || msg.role === "assistant") {
      const messageContent = convertMessageForAI({
        role: msg.role,
        content: msg.content,
        attachments: msg.attachments,
      });

      coreMessages.push(messageContent);
    }
  }

  return coreMessages;
}
