import { removeDuplicateSourceSections } from "@shared/text-utils";
import type { CoreMessage } from "ai";
import type { Attachment, StreamCallbacks } from "@/types";
import {
  extractReasoningContent,
  humanizeReasoningText,
  isReasoningPart,
  type StreamPart,
} from "../../../convex/lib/shared/stream_utils";
import { extractCitations, extractMarkdownCitations } from "./citations";

export type { StreamCallbacks };

/**
 * Client-side Stream Handler for Private Chat
 *
 * PRIVACY GUARANTEES:
 * - This handler does NOT store any message content
 * - All data is passed through callbacks immediately
 * - Buffers are used only for batching chunks, then cleared
 * - No persistence or caching mechanisms are used
 * - When the handler is destroyed, all buffered data is lost
 *
 * The handler only maintains temporary buffers for smooth streaming
 * and passes all content to the provided callbacks.
 */
export class ClientStreamHandler {
  private contentBuffer = "";
  private lastUpdate = Date.now();
  private chunkCounter = 0;
  private abortController?: AbortController;
  private finishData: {
    text: string;
    finishReason: string;
    reasoning?: string | null;
    providerMetadata?: Record<string, unknown>;
  } | null = null;
  private finishProcessed = false;

  constructor(private callbacks: StreamCallbacks) {}

  setAbortController(controller: AbortController) {
    this.abortController = controller;
  }

  getAbortController(): AbortController | undefined {
    return this.abortController;
  }

  stop() {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  private flushContentBuffer() {
    if (this.contentBuffer.length > 0) {
      this.callbacks.onContent(this.contentBuffer);
      this.contentBuffer = "";
    }
    this.lastUpdate = Date.now();
  }

  private shouldFlushContent(): boolean {
    const timeSinceLastUpdate = Date.now() - this.lastUpdate;
    return this.contentBuffer.length >= 25 || timeSinceLastUpdate >= 75;
  }

  async processTextStream(stream: AsyncIterable<string>) {
    try {
      for await (const chunk of stream) {
        this.contentBuffer += chunk;
        this.chunkCounter++;

        if (this.shouldFlushContent()) {
          this.flushContentBuffer();
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.callbacks.onFinish("stop");
        return;
      }
      throw error;
    } finally {
      this.flushContentBuffer();

      if (this.finishData) {
        this.processFinishData();
      }
    }
  }

  async processFullStream(
    stream: AsyncIterable<{ type: string; textDelta?: string }>
  ) {
    try {
      for await (const part of stream) {
        if (part.type === "text-delta") {
          this.contentBuffer += part.textDelta || "";
          if (this.shouldFlushContent()) {
            this.flushContentBuffer();
          }
        } else if (
          isReasoningPart(part as StreamPart) &&
          this.callbacks.onReasoning
        ) {
          const reasoningContent = extractReasoningContent(part as StreamPart);
          if (reasoningContent) {
            this.callbacks.onReasoning(reasoningContent);
          }
        }

        this.chunkCounter++;
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.callbacks.onFinish("stop");
        return;
      }
      throw error;
    } finally {
      this.flushContentBuffer();

      if (this.finishData) {
        this.processFinishData();
      }
    }
  }

  handleFinish(
    text: string,
    finishReason: string | null | undefined,
    reasoning?: string | null | undefined,
    providerMetadata?: Record<string, unknown>
  ) {
    this.finishData = {
      text,
      finishReason: finishReason || "stop",
      reasoning,
      providerMetadata,
    };
  }

  private processFinishData() {
    if (!this.finishData || this.finishProcessed) {
      return;
    }

    this.finishProcessed = true;
    const { text, finishReason, reasoning, providerMetadata } = this.finishData;

    // Clean the text to remove duplicate source sections
    const cleanedText = removeDuplicateSourceSections(text);

    if (reasoning && this.callbacks.onReasoning) {
      const humanizedReasoning = humanizeReasoningText(reasoning);
      this.callbacks.onReasoning(humanizedReasoning);
    }

    let citations = extractCitations(providerMetadata);
    if (!citations || citations.length === 0) {
      citations = extractMarkdownCitations(cleanedText);
    }

    if (citations.length > 0 && this.callbacks.onCitations) {
      this.callbacks.onCitations(citations);
    }

    this.callbacks.onFinish(finishReason);
  }
}

// Convert attachments to AI SDK format
export function convertAttachmentsToContent(
  attachments?: Attachment[]
): Array<{ type: "text" | "image"; text?: string; image?: string }> {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  return attachments.map(attachment => {
    if (attachment.type === "image") {
      if (attachment.url) {
        return { type: "image" as const, image: attachment.url };
      }
      if (attachment.content && attachment.mimeType) {
        const dataUrl = `data:${attachment.mimeType};base64,${attachment.content}`;
        return { type: "image" as const, image: dataUrl };
      }
    }

    // For text files, include the actual content
    if (attachment.type === "text" && attachment.content) {
      return {
        type: "text" as const,
        text: `File: ${attachment.name}\n\n${attachment.content}`,
      };
    }

    // For other files (PDFs, etc.), just show a placeholder
    return {
      type: "text" as const,
      text: `[Attached file: ${attachment.name} (${attachment.type})]`,
    };
  });
}

// Convert chat messages to Core messages for AI SDK
export function convertToCoreMessages(
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: Attachment[];
  }>
): CoreMessage[] {
  return messages.map(msg => {
    if (!msg.attachments || msg.attachments.length === 0) {
      return {
        role: msg.role,
        content: msg.content,
      } as CoreMessage;
    }

    const attachmentContent = convertAttachmentsToContent(msg.attachments);
    return {
      role: msg.role,
      content: [
        { type: "text" as const, text: msg.content },
        ...attachmentContent,
      ],
    } as CoreMessage;
  });
}
