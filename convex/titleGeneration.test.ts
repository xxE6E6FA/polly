import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import {
  batchUpdateTitlesHandler,
  generateTitleHandler,
} from "./titleGeneration";

describe("titleGeneration.generateTitle", () => {
  afterEach(() => {
    mock.restore();
    // Clean up environment variables
    if (process.env.GEMINI_API_KEY !== undefined) {
      process.env.GEMINI_API_KEY = undefined;
    }
  });

  test("generates title from message without updating conversation", async () => {
    // Ensure no API key to trigger fallback
    process.env.GEMINI_API_KEY = undefined;

    const ctx = makeConvexCtx({
      runMutation: mock(() => Promise.resolve()),
    });

    const result = await generateTitleHandler(ctx, {
      message: "Hello, how are you?",
    });

    expect(result).toBe("Hello, how are you?");
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  test("generates title and updates conversation when conversationId provided", async () => {
    // Ensure no API key to trigger fallback
    process.env.GEMINI_API_KEY = undefined;

    const conversationId = "conv-123" as Id<"conversations">;

    const ctx = makeConvexCtx({
      runMutation: mock(() => Promise.resolve()),
    });

    const result = await generateTitleHandler(ctx, {
      message: "Test message",
      conversationId,
    });

    expect(result).toBe("Test message");
    expect(ctx.runMutation).toHaveBeenCalledWith(expect.any(Object), {
      id: conversationId,
      updates: { title: "Test message" },
      setUpdatedAt: true,
    });
  });

  test("falls back to simple title generation when API fails", async () => {
    // Mock environment variable to trigger API path
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";

    // Mock fetch to fail
    spyOn(globalThis, "fetch").mockRejectedValue(new Error("API error"));

    const ctx = makeConvexCtx({
      runMutation: mock(() => Promise.resolve()),
    });

    const result = await generateTitleHandler(ctx, {
      message:
        "Hello world this is a very long message that should be truncated",
    });

    // Should be truncated to 37 chars + "..." = 40 total
    expect(result).toBe("Hello world this is a very long messa...");
    expect(result.length).toBe(40);

    // Restore environment
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      process.env.GEMINI_API_KEY = undefined;
    }
  });

  test("falls back to simple title when no API response", async () => {
    // Mock environment variable to trigger API path
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";

    // Mock fetch to return empty response
    spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    const ctx = makeConvexCtx({
      runMutation: mock(() => Promise.resolve()),
    });

    const result = await generateTitleHandler(ctx, {
      message: "Short message",
    });

    expect(result).toBe("Short message");

    // Restore environment
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      process.env.GEMINI_API_KEY = undefined;
    }
  });

  test("falls back to simple title when API response is not ok", async () => {
    // Mock environment variable to trigger API path
    const originalApiKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-key";

    // Mock fetch to return error response
    spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const ctx = makeConvexCtx({
      runMutation: mock(() => Promise.resolve()),
    });

    const result = await generateTitleHandler(ctx, {
      message: "Test message",
    });

    expect(result).toBe("Test message");

    // Restore environment
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      process.env.GEMINI_API_KEY = undefined;
    }
  });

  test("uses fallback title for empty message", async () => {
    // Ensure no API key to trigger fallback
    process.env.GEMINI_API_KEY = undefined;

    const ctx = makeConvexCtx({
      runMutation: mock(() => Promise.resolve()),
    });

    const result = await generateTitleHandler(ctx, {
      message: "",
    });

    expect(result).toBe("New conversation");
  });
});

describe("titleGeneration.batchUpdateTitles", () => {
  test("updates multiple conversation titles successfully", async () => {
    const updates = [
      {
        conversationId: "conv-1" as Id<"conversations">,
        title: "Title 1",
      },
      {
        conversationId: "conv-2" as Id<"conversations">,
        title: "Title 2",
      },
    ];

    const ctx = makeConvexCtx({
      db: {
        patch: mock(() => Promise.resolve()),
      },
    });

    await batchUpdateTitlesHandler(ctx, { updates });

    expect(ctx.db.patch).toHaveBeenCalledTimes(2);
    expect(ctx.db.patch).toHaveBeenCalledWith("conv-1", { title: "Title 1" });
    expect(ctx.db.patch).toHaveBeenCalledWith("conv-2", { title: "Title 2" });
  });

  test("handles partial failures in batch updates", async () => {
    const updates = [
      {
        conversationId: "conv-1" as Id<"conversations">,
        title: "Title 1",
      },
      {
        conversationId: "conv-2" as Id<"conversations">,
        title: "Title 2",
      },
    ];

    // Mock patch to fail on second call
    let callCount = 0;
    const ctx = makeConvexCtx({
      db: {
        patch: mock(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error("Database error"));
          }
          return Promise.resolve();
        }),
      },
    });

    // Should not throw, just log the error
    await expect(
      batchUpdateTitlesHandler(ctx, { updates })
    ).resolves.toBeUndefined();

    expect(ctx.db.patch).toHaveBeenCalledTimes(2);
  });

  test("handles empty updates array", async () => {
    const ctx = makeConvexCtx({
      db: {
        patch: mock(() => Promise.resolve()),
      },
    });

    await batchUpdateTitlesHandler(ctx, { updates: [] });

    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
