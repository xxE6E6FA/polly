import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { CONFIG } from "./config";

//

export const convertStorageToData = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  fileType?: string
): Promise<{ blob: Blob; arrayBuffer: ArrayBuffer; base64: string; mimeType: string }> => {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new Error("File not found in storage");
  }
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(new Uint8Array(arrayBuffer)).toString("base64");
  const mimeType =
    (blob as any).type ||
    CONFIG.MIME_TYPES[(fileType as keyof typeof CONFIG.MIME_TYPES) || "default"] ||
    CONFIG.MIME_TYPES.default;
  return { blob, arrayBuffer, base64, mimeType };
};

export const convertAttachment = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string; name?: string },
  format: "dataUrl" | "aiSdk"
): Promise<string | { data: ArrayBuffer; mimeType: string }> => {
  const storageData = await convertStorageToData(ctx, attachment.storageId, attachment.type);
  if (format === "dataUrl") {
    return `data:${storageData.mimeType};base64,${storageData.base64}`;
  }
  return { data: storageData.arrayBuffer, mimeType: storageData.mimeType };
};

export const convertMessagePart = async (
  ctx: ActionCtx,
  part: any,
  provider: string
): Promise<any> => {
  if (part.type === "text") {
    return { type: "text" as const, text: part.text || "" };
  }
  if (part.type === "image_url") {
    if (part.attachment?.storageId) {
      try {
        const dataUrl = (await convertAttachment(ctx, part.attachment, "dataUrl")) as string;
        return { type: "image" as const, image: dataUrl };
      } catch {
        // fallthrough
      }
    }
    return { type: "image" as const, image: part.image_url?.url || "" };
  }
  if (part.type === "file") {
    if (
      part.attachment?.storageId &&
      part.attachment.type === "pdf" &&
      (provider === "anthropic" || provider === "google")
    ) {
      try {
        const { data, mimeType } = (await convertAttachment(ctx, part.attachment, "aiSdk")) as {
          data: ArrayBuffer;
          mimeType: string;
        };
        return { type: "file" as const, data, mimeType };
      } catch {
        // fallthrough
      }
    }
    if (part.attachment?.type === "pdf") {
      if (part.attachment.extractedText) {
        return { type: "text" as const, text: part.attachment.extractedText };
      }
      if (part.attachment.textFileId) {
        try {
          const storageData = await convertStorageToData(ctx, part.attachment.textFileId, "text/plain");
          return { type: "text" as const, text: new TextDecoder().decode(storageData.arrayBuffer) };
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
  provider: string
): Promise<Array<{ role: "system" | "user" | "assistant"; content: any }>> => {
  const promises = messages.map((msg) => {
    if (typeof msg.content === "string") {
      return Promise.resolve({ role: msg.role as any, content: msg.content });
    }
    return Promise.all(msg.content.map((p: any) => convertMessagePart(ctx, p, provider))).then((parts) => ({
      role: msg.role as any,
      content: parts,
    }));
  });
  return await Promise.all(promises);
};
