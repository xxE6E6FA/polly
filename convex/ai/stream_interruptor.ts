import { handleStreamOperation } from "./error_handlers";
import { ResourceManager } from "./resource_manager";
import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";

/**
 * Event-driven stream interruption system
 * Uses AbortController as the primary mechanism with minimal database polling
 */
export class StreamInterruptor {
  private abortController?: AbortController;
  private isAborted = false;
  private messageDeleted = false;
  private readonly resourceManager = new ResourceManager();
  private stopCheckPromise?: Promise<void>;
  private shouldStopChecking = false;

  // Cache to reduce redundant queries
  private lastStopCheckResult: boolean | null = null;
  private cacheValidUntil = 0;
  private static readonly CACHE_DURATION_MS = 1000; // Cache for 1 second

  constructor(
    private ctx: ActionCtx,
    private messageId: Id<"messages">
  ) {}

  /**
   * Set the abort controller for the stream
   */
  setAbortController(abortController: AbortController) {
    this.abortController = abortController;
    this.resourceManager.registerAbortController(abortController);

    // Listen for abort signals
    abortController.signal.addEventListener("abort", () => {
      this.isAborted = true;
      this.shouldStopChecking = true;
    });
  }

  /**
   * Start monitoring for stop signals using exponential backoff
   * This reduces database load while maintaining responsiveness
   */
  startStopMonitoring(): void {
    if (this.stopCheckPromise) {
      return; // Already monitoring
    }

    this.stopCheckPromise = this.monitorWithBackoff();
  }

  /**
   * Monitor for stop signals with exponential backoff
   * Starts with frequent checks, then backs off to reduce load
   */
  private async monitorWithBackoff(): Promise<void> {
    let interval = 500; // Start with 500ms (increased from 100ms)
    const maxInterval = 2000; // Max 2 seconds (increased from 1 second)
    const backoffMultiplier = 1.5;

    while (!this.shouldStopChecking && !this.isAborted) {
      try {
        const shouldStop = await this.checkForStopSignal();
        if (shouldStop) {
          await this.abort();
          break;
        }

        // If no stop signal, increase interval (exponential backoff)
        interval = Math.min(interval * backoffMultiplier, maxInterval);

        // Wait for the interval or until aborted
        await new Promise<void>(resolve => {
          const timeout = setTimeout(resolve, interval);
          this.resourceManager.registerTimeout(timeout);

          // If aborted while waiting, resolve immediately
          if (this.abortController?.signal.aborted) {
            clearTimeout(timeout);
            resolve();
          }
        });
      } catch {
        // Stop monitoring on error
        break;
      }
    }
  }

  /**
   * Check if we should stop streaming
   * Returns true if stop was requested or message was deleted
   */
  async checkForStopSignal(): Promise<boolean> {
    if (this.isAborted || this.messageDeleted) {
      return true;
    }

    // Use cached result if available and valid
    if (
      this.lastStopCheckResult !== null &&
      Date.now() < this.cacheValidUntil
    ) {
      return this.lastStopCheckResult;
    }

    const result = await handleStreamOperation(
      async () => {
        const message = await this.ctx.runQuery(api.messages.getById, {
          id: this.messageId,
        });

        if (!message) {
          return { shouldStop: true, messageDeleted: true };
        }

        // Note: conversation ID available if needed for future use

        // Check if the conversation is no longer in streaming state
        if (message.conversationId) {
          const conversation = await this.ctx.runQuery(api.conversations.get, {
            id: message.conversationId,
          });

          const shouldStop = conversation ? !conversation.isStreaming : true;

          // Cache the result
          this.lastStopCheckResult = shouldStop;
          this.cacheValidUntil =
            Date.now() + StreamInterruptor.CACHE_DURATION_MS;

          if (shouldStop) {
            return { shouldStop: true, messageDeleted: false };
          }
        }

        // Cache the result
        this.lastStopCheckResult = false;
        this.cacheValidUntil = Date.now() + StreamInterruptor.CACHE_DURATION_MS;

        return { shouldStop: false, messageDeleted: false };
      },
      () => {
        this.messageDeleted = true;
        this.lastStopCheckResult = true;
      }
    );

    if (!result) {
      this.messageDeleted = true;
      this.lastStopCheckResult = true;
      return true;
    }

    if (result.messageDeleted) {
      this.messageDeleted = true;
      this.lastStopCheckResult = true;
    }

    return result.shouldStop;
  }

  /**
   * Abort the stream immediately
   */
  async abort(): Promise<void> {
    if (this.isAborted) {
      return;
    }

    this.isAborted = true;
    this.shouldStopChecking = true;

    // Use AbortController as the primary mechanism
    if (this.abortController && !this.abortController.signal.aborted) {
      try {
        this.abortController.abort();
      } catch {
        // AbortController.abort() failed - continue with cleanup
      }
    }

    // Small delay to let the signal propagate
    await new Promise<void>(resolve => setTimeout(resolve, 50));
  }

  /**
   * Check if the stream is aborted
   */
  isStreamAborted(): boolean {
    return (
      this.isAborted ||
      this.messageDeleted ||
      (this.abortController?.signal.aborted ?? false)
    );
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.shouldStopChecking = true;
    this.resourceManager.cleanup();
    this.isAborted = true;
  }

  /**
   * Wait for monitoring to complete
   */
  async waitForMonitoringComplete(): Promise<void> {
    if (this.stopCheckPromise) {
      try {
        await this.stopCheckPromise;
      } catch {
        // Ignore errors during cleanup
      }
    }
  }
}
