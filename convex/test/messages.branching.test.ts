import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages branching", () => {
  it("setBranch marks siblings non-main and target as main; getAlternatives returns siblings", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const conversationId = await t.db.insert("conversations", {
      title: "t",
      userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // Create parent and two alternatives
    const parentId = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "p",
      createdAt: Date.now(),
      isMainBranch: true,
    });
    const a1 = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "a1",
      parentId,
      createdAt: Date.now(),
      isMainBranch: false,
    });
    const a2 = await t.db.insert("messages", {
      conversationId,
      role: "assistant",
      content: "a2",
      parentId,
      createdAt: Date.now(),
      isMainBranch: true,
    });

    await t.runMutation(api.messages.setBranch, { messageId: a1, parentId });
    const alt = await t.runQuery(api.messages.getAlternatives, { parentId });
    const refreshedA1 = await t.db.get(a1);
    const refreshedA2 = await t.db.get(a2);
    expect(refreshedA1?.isMainBranch).toBe(true);
    expect(refreshedA2?.isMainBranch).toBe(false);
    expect(alt.map((m: any) => m._id)).toContain(a2);
  });
});

