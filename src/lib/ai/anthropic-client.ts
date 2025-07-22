import Anthropic from "@anthropic-ai/sdk";
import { supportsReasoning } from "@shared/model-capabilities-config";
import { ANTHROPIC_BUDGET_MAP } from "@shared/reasoning-config";
import type { AnthropicStreamOptions } from "@/types";
import {
  type AnthropicStreamEvent,
  calculateAnthropicMaxTokens,
  convertToAnthropicMessages,
  processAnthropicStream,
} from "../../../convex/lib/shared/anthropic_stream";

/**
 * Client-side Anthropic native streaming for reasoning models
 * This bypasses the AI SDK to properly handle thinking_delta events
 */
export class AnthropicClient {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true, // Required for browser usage
    });
  }

  async streamChat(options: AnthropicStreamOptions): Promise<void> {
    const {
      messages,
      model,
      temperature: _temperature,
      maxTokens,
      topP,
      reasoningConfig,
      abortSignal,
      callbacks,
    } = options;

    // Convert messages to Anthropic format
    const anthropicMessages = convertToAnthropicMessages(messages);

    // Calculate budget tokens
    const budgetTokens =
      reasoningConfig?.maxTokens ??
      ANTHROPIC_BUDGET_MAP[reasoningConfig?.effort ?? "medium"];

    // Calculate max tokens
    const finalMaxTokens = calculateAnthropicMaxTokens(maxTokens, budgetTokens);

    try {
      const stream = this.anthropic.messages.stream({
        model,
        max_tokens: finalMaxTokens,
        temperature: 1, // Required for thinking
        top_p: topP,
        messages: anthropicMessages,
        thinking: {
          type: "enabled",
          budget_tokens: budgetTokens,
        },
      });

      // Track abort state
      let isAborted = false;
      let finishReason: string | undefined;

      // Listen for abort signal
      if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
          isAborted = true;
          stream.abort();
        });
      }

      // Process the stream using shared logic
      await processAnthropicStream(
        stream as AsyncIterable<AnthropicStreamEvent>,
        {
          onTextDelta: text => {
            callbacks.onContent(text);
          },
          onThinkingDelta: thinking => {
            if (callbacks.onReasoning) {
              callbacks.onReasoning(thinking);
            }
          },
          onFinish: ({ finishReason: reason }) => {
            // Store finish reason but don't call callback yet
            finishReason = reason;
          },
          checkAbort: () => isAborted,
        }
      );

      // Now that stream is complete, call finish callback
      if (!isAborted) {
        callbacks.onFinish(finishReason || "stop");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "StoppedByUser") {
        callbacks.onFinish("stop");
        return;
      }

      if (error instanceof Error && error.name === "AbortError") {
        callbacks.onFinish("stop");
        return;
      }

      throw error;
    }
  }

  /**
   * Check if a model supports native reasoning
   */
  static supportsNativeReasoning(model: string): boolean {
    // Use shared reasoning detection for consistency
    return supportsReasoning("anthropic", model);
  }
}
