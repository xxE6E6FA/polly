/**
 * PDF Attachment Conversion
 *
 * Converts stored PDF attachments to AI SDK format.
 * Handles native PDF support (Anthropic, Google) and text extraction fallback.
 */

import type { FilePart, TextPart } from "ai";
import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import {
  getStoredPdfText,
  shouldExtractPdfText,
} from "../pdf";
import { fetchStorageWithRetry } from "./core";
import type { ConversionOptions, StoredAttachment } from "./core";

// ==================== PDF Conversion ====================

/**
 * Convert a PDF attachment to AI SDK format
 *
 * Decision logic:
 * - If model supports native PDF (Anthropic, Google) and supportsFiles: send raw PDF
 * - Otherwise: extract text and send as TextPart
 *
 * Text extraction priority:
 * 1. textFileId (stored extracted text - fastest, persistent)
 * 2. extractedText (deprecated inline cache)
 * 3. storageId -> extractPdfText action (server-side extraction)
 * 4. content (inline text - private mode)
 */
export async function convertPdfAttachment(
  ctx: ActionCtx,
  attachment: StoredAttachment,
  options: ConversionOptions
): Promise<TextPart | FilePart> {
  const needsExtraction = shouldExtractPdfText(
    options.provider,
    options.modelId,
    options.supportsFiles
  );

  // Native PDF support - send raw file
  if (!needsExtraction && attachment.storageId) {
    try {
      const blob = await fetchStorageWithRetry(ctx, attachment.storageId);
      const arrayBuffer = await blob.arrayBuffer();
      return {
        type: "file",
        data: new Uint8Array(arrayBuffer),
        mediaType: "application/pdf",
      };
    } catch (error) {
      console.warn(
        "[message-converter] Failed to fetch PDF from storage after retries, falling back to extraction:",
        error
      );
      // Fall through to extraction
    }
  }

  // Need text extraction
  const text = await extractPdfText(ctx, attachment);

  return {
    type: "text",
    text: formatPdfText(text, attachment.name),
  };
}

/**
 * Extract text from PDF using priority chain
 */
async function extractPdfText(
  ctx: ActionCtx,
  attachment: StoredAttachment
): Promise<string> {
  // Priority 1: Use textFileId (stored extracted text) with retry
  if (attachment.textFileId) {
    try {
      const storedText = await getStoredPdfText(ctx, attachment.textFileId);
      if (storedText) {
        return storedText;
      }
    } catch (error) {
      console.warn(
        "[message-converter] Failed to fetch stored PDF text, falling back to extraction:",
        error
      );
      // Fall through to next priority
    }
  }

  // Priority 2: Use extractedText (deprecated inline cache)
  if (attachment.extractedText) {
    return attachment.extractedText;
  }

  // Priority 3: Extract from storage using Gemini
  if (attachment.storageId) {
    try {
      const result = await ctx.runAction(api.ai.pdf.extractPdfText, {
        storageId: attachment.storageId,
        filename: attachment.name || "document.pdf",
      });
      return result.text;
    } catch (error) {
      console.error("[message-converter] PDF extraction failed:", error);
      return `[PDF extraction failed for ${attachment.name || "document.pdf"}: ${error instanceof Error ? error.message : "Unknown error"}]`;
    }
  }

  // Priority 4: Use content (for private mode, should already be text)
  if (attachment.content) {
    return attachment.content;
  }

  return `[Unable to read PDF: ${attachment.name || "document.pdf"}]`;
}

/**
 * Format PDF text with filename header
 */
function formatPdfText(text: string, filename?: string): string {
  if (filename) {
    return `--- Content from ${filename} ---\n${text}`;
  }
  return text;
}
