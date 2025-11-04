import { describe, test, expect } from "bun:test";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages.internalAtomicUpdate", () => {
  test("patches fields directly when no append provided", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conversationId = await t.db.insert("conversations", {
      title: "t",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const mid = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "a",
      createdAt: Date.now(),
      isMainBranch: true,
    });
    await t.runMutation(internal.messages.internalAtomicUpdate, {
      id: mid,
      content: "b",
      metadata: { finishReason: "stop" },
    });
    const m = await t.db.get(mid);
    expect(m?.content).toBe("b");
    expect(m?.metadata?.finishReason).toBe("stop");
  });
});
