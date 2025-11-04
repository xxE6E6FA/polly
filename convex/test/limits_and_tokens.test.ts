import { describe, test, expect } from "bun:test";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "./helpers";
import { MAX_USER_MESSAGE_CHARS } from "../constants";

describe("message limits and rolling token estimates", () => {
  test("rejects oversize user messages across entry points", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now(), conversationCount: 0, totalMessageCount: 0 });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    const tooBig = "x".repeat(MAX_USER_MESSAGE_CHARS + 1);

    // createConversation firstMessage cap
    await expect(
      authed.runMutation(api.conversations.createConversation, { firstMessage: tooBig })
    ).rejects.toBeTruthy();

    // Seed a small conversation to test sendMessage/createUserMessage caps
    const { conversationId } = await authed.runMutation(api.conversations.createConversation, { firstMessage: "ok" });

    // createUserMessage cap
    await expect(
      authed.action(api.conversations.createUserMessage, { conversationId, content: tooBig })
    ).rejects.toBeTruthy();

    // sendMessage cap
    await expect(
      authed.action(api.conversations.sendMessage, { conversationId, content: tooBig })
    ).rejects.toBeTruthy();
  });

  test("maintains a rolling token estimate for conversations", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now(), conversationCount: 0, totalMessageCount: 0 });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    const firstMessage = "aaaa"; // 4 chars -> ~1 token
    const { conversationId, assistantMessageId } = await authed.runMutation(
      api.conversations.createConversation,
      { firstMessage }
    );

    const afterCreate = await t.run((ctx: any) => ctx.db.get(conversationId));
    expect((afterCreate as any)?.tokenEstimate || 0).toBeGreaterThanOrEqual(1);

    // Add another user message via public API to exercise auto-increment path
    await authed.runMutation(api.messages.create, {
      conversationId,
      role: "user",
      content: "bbbbbbbb", // 8 chars -> ~2 tokens
      isMainBranch: true,
    });

    const afterUser = await t.run((ctx: any) => ctx.db.get(conversationId));
    expect((afterUser as any)?.tokenEstimate || 0).toBeGreaterThanOrEqual(((afterCreate as any)?.tokenEstimate || 0) + 2);

    // Finalize assistant content to bump estimate via internal updateContent
    await t.runMutation(internal.messages.updateContent, {
      messageId: assistantMessageId,
      content: "cccccccc", // 8 chars -> ~2 tokens
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });

    const afterAssistant = await t.run((ctx: any) => ctx.db.get(conversationId));
    expect((afterAssistant as any)?.tokenEstimate || 0).toBeGreaterThanOrEqual(((afterUser as any)?.tokenEstimate || 0) + 2);
  });
});

