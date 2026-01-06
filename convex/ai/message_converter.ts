/**
 * Unified Message Converter
 *
 * Single source of truth for converting stored messages/attachments to AI SDK format.
 * Handles all legacy formats for backward compatibility.
 *
 * Entry points:
 * - convertAttachmentToAISDK() - Single attachment conversion
 * - convertStoredMessageToAISDK() - Full message with attachments
 * - convertStoredMessagesToAISDK() - Batch conversion
 */

import type { FilePart, ImagePart, TextPart } from "ai";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  getStoredPdfText,
  modelSupportsPdfNatively,
  shouldExtractPdfText,
} from "./pdf";

// ==================== Retry Configuration ====================

/**
 * Configurable retry settings for storage operations.
 * Defaults are tuned for production (eventual consistency handling).
 * Tests can override via setRetryConfig() to avoid timeouts.
 */
let retryConfig = {
  maxRetries: 4,
  baseDelayMs: 500,
};

/**
 * Configure retry behavior. Primarily for testing.
 * @example setRetryConfig({ maxRetries: 0, baseDelayMs: 0 }) // Disable retries
 */
export function setRetryConfig(config: {
  maxRetries: number;
  baseDelayMs: number;
}): void {
  retryConfig = config;
}

/**
 * Reset retry config to production defaults.
 */
export function resetRetryConfig(): void {
  retryConfig = { maxRetries: 4, baseDelayMs: 500 };
}

// ==================== Types ====================

/**
 * Stored attachment format (from attachmentSchema in schemas.ts)
 * This is the canonical format stored in the database
 */
export type StoredAttachment = {
  type: "image" | "pdf" | "text";
  url: string;
  name: string;
  size: number;
  content?: string; // Base64 for images (private mode), text content for text files
  storageId?: Id<"_storage">;
  mimeType?: string;
  textFileId?: Id<"_storage">; // For cached PDF extraction
  extractedText?: string; // Deprecated: inline PDF text cache
  thumbnail?: string;
};

/**
 * Legacy intermediate format from buildContextMessages
 * @deprecated This format will be removed - use StoredAttachment directly
 */
export type LegacyMessagePart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string };
      attachment?: StoredAttachment;
    }
  | { type: "file"; file: { filename: string }; attachment?: StoredAttachment }
  | { type: "image" | "pdf" | "text"; attachment?: StoredAttachment };

/**
 * Options for conversion
 */
export type ConversionOptions = {
  provider: string;
  modelId: string;
  supportsFiles: boolean;
};

/**
 * AI SDK compatible part types
 */
export type AISDKPart = TextPart | ImagePart | FilePart;

// ==================== Core Conversion Functions ====================

/**
 * Convert a stored attachment to AI SDK format
 *
 * Handles all source formats:
 * - Images with storageId (resolve to URL)
 * - Images with content (base64 from private mode)
 * - Images with url only (direct URL)
 * - PDFs with textFileId (cached extraction)
 * - PDFs with extractedText (deprecated cache)
 * - PDFs with storageId only (needs extraction)
 * - PDFs with native support (send raw file)
 * - Text files with content or storageId
 */
export async function convertAttachmentToAISDK(
  ctx: ActionCtx,
  attachment: StoredAttachment,
  options: ConversionOptions
): Promise<AISDKPart> {
  switch (attachment.type) {
    case "image":
      return convertImageAttachment(ctx, attachment);

    case "pdf":
      return convertPdfAttachment(ctx, attachment, options);

    case "text":
      return convertTextAttachment(ctx, attachment);

    default: {
      const exhaustiveCheck: never = attachment.type;
      throw new Error(`Unsupported attachment type: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Convert a legacy message part to AI SDK format
 * Handles both old image_url/file format and new direct format
 */
export async function convertLegacyPartToAISDK(
  ctx: ActionCtx,
  part: LegacyMessagePart,
  options: ConversionOptions
): Promise<AISDKPart> {
  // Plain text parts
  if (part.type === "text" && "text" in part) {
    return { type: "text", text: part.text };
  }

  // Legacy image_url format (from buildContextMessages)
  if (part.type === "image_url") {
    if (part.attachment) {
      return convertAttachmentToAISDK(ctx, part.attachment, options);
    }
    // Fallback to direct URL
    return { type: "image", image: part.image_url.url };
  }

  // Legacy file format (for PDFs and text files)
  if (part.type === "file" && part.attachment) {
    return convertAttachmentToAISDK(ctx, part.attachment, options);
  }

  // New unified format - attachment passed directly with type marker
  if (
    (part.type === "image" || part.type === "pdf" || part.type === "text") &&
    part.attachment
  ) {
    return convertAttachmentToAISDK(ctx, part.attachment, options);
  }

  // Unknown format - return empty text to avoid breaking
  console.warn("[message-converter] Unknown part format:", part);
  return { type: "text", text: "" };
}

/**
 * Convert a stored message (with attachments) to AI SDK CoreMessage format
 */
export async function convertStoredMessageToAISDK(
  ctx: ActionCtx,
  message: {
    role: string;
    content: string;
    attachments?: StoredAttachment[];
  },
  options: ConversionOptions
): Promise<{
  role: "system" | "user" | "assistant";
  content: string | AISDKPart[];
}> {
  const role = message.role as "system" | "user" | "assistant";

  // No attachments - simple string content
  if (!message.attachments || message.attachments.length === 0) {
    return { role, content: message.content };
  }

  // Build content parts array
  const parts: AISDKPart[] = [];

  // Add text content if present
  if (message.content.trim()) {
    parts.push({ type: "text", text: message.content });
  }

  // Convert each attachment
  const attachmentParts = await Promise.all(
    message.attachments.map(att => convertAttachmentToAISDK(ctx, att, options))
  );

  parts.push(...attachmentParts);

  return { role, content: parts };
}

/**
 * Convert multiple stored messages to AI SDK format
 */
export async function convertStoredMessagesToAISDK(
  ctx: ActionCtx,
  messages: Array<{
    role: string;
    content: string;
    attachments?: StoredAttachment[];
  }>,
  options: ConversionOptions
): Promise<
  Array<{
    role: "system" | "user" | "assistant";
    content: string | AISDKPart[];
  }>
> {
  return Promise.all(
    messages.map(msg => convertStoredMessageToAISDK(ctx, msg, options))
  );
}

// ==================== Private Conversion Helpers ====================

/**
 * Fetch storage with retry logic to handle eventual consistency
 * Retries with exponential backoff using retryConfig settings
 */
export async function fetchStorageWithRetry(
  ctx: ActionCtx,
  storageId: Id<"_storage">
): Promise<Blob> {
  const { maxRetries, baseDelayMs } = retryConfig;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await ctx.storage.get(storageId);
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `[fetchStorageWithRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        lastError.message
      );
    }

    if (attempt < maxRetries && baseDelayMs > 0) {
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[fetchStorageWithRetry] Retrying after ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.error(
    `[fetchStorageWithRetry] File not available after ${maxRetries + 1} attempts`
  );
  throw lastError ?? new Error("File not found in storage");
}

/**
 * Convert an image attachment to AI SDK ImagePart
 *
 * Priority chain:
 * 1. storageId -> ctx.storage.getUrl() with retry (preferred)
 * 2. storageId -> ctx.storage.get() with retry -> data URL (fallback)
 * 3. content (base64) -> data URL (for private mode)
 * 4. url (direct URL fallback)
 * 5. Graceful fallback to TextPart if image is unavailable
 */
async function convertImageAttachment(
  ctx: ActionCtx,
  attachment: StoredAttachment
): Promise<ImagePart | TextPart> {
  // Priority 1: Use storageId to get a fresh, signed URL with retry
  if (attachment.storageId) {
    const { maxRetries, baseDelayMs } = retryConfig;
    // Try getUrl first (faster, returns signed URL)
    // Retry with exponential backoff to handle storage consistency delays
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const storageUrl = await ctx.storage.getUrl(attachment.storageId);
        if (storageUrl) {
          return { type: "image", image: storageUrl };
        }
      } catch (error) {
        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          if (baseDelayMs > 0) {
            console.warn(
              `[message-converter] getUrl attempt ${attempt + 1}/${maxRetries + 1} failed, retrying after ${delayMs}ms:`,
              error
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } else {
          console.warn(
            "[message-converter] Failed to get storage URL after retries, falling back to blob fetch:",
            error
          );
        }
      }
    }

    // Priority 2: Fetch blob with retry and convert to data URL
    try {
      const blob = await fetchStorageWithRetry(ctx, attachment.storageId);
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = bufferToBase64(new Uint8Array(arrayBuffer));
      const mimeType = blob.type || attachment.mimeType || "image/jpeg";
      return { type: "image", image: `data:${mimeType};base64,${base64}` };
    } catch (error) {
      console.warn(
        "[message-converter] Failed to fetch image from storage after retries:",
        error
      );
      // Fall through to other options
    }
  }

  // Priority 3: Use content field (base64 from private mode)
  if (attachment.content) {
    const mimeType = attachment.mimeType || "image/jpeg";
    return {
      type: "image",
      image: `data:${mimeType};base64,${attachment.content}`,
    };
  }

  // Priority 4: Use url directly (check it's not empty)
  if (attachment.url && attachment.url.trim()) {
    return { type: "image", image: attachment.url };
  }

  // Graceful degradation: return placeholder text instead of throwing
  // This allows the conversation to continue even if the image file was deleted
  console.warn(
    `[message-converter] Image attachment "${attachment.name}" has no valid source (storageId: ${attachment.storageId || "none"}, url: ${attachment.url || "none"})`
  );
  return {
    type: "text",
    text: `[Image "${attachment.name}" is no longer available - the file may have been deleted]`,
  };
}

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
async function convertPdfAttachment(
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

/**
 * Convert a text attachment to AI SDK TextPart
 *
 * Priority:
 * 1. content (inline text)
 * 2. storageId (fetch from storage)
 */
async function convertTextAttachment(
  ctx: ActionCtx,
  attachment: StoredAttachment
): Promise<TextPart> {
  // Priority 1: Use content directly
  if (attachment.content) {
    return {
      type: "text",
      text: formatTextContent(attachment.content, attachment.name),
    };
  }

  // Priority 2: Fetch from storage with retry
  if (attachment.storageId) {
    try {
      const blob = await fetchStorageWithRetry(ctx, attachment.storageId);
      const text = await blob.text();
      return {
        type: "text",
        text: formatTextContent(text, attachment.name),
      };
    } catch (error) {
      console.warn(
        "[message-converter] Failed to fetch text file from storage after retries:",
        error
      );
    }
  }

  return {
    type: "text",
    text: `[Unable to read text file: ${attachment.name || "document.txt"}]`,
  };
}

/**
 * Format text content with filename header
 */
function formatTextContent(text: string, filename?: string): string {
  if (filename) {
    return `--- Content from ${filename} ---\n${text}`;
  }
  return text;
}

// ==================== Utility Functions ====================

/**
 * Convert Uint8Array to base64 string
 * Uses pure JavaScript for Convex compatibility
 */
function bufferToBase64(bytes: Uint8Array): string {
  const base64chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  let i;

  for (i = 0; i < bytes.length - 2; i += 3) {
    const byte0 = bytes[i]!;
    const byte1 = bytes[i + 1]!;
    const byte2 = bytes[i + 2]!;
    result += base64chars[byte0 >> 2];
    result += base64chars[((byte0 & 3) << 4) | (byte1 >> 4)];
    result += base64chars[((byte1 & 15) << 2) | (byte2 >> 6)];
    result += base64chars[byte2 & 63];
  }

  if (i < bytes.length) {
    const lastByte = bytes[i]!;
    result += base64chars[lastByte >> 2];
    if (i === bytes.length - 1) {
      result += base64chars[(lastByte & 3) << 4];
      result += "==";
    } else {
      const nextByte = bytes[i + 1]!;
      result += base64chars[((lastByte & 3) << 4) | (nextByte >> 4)];
      result += base64chars[(nextByte & 15) << 2];
      result += "=";
    }
  }

  return result;
}
