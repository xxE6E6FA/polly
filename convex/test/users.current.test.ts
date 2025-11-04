import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/users.current", () => {
  test("returns null when not authenticated and user when authed", async () => {
    const t = await makeConvexTest();
    const res1 = await t.runQuery(api.users.current, {});
    expect(res1).toBeNull();

    const userId = await t.db.insert("users", { isAnonymous: true, createdAt: Date.now() });
    const authed = t.withIdentity({ subject: userId, issuer: "test" });
    const res2 = await authed.runQuery(api.users.current, {});
    expect(res2?._id).toBe(userId);
  });
});

