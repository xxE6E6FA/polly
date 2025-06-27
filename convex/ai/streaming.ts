import { extractCitations, extractMarkdownCitations } from "./citations";
import { CONFIG } from "./config";
import { clearConversationStreaming } from "./messages";
import {
  type FinishData,
  type ProviderMetadata,
  type StreamPart,
} from "./types";
import { extractReasoning, humanizeText } from "./utils";
import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";

export class StreamHandler {
  private contentBuffer = "";
  private lastUpdate = Date.now();
  private chunkCounter = 0;
  private wasStopped = false;
  private abortController?: AbortController;
  private updateQueue: Promise<void> = Promise.resolve();
  private isInitialized = false;
  private finishData: FinishData | null = null;
  private messageDeleted = false;

  constructor(
    private ctx: ActionCtx,
    private messageId: Id<"messages">
  ) {}

  get messageIdValue() {
    return this.messageId;
  }

  setAbortController(abortController: AbortController) {
    this.abortController = abortController;
  }

  private async checkMessageExists(): Promise<boolean> {
    try {
      const message = await this.ctx.runQuery(api.messages.getById, {
        id: this.messageId,
      });
      if (!message) {
        this.messageDeleted = true;
        this.abortController?.abort();
        return false;
      }
      return true;
    } catch {
      // If we can't query the message, assume it's deleted
      this.messageDeleted = true;
      this.abortController?.abort();
      return false;
    }
  }

  public async checkIfStopped(): Promise<boolean> {
    // First check if message was deleted
    if (this.messageDeleted) {
      return true;
    }

    this.chunkCounter++;
    if (this.chunkCounter % CONFIG.STREAM.CHECK_STOP_EVERY_N_CHUNKS === 0) {
      const exists = await this.checkMessageExists();
      if (!exists) {
        return true;
      }

      const message = await this.ctx.runQuery(api.messages.getById, {
        id: this.messageId,
      });
      if (message?.metadata?.stopped) {
        this.wasStopped = true;
        this.abortController?.abort();
        return true;
      }
    }
    return false;
  }

  private queueUpdate<T>(operation: () => Promise<T>): Promise<T> {
    // Chain operations to ensure they run sequentially
    const result = this.updateQueue.then(operation).catch(error => {
      console.error("Update operation failed:", error);
      throw error;
    });

    // Update the queue to wait for this operation
    this.updateQueue = result.then(() => {}).catch(() => {});

    return result;
  }

  async waitForQueuedUpdates(): Promise<void> {
    await this.updateQueue;
  }

  async flushContentBuffer(): Promise<void> {
    if (this.messageDeleted || this.contentBuffer.length === 0) {
      return;
    }

    const humanizedContent = humanizeText(this.contentBuffer);
    const contentToAppend = humanizedContent;
    this.contentBuffer = "";
    this.lastUpdate = Date.now();

    await this.queueUpdate(async () => {
      // Check again inside the queued operation
      if (this.messageDeleted) {
        return;
      }

      try {
        await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
          id: this.messageId,
          appendContent: contentToAppend,
        });
      } catch (error) {
        // If message doesn't exist, mark as deleted and stop
        if (
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("nonexistent document"))
        ) {
          console.warn(
            `Message ${this.messageId} was deleted during streaming`
          );
          this.messageDeleted = true;
          this.abortController?.abort();
          return;
        }
        throw error;
      }
    });
  }

  public async appendToBuffer(text: string): Promise<void> {
    // If message is deleted or we already have finish data, don't append more chunks
    if (this.messageDeleted || this.hasFinishData()) {
      return;
    }

    this.contentBuffer += text;

    const timeSinceLastUpdate = Date.now() - this.lastUpdate;
    if (
      this.contentBuffer.length >= CONFIG.STREAM.BATCH_SIZE ||
      timeSinceLastUpdate >= CONFIG.STREAM.BATCH_TIMEOUT
    ) {
      await this.flushContentBuffer();
    }
  }

  async initializeStreaming(): Promise<void> {
    if (this.isInitialized || this.messageDeleted) {
      return;
    }

    // Check if message exists before initializing
    const exists = await this.checkMessageExists();
    if (!exists) {
      return;
    }

    this.isInitialized = true;
    await this.queueUpdate(async () => {
      if (this.messageDeleted) {
        return;
      }

      try {
        await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
          id: this.messageId,
          content: "",
        });
      } catch (error) {
        // If message doesn't exist, mark as deleted and stop
        if (
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("nonexistent document"))
        ) {
          console.warn(
            `Message ${this.messageId} was deleted before streaming started`
          );
          this.messageDeleted = true;
          this.abortController?.abort();
          return;
        }
        throw error;
      }
    });
  }

  public setFinishData(data: FinishData) {
    this.finishData = data;
  }

  hasFinishData(): boolean {
    return this.finishData !== null;
  }

  async handleFinish(
    text: string,
    finishReason: string | null | undefined,
    reasoning: string | null | undefined,
    providerMetadata: ProviderMetadata | undefined
  ): Promise<void> {
    if (this.wasStopped || this.messageDeleted) {
      return;
    }

    // Extract reasoning if embedded in content
    const extractedReasoning = reasoning || extractReasoning(text);
    const humanizedReasoning = extractedReasoning
      ? humanizeText(extractedReasoning)
      : undefined;

    // Extract citations from provider metadata
    let citations = extractCitations(providerMetadata);

    // If using OpenRouter with web search and no citations found in metadata,
    // Try extracting from markdown links in the response text
    if (!citations || citations.length === 0) {
      const markdownCitations = extractMarkdownCitations(text);
      if (markdownCitations.length > 0) {
        citations = markdownCitations;
      }
    }

    // Update metadata only (content is already set in finishProcessing)
    await this.queueUpdate(async () => {
      if (this.messageDeleted) {
        return;
      }

      try {
        const currentMessage = await this.ctx.runQuery(api.messages.getById, {
          id: this.messageId,
        });

        // If message doesn't exist, mark as deleted
        if (!currentMessage) {
          console.warn(`Message ${this.messageId} was deleted before finish`);
          this.messageDeleted = true;
          return;
        }

        const metadata = {
          ...(currentMessage.metadata || {}),
          finishReason: finishReason || "stop",
        };

        await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
          id: this.messageId,
          reasoning: humanizedReasoning,
          metadata,
          citations,
        });
      } catch (error) {
        // If the update fails because the message was deleted, mark and continue
        if (
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("nonexistent document"))
        ) {
          console.warn(`Message ${this.messageId} was deleted during finish`);
          this.messageDeleted = true;
          return;
        }
        throw error;
      }
    });

    await this.waitForQueuedUpdates();

    // Enrich citations with metadata if we have any (skip if message deleted)
    if (!this.messageDeleted && citations && citations.length > 0) {
      await this.ctx.scheduler
        .runAfter(0, internal.citationEnrichment.enrichMessageCitations, {
          messageId: this.messageId,
          citations,
        })
        .catch(error => {
          // Don't fail if citation enrichment fails
          console.warn("Failed to enrich citations:", error);
        });
    }

    await clearConversationStreaming(this.ctx, this.messageId);
  }

  public async handleStop(): Promise<void> {
    if (this.messageDeleted) {
      return;
    }

    await this.flushContentBuffer();
    await this.waitForQueuedUpdates();

    await this.queueUpdate(async () => {
      if (this.messageDeleted) {
        return;
      }

      try {
        await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
          id: this.messageId,
          metadata: {
            finishReason: "stop",
            stopped: true,
          },
        });
      } catch (error) {
        // If message doesn't exist, mark as deleted and continue
        if (
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("nonexistent document"))
        ) {
          console.warn(`Message ${this.messageId} was deleted during stop`);
          this.messageDeleted = true;
          return;
        }
        throw error;
      }
    });

    await this.waitForQueuedUpdates();
    await clearConversationStreaming(this.ctx, this.messageId);
  }

  async processStream(
    stream: AsyncIterable<string | StreamPart>,
    isFullStream = false
  ): Promise<void> {
    // Initialize streaming before processing any content
    await this.initializeStreaming();

    // If message was deleted during initialization, exit early
    if (this.messageDeleted) {
      throw new Error("MessageDeleted");
    }

    try {
      for await (const part of stream) {
        // For full stream (reasoning), stop checks happen inside handleFullStreamPart
        // For text stream, we need to check here before appending
        if (
          !isFullStream && // Check if we should stop processing
          (await this.checkIfStopped())
        ) {
          if (this.messageDeleted) {
            throw new Error("MessageDeleted");
          }
          throw new Error("StoppedByUser");
        }

        if (this.hasFinishData()) {
          break;
        }

        await (isFullStream
          ? this.handleFullStreamPart(part as StreamPart)
          : this.appendToBuffer(part as string));
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message !== "StoppedByUser" &&
        error.message !== "MessageDeleted"
      ) {
        console.error(`Stream processing error for ${this.messageId}:`, error);
      }
      throw error;
    } finally {
      // Only flush if we don't have finish data and message wasn't deleted
      if (!this.hasFinishData() && !this.messageDeleted) {
        await this.flushContentBuffer();
      }
      await this.waitForQueuedUpdates();
    }
  }

  private async handleFullStreamPart(part: StreamPart): Promise<void> {
    if (this.messageDeleted) {
      return;
    }

    // Increment chunk counter for all part types to ensure stop checks happen
    this.chunkCounter++;

    if (part.type === "text-delta") {
      await this.appendToBuffer(part.textDelta || "");
    } else if (part.type === "reasoning" || part.type === "thinking_delta") {
      // Check if we should stop before processing reasoning
      if (await this.checkIfStopped()) {
        if (this.messageDeleted) {
          throw new Error("MessageDeleted");
        }
        throw new Error("StoppedByUser");
      }

      await this.queueUpdate(async () => {
        if (this.messageDeleted || this.wasStopped) {
          return;
        }

        try {
          await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
            id: this.messageId,
            appendReasoning: part.textDelta || "",
          });
        } catch (error) {
          // If message doesn't exist, mark as deleted and continue
          if (
            error instanceof Error &&
            (error.message.includes("not found") ||
              error.message.includes("nonexistent document"))
          ) {
            console.warn(
              `Message ${this.messageId} was deleted during reasoning append`
            );
            this.messageDeleted = true;
            this.abortController?.abort();
            return;
          }
          throw error;
        }
      });
    }
  }

  public async finishProcessing(): Promise<void> {
    if (this.messageDeleted) {
      return;
    }

    if (!this.finishData) {
      console.error(`No finish data available for message ${this.messageId}`);
      return;
    }

    // Set the final content from onFinish (authoritative)
    await this.queueUpdate(async () => {
      if (this.messageDeleted) {
        return;
      }

      try {
        await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
          id: this.messageId,
          content: this.finishData!.text,
        });
      } catch (error) {
        // If message doesn't exist, mark as deleted and continue
        if (
          error instanceof Error &&
          (error.message.includes("not found") ||
            error.message.includes("nonexistent document"))
        ) {
          console.warn(
            `Message ${this.messageId} was deleted during final processing`
          );
          this.messageDeleted = true;
          return;
        }
        throw error;
      }
    });

    await this.waitForQueuedUpdates();

    // Now handle metadata and other finish tasks (skip if deleted)
    if (!this.messageDeleted) {
      await this.handleFinish(
        this.finishData.text,
        this.finishData.finishReason,
        this.finishData.reasoning,
        this.finishData.providerMetadata
      );
    }

    this.finishData = null;
  }
}
