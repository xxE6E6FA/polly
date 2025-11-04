import { describe, test, expect } from "bun:test";
import { isConversationStreaming, findStreamingMessage } from "./streaming_utils";
import { makeConvexTest } from "../test/helpers";

describe("convex/lib/streaming_utils", () => {
  test("returns false/null when no assistant messages exist", async () => {
    const t = await makeConvexTest();
    const convId = await t.run(async (ctx: any) => {
      return await ctx.db.insert("conversations", {
        title: "c",
        userId: await ctx.db.insert("users", { isAnonymous: true, createdAt: Date.now() }),
        isStreaming: false,
        isArchived: false,
        isPinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const streaming = await t.run((ctx: any) => isConversationStreaming(ctx, convId));
    const current = await t.run((ctx: any) => findStreamingMessage(ctx, convId));
    expect(streaming).toBe(false);
    expect(current).toBeNull();
  });

  test("detects streaming based on metadata and status, and ignores done/error", async () => {
    const t = await makeConvexTest();
    const { convId } = await t.run(async (ctx: any) => {
      const uid = await ctx.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
      const convId = await ctx.db.insert("conversations", {
        title: "c2",
        userId: uid,
        isStreaming: false,
        isArchived: false,
        isPinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // assistant message with finishReason => not streaming
      await ctx.db.insert("messages", {
        conversationId: convId,
        role: "assistant",
        content: "done",
        isMainBranch: true,
        metadata: { finishReason: "stop" },
        status: "done",
        createdAt: Date.now(),
      });

      return { convId };
    });

    expect(await t.run((ctx: any) => isConversationStreaming(ctx, convId))).toBe(false);
    expect(await t.run((ctx: any) => findStreamingMessage(ctx, convId))).toBeNull();

    // insert a streaming assistant message (no finishReason, no stopped, not error)
    const msgId = await t.run(async (ctx: any) => {
      return await ctx.db.insert("messages", {
        conversationId: convId,
        role: "assistant",
        content: "partial",
        isMainBranch: true,
        metadata: {},
        status: "streaming",
        createdAt: Date.now(),
      });
    });

    expect(await t.run((ctx: any) => isConversationStreaming(ctx, convId))).toBe(true);
    const current = await t.run((ctx: any) => findStreamingMessage(ctx, convId));
    expect(current).toEqual({ id: msgId, isStreaming: true });

    // mark as error => not streaming anymore
    await t.run(async (ctx: any) => {
      await ctx.db.patch(msgId, { status: "error" });
    });

    expect(await t.run((ctx: any) => isConversationStreaming(ctx, convId))).toBe(false);
    expect(await t.run((ctx: any) => findStreamingMessage(ctx, convId))).toBeNull();
  });
});
