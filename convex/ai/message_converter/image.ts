/**
 * Image Attachment Conversion
 *
 * Converts stored image attachments to AI SDK ImagePart format.
 * Handles storageId resolution, base64 content, and URL fallbacks.
 */

import type { ImagePart, TextPart } from "ai";
import type { ActionCtx } from "../../_generated/server";
import { arrayBufferToBase64 } from "../../lib/encoding";
import { fetchStorageWithRetry, getRetryConfig } from "./core";
import type { StoredAttachment } from "./core";

/**
 * @deprecated Use `arrayBufferToBase64` from `convex/lib/encoding` instead.
 */
export function bufferToBase64(bytes: Uint8Array): string {
  return arrayBufferToBase64(bytes.buffer as ArrayBuffer);
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
      const base64 = arrayBufferToBase64(arrayBuffer);
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
