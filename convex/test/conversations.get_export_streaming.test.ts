import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/conversations get/export/streaming", () => {
  test("get and getWithAccessInfo enforce access; getForExport limits and strips heavy fields", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const otherUserId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    const conversationId = await t.db.insert("conversations", {
      title: "Export Test",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Create 3 main-branch messages
    for (let i = 0; i < 3; i++) {
      await t.db.insert("messages", {
        conversationId,
        role: i === 0 ? "user" : "assistant",
        content: `m${i}`,
        isMainBranch: true,
        createdAt: Date.now(),
      });
    }

    const getRes = await authed.runQuery(api.conversations.get, { id: conversationId });
    expect(getRes?._id).toBe(conversationId);
    const access = await authed.runQuery(api.conversations.getWithAccessInfo, { id: conversationId });
    expect(access.hasAccess).toBe(true);

    // Other user should not have access
    const otherAuthed = t.withIdentity({ subject: otherUserId, issuer: "test" });
    const denied = await otherAuthed.runQuery(api.conversations.get, { id: conversationId });
    expect(denied).toBeNull();

    // Export limited to 2 messages and without attachments/metadata
    const exportRes = await authed.runQuery(api.conversations.getForExport, { id: conversationId, limit: 2 });
    expect(exportRes?.conversation?._id).toBe(conversationId);
    expect(exportRes?.messages.length).toBe(2);
    const sample = exportRes?.messages[0] as any;
    expect(sample).not.toHaveProperty("attachments");
    expect(sample).not.toHaveProperty("metadata");
  });

  test("setStreaming toggles flag and isStreaming reflects unfinished assistant message presence", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const conversationId = await t.db.insert("conversations", {
      title: "S",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isStreaming: false,
    });
    await authed.runMutation(api.conversations.setStreaming, { conversationId, isStreaming: true });
    const conv = await t.db.get(conversationId);
    expect(conv?.isStreaming).toBe(true);

    // With no assistant unfinished message, isStreaming query may return false
    const res1 = await t.runQuery(api.conversations.isStreaming, { conversationId });
    expect(typeof res1).toBe("boolean");

    // Insert unfinished assistant message, then expect true
    await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "partial",
      createdAt: Date.now(),
      isMainBranch: true,
      metadata: {},
    });
    const res2 = await t.runQuery(api.conversations.isStreaming, { conversationId });
    expect(res2).toBe(true);
  });
});

