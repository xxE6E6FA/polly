/**
 * Shared message conversion utilities (Browser/Frontend)
 *
 * Converts messages with attachments to AI SDK message format.
 * Used for browser-side AI calls (private mode).
 *
 * For Convex/server-side conversion, use convex/ai/message_converter.ts instead.
 *
 * Entry points:
 * - convertMessageForAI() - Convert a message with attachments to ModelMessage
 * - convertAttachmentsForAI() - Convert attachments to AI SDK parts
 */

import type { FilePart, ImagePart, ModelMessage, TextPart } from "ai";
import type { Attachment } from "@/types";

type ContentPart = TextPart | ImagePart | FilePart;

/**
 * Part type returned by attachment conversion
 */
export type ConvertedAttachmentPart =
  | { type: "image"; image: string }
  | { type: "text"; text: string };

/**
 * Convert attachments to AI SDK compatible parts
 *
 * Handles:
 * - Images: converts base64 content to data URL
 * - Text files: uses content directly
 * - PDFs: uses extractedText or content
 */
export function convertAttachmentsForAI(
  attachments: Attachment[] | undefined
): ConvertedAttachmentPart[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments.map(attachment => {
    switch (attachment.type) {
      case "image": {
        if (!attachment.content) {
          throw new Error(`Image attachment ${attachment.name} has no content`);
        }
        const mimeType = attachment.mimeType || "image/jpeg";
        const dataUrl = `data:${mimeType};base64,${attachment.content}`;
        return {
          type: "image",
          image: dataUrl,
        };
      }

      case "text":
        if (!attachment.content) {
          throw new Error(`Text attachment ${attachment.name} has no content`);
        }
        return {
          type: "text",
          text: attachment.content,
        };

      case "pdf": {
        const pdfText = attachment.extractedText || attachment.content;
        if (!pdfText) {
          throw new Error(`PDF attachment ${attachment.name} has no content`);
        }
        return {
          type: "text",
          text: pdfText,
        };
      }

      default:
        throw new Error(`Unsupported attachment type: ${attachment.type}`);
    }
  });
}

/**
 * Convert a message with attachments to AI SDK ModelMessage format
 *
 * If the message has no attachments, returns simple string content.
 * If the message has attachments, returns content parts array.
 */
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
