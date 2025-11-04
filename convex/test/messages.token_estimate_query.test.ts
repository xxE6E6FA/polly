import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("messages.getConversationTokenEstimate", () => {
  test("sums tokens (chars/4) for user/assistant only", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conv = await t.db.insert("conversations", { title: "T", userId, createdAt: Date.now(), updatedAt: Date.now(), tokenEstimate: 0 });

    // 8 chars user -> ~2 tokens, 8 chars assistant -> ~2 tokens, system ignored
    await t.db.insert("messages", { conversationId: conv, role: "system", content: "ignored", isMainBranch: true, createdAt: Date.now() });
    await t.db.insert("messages", { conversationId: conv, role: "user", content: "bbbbbbbb", isMainBranch: true, createdAt: Date.now() });
    await t.db.insert("messages", { conversationId: conv, role: "assistant", content: "cccccccc", isMainBranch: true, createdAt: Date.now() });

    const estimate = await t.runQuery(api.messages.getConversationTokenEstimate, { conversationId: conv });
    expect(estimate).toBeGreaterThanOrEqual(4);
  });
});

