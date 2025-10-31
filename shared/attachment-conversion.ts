/**
 * Shared attachment conversion utilities
 * Converts Attachment objects to AI SDK compatible format
 * Used by both browser (private) and Convex (server) modes
 */
import type { Attachment } from "@/types";

export type ConvertedAttachmentPart =
  | { type: "image"; image: string }
  | { type: "text"; text: string };

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
