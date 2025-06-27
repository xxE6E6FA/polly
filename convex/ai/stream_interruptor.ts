import { CONFIG } from "./config";
import { handleStreamOperation } from "./error_handlers";
import { ResourceManager } from "./resource_manager";
import { api } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";

/**
 * Bulletproof stream interruption system
 * Handles multiple abort mechanisms to ensure 100% reliability
 */
export class StreamInterruptor {
  private abortController?: AbortController;
  private isAborted = false;
  private abortPromise?: Promise<void>;
  private messageDeleted = false;
  private readonly resourceManager = new ResourceManager();

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
    });
  }

  /**
   * Start monitoring for stop signals from the client
   */
  startStopMonitoring(): void {
    const stopCheckInterval = setInterval(async () => {
      try {
        const shouldStop = await this.checkForStopSignal();
        if (shouldStop) {
          await this.abort("ClientStop");
        }
      } catch {
        // Stop monitoring error - expected during cleanup
      }
    }, CONFIG.STREAM.STOP_CHECK_INTERVAL_MS);

    this.resourceManager.registerInterval(stopCheckInterval);
  }

  /**
   * Check if we should stop streaming
   * Returns true if stop was requested or message was deleted
   */
  async checkForStopSignal(): Promise<boolean> {
    if (this.isAborted || this.messageDeleted) {
      return true;
    }

    const result = await handleStreamOperation(
      async () => {
        const message = await this.ctx.runQuery(api.messages.getById, {
          id: this.messageId,
        });

        if (!message) {
          return { shouldStop: true, messageDeleted: true };
        }

        // Check if the conversation is no longer in streaming state
        if (message.conversationId) {
          const conversation = await this.ctx.runQuery(api.conversations.get, {
            id: message.conversationId,
          });

          if (conversation && !conversation.isStreaming) {
            return { shouldStop: true, messageDeleted: false };
          }
        }

        return { shouldStop: false, messageDeleted: false };
      },
      () => {
        this.messageDeleted = true;
      }
    );

    if (!result) {
      this.messageDeleted = true;
      return true;
    }

    if (result.messageDeleted) {
      this.messageDeleted = true;
    }

    return result.shouldStop;
  }

  /**
   * Abort the stream with multiple mechanisms for 100% reliability
   */
  async abort(reason: string = "Unknown"): Promise<void> {
    if (this.isAborted) {
      return;
    }

    this.isAborted = true;

    // Create abort promise with timeout
    this.abortPromise = this.executeAbort(reason);

    // Set timeout to force abort completion
    const abortTimeout = setTimeout(() => {
      this.forceAbort();
    }, CONFIG.STREAM.ABORT_TIMEOUT_MS);

    this.resourceManager.registerTimeout(abortTimeout);

    try {
      await this.abortPromise;
    } finally {
      // Timeout will be cleaned up by resource manager
    }
  }

  /**
   * Execute the actual abort with signal-only mechanism
   */
  private async executeAbort(_reason: string): Promise<void> {
    // Only use AbortController signal - no database writes to avoid conflicts
    if (this.abortController && !this.abortController.signal.aborted) {
      try {
        this.abortController.abort();
      } catch {
        // AbortController.abort() failed
      }
    }

    // Small delay to let the signal propagate
    await new Promise<void>(resolve => setTimeout(resolve, 50));
  }

  /**
   * Force abort when timeout is reached
   */
  private forceAbort(): void {
    // Force abort controller
    if (this.abortController && !this.abortController.signal.aborted) {
      try {
        this.abortController.abort();
      } catch {
        // Force abort failed
      }
    }
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
    this.resourceManager.cleanup();
    this.isAborted = true;
  }

  /**
   * Wait for abort to complete (with timeout)
   */
  async waitForAbort(): Promise<void> {
    if (!this.abortPromise) {
      return;
    }

    try {
      await Promise.race([
        this.abortPromise,
        new Promise<void>(resolve =>
          setTimeout(resolve, CONFIG.STREAM.ABORT_TIMEOUT_MS)
        ),
      ]);
    } catch {
      // Error waiting for abort
    }
  }
}
