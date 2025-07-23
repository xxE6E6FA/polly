import Anthropic from "@anthropic-ai/sdk";
import { api, internal } from "../_generated/api";
import { type Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import {
  type AnthropicStreamEvent,
  calculateAnthropicMaxTokens,
  convertToAnthropicMessages,
  processAnthropicStream,
} from "../lib/shared/anthropic_stream";
import { type StreamMessage } from "../types";
import { handleStreamOperation } from "./error_handlers";
import { ResourceManager } from "./resource_manager";
import { StreamInterruptor } from "./stream_interruptor";
import { StreamHandler } from "../stream";

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
      await this.ctx.runMutation(api.conversations.patch, {
        id: message.conversationId,
        updates: { isStreaming: true },
        setUpdatedAt: true,
      });
    }

    // Convert messages to Anthropic format using shared logic
    const anthropicMessages = convertToAnthropicMessages(args.messages);

    // Configure thinking if reasoning is enabled
    const budgetMap = {
      low: 5000,
      medium: 10000,
      high: 20000,
    };

    const budgetTokens =
      args.reasoningConfig?.maxTokens ??
      budgetMap[args.reasoningConfig?.effort ?? "medium"];

    // Calculate max tokens using shared logic
    const maxTokens = calculateAnthropicMaxTokens(args.maxTokens, budgetTokens);

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

      // Handle the stream using shared logic
      await processAnthropicStream(
        stream as AsyncIterable<AnthropicStreamEvent>,
        {
          onTextDelta: async text => {
            await this.streamHandler.appendToBuffer(text);
          },
          onThinkingDelta: async thinking => {
            await this.appendReasoning(thinking);
          },
          onFinish: async ({ text, reasoning, finishReason }) => {
            this.streamHandler.setFinishData({
              text,
              finishReason: finishReason || "stop",
              reasoning: reasoning || undefined,
              providerMetadata: undefined,
            });
            await this.streamHandler.finishProcessing();
          },
          checkAbort: async () => {
            return (
              this.interruptor.isStreamAborted() ||
              (await this.streamHandler.checkIfStopped())
            );
          },
        }
      );
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
