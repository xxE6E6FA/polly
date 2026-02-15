/**
 * Message Converter Core
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
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { convertImageAttachment } from "./image";
import { convertPdfAttachment } from "./pdf";
import { convertMediaAttachment, convertTextAttachment } from "./text";

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
 * Get current retry configuration.
 * Used by sub-modules to access shared retry settings.
 */
export function getRetryConfig(): { maxRetries: number; baseDelayMs: number } {
  return retryConfig;
}

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
  type: "image" | "pdf" | "text" | "audio" | "video";
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
  | {
      type: "image" | "pdf" | "text" | "audio" | "video";
      attachment?: StoredAttachment;
    };

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

// ==================== Storage Helpers ====================

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

    case "audio":
    case "video":
      return convertMediaAttachment(ctx, attachment, attachment.type, options);

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
    (part.type === "image" ||
      part.type === "pdf" ||
      part.type === "text" ||
      part.type === "audio" ||
      part.type === "video") &&
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
