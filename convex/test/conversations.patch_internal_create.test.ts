import { describe, it, expect } from "vitest";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/conversations patch/internal/createWithUserId", () => {
  it("patch sets fields and optionally bumps updatedAt; internalPatch no-ops on missing id", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const convId = await t.db.insert("conversations", {
      title: "Old",
      userId,
      createdAt: Date.now(),
      updatedAt: 1,
      isStreaming: false,
    });

    // Authed patch
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    await authed.runMutation(api.conversations.patch, { id: convId, updates: { title: "New" }, setUpdatedAt: true });
    const conv = await t.db.get(convId);
    expect(conv?.title).toBe("New");
    expect((conv?.updatedAt || 0)).toBeGreaterThan(1);

    // internalPatch missing id should not throw
    await t.runMutation(internal.conversations.internalPatch, { id: ("nonexistent" as any), updates: { title: "X" } });
  });

  it("createWithUserId creates conversation and user message and increments conversationCount", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now(), conversationCount: 0 });
    const { conversationId, userMessageId, assistantMessageId } = await t.runMutation(internal.conversations.createWithUserId, {
      userId,
      firstMessage: "hello",
    });
    expect(conversationId).toBeDefined();
    const conv = await t.db.get(conversationId);
    expect(conv?.userId).toBe(userId);
    const u = await t.db.get(userId);
    expect((u?.conversationCount || 0)).toBe(1);
    const userMsg = await t.db.get(userMessageId);
    expect(userMsg?.role).toBe("user");
    const assistant = await t.db.get(assistantMessageId);
    expect(assistant?.role).toBe("assistant");
  });
});
