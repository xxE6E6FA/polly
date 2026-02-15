/**
 * Text, Audio, and Video Attachment Conversion
 *
 * Converts stored text file attachments to AI SDK TextPart format.
 * Converts audio/video attachments to AI SDK FilePart format (for supported providers).
 */

import type { FilePart, TextPart } from "ai";
import type { ActionCtx } from "../../_generated/server";
import { fetchStorageWithRetry } from "./core";
import type { ConversionOptions, StoredAttachment } from "./core";

// ==================== Utility Functions ====================

/**
 * Convert base64 string to Uint8Array
 * Uses pure JavaScript for Convex compatibility
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  // Strip padding
  let len = base64.length;
  while (len > 0 && base64[len - 1] === "=") {
    len--;
  }

  const byteLength = (len * 3) >> 2;
  const bytes = new Uint8Array(byteLength);
  let p = 0;

  for (let i = 0; i < len; ) {
    const a = lookup[base64.charCodeAt(i++)] ?? 0;
    const b = i < len ? (lookup[base64.charCodeAt(i++)] ?? 0) : 0;
    const c = i < len ? (lookup[base64.charCodeAt(i++)] ?? 0) : 0;
    const d = i < len ? (lookup[base64.charCodeAt(i++)] ?? 0) : 0;

    bytes[p++] = (a << 2) | (b >> 4);
    if (p < byteLength) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < byteLength) bytes[p++] = ((c & 3) << 6) | d;
  }

  return bytes;
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

// ==================== Text File Conversion ====================

/**
 * Convert a text attachment to AI SDK TextPart
 *
 * Priority:
 * 1. content (inline text)
 * 2. storageId (fetch from storage)
 */
export async function convertTextAttachment(
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

// ==================== Audio/Video Conversion ====================

/**
 * Check if a provider supports audio/video file parts.
 * Google (Gemini) supports both natively via the AI SDK.
 * OpenRouter's dedicated provider converts audio FilePart -> input_audio format,
 * and passes video as a generic file part (works when the underlying model supports it).
 */
function providerSupportsMediaFiles(provider: string): boolean {
  return provider === "google" || provider === "openrouter";
}

/**
 * Derive a media type from the file extension when mimeType is missing.
 */
function inferMediaType(
  name: string,
  category: "audio" | "video"
): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const extMap: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    aac: "audio/aac",
    webm: category === "audio" ? "audio/webm" : "video/webm",
    mp4: category === "audio" ? "audio/mp4" : "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
  };
  if (ext && extMap[ext]) {
    return extMap[ext];
  }
  return category === "audio" ? "audio/mpeg" : "video/mp4";
}

/**
 * Convert an audio or video attachment to AI SDK FilePart
 *
 * Only sends native file parts to providers that support them (Google/Gemini).
 * Other providers get a text fallback explaining the limitation.
 *
 * Priority (for supported providers):
 * 1. storageId -> fetch blob and send as file
 * 2. content + mimeType -> send as file data
 * 3. Graceful fallback to TextPart if media is unavailable
 */
export async function convertMediaAttachment(
  ctx: ActionCtx,
  attachment: StoredAttachment,
  category: "audio" | "video",
  options: ConversionOptions
): Promise<FilePart | TextPart> {
  if (!providerSupportsMediaFiles(options.provider)) {
    const label = category === "audio" ? "Audio" : "Video";
    return {
      type: "text",
      text: `[${label} file "${attachment.name}" was attached but cannot be processed — this model's provider does not support ${category} input]`,
    };
  }

  const resolvedMediaType =
    attachment.mimeType || inferMediaType(attachment.name, category);

  // Priority 1: Fetch from storage
  if (attachment.storageId) {
    try {
      const blob = await fetchStorageWithRetry(ctx, attachment.storageId);
      return {
        type: "file",
        data: new Uint8Array(await blob.arrayBuffer()),
        mediaType: blob.type || resolvedMediaType,
      };
    } catch (error) {
      console.warn(
        `[message-converter] Failed to fetch ${category} from storage:`,
        error
      );
    }
  }

  // Priority 2: Use inline content (base64 string -> Uint8Array)
  if (attachment.content) {
    return {
      type: "file",
      data: base64ToUint8Array(attachment.content),
      mediaType: resolvedMediaType,
    };
  }

  // Graceful degradation
  return {
    type: "text",
    text: `[${category === "audio" ? "Audio" : "Video"} "${attachment.name}" is no longer available]`,
  };
}
