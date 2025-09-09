import { describe, it, expect } from "vitest";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages (internal)", () => {
  it("internalUpdate appends content and reasoning when provided", async () => {
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
      reasoning: "r",
      createdAt: Date.now(),
      isMainBranch: true,
    });
    await t.runMutation(internal.messages.internalUpdate, {
      id: mid,
      appendContent: "b",
      appendReasoning: "2",
    });
    const msg = await t.runQuery(internal.messages.internalGetByIdQuery, { id: mid });
    expect(msg.content).toBe("ab");
    expect(msg.reasoning).toBe("r2");
  });

  it("updateContent sets content, reasoning, and finish metadata", async () => {
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
      content: "",
      reasoning: "",
      createdAt: Date.now(),
      isMainBranch: true,
      metadata: {},
    });

    await t.runMutation(internal.messages.updateContent, {
      messageId: mid,
      content: "final",
      reasoning: "think",
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });

    const m = await t.runQuery(internal.messages.internalGetByIdQuery, { id: mid });
    expect(m.content).toBe("final");
    expect(m.reasoning).toBe("think");
    expect(m.metadata?.finishReason).toBe("stop");
    expect(m.metadata?.usage?.totalTokens).toBe(3);
    expect(typeof m.completedAt).toBe("number");
  });
});
