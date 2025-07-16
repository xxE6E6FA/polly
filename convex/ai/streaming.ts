import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { extractMarkdownCitations } from "../lib/shared/citations";
import {
  extractReasoningContent,
  humanizeReasoningText,
  isReasoningPart,
} from "../lib/shared/stream_utils";
import {
  type FinishData,
  type ProviderMetadata,
  type StreamPart,
} from "../types";
import { extractCitations } from "./citations";
import { CONFIG } from "./config";
import { handleStreamOperation } from "./error_handlers";
import { clearConversationStreaming } from "./messages";
import { removeDuplicateSourceSections } from "../../shared/text-utils";
import { humanizeText } from "./utils";

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

  // Cache to reduce redundant queries
  private messageExistsCache: boolean | null = null;
  private conversationIdCache: Id<"conversations"> | null = null;
  private lastStopCheckTime = 0;
  private cachedStreamingState: boolean | null = null;
  private cacheValidUntil = 0;
  private static readonly CACHE_DURATION_MS = 1000; // Cache for 1 second

  constructor(private ctx: ActionCtx, private messageId: Id<"messages">) {}

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
    // Use cached result if available and valid
    if (this.messageExistsCache !== null && Date.now() < this.cacheValidUntil) {
      return this.messageExistsCache;
    }

    const result = await handleStreamOperation(
      async () => {
        const message = await this.ctx.runQuery(api.messages.getById, {
          id: this.messageId,
        });
        const exists = Boolean(message);

        // Cache the result and conversation ID
        this.messageExistsCache = exists;
        this.conversationIdCache = message?.conversationId || null;
        this.cacheValidUntil = Date.now() + StreamHandler.CACHE_DURATION_MS;

        return { exists };
      },
      () => {
        this.messageDeleted = true;
        this.messageExistsCache = false;
        this.safeAbort();
      }
    );

    if (!result) {
      return false;
    }

    if (!result.exists) {
      this.messageDeleted = true;
      this.messageExistsCache = false;
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
      const now = Date.now();

      // Rate limit stop checks to avoid excessive queries
      if (now - this.lastStopCheckTime < CONFIG.STREAM.STOP_CHECK_INTERVAL_MS) {
        return false;
      }

      this.lastStopCheckTime = now;

      const exists = await this.checkMessageExists();
      if (!exists) {
        return true;
      }

      // Use cached conversation ID if available
      let conversationId = this.conversationIdCache;

      // If no cached conversation ID, fetch it
      if (!conversationId) {
        const message = await this.ctx.runQuery(api.messages.getById, {
          id: this.messageId,
        });
        conversationId = message?.conversationId || null;
        this.conversationIdCache = conversationId;
      }

      // Check if conversation is no longer streaming (our stop signal)
      if (conversationId) {
        // Use cached streaming state if available and valid
        if (
          this.cachedStreamingState !== null &&
          Date.now() < this.cacheValidUntil
        ) {
          if (!this.cachedStreamingState) {
            this.wasStopped = true;
            this.safeAbort();
            return true;
          }
        } else {
          const conversation = await this.ctx.runQuery(api.conversations.get, {
            id: conversationId,
          });

          const isStreaming = conversation?.isStreaming ?? false;
          this.cachedStreamingState = isStreaming;
          this.cacheValidUntil = Date.now() + StreamHandler.CACHE_DURATION_MS;

          if (!isStreaming) {
            this.wasStopped = true;
            this.safeAbort();
            return true;
          }
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
    const shouldFlush =
      this.contentBuffer.length >= CONFIG.STREAM.BATCH_SIZE ||
      timeSinceLastUpdate >= CONFIG.STREAM.BATCH_TIMEOUT;

    if (shouldFlush) {
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

    // Clean the text to remove duplicate source sections
    const cleanedText = removeDuplicateSourceSections(text);

    // Use reasoning provided by AI SDK
    const extractedReasoning = reasoning;
    const humanizedReasoning = extractedReasoning
      ? humanizeReasoningText(extractedReasoning)
      : undefined;

    // Extract citations from provider metadata
    let citations = extractCitations(providerMetadata);

    // If using OpenRouter with web search and no citations found in metadata,
    // Try extracting from markdown links in the response text
    if (!citations || citations.length === 0) {
      const markdownCitations = extractMarkdownCitations(cleanedText);
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

    // No need to enrich citations anymore - Exa provides all metadata directly
    // Citations from other providers might need enrichment, but we're focusing on Exa

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
    } else if (part.type === "error") {
      const errorPart = part as { type: "error"; error: unknown };
      console.error("Stream error part received:", {
        messageId: this.messageId,
        error: errorPart.error,
      });
      // Handle error parts by throwing an error to stop the stream
      const errorObj = errorPart.error as { message?: string; toString?: () => string } | null;
      const errorMessage =
        errorObj?.message || errorObj?.toString?.() || "Unknown stream error";
      throw new Error(`Stream error: ${errorMessage}`);
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
    } else {
      console.warn("Unknown stream part type:", {
        messageId: this.messageId,
        partType: part.type,
      });
    }
  }

  public async finishProcessing(): Promise<void> {
    if (this.messageDeleted) {
      return;
    }

    if (!this.finishData) {
      console.warn("=== No finish data available ===", {
        messageId: this.messageId,
        wasStopped: this.wasStopped,
        isInitialized: this.isInitialized,
      });
      return;
    }

    // Clean the content to remove duplicate source sections
    const cleanedContent = removeDuplicateSourceSections(this.finishData.text);

    // Set the final content from onFinish (authoritative)
    await this.queueUpdate(async () => {
      if (this.messageDeleted) {
        return;
      }

      try {
        await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
          id: this.messageId,
          content: cleanedContent,
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
        cleanedContent,
        this.finishData.finishReason,
        this.finishData.reasoning,
        this.finishData.providerMetadata
      );
    }

    this.finishData = null;
  }
}
