import Anthropic from "@anthropic-ai/sdk";
import { internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { type StreamMessage } from "./types";
import { StreamHandler } from "./streaming";

export class AnthropicNativeHandler {
  private anthropic: Anthropic;
  private streamHandler: StreamHandler;

  constructor(
    private ctx: ActionCtx,
    apiKey: string,
    messageId: Id<"messages">
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.streamHandler = new StreamHandler(ctx, messageId);
  }

  setAbortController(abortController: AbortController) {
    this.streamHandler.setAbortController(abortController);
  }

  async streamResponse(args: {
    messages: StreamMessage[];
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    reasoningConfig?: {
      effort?: "low" | "medium" | "high";
      maxTokens?: number;
    };
  }) {
    // Convert messages to Anthropic format
    const anthropicMessages = this.convertMessages(args.messages);

    // Configure thinking if reasoning is enabled
    const budgetMap = {
      low: 5000,
      medium: 10000,
      high: 20000,
    };

    const budgetTokens =
      args.reasoningConfig?.maxTokens ??
      budgetMap[args.reasoningConfig?.effort ?? "medium"];

    // Ensure max_tokens is greater than budget_tokens
    // Use generous defaults for reasoning tasks
    const defaultMaxTokens = 16384; // Higher default for reasoning
    const minBuffer = 4096; // Larger buffer for response after thinking

    const maxTokens = Math.max(
      args.maxTokens || defaultMaxTokens,
      budgetTokens + minBuffer
    );

    try {
      const stream = await this.anthropic.messages.stream({
        model: args.model,
        max_tokens: maxTokens,
        // Anthropic requires temperature to be 1 when thinking is enabled
        temperature: 1,
        top_p: args.topP,
        messages: anthropicMessages,
        thinking: {
          type: "enabled",
          budget_tokens: budgetTokens,
        },
      });

      // Handle the stream
      await this.handleAnthropicStream(stream);
    } catch (error) {
      console.error("Anthropic native streaming error:", error);
      throw error;
    }
  }

  private convertMessages(
    messages: StreamMessage[]
  ): Anthropic.Messages.MessageParam[] {
    return messages
      .filter(msg => msg.role !== "system") // System messages handled separately if needed
      .map(msg => ({
        role: msg.role as "user" | "assistant",
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
      }));
  }

  private async handleAnthropicStream(
    stream: Awaited<ReturnType<typeof this.anthropic.messages.stream>>
  ) {
    let finalText = "";
    let finalReasoning = "";

    try {
      for await (const event of stream) {
        // Check if stopped
        if (await this.streamHandler.checkIfStopped()) {
          stream.abort();
          throw new Error("StoppedByUser");
        }

        switch (event.type) {
          case "content_block_delta":
            if (event.delta.type === "text_delta") {
              finalText += event.delta.text;
              await this.streamHandler.appendToBuffer(event.delta.text);
            } else if (event.delta.type === "thinking_delta") {
              finalReasoning += event.delta.thinking;
              await this.appendReasoning(event.delta.thinking);
            }
            break;

          case "message_delta":
            if (event.delta.stop_reason) {
              // Store finish data
              this.streamHandler.setFinishData({
                text: finalText,
                finishReason: event.delta.stop_reason,
                reasoning: finalReasoning || undefined,
                providerMetadata: undefined,
              });
            }
            break;
        }
      }

      // Finish processing
      await this.streamHandler.finishProcessing();
    } catch (error) {
      if (error instanceof Error && error.message === "StoppedByUser") {
        await this.streamHandler.handleStop();
        return;
      }
      throw error;
    }
  }

  private async appendReasoning(reasoningDelta: string) {
    try {
      await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: this.streamHandler.messageIdValue,
        appendReasoning: reasoningDelta,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("nonexistent document"))
      ) {
        console.warn(
          `Message ${this.streamHandler.messageIdValue} was deleted during reasoning append`
        );
        return;
      }
      throw error;
    }
  }
}
