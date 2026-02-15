/**
 * Image Attachment Conversion
 *
 * Converts stored image attachments to AI SDK ImagePart format.
 * Handles storageId resolution, base64 content, and URL fallbacks.
 */

import type { ImagePart, TextPart } from "ai";
import type { ActionCtx } from "../../_generated/server";
import { fetchStorageWithRetry, getRetryConfig } from "./core";
import type { StoredAttachment } from "./core";

// ==================== Utility Functions ====================

/**
 * Convert Uint8Array to base64 string
 * Uses pure JavaScript for Convex compatibility
 */
export function bufferToBase64(bytes: Uint8Array): string {
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

// ==================== Image Conversion ====================

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
export async function convertImageAttachment(
  ctx: ActionCtx,
  attachment: StoredAttachment
): Promise<ImagePart | TextPart> {
  // Priority 1: Use storageId to get a fresh, signed URL with retry
  if (attachment.storageId) {
    const { maxRetries, baseDelayMs } = getRetryConfig();
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
