import { describe, it, expect } from "vitest";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/messages access control", () => {
  it("removeMultiple throws when no access to messages", async () => {
    const t = await makeConvexTest();
    const owner = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const other = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });

    const conv = await t.db.insert("conversations", {
      title: "A",
      userId: owner,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const msg = await t.db.insert("messages", {
      conversationId: conv,
      role: "user",
      content: "x",
      isMainBranch: true,
      createdAt: Date.now(),
    });

    const otherAuthed = t.withIdentity({ subject: other, issuer: "test" });
    await expect(
      otherAuthed.runMutation(api.messages.removeMultiple, { ids: [msg] })
    ).rejects.toThrow();
  });
});

