import { extractCitations } from "./citations";
import { extractMarkdownCitations } from "../lib/shared/citations";
import { CONFIG } from "./config";
import { handleStreamOperation } from "./error_handlers";
import { clearConversationStreaming } from "./messages";
import {
  type FinishData,
  type ProviderMetadata,
  type StreamPart,
} from "./types";
import { extractReasoning, humanizeText } from "./utils";
import {
  isReasoningPart,
  extractReasoningContent,
  humanizeReasoningText,
} from "../lib/shared/stream_utils";
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

  private safeAbort(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      try {
        this.abortController.abort();
      } catch {
        // Failed to abort controller
      }
    }
  }

  private async checkMessageExists(): Promise<boolean> {
    const result = await handleStreamOperation(
      async () => {
        const message = await this.ctx.runQuery(api.messages.getById, {
          id: this.messageId,
        });
        return { exists: Boolean(message) };
      },
      () => {
        this.messageDeleted = true;
        this.safeAbort();
      }
    );

    if (!result) {
      return false;
    }

    if (!result.exists) {
      this.messageDeleted = true;
      this.safeAbort();
      return false;
    }

    return true;
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

      // Check if conversation is no longer streaming (our stop signal)
      if (message?.conversationId) {
        const conversation = await this.ctx.runQuery(api.conversations.get, {
          id: message.conversationId,
        });

        if (conversation && !conversation.isStreaming) {
          this.wasStopped = true;
          this.safeAbort();
          return true;
        }
      }
    }
    return false;
  }

  private queueUpdate<T>(operation: () => Promise<T>): Promise<T> {
    // Chain operations to ensure they run sequentially with retry logic
    const result = this.updateQueue.then(async () => {
      const operationResult = await handleStreamOperation(operation, () => {
        this.messageDeleted = true;
        this.safeAbort();
      });

      // If operation failed due to message deletion, throw to propagate
      if (operationResult === null) {
        throw new Error("MessageDeleted");
      }

      return operationResult;
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
          this.messageDeleted = true;
          this.safeAbort();
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
          this.messageDeleted = true;
          this.safeAbort();
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
      ? humanizeReasoningText(extractedReasoning)
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
          this.messageDeleted = true;
          return;
        }
        throw error;
      }
    });

    await this.waitForQueuedUpdates();

    // Enrich citations with metadata if we have any (skip if message deleted)
    if (!this.messageDeleted && citations && citations.length > 0) {
      await this.ctx.scheduler.runAfter(
        0,
        internal.citationEnrichment.enrichMessageCitations,
        {
          messageId: this.messageId,
          citations,
        }
      );
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
    } catch {
      // Stream processing error
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
    } else if (isReasoningPart(part)) {
      // Check if we should stop before processing reasoning
      if (await this.checkIfStopped()) {
        if (this.messageDeleted) {
          throw new Error("MessageDeleted");
        }
        throw new Error("StoppedByUser");
      }

      const reasoningContent = extractReasoningContent(part);
      if (reasoningContent) {
        await this.queueUpdate(async () => {
          if (this.messageDeleted || this.wasStopped) {
            return;
          }

          try {
            await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
              id: this.messageId,
              appendReasoning: reasoningContent,
            });
          } catch (error) {
            // If message doesn't exist, mark as deleted and continue
            if (
              error instanceof Error &&
              (error.message.includes("not found") ||
                error.message.includes("nonexistent document"))
            ) {
              this.messageDeleted = true;
              this.safeAbort();
              return;
            }
            throw error;
          }
        });
      }
    }
  }

  public async finishProcessing(): Promise<void> {
    if (this.messageDeleted) {
      return;
    }

    if (!this.finishData) {
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
          this.messageDeleted = true;
          return;
        }
        throw error;
      }
    });

    await this.waitForQueuedUpdates();

    // Now handle metadata and other finish tasks (skip if deleted or stopped)
    if (!this.messageDeleted && !this.wasStopped) {
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
