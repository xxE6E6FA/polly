import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/conversations.list", () => {
  test("respects includeArchived and archivedOnly filters and pagination", async () => {
    const t = await makeConvexTest();
    const userId = await t.db.insert("users", { isAnonymous: false, createdAt: Date.now() });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });

    const ids: string[] = [] as any;
    for (let i = 0; i < 5; i++) {
      const { conversationId } = await authed.runMutation(api.conversations.createConversation, { firstMessage: `m${i}` });
      ids.push(conversationId);
    }
    // Archive two
    await t.db.patch(ids[1], { isArchived: true });
    await t.db.patch(ids[3], { isArchived: true });

    // includeArchived=false -> only non-archived
    const res1 = await authed.runQuery(api.conversations.list, { includeArchived: false, paginationOpts: { numItems: 100 } });
    const arr1 = Array.isArray(res1) ? res1 : res1.page;
    expect(arr1.every((c: any) => !c.isArchived)).toBe(true);

    // archivedOnly -> only archived
    const res2 = await authed.runQuery(api.conversations.list, { archivedOnly: true, paginationOpts: { numItems: 100 } });
    const arr2 = Array.isArray(res2) ? res2 : res2.page;
    expect(arr2.length).toBeGreaterThan(0);
    expect(arr2.every((c: any) => c.isArchived)).toBe(true);

    // pagination limit
    const res3 = await authed.runQuery(api.conversations.list, { paginationOpts: { numItems: 2 } });
    const arr3 = Array.isArray(res3) ? res3 : res3.page;
    expect(arr3.length).toBeLessThanOrEqual(2);
  });
});

