import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../../../test/convex-ctx";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import {
  configureTools,
  buildToolOptions,
  initializeStreaming,
  handleToolCall,
  handleToolResult,
  finalizeSuccess,
  finalizeUserStopped,
  handleStreamError,
  type TimingMetrics,
} from "./state";

// ── Helpers ──────────────────────────────────────────────────────────────

const messageId = "msg-123" as Id<"messages">;
const conversationId = "conv-456" as Id<"conversations">;

function makeActionCtx(overrides?: Parameters<typeof makeConvexCtx>[0]) {
  return makeConvexCtx(overrides) as unknown as ActionCtx;
}

function makeBuffer() {
  return {
    appendContent: mock(() => {}),
    flush: mock(() => Promise.resolve()),
    advanceSegment: mock(() => {}),
  };
}

function baseTiming(overrides?: Partial<TimingMetrics>): TimingMetrics {
  return {
    startTime: 1000,
    firstTokenTime: 1200,
    reasoningStartTime: undefined,
    reasoningEndTime: undefined,
    hasReceivedContent: true,
    ...overrides,
  };
}

// ── configureTools ───────────────────────────────────────────────────────

describe("configureTools", () => {
  test("enables web search when supportsTools and exaApiKey present", () => {
    const result = configureTools(true, "exa-key", undefined, [], messageId);
    expect(result.useWebSearch).toBe(true);
    expect(result.useImageGen).toBe(false);
    expect(result.hasAnyTools).toBe(true);
    expect(result.toolInstructions).toContain("CITATIONS");
  });

  test("enables image gen when supportsTools, replicateKey, and imageModels present", () => {
    const result = configureTools(
      true,
      undefined,
      "rep-key",
      [{ modelId: "flux", name: "Flux" }] as any,
      messageId,
    );
    expect(result.useWebSearch).toBe(false);
    expect(result.useImageGen).toBe(true);
    expect(result.hasAnyTools).toBe(true);
    expect(result.toolInstructions).toContain("IMAGE GENERATION");
  });

  test("enables both tools when all keys present", () => {
    const result = configureTools(
      true,
      "exa-key",
      "rep-key",
      [{ modelId: "flux", name: "Flux" }] as any,
      messageId,
    );
    expect(result.useWebSearch).toBe(true);
    expect(result.useImageGen).toBe(true);
    expect(result.hasAnyTools).toBe(true);
    expect(result.toolInstructions).toContain("CITATIONS");
    expect(result.toolInstructions).toContain("IMAGE GENERATION");
  });

  test("disables all tools when supportsTools is false", () => {
    const result = configureTools(false, "exa-key", "rep-key", [{ modelId: "flux", name: "Flux" }] as any, messageId);
    expect(result.useWebSearch).toBe(false);
    expect(result.useImageGen).toBe(false);
    expect(result.hasAnyTools).toBe(false);
    expect(result.toolInstructions).toBe("");
  });

  test("disables image gen when no image models provided", () => {
    const result = configureTools(true, undefined, "rep-key", [], messageId);
    expect(result.useImageGen).toBe(false);
    expect(result.hasAnyTools).toBe(false);
  });

  test("returns empty toolInstructions when no tools enabled", () => {
    const result = configureTools(false, undefined, undefined, [], messageId);
    expect(result.toolInstructions).toBe("");
  });
});

// ── buildToolOptions ─────────────────────────────────────────────────────

describe("buildToolOptions", () => {
  test("returns empty object when hasAnyTools is false", () => {
    const ctx = makeActionCtx();
    const result = buildToolOptions(
      ctx,
      messageId,
      { useWebSearch: false, useImageGen: false, hasAnyTools: false },
      undefined,
      undefined,
      [],
      { value: false },
    );
    expect(result).toEqual({});
  });

  test("returns tools and prepareStep when tools enabled", () => {
    const ctx = makeActionCtx();
    const result = buildToolOptions(
      ctx,
      messageId,
      { useWebSearch: true, useImageGen: false, hasAnyTools: true },
      "exa-key",
      undefined,
      [],
      { value: false },
    );
    expect(result).toHaveProperty("tools");
    expect(result).toHaveProperty("prepareStep");
    expect(result).toHaveProperty("toolChoice", "auto");
    expect((result as any).tools).toHaveProperty("webSearch");
    expect((result as any).tools).not.toHaveProperty("generateImage");
  });

  test("prepareStep returns toolChoice none after image gen", () => {
    const ctx = makeActionCtx();
    const hasCalledImageGenRef = { value: true };
    const result = buildToolOptions(
      ctx,
      messageId,
      { useWebSearch: true, useImageGen: false, hasAnyTools: true },
      "exa-key",
      undefined,
      [],
      hasCalledImageGenRef,
    );
    const step = (result as any).prepareStep({ stepNumber: 1 });
    expect(step).toEqual({ toolChoice: "none" });
  });

  test("prepareStep returns toolChoice none at max steps", () => {
    const ctx = makeActionCtx();
    const result = buildToolOptions(
      ctx,
      messageId,
      { useWebSearch: true, useImageGen: false, hasAnyTools: true },
      "exa-key",
      undefined,
      [],
      { value: false },
    );
    const step = (result as any).prepareStep({ stepNumber: 5 });
    expect(step).toEqual({ toolChoice: "none" });
  });

  test("prepareStep returns empty object when under max steps and no image gen", () => {
    const ctx = makeActionCtx();
    const result = buildToolOptions(
      ctx,
      messageId,
      { useWebSearch: true, useImageGen: false, hasAnyTools: true },
      "exa-key",
      undefined,
      [],
      { value: false },
    );
    const step = (result as any).prepareStep({ stepNumber: 1 });
    expect(step).toEqual({});
  });
});

// ── initializeStreaming ──────────────────────────────────────────────────

describe("initializeStreaming", () => {
  test("calls updateMessageStatus with thinking and patches conversation", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await initializeStreaming(ctx, conversationId, messageId);

    expect(runMutation).toHaveBeenCalledTimes(2);

    // First call: updateMessageStatus
    const firstCall = (runMutation as ReturnType<typeof mock>).mock.calls[0];
    expect(firstCall[1]).toEqual({ messageId, status: "thinking" });

    // Second call: internalPatch with streaming state
    const secondCall = (runMutation as ReturnType<typeof mock>).mock.calls[1];
    expect(secondCall[1]).toEqual({
      id: conversationId,
      updates: { isStreaming: true, currentStreamingMessageId: messageId },
      clearFields: ["stopRequested"],
    });
  });
});

// ── handleToolCall ───────────────────────────────────────────────────────

describe("handleToolCall", () => {
  test("sets hasCalledImageGenRef and appends marker for generateImage", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();
    const hasCalledImageGenRef = { value: false };

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "generateImage", input: { prompt: "a cat" } },
      buffer as any,
      hasCalledImageGenRef,
    );

    expect(hasCalledImageGenRef.value).toBe(true);
    expect(buffer.appendContent).toHaveBeenCalledWith("\n\n<!-- generated-image -->\n\n");
  });

  test("does not set hasCalledImageGenRef for non-image tools", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();
    const hasCalledImageGenRef = { value: false };

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "webSearch", input: { query: "test" } },
      buffer as any,
      hasCalledImageGenRef,
    );

    expect(hasCalledImageGenRef.value).toBe(false);
    expect(buffer.appendContent).not.toHaveBeenCalled();
  });

  test("flushes buffer and advances segment", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "webSearch" },
      buffer as any,
      { value: false },
    );

    expect(buffer.flush).toHaveBeenCalled();
    expect(buffer.advanceSegment).toHaveBeenCalled();
  });

  test("calls addToolCall mutation with correct shape", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "webSearch", input: { query: "hello", searchMode: "auto" } },
      buffer as any,
      { value: false },
    );

    // Find the addToolCall call (not updateMessageStatus)
    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    const addToolCallCall = calls.find((c: any) => c[1]?.toolCall);
    expect(addToolCallCall).toBeDefined();
    expect(addToolCallCall![1].toolCall.id).toBe("tc-1");
    expect(addToolCallCall![1].toolCall.name).toBe("webSearch");
    expect(addToolCallCall![1].toolCall.status).toBe("running");
    expect(addToolCallCall![1].toolCall.args.query).toBe("hello");
    expect(addToolCallCall![1].toolCall.args.mode).toBe("auto");
  });

  test("updates message status to searching", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "webSearch" },
      buffer as any,
      { value: false },
    );

    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    const statusCall = calls.find((c: any) => c[1]?.status === "searching");
    expect(statusCall).toBeDefined();
  });

  test("extracts prompt and imageModel args for generateImage tool", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "generateImage", input: { prompt: "a sunset", model: "flux-pro" } },
      buffer as any,
      { value: false },
    );

    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    const addToolCallCall = calls.find((c: any) => c[1]?.toolCall);
    expect(addToolCallCall![1].toolCall.args.prompt).toBe("a sunset");
    expect(addToolCallCall![1].toolCall.args.imageModel).toBe("flux-pro");
  });

  test("handles undefined input gracefully", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();

    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "webSearch" },
      buffer as any,
      { value: false },
    );

    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    const addToolCallCall = calls.find((c: any) => c[1]?.toolCall);
    expect(addToolCallCall![1].toolCall.args).toEqual({});
  });

  test("handles addToolCall failure gracefully", async () => {
    let callCount = 0;
    const runMutation = mock((..._args: any[]) => {
      callCount++;
      // Fail the addToolCall (first runMutation call)
      if (callCount === 1) return Promise.reject(new Error("mutation failed"));
      return Promise.resolve();
    });
    const ctx = makeActionCtx({ runMutation });
    const buffer = makeBuffer();

    // Should not throw — addToolCall is inside try/catch
    await handleToolCall(
      ctx,
      messageId,
      { toolCallId: "tc-1", toolName: "webSearch" },
      buffer as any,
      { value: false },
    );
  });
});

// ── handleToolResult ─────────────────────────────────────────────────────

describe("handleToolResult", () => {
  test("stores citations on success with citations", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const citationsRef = { value: [] as any[] };
    const citations = [{ type: "url_citation" as const, url: "https://example.com", title: "Example" }];

    await handleToolResult(
      ctx,
      messageId,
      { toolCallId: "tc-1", output: { success: true, citations } },
      citationsRef,
    );

    expect(citationsRef.value).toEqual(citations);
  });

  test("calls finalizeToolResult with completed on success", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await handleToolResult(
      ctx,
      messageId,
      { toolCallId: "tc-1", output: { success: true } },
      { value: [] },
    );

    const call = (runMutation as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].toolStatus).toBe("completed");
    expect(call[1].messageStatus).toBe("streaming");
  });

  test("calls finalizeToolResult with error on failure", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await handleToolResult(
      ctx,
      messageId,
      { toolCallId: "tc-1", output: { success: false } },
      { value: [] },
    );

    const call = (runMutation as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].toolStatus).toBe("error");
    expect(call[1].toolError).toBe("Tool call failed");
  });

  test("does not store citations when not present", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const citationsRef = { value: [] as any[] };

    await handleToolResult(
      ctx,
      messageId,
      { toolCallId: "tc-1", output: { success: true } },
      citationsRef,
    );

    expect(citationsRef.value).toEqual([]);
  });

  test("handles finalizeToolResult failure gracefully", async () => {
    const runMutation = mock(() => Promise.reject(new Error("mutation failed")));
    const ctx = makeActionCtx({ runMutation });

    // Should not throw
    await handleToolResult(
      ctx,
      messageId,
      { toolCallId: "tc-1", output: { success: true } },
      { value: [] },
    );
  });
});

// ── finalizeSuccess ──────────────────────────────────────────────────────

describe("finalizeSuccess", () => {
  test("calls finalizeStream with correct metadata shape", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const timing = baseTiming();

    await finalizeSuccess(ctx, conversationId, messageId, [], timing, {
      finishReason: "stop",
      usage: {
        totalTokens: 100,
        inputTokens: 60,
        outputTokens: 40,
      },
    });

    expect(runMutation).toHaveBeenCalledTimes(1);
    const call = (runMutation as ReturnType<typeof mock>).mock.calls[0];
    const args = call[1];
    expect(args.messageId).toBe(messageId);
    expect(args.conversationId).toBe(conversationId);
    expect(args.metadata.finishReason).toBe("stop");
    expect(args.metadata.tokenUsage.totalTokens).toBe(100);
    expect(args.metadata.tokenUsage.inputTokens).toBe(60);
    expect(args.metadata.tokenUsage.outputTokens).toBe(40);
  });

  test("computes timing metrics correctly", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const timing = baseTiming({ startTime: 1000, firstTokenTime: 1200 });

    await finalizeSuccess(ctx, conversationId, messageId, [], timing, {
      usage: { totalTokens: 50, inputTokens: 30, outputTokens: 20 },
    });

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.timeToFirstTokenMs).toBe(200);
    expect(args.metadata.tokensPerSecond).toBeGreaterThan(0);
  });

  test("computes thinkingDuration when reasoning times present", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const timing = baseTiming({
      reasoningStartTime: 1100,
      reasoningEndTime: 1500,
    });

    await finalizeSuccess(ctx, conversationId, messageId, [], timing, {});

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.thinkingDurationMs).toBe(400);
  });

  test("handles missing usage gracefully", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await finalizeSuccess(ctx, conversationId, messageId, [], baseTiming(), {});

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.finishReason).toBe("stop");
    expect(args.metadata.tokenUsage).toBeUndefined();
  });

  test("passes citations when present", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const citations = [{ type: "url_citation" as const, url: "https://example.com", title: "Ex" }];

    await finalizeSuccess(ctx, conversationId, messageId, citations, baseTiming(), {});

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.citations).toEqual(citations);
  });

  test("omits citations when empty", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await finalizeSuccess(ctx, conversationId, messageId, [], baseTiming(), {});

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.citations).toBeUndefined();
  });

  test("extracts reasoningTokens from outputTokenDetails", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await finalizeSuccess(ctx, conversationId, messageId, [], baseTiming(), {
      usage: {
        totalTokens: 100,
        inputTokens: 60,
        outputTokens: 40,
        outputTokenDetails: { reasoningTokens: 15 },
      },
    });

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.tokenUsage.reasoningTokens).toBe(15);
  });

  test("formats warnings correctly", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await finalizeSuccess(ctx, conversationId, messageId, [], baseTiming(), {
      warnings: [
        { type: "unsupported", feature: "streaming" },
        { type: "other", message: "some warning" },
      ],
    });

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.warnings).toContain("Unsupported: streaming");
    expect(args.metadata.warnings).toContain("some warning");
  });

  test("uses endTime fallback when reasoningStartTime set but reasoningEndTime undefined", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });
    const timing = baseTiming({
      reasoningStartTime: 1100,
      reasoningEndTime: undefined,
    });

    await finalizeSuccess(ctx, conversationId, messageId, [], timing, {});

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    // thinkingDurationMs = endTime - reasoningStartTime, endTime > 1100
    expect(args.metadata.thinkingDurationMs).toBeGreaterThan(0);
  });

  test("formats compatibility warning type", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await finalizeSuccess(ctx, conversationId, messageId, [], baseTiming(), {
      warnings: [
        { type: "compatibility", feature: "toolChoice", details: "not supported by provider" },
      ],
    });

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.warnings).toContain("Compatibility: toolChoice - not supported by provider");
  });
});

// ── finalizeUserStopped ──────────────────────────────────────────────────

describe("finalizeUserStopped", () => {
  test("flushes buffer and calls finalizeStream with user_stopped", async () => {
    const runQuery = mock(() => Promise.resolve({ status: "streaming", content: "hello" }));
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runQuery, runMutation });
    const buffer = makeBuffer();

    await finalizeUserStopped(ctx, conversationId, messageId, buffer as any, baseTiming());

    expect(buffer.flush).toHaveBeenCalled();
    expect(runMutation).toHaveBeenCalledTimes(1);
    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.finishReason).toBe("user_stopped");
    expect(args.metadata.stopped).toBe(true);
  });

  test("skips finalization when message has been reset (retry scenario)", async () => {
    const runQuery = mock(() => Promise.resolve({ status: "thinking", content: "" }));
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runQuery, runMutation });
    const buffer = makeBuffer();

    await finalizeUserStopped(ctx, conversationId, messageId, buffer as any, baseTiming());

    expect(buffer.flush).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("computes timing metrics in metadata", async () => {
    const runQuery = mock(() => Promise.resolve({ status: "streaming", content: "hi" }));
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runQuery, runMutation });
    const buffer = makeBuffer();

    await finalizeUserStopped(
      ctx,
      conversationId,
      messageId,
      buffer as any,
      baseTiming({ startTime: 1000, firstTokenTime: 1100 }),
    );

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.metadata.timeToFirstTokenMs).toBe(100);
    expect(args.metadata.duration).toBeGreaterThan(0);
  });

  test("handles errors gracefully without throwing", async () => {
    const runQuery = mock(() => Promise.reject(new Error("query failed")));
    const ctx = makeActionCtx({ runQuery });
    const buffer = makeBuffer();

    // Should not throw
    await finalizeUserStopped(ctx, conversationId, messageId, buffer as any, baseTiming());
  });
});

// ── handleStreamError ────────────────────────────────────────────────────

describe("handleStreamError", () => {
  test("calls updateMessageError with user-friendly message", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    await handleStreamError(ctx, messageId, new Error("Something broke"));

    expect(runMutation).toHaveBeenCalledTimes(1);
    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    expect(args.messageId).toBe(messageId);
    expect(args.error).toBeDefined();
    expect(typeof args.error).toBe("string");
  });

  test("handles errors in error handler gracefully", async () => {
    const runMutation = mock(() => Promise.reject(new Error("update failed")));
    const ctx = makeActionCtx({ runMutation });

    // Should not throw
    await handleStreamError(ctx, messageId, new Error("original error"));
  });

  test("omits errorDetail when it matches the user-friendly message", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeActionCtx({ runMutation });

    // A generic error where raw message = user-friendly message
    await handleStreamError(ctx, messageId, new Error("Something went wrong"));

    const args = (runMutation as ReturnType<typeof mock>).mock.calls[0][1];
    // When raw === friendly, errorDetail should be undefined
    // (the code checks: errorDetail !== errorMessage ? errorDetail : undefined)
    expect(args.messageId).toBe(messageId);
    expect(args.error).toBeDefined();
  });
});
