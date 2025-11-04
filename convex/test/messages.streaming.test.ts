import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages.hasStreamingMessage", () => {
  test("returns assistant without finishReason as streaming", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conversationId = await t.db.insert("conversations", {
      title: "t",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "partial",
      createdAt: Date.now(),
      isMainBranch: true,
      metadata: {},
    });
    const res = await t.runQuery(api.messages.hasStreamingMessage, { conversationId });
    expect(res).toBeTruthy();
  });

  test("returns null when assistant has finishReason", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conversationId = await t.db.insert("conversations", {
      title: "t",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "done",
      createdAt: Date.now(),
      isMainBranch: true,
      metadata: { finishReason: "stop" },
    });
    const res = await t.runQuery(api.messages.hasStreamingMessage, { conversationId });
    expect(res).toBeNull();
  });
});

