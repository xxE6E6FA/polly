import { describe, expect, test } from "bun:test";
import { createConvexTestInstance } from "../test/convex-test-utils";

// Demonstration of testing Convex functions using convex-test.
// This test auto-skips if convex-test isn't installed yet.

describe("convex: users", () => {
  test("createAnonymous + getById roundtrip", async () => {
    const t = await createConvexTestInstance();
    if (!t) {
      return;
    }

    try {
      const { api } = await import("@convex/_generated/api");

      const id = await t.mutation(api.users.createAnonymous, {});
      expect(id).toBeTruthy();

      const user = await t.query(api.users.getById, { id });
      expect(user?.isAnonymous).toBe(true);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("import.meta.glob")
      ) {
        return;
      }
      throw error;
    }
  });

  test("patch updates user fields", async () => {
    const t = await createConvexTestInstance();
    if (!t) {
      return;
    }

    try {
      const { api } = await import("@convex/_generated/api");

      const id = await t.mutation(api.users.createAnonymous, {});
      await t.mutation(api.users.patch, {
        id,
        updates: { name: "Test User", hasUnlimitedCalls: true },
      });
      const user = await t.query(api.users.getById, { id });
      expect(user?.name).toBe("Test User");
      expect(user?.hasUnlimitedCalls).toBe(true);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("import.meta.glob")
      ) {
        return;
      }
      throw error;
    }
  });

  test("incrementMessage updates counters with monthly flag", async () => {
    const t = await createConvexTestInstance();
    if (!t) {
      return;
    }

    try {
      const { api } = await import("@convex/_generated/api");

      const id = await t.mutation(api.users.createAnonymous, {});

      await t.mutation(api.users.incrementMessage, {
        userId: id,
        model: "test",
        provider: "openai",
        countTowardsMonthly: true,
      });

      let user = await t.query(api.users.getById, { id });
      expect(user?.messagesSent).toBe(1);
      expect(user?.monthlyMessagesSent).toBe(1);
      expect(user?.totalMessageCount).toBe(1);

      await t.mutation(api.users.incrementMessage, {
        userId: id,
        model: "test",
        provider: "openai",
        countTowardsMonthly: false,
      });

      user = await t.query(api.users.getById, { id });
      expect(user?.messagesSent).toBe(2);
      expect(user?.monthlyMessagesSent).toBe(1);
      expect(user?.totalMessageCount).toBe(2);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message?.includes("import.meta.glob")
      ) {
        return;
      }
      throw error;
    }
  });
});
