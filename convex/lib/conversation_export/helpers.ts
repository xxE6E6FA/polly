import type { ExportAttachment } from "../background_jobs/helpers";

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }

  let base64 = "";
  let i = 0;
  const len = bytes.length;
  const getByte = (index: number) => {
    const value = bytes[index];
    if (value === undefined) {
      throw new Error(`Unexpected missing byte at index ${index}`);
    }
    return value;
  };

  for (; i + 2 < len; i += 3) {
    const byte1 = getByte(i);
    const byte2 = getByte(i + 1);
    const byte3 = getByte(i + 2);
    base64 += BASE64_CHARS[byte1 >> 2];
    base64 += BASE64_CHARS[((byte1 & 0x03) << 4) | (byte2 >> 4)];
    base64 += BASE64_CHARS[((byte2 & 0x0f) << 2) | (byte3 >> 6)];
    base64 += BASE64_CHARS[byte3 & 0x3f];
  }

  const remaining = len - i;

  if (remaining === 1) {
    const byte = getByte(i);
    base64 += BASE64_CHARS[byte >> 2];
    base64 += BASE64_CHARS[(byte & 0x03) << 4];
    base64 += "==";
  } else if (remaining === 2) {
    const byte1 = getByte(i);
    const byte2 = getByte(i + 1);
    base64 += BASE64_CHARS[byte1 >> 2];
    base64 += BASE64_CHARS[((byte1 & 0x03) << 4) | (byte2 >> 4)];
    base64 += BASE64_CHARS[(byte2 & 0x0f) << 2];
    base64 += "=";
  }

  return base64;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

export function encodeTextToBase64(content: string): string {
  if (typeof TextEncoder !== "undefined") {
    return uint8ArrayToBase64(new TextEncoder().encode(content));
  }

  // Fallback encoder for environments without TextEncoder (should be rare)
  const utf8: number[] = [];
  for (let i = 0; i < content.length; i++) {
    const codePoint = content.charCodeAt(i);
    if (codePoint < 0x80) {
      utf8.push(codePoint);
    } else if (codePoint < 0x800) {
      utf8.push(0xc0 | (codePoint >> 6));
      utf8.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      // Handle surrogate pairs
      const next = content.charCodeAt(++i);
      const combined = 0x10000 + ((codePoint & 0x3ff) << 10) + (next & 0x3ff);
      utf8.push(0xf0 | (combined >> 18));
      utf8.push(0x80 | ((combined >> 12) & 0x3f));
      utf8.push(0x80 | ((combined >> 6) & 0x3f));
      utf8.push(0x80 | (combined & 0x3f));
    } else {
      utf8.push(0xe0 | (codePoint >> 12));
      utf8.push(0x80 | ((codePoint >> 6) & 0x3f));
      utf8.push(0x80 | (codePoint & 0x3f));
    }
  }
  return uint8ArrayToBase64(Uint8Array.from(utf8));
}

export function inferMimeType(attachment: ExportAttachment): string {
  if (attachment.mimeType) {
    return attachment.mimeType;
  }

  if (attachment.type === "image") {
    const extension = attachment.name.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "svg":
        return "image/svg+xml";
      default:
        return "image/png";
    }
  }

  if (attachment.type === "pdf") {
    return "application/pdf";
  }

  if (attachment.type === "text") {
    return "text/plain; charset=utf-8";
  }

  return "application/octet-stream";
}

export function buildDataUrl(mimeType: string, base64Content: string): string {
  return `data:${mimeType};base64,${base64Content}`;
}

export function generateExportMetadata(
  conversationIds: string[],
  includeAttachments: boolean
) {
  const dateStr = new Date().toLocaleDateString();
  const count = conversationIds.length;
  const title =
    count === 1
      ? `Export Conversation - ${dateStr}`
      : `Export ${count} Conversations - ${dateStr}`;
  const description = `Export of ${count} conversation${
    count !== 1 ? "s" : ""
  } on ${dateStr}${includeAttachments ? " (with attachments)" : ""}`;

  return { title, description };
}
