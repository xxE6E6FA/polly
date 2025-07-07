import { type CoreMessage } from "ai";
import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import {
  type Citation,
  type MessagePart,
  type StorageData,
  type StreamMessage,
} from "../types";
import { CONFIG } from "./config";

// Unified storage converter
export const convertStorageToData = async (
  ctx: ActionCtx,
  storageId: Id<"_storage">,
  fileType?: string
): Promise<StorageData> => {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    throw new Error("File not found in storage");
  }

  const arrayBuffer = await blob.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binaryString = "";
  for (let i = 0; i < uint8Array.length; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binaryString);

  const mimeType =
    blob.type ||
    CONFIG.MIME_TYPES[fileType as keyof typeof CONFIG.MIME_TYPES] ||
    CONFIG.MIME_TYPES.default;

  return { blob, arrayBuffer, base64, mimeType };
};

// Unified attachment converter
export const convertAttachment = async (
  ctx: ActionCtx,
  attachment: { storageId: Id<"_storage">; type: string; name?: string },
  format: "dataUrl" | "aiSdk"
): Promise<string | { data: ArrayBuffer; mimeType: string }> => {
  const storageData = await convertStorageToData(
    ctx,
    attachment.storageId,
    attachment.type
  );

  if (format === "dataUrl") {
    return `data:${storageData.mimeType};base64,${storageData.base64}`;
  }

  return { data: storageData.arrayBuffer, mimeType: storageData.mimeType };
};

// Convert message part to AI SDK format
export const convertMessagePart = async (
  ctx: ActionCtx,
  part: MessagePart,
  provider: string
) => {
  const converters = {
    text: () => ({ type: "text" as const, text: part.text || "" }),

    image_url: async () => {
      if (part.attachment?.storageId) {
        try {
          const dataUrl = (await convertAttachment(
            ctx,
            part.attachment,
            "dataUrl"
          )) as string;
          return { type: "image" as const, image: dataUrl };
        } catch {
          // Failed to convert Convex attachment, falling back to URL
        }
      }
      return { type: "image" as const, image: part.image_url?.url || "" };
    },

    file: async () => {
      // Check if this is a Convex storage attachment for PDF and provider supports it
      if (
        part.attachment?.storageId &&
        part.attachment.type === "pdf" &&
        (provider === "anthropic" || provider === "google")
      ) {
        try {
          const { data, mimeType } = (await convertAttachment(
            ctx,
            part.attachment,
            "aiSdk"
          )) as { data: ArrayBuffer; mimeType: string };
          return { type: "file" as const, data, mimeType };
        } catch {
          // Failed to convert Convex PDF, falling back to text
        }
      }
      // Fallback to text format
      return {
        type: "text" as const,
        text: `File: ${part.file?.filename || "Unknown"}\n${part.file?.file_data || ""}`,
      };
    },
  };

  const converter = converters[part.type as keyof typeof converters];
  return converter ? await converter() : { type: "text" as const, text: "" };
};

// Convert our message format to AI SDK format
export const convertMessages = async (
  ctx: ActionCtx,
  messages: StreamMessage[],
  provider: string
): Promise<CoreMessage[]> => {
  const promises = messages.map((msg): Promise<CoreMessage> => {
    if (typeof msg.content === "string") {
      return Promise.resolve({
        role: msg.role,
        content: msg.content,
      } as CoreMessage);
    }

    // Handle multi-modal content
    return Promise.all(
      msg.content.map(part => convertMessagePart(ctx, part, provider))
    ).then(
      parts =>
        ({
          role: msg.role,
          content: parts,
        }) as CoreMessage
    );
  });

  return Promise.all(promises);
};

// Update message helper
export const updateMessage = async (
  ctx: ActionCtx,
  messageId: Id<"messages">,
  updates: {
    content?: string;
    reasoning?: string;
    finishReason?: string;
    citations?: Citation[];
  }
) => {
  try {
    // Get current message to preserve existing metadata
    const currentMessage = await ctx.runQuery(api.messages.getById, {
      id: messageId,
    });

    // If message doesn't exist, silently return
    if (!currentMessage) {
      return;
    }

    // Merge metadata to preserve existing fields like stopped
    const metadata = updates.finishReason
      ? {
          ...(currentMessage.metadata || {}),
          finishReason: updates.finishReason,
        }
      : currentMessage.metadata;

    await ctx.runMutation(internal.messages.internalAtomicUpdate, {
      id: messageId,
      content: updates.content,
      reasoning: updates.reasoning || undefined,
      metadata,
      citations: updates.citations?.length ? updates.citations : undefined,
    });
  } catch (error) {
    // If the update fails because the message was deleted, log and continue
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("nonexistent document"))
    ) {
      return;
    }
    // Re-throw other errors
    throw error;
  }
};

// Clear conversation streaming state
export const clearConversationStreaming = async (
  ctx: ActionCtx,
  messageId: Id<"messages">
) => {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // Use query instead of mutation to get message data
      const message = await ctx.runQuery(api.messages.getById, {
        id: messageId,
      });

      if (message?.conversationId) {
        await ctx.runMutation(api.conversations.setStreamingState, {
          id: message.conversationId,
          isStreaming: false,
        });
      }

      // Success - exit retry loop
      return;
    } catch (error) {
      attempts++;

      // If it's a write conflict and we have retries left, wait and try again
      if (
        attempts < maxAttempts &&
        error instanceof Error &&
        error.message.includes("Documents read from or written to")
      ) {
        // Exponential backoff: 50ms, 100ms, 200ms
        const delay = 50 * Math.pow(2, attempts - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Final attempt failed or different error type
      // Don't log write conflicts as warnings since they're expected
      if (
        !(
          error instanceof Error &&
          error.message.includes("Documents read from or written to")
        )
      ) {
        // Failed to clear streaming state
      }
      return; // Give up gracefully
    }
  }
};
