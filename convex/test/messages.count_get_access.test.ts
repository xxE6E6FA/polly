import { describe, it, expect } from "vitest";
import { api, internal } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages count/get access", () => {
  it("getMessageCount returns number of messages in conversation", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conv = await t.db.insert("conversations", { title: "C", userId, createdAt: Date.now(), updatedAt: Date.now() });
    for (let i = 0; i < 3; i++) {
      await t.db.insert("messages", { conversationId: conv, role: "user", content: String(i), createdAt: Date.now(), isMainBranch: true });
    }
    const count = await t.runQuery(api.messages.getMessageCount, { conversationId: conv });
    expect(count).toBe(3);
  });

  it("getById enforces access; internalGetByIdQuery ignores access", async () => {
    const t = await makeConvexTest();
    const owner = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const other = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const conv = await t.db.insert("conversations", { title: "C", userId: owner, createdAt: Date.now(), updatedAt: Date.now() });
    const mid = await t.db.insert("messages", { conversationId: conv, role: "user", content: "x", createdAt: Date.now(), isMainBranch: true });

    const authedOther = t.withIdentity({ subject: other, issuer: "test" });
    const denied = await authedOther.runQuery(api.messages.getById, { id: mid });
    expect(denied).toBeNull();

    const internalMsg = await t.runQuery(internal.messages.getByIdInternal, { id: mid });
    expect(internalMsg?._id).toBe(mid);
  });
});
