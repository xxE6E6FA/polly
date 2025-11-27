import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { CONFIG } from "./config";
import { shouldExtractPdfText } from "./pdf";

/**
 * Retry fetching a file from storage with exponential backoff.
 * This handles the case where a file was just uploaded and may not be
 * immediately available due to storage consistency.
 */
const fetchStorageWithRetry = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  maxRetries = 5,
  initialDelayMs = 100,
): Promise<Blob> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const blob = await ctx.storage.get(storageId);
    if (blob) {
      if (attempt > 0) {
        console.log(
          `[fetchStorageWithRetry] File available after ${attempt + 1} attempts`,
        );
      }
      return blob;
    }

    // File not found - might be eventual consistency, retry with backoff
    lastError = new Error("File not found in storage");
    const delayMs = initialDelayMs * Math.pow(2, attempt);

    if (attempt < maxRetries - 1) {
      console.log(
        `[fetchStorageWithRetry] File not available yet, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
      );
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.error(
    `[fetchStorageWithRetry] File not available after ${maxRetries} attempts`,
  );
  throw lastError ?? new Error("File not found in storage");
};

export const convertStorageToData = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  fileType?: string,
): Promise<{
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  base64: string;
  mimeType: string;
}> => {
  const blob = await fetchStorageWithRetry(ctx, storageId);
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(new Uint8Array(arrayBuffer)).toString("base64");
  const mimeType =
    (blob as any).type ||
    CONFIG.MIME_TYPES[
      (fileType as keyof typeof CONFIG.MIME_TYPES) || "default"
    ] ||
    CONFIG.MIME_TYPES.default;
  return { blob, arrayBuffer, base64, mimeType };
};

export const convertAttachment = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string; name?: string },
  format: "dataUrl" | "aiSdk",
): Promise<string | { data: ArrayBuffer; mimeType: string }> => {
  const storageData = await convertStorageToData(
    ctx,
    attachment.storageId,
    attachment.type,
  );
  if (format === "dataUrl") {
    return `data:${storageData.mimeType};base64,${storageData.base64}`;
  }
  return { data: storageData.arrayBuffer, mimeType: storageData.mimeType };
};

/**
 * Helper to extract PDF text when needed
 */
const extractPdfTextIfNeeded = async (
  ctx: ActionCtx,
  attachment: {
    storageId?: Id<"_storage">;
    name?: string;
    extractedText?: string;
    textFileId?: Id<"_storage">;
  },
  provider: string,
  modelId: string,
  supportsFiles: boolean,
): Promise<{ type: "text"; text: string } | { type: "file"; data: ArrayBuffer; mimeType: string } | null> => {
  // Check if we already have extracted text
  if (attachment.extractedText) {
    return { type: "text" as const, text: attachment.extractedText };
  }

  // Check if we have stored text
  if (attachment.textFileId) {
    try {
      const storageData = await convertStorageToData(
        ctx,
        attachment.textFileId,
        "text/plain",
      );
      return {
        type: "text" as const,
        text: new TextDecoder().decode(storageData.arrayBuffer),
      };
    } catch {
      // fallthrough to extraction
    }
  }

  // Check if we need to extract text
  const needsExtraction = shouldExtractPdfText(provider, modelId, supportsFiles);

  if (!needsExtraction && attachment.storageId) {
    // Native PDF support - send raw PDF
    try {
      const { data, mimeType } = (await convertAttachment(
        ctx,
        { storageId: attachment.storageId, type: "pdf", name: attachment.name },
        "aiSdk",
      )) as { data: ArrayBuffer; mimeType: string };
      return { type: "file" as const, data, mimeType };
    } catch {
      // fallthrough
    }
  }

  // Need to extract text - call the extraction action
  if (attachment.storageId) {
    try {
      const result = await ctx.runAction(api.ai.pdf.extractPdfText, {
        storageId: attachment.storageId,
        filename: attachment.name || "document.pdf",
      });
      return { type: "text" as const, text: result.text };
    } catch (error) {
      console.error("[convertMessagePart] PDF extraction failed:", error);
      return {
        type: "text" as const,
        text: `[PDF extraction failed for ${attachment.name || "document.pdf"}: ${error instanceof Error ? error.message : "Unknown error"}]`,
      };
    }
  }

  return null;
};

export const convertMessagePart = async (
  ctx: ActionCtx,
  part: any,
  provider: string,
  modelId: string,
  supportsFiles: boolean,
): Promise<any> => {
  // Handle raw text file attachment (from createConversation path)
  // Must check BEFORE plain text parts since both have type: "text"
  if (part.type === "text" && part.storageId) {
    if (part.content) {
      return { type: "text" as const, text: part.content };
    }
    try {
      const storageData = await convertStorageToData(
        ctx,
        part.storageId,
        "text/plain",
      );
      return {
        type: "text" as const,
        text: new TextDecoder().decode(storageData.arrayBuffer),
      };
    } catch {
      return {
        type: "text" as const,
        text: `[Unable to read text file: ${part.name || "document.txt"}]`,
      };
    }
  }

  // Handle plain text parts
  if (part.type === "text") {
    return { type: "text" as const, text: part.text || "" };
  }

  // Handle raw image attachment (from createConversation path)
  if (part.type === "image") {
    // Prefer using storage URL directly - it's immediately available and avoids
    // potential consistency issues with storage.get()
    if (part.storageId) {
      const storageUrl = await ctx.storage.getUrl(part.storageId);
      if (storageUrl) {
        return { type: "image" as const, image: storageUrl };
      }
      // If getUrl fails, try fetching the blob as fallback
      try {
        const dataUrl = (await convertAttachment(
          ctx,
          { storageId: part.storageId, type: "image", name: part.name },
          "dataUrl",
        )) as string;
        return { type: "image" as const, image: dataUrl };
      } catch (error) {
        console.error("[convertMessagePart] Failed to convert image from storage:", error);
        // fallthrough to URL
      }
    }
    if (part.url) {
      return { type: "image" as const, image: part.url };
    }
    console.warn("[convertMessagePart] Image attachment has no storageId or url:", part.name);
    return { type: "text" as const, text: "" };
  }

  // Handle raw PDF attachment (from createConversation path)
  if (part.type === "pdf") {
    const result = await extractPdfTextIfNeeded(
      ctx,
      {
        storageId: part.storageId,
        name: part.name,
        extractedText: part.extractedText,
        textFileId: part.textFileId,
      },
      provider,
      modelId,
      supportsFiles,
    );
    if (result) {
      return result;
    }
    return {
      type: "text" as const,
      text: `[Unable to process PDF: ${part.name || "document.pdf"}]`,
    };
  }

  if (part.type === "image_url") {
    // Prefer using storage URL directly - it's immediately available
    if (part.attachment?.storageId) {
      const storageUrl = await ctx.storage.getUrl(part.attachment.storageId);
      if (storageUrl) {
        return { type: "image" as const, image: storageUrl };
      }
      // If getUrl fails, try fetching the blob as fallback
      try {
        const dataUrl = (await convertAttachment(
          ctx,
          part.attachment,
          "dataUrl",
        )) as string;
        return { type: "image" as const, image: dataUrl };
      } catch {
        // fallthrough
      }
    }
    return { type: "image" as const, image: part.image_url?.url || "" };
  }

  if (part.type === "file") {
    // Handle PDF attachments
    if (part.attachment?.type === "pdf") {
      const result = await extractPdfTextIfNeeded(
        ctx,
        part.attachment,
        provider,
        modelId,
        supportsFiles,
      );
      if (result) {
        return result;
      }
    }

    // Handle text file attachments
    if (part.attachment?.type === "text") {
      if (part.attachment.content) {
        return { type: "text" as const, text: part.attachment.content };
      }
      if (part.attachment.storageId) {
        try {
          const storageData = await convertStorageToData(
            ctx,
            part.attachment.storageId,
            "text/plain",
          );
          return {
            type: "text" as const,
            text: new TextDecoder().decode(storageData.arrayBuffer),
          };
        } catch {
          // fallthrough
        }
      }
    }

    return {
      type: "text" as const,
      text: `File: ${part.file?.filename || "Unknown"}\n${part.file?.file_data || ""}`,
    };
  }
  return { type: "text" as const, text: "" };
};

export const convertMessages = async (
  ctx: ActionCtx,
  messages: Array<{ role: string; content: string | any[] }>,
  provider: string,
  modelId: string,
  supportsFiles: boolean,
): Promise<Array<{ role: "system" | "user" | "assistant"; content: any }>> => {
  const promises = messages.map(async (msg) => {
    if (typeof msg.content === "string") {
      return Promise.resolve({ role: msg.role as any, content: msg.content });
    }
    const parts = await Promise.all(
      msg.content.map((p: any) =>
        convertMessagePart(ctx, p, provider, modelId, supportsFiles),
      ),
    );
    return {
      role: msg.role as any,
      content: parts,
    };
  });
  return await Promise.all(promises);
};
