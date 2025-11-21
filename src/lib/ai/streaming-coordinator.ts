/**
 * Centralized coordinator for HTTP streaming in server mode
 * Manages abort controllers and provides a unified API for starting/stopping streams
 */

import type { Id } from "@convex/_generated/dataModel";
import type { ReasoningConfig } from "@/types";
import { type StartAuthorStreamArgs, startAuthorStream } from "./http-stream";

/**
 * Singleton coordinator for managing HTTP streams
 * Ensures only one stream is active at a time and provides clean abort handling
 */
class StreamingCoordinatorClass {
  private abortController: AbortController | null = null;
  private currentStreamId: string | null = null;

  /**
   * Start streaming for an assistant message
   * Automatically stops any existing stream before starting a new one
   */
  async start(params: {
    convexUrl: string;
    authToken?: string | null;
    conversationId: Id<"conversations"> | string;
    assistantMessageId: Id<"messages"> | string;
    modelId?: string;
    provider?: string;
    personaId?: Id<"personas"> | null;
    reasoningConfig?: ReasoningConfig;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  }): Promise<boolean> {
    // Stop any existing stream first
    this.stop();

    const streamId = String(params.assistantMessageId);
    this.currentStreamId = streamId;

    try {
      const handle = await startAuthorStream({
        convexUrl: params.convexUrl,
        authToken: params.authToken,
        conversationId: params.conversationId,
        assistantMessageId: params.assistantMessageId,
        modelId: params.modelId,
        provider: params.provider,
        personaId: params.personaId,
        reasoningConfig: params.reasoningConfig,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        topP: params.topP,
        frequencyPenalty: params.frequencyPenalty,
        presencePenalty: params.presencePenalty,
      });

      if (handle) {
        this.abortController = handle.abortController;
        return true;
      }

      return false;
    } catch (error) {
      console.error("[StreamingCoordinator] Failed to start stream:", error);
      this.currentStreamId = null;
      return false;
    }
  }

  /**
   * Stop the current stream if one is active
   */
  stop(): void {
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch (_error) {
        // Ignore errors when aborting
      }
      this.abortController = null;
    }
    this.currentStreamId = null;
  }

  /**
   * Check if a stream is currently active
   */
  isStreaming(): boolean {
    return this.abortController !== null && this.currentStreamId !== null;
  }

  /**
   * Get the ID of the currently streaming message
   */
  getCurrentStreamId(): string | null {
    return this.currentStreamId;
  }
}

// Export singleton instance
export const StreamingCoordinator = new StreamingCoordinatorClass();
