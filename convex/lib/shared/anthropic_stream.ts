/**
 * Shared Anthropic stream handling for reasoning models
 * This module provides common logic for handling Anthropic's native streaming API
 * which properly supports thinking/reasoning tokens
 */

export interface AnthropicStreamEvent {
  type: string;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    stop_reason?: string;
  };
}

export interface AnthropicStreamCallbacks {
  onTextDelta: (text: string) => void | Promise<void>;
  onThinkingDelta: (thinking: string) => void | Promise<void>;
  onFinish: (data: {
    text: string;
    reasoning: string;
    finishReason?: string;
  }) => void | Promise<void>;
  checkAbort?: () => boolean | Promise<boolean>;
}

/**
 * Process an Anthropic stream with proper thinking/reasoning support
 */
export async function processAnthropicStream(
  stream: AsyncIterable<AnthropicStreamEvent>,
  callbacks: AnthropicStreamCallbacks
): Promise<void> {
  let finalText = "";
  let finalReasoning = "";

  for await (const event of stream) {
    // Check if we should abort
    if (callbacks.checkAbort) {
      const shouldAbort = await callbacks.checkAbort();
      if (shouldAbort) {
        throw new Error("StoppedByUser");
      }
    }

    switch (event.type) {
      case "content_block_delta":
        if (event.delta?.type === "text_delta" && event.delta.text) {
          finalText += event.delta.text;
          await callbacks.onTextDelta(event.delta.text);
        } else if (
          event.delta?.type === "thinking_delta" &&
          event.delta.thinking
        ) {
          finalReasoning += event.delta.thinking;
          await callbacks.onThinkingDelta(event.delta.thinking);
        }
        break;

      case "message_delta":
        if (event.delta?.stop_reason) {
          await callbacks.onFinish({
            text: finalText,
            reasoning: finalReasoning,
            finishReason: event.delta.stop_reason,
          });
        }
        break;
    }
  }
}

/**
 * Convert messages to Anthropic format
 */
export function convertToAnthropicMessages(
  messages: Array<{
    role: string;
    content: string | unknown;
  }>
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter(msg => msg.role !== "system") // System messages handled separately
    .map(msg => ({
      role: msg.role as "user" | "assistant",
      content:
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content),
    }));
}

/**
 * Calculate max tokens for reasoning models
 */
export function calculateAnthropicMaxTokens(
  baseMaxTokens: number | undefined,
  budgetTokens: number
): number {
  const defaultMaxTokens = 16384; // Higher default for reasoning
  const minBuffer = 4096; // Buffer for response after thinking

  return Math.max(baseMaxTokens || defaultMaxTokens, budgetTokens + minBuffer);
}
