/**
 * Shared message conversion utilities
 * Converts messages with attachments to AI SDK message format
 * Used by both browser (private) and Convex (server) modes
 */

import type { FilePart, ImagePart, ModelMessage, TextPart } from "ai";
import type { Attachment } from "@/types";
import { convertAttachmentsForAI } from "./attachment-conversion";

type ContentPart = TextPart | ImagePart | FilePart;

export function convertMessageForAI(message: {
  role: string;
  content: string;
  attachments?: Attachment[];
}): ModelMessage {
  const attachments = convertAttachmentsForAI(message.attachments);

  if (attachments.length === 0) {
    return {
      role: message.role as "user" | "assistant" | "system",
      content: message.content,
    } as ModelMessage;
  }

  const contentParts: ContentPart[] = [];

  if (message.content.trim()) {
    contentParts.push({
      type: "text",
      text: message.content,
    });
  }

  for (const attachment of attachments) {
    if (attachment.type === "image") {
      contentParts.push({
        type: "image",
        image: attachment.image,
      } as ImagePart);
    } else if (attachment.type === "text") {
      contentParts.push({
        type: "text",
        text: attachment.text,
      } as TextPart);
    }
  }

  return {
    role: message.role as "user" | "assistant" | "system",
    content: contentParts,
  } as ModelMessage;
}
