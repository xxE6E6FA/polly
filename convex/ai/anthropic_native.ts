import Anthropic from "@anthropic-ai/sdk";
import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { handleStreamOperation } from "./error_handlers";
import { ResourceManager } from "./resource_manager";
import { type StreamMessage } from "./types";
import { StreamHandler } from "./streaming";
import { StreamInterruptor } from "./stream_interruptor";

export class AnthropicNativeHandler {
  private anthropic: Anthropic;
  private streamHandler: StreamHandler;
  private interruptor: StreamInterruptor;
  private readonly resourceManager = new ResourceManager();

  constructor(
    private ctx: ActionCtx,
    apiKey: string,
    messageId: Id<"messages">
  ) {
    this.anthropic = new Anthropic({ apiKey });
    this.streamHandler = new StreamHandler(ctx, messageId);
    this.interruptor = new StreamInterruptor(ctx, messageId);
  }

  setAbortController(abortController: AbortController) {
    this.streamHandler.setAbortController(abortController);
    this.interruptor.setAbortController(abortController);
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
    // Ensure conversation is marked as streaming at the start
    const message = await this.ctx.runQuery(api.messages.getById, {
      id: this.streamHandler.messageIdValue,
    });

    if (message?.conversationId) {
      await this.ctx.runMutation(api.conversations.setStreamingState, {
        id: message.conversationId,
        isStreaming: true,
      });
    }
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

      // Start monitoring for stop signals now that we're streaming
      this.interruptor.startStopMonitoring();

      // Handle the stream
      await this.handleAnthropicStream(stream);
    } catch (error) {
      // Don't log AbortError as an error - it's expected when stopping
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.includes("AbortError"))
      ) {
        return;
      }

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
        // Robust stop checking - check multiple sources
        // Check if we should stop streaming (dual check for responsiveness)
        if (
          this.interruptor.isStreamAborted() ||
          (await this.streamHandler.checkIfStopped())
        ) {
          stream.abort();
          await this.interruptor.abort("StreamLoop");
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
      if (
        error instanceof Error &&
        (error.message === "StoppedByUser" ||
          error.name === "AbortError" ||
          error.message.includes("AbortError"))
      ) {
        await this.streamHandler.handleStop();
        return;
      }
      throw error;
    } finally {
      // Always cleanup resources
      this.interruptor.cleanup();
      this.resourceManager.cleanup();
    }
  }

  private async appendReasoning(reasoningDelta: string) {
    await handleStreamOperation(async () => {
      await this.ctx.runMutation(internal.messages.internalAtomicUpdate, {
        id: this.streamHandler.messageIdValue,
        appendReasoning: reasoningDelta,
      });
    });
  }
}
