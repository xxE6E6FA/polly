import { describe, test, expect } from "bun:test";
import { api } from "../_generated/api";
import { makeConvexTest } from "./helpers";

describe("convex/users", () => {
  test("incrementMessage increases counters", async () => {
    const t = await makeConvexTest();
    const userId = await t.run(async (ctx: any) => {
      return await ctx.db.insert("users", {
        isAnonymous: false,
        createdAt: Date.now(),
        messagesSent: 0,
        monthlyMessagesSent: 0,
        totalMessageCount: 0,
      });
    });
    await t.mutation(api.users.incrementMessage, {
      userId,
      model: "gpt",
      provider: "openai",
      tokensUsed: 10,
      countTowardsMonthly: true,
    });
    const u = await t.run(async (ctx: any) => {
      return await ctx.db.get(userId);
    });
    expect(u?.messagesSent).toBe(1);
    expect(u?.monthlyMessagesSent).toBe(1);
    expect(u?.totalMessageCount).toBe(1);
  });

  test("incrementMessage skips monthly count when flagged", async () => {
    const t = await makeConvexTest();
    const userId = await t.run(async (ctx: any) => {
      return await ctx.db.insert("users", {
        isAnonymous: false,
        createdAt: Date.now(),
        messagesSent: 0,
        monthlyMessagesSent: 0,
        totalMessageCount: 0,
      });
    });
    await t.mutation(api.users.incrementMessage, {
      userId,
      model: "gpt",
      provider: "openai",
      tokensUsed: 5,
      countTowardsMonthly: false,
    });
    const updated = await t.run(async (ctx: any) => {
      return await ctx.db.get(userId);
    });
    expect(updated?.messagesSent).toBe(1);
    expect(updated?.monthlyMessagesSent).toBe(0);
    expect(updated?.totalMessageCount).toBe(1);
  });

  test("graduateAnonymousUser transfers conversation ownership and aggregates counts", async () => {
    const t = await makeConvexTest();
    const { anonId, newUserId, convId } = await t.run(async (ctx: any) => {
      const anonId = await ctx.db.insert("users", {
        isAnonymous: true,
        createdAt: Date.now(),
        conversationCount: 1,
        totalMessageCount: 2,
        monthlyMessagesSent: 2,
      });
      const newUserId = await ctx.db.insert("users", {
        isAnonymous: false,
        createdAt: Date.now(),
        conversationCount: 1,
        totalMessageCount: 3,
        monthlyMessagesSent: 3,
      });
      const convId = await ctx.db.insert("conversations", {
        title: "anon",
        userId: anonId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { anonId, newUserId, convId };
    });

    const res = await t.mutation(api.users.graduateAnonymousUser, {
      anonymousUserId: anonId,
      newUserId,
    });
    expect(res.success).toBe(true);
    const { conv, newUser } = await t.run(async (ctx: any) => {
      const conv = await ctx.db.get(convId);
      const newUser = await ctx.db.get(newUserId);
      return { conv, newUser };
    });
    expect(conv?.userId).toBe(newUserId);
    expect(newUser?.monthlyMessagesSent).toBeGreaterThanOrEqual(3);
    expect(newUser?.totalMessageCount).toBeGreaterThanOrEqual(3);
  });
});
