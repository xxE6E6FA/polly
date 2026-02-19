/**
 * Stress tests for write conflict patterns used in mutation handlers.
 *
 * These tests verify the patterns that mutations use for:
 * 1. Read-modify-write with fresh reads on retry
 * 2. Counter increment patterns (messageCount, totalMessageCount)
 * 3. Content append patterns (streaming content)
 * 4. Metadata merge patterns
 *
 * The actual mutations use withRetry internally, so these tests verify
 * that the patterns work correctly when conflicts occur.
 */
import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../test/convex-ctx";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { withRetry } from "./ai/error_handlers";

const WRITE_CONFLICT_ERROR = "Documents read from or written to have changed";

describe("updateMessageStatus pattern", () => {
  /**
   * Pattern: Read message -> check status -> patch with metadata
   * Used by: updateMessageStatus, updateAssistantStatus
   */

  test("retries status update on write conflict", async () => {
    let patchCallCount = 0;
    const mockMessage = {
      _id: "msg123",
      role: "assistant",
      status: "streaming",
      metadata: { existingField: "value" },
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => {
          patchCallCount++;
          if (patchCallCount < 3) {
            return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
          }
          return Promise.resolve(undefined);
        }),
      },
    });

    // Simulate the updateMessageStatus pattern
    await withRetry(async () => {
      const message = await ctx.db.get("messages", "msg123");
      if (!message) {
        return;
      }

      if (message.status === "error") {
        return;
      }

      const updateData: Record<string, unknown> = { status: "done" };

      if (message.role === "assistant") {
        const currentMetadata = (message.metadata || {}) as Record<
          string,
          unknown
        >;
        updateData.metadata = {
          ...currentMetadata,
          finishReason: "stop",
        };
      }

      await ctx.db.patch("messages", "msg123", updateData);
    });

    expect(patchCallCount).toBe(3);
  });

  test("preserves existing metadata fields through conflicts", async () => {
    let capturedPatch: Record<string, unknown> | null = null;
    let patchCallCount = 0;
    const mockMessage = {
      _id: "msg123",
      role: "assistant",
      status: "streaming",
      metadata: { existingField: "preserved", tokens: 100 },
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            patchCallCount++;
            capturedPatch = patch;
            if (patchCallCount < 2) {
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    await withRetry(async () => {
      const message = await ctx.db.get("messages", "msg123");
      if (!message) {
        return;
      }

      const currentMetadata = (message.metadata || {}) as Record<
        string,
        unknown
      >;
      await ctx.db.patch("messages", "msg123", {
        status: "done",
        metadata: { ...currentMetadata, finishReason: "stop" },
      });
    });

    expect(capturedPatch?.status).toBe("done");
    const metadata = capturedPatch?.metadata as Record<string, unknown>;
    expect(metadata?.existingField).toBe("preserved");
    expect(metadata?.tokens).toBe(100);
    expect(metadata?.finishReason).toBe("stop");
  });
});

describe("internalUpdate append pattern", () => {
  /**
   * Pattern: Read message -> append to content/reasoning -> patch
   * Used by: internalUpdate, updateAssistantContent, internalAtomicUpdate
   */

  test("uses fresh content on retry for append operations", async () => {
    let patchCallCount = 0;
    let capturedContent: string | null = null;
    let currentContent = "Hello ";

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({
            _id: "msg123",
            content: currentContent,
            status: "streaming",
          })
        ),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            patchCallCount++;
            capturedContent = patch.content as string;
            if (patchCallCount < 2) {
              // Simulate another process appending
              currentContent = "Hello world ";
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    const appendContent = "!";

    await withRetry(async () => {
      const message = await ctx.db.get("messages", "msg123");
      if (!message) {
        return;
      }

      const updates: Record<string, unknown> = {};
      updates.content = ((message.content as string) || "") + appendContent;

      await ctx.db.patch("messages", "msg123", updates);
    });

    // On retry, it should read "Hello world " and append "!" = "Hello world !"
    expect(capturedContent).toBe("Hello world !");
    expect(patchCallCount).toBe(2);
  });

  test("handles reasoning append with conflicts", async () => {
    let capturedReasoning: string | null = null;
    let currentReasoning = "Step 1: ";

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({
            _id: "msg123",
            content: "result",
            reasoning: currentReasoning,
          })
        ),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            capturedReasoning = patch.reasoning as string;
            // Simulate conflict that updates reasoning
            if (currentReasoning === "Step 1: ") {
              currentReasoning = "Step 1: Analyze. ";
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    await withRetry(async () => {
      const message = await ctx.db.get("messages", "msg123");
      if (!message) {
        return;
      }

      await ctx.db.patch("messages", "msg123", {
        reasoning: `${(message.reasoning as string) || ""}Step 2: Execute.`,
      });
    });

    expect(capturedReasoning).toBe("Step 1: Analyze. Step 2: Execute.");
  });
});

describe("conversation internalPatch pattern", () => {
  /**
   * Pattern: Read conversation -> update with monotonic timestamp -> patch
   * Used by: internalPatch, clearStreamingForMessage
   */

  test("uses fresh updatedAt for monotonic timestamp on retry", async () => {
    let patchCallCount = 0;
    let capturedUpdatedAt: number | null = null;
    let currentUpdatedAt = 1000;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({
            _id: "conv123",
            title: "Test",
            updatedAt: currentUpdatedAt,
          })
        ),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            patchCallCount++;
            capturedUpdatedAt = patch.updatedAt as number;
            if (patchCallCount < 2) {
              // Simulate another process updating timestamp
              currentUpdatedAt = 5000;
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    await withRetry(async () => {
      const conversation = await ctx.db.get("conversations", "conv123");
      if (!conversation) {
        return;
      }

      const now = Date.now();
      const patch: Record<string, unknown> = {
        title: "Updated",
        updatedAt: Math.max(now, ((conversation.updatedAt as number) || 0) + 1),
      };

      await ctx.db.patch("conversations", "conv123", patch);
    });

    // On retry, should use fresh updatedAt (5000+1 = 5001 minimum)
    expect(capturedUpdatedAt).toBeGreaterThanOrEqual(5001);
  });

  test("handles clearFields pattern with conflicts", async () => {
    let capturedPatch: Record<string, unknown> | null = null;
    let patchCallCount = 0;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({
            _id: "conv123",
            isStreaming: true,
            stopRequested: true,
          })
        ),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            patchCallCount++;
            capturedPatch = patch;
            if (patchCallCount < 2) {
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    const clearFields = ["stopRequested"];
    const updates = { isStreaming: false };

    await withRetry(async () => {
      const conversation = await ctx.db.get("conversations", "conv123");
      if (!conversation) {
        return;
      }

      const patch: Record<string, unknown> = { ...updates };
      for (const field of clearFields) {
        patch[field] = undefined;
      }

      await ctx.db.patch("conversations", "conv123", patch);
    });

    expect(capturedPatch?.isStreaming).toBe(false);
    expect(capturedPatch?.stopRequested).toBeUndefined();
  });
});

describe("removeMultiple counter decrement pattern", () => {
  /**
   * Pattern: Read conversation -> decrement messageCount -> patch
   * Used by: removeMultiple, internalRemoveMultiple
   */

  test("uses fresh messageCount on retry for decrement", async () => {
    let patchCallCount = 0;
    let capturedMessageCount: number | null = null;
    let currentMessageCount = 10;
    const deletedCount = 2;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({
            _id: "conv123",
            messageCount: currentMessageCount,
          })
        ),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            patchCallCount++;
            capturedMessageCount = patch.messageCount as number;
            if (patchCallCount < 3) {
              // Simulate another process modifying messageCount
              currentMessageCount = 8;
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    await withRetry(async () => {
      const conversation = await ctx.db.get("conversations", "conv123");
      if (!conversation) {
        return;
      }

      await ctx.db.patch("conversations", "conv123", {
        isStreaming: false,
        messageCount: Math.max(
          0,
          ((conversation.messageCount as number) || deletedCount) - deletedCount
        ),
      });
    });

    // On retry, should use fresh value: 8 - 2 = 6
    expect(capturedMessageCount).toBe(6);
    expect(patchCallCount).toBe(3);
  });

  test("handles concurrent user message count decrements", async () => {
    let capturedCount: number | null = null;
    let currentCount = 100;
    const decrementBy = 5;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({
            _id: "user123",
            totalMessageCount: currentCount,
          })
        ),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            capturedCount = patch.totalMessageCount as number;
            if (currentCount === 100) {
              // Simulate concurrent decrement
              currentCount = 95;
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    await withRetry(async () => {
      const user = await ctx.db.get("users", "user123");
      if (!user) {
        return;
      }

      await ctx.db.patch("users", "user123", {
        totalMessageCount: Math.max(
          0,
          ((user.totalMessageCount as number) || 0) - decrementBy
        ),
      });
    });

    // On retry: 95 - 5 = 90
    expect(capturedCount).toBe(90);
  });
});

describe("updateImageGeneration pattern", () => {
  /**
   * Pattern: Read message -> merge imageGeneration -> patch message -> patch conversation
   * Used by: updateImageGeneration
   */

  test("retries message patch and preserves nested metadata", async () => {
    let patchCallCount = 0;
    let capturedPatch: Record<string, unknown> | null = null;

    const mockMessage = {
      _id: "msg123",
      conversationId: "conv123",
      imageGeneration: {
        status: "starting",
        metadata: {
          model: "flux",
          params: { aspectRatio: "16:9", steps: 20 },
        },
      },
      metadata: {},
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(
          (_table: string, _id: string, patch: Record<string, unknown>) => {
            patchCallCount++;
            capturedPatch = patch;
            if (patchCallCount < 2) {
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
        ),
      },
    });

    const newData = {
      status: "processing",
      metadata: { duration: 10 },
    };

    await withRetry(async () => {
      const message = await ctx.db.get("messages", "msg123");
      if (!message) {
        return null;
      }

      const currentImageGeneration = (message.imageGeneration || {}) as Record<
        string,
        unknown
      >;
      const currentMetadata = (currentImageGeneration.metadata || {}) as Record<
        string,
        unknown
      >;
      const currentParams = (currentMetadata.params || {}) as Record<
        string,
        unknown
      >;

      const newMetadata = newData.metadata as Record<string, unknown>;

      const updatedImageGeneration = {
        ...currentImageGeneration,
        status: newData.status,
        metadata: {
          ...currentMetadata,
          ...newMetadata,
          params: { ...currentParams },
        },
      };

      await ctx.db.patch("messages", "msg123", {
        imageGeneration: updatedImageGeneration,
      });

      return message;
    });

    const imageGen = capturedPatch?.imageGeneration as Record<string, unknown>;
    expect(imageGen?.status).toBe("processing");
    const metadata = imageGen?.metadata as Record<string, unknown>;
    expect(metadata?.model).toBe("flux");
    expect(metadata?.duration).toBe(10);
    const params = metadata?.params as Record<string, unknown>;
    expect(params?.aspectRatio).toBe("16:9");
    expect(params?.steps).toBe(20);
  });

  test("handles separate conversation patch with its own retry", async () => {
    let messagePatchCount = 0;
    let conversationPatchCount = 0;

    const mockMessage = {
      _id: "msg123",
      conversationId: "conv123",
      imageGeneration: { status: "processing" },
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock((table: string) => {
          if (table === "messages") {
            return Promise.resolve(mockMessage);
          }
          if (table === "conversations") {
            return Promise.resolve({ _id: "conv123" });
          }
          return Promise.resolve(null);
        }),
        patch: mock((table: string) => {
          if (table === "messages") {
            messagePatchCount++;
            return Promise.resolve(undefined);
          }
          if (table === "conversations") {
            conversationPatchCount++;
            if (conversationPatchCount < 3) {
              return Promise.reject(new Error(WRITE_CONFLICT_ERROR));
            }
            return Promise.resolve(undefined);
          }
          return Promise.resolve(undefined);
        }),
      },
    });

    // Message update
    const message = await withRetry(async () => {
      const msg = await ctx.db.get("messages", "msg123");
      if (!msg) {
        return null;
      }
      await ctx.db.patch("messages", "msg123", {
        imageGeneration: { status: "succeeded" },
        status: "done",
      });
      return msg;
    });

    // Separate conversation update with its own retry
    if (message?.conversationId) {
      await withRetry(async () => {
        await ctx.db.patch("conversations", message.conversationId as string, {
          isStreaming: false,
          activeImageGeneration: undefined,
        });
      });
    }

    expect(messagePatchCount).toBe(1);
    expect(conversationPatchCount).toBe(3);
  });
});

describe("concurrent streaming simulation", () => {
  /**
   * Simulates real-world streaming scenarios where multiple
   * content chunks compete for the same message document.
   */

  test("handles rapid content append conflicts", async () => {
    let messageContent = "";
    let conflictCount = 0;
    let callCount = 0;
    const chunks = [
      "Hello",
      " ",
      "world",
      "!",
      " ",
      "How",
      " ",
      "are",
      " ",
      "you",
      "?",
    ];

    for (const chunk of chunks) {
      await withRetry(
        () => {
          callCount++;
          const currentContent = messageContent;

          // Deterministic conflict: fail on every 3rd call (at most once per chunk)
          if (callCount % 3 === 0) {
            conflictCount++;
            throw new Error(WRITE_CONFLICT_ERROR);
          }

          messageContent = currentContent + chunk;
          return Promise.resolve();
        },
        5,
        1
      );
    }

    expect(messageContent).toBe("Hello world! How are you?");
    expect(conflictCount).toBeGreaterThan(0);
  });

  test("handles interleaved content and reasoning updates", async () => {
    let content = "";
    let reasoning = "";
    let totalConflicts = 0;
    let callCount = 0;

    const updates = [
      { type: "content", value: "The " },
      { type: "reasoning", value: "Analyzing: " },
      { type: "content", value: "answer " },
      { type: "reasoning", value: "computing result. " },
      { type: "content", value: "is " },
      { type: "content", value: "42." },
      { type: "reasoning", value: "Done." },
    ];

    for (const update of updates) {
      await withRetry(
        () => {
          callCount++;

          // Deterministic conflict: fail on every 4th call
          if (callCount % 4 === 0) {
            totalConflicts++;
            throw new Error(WRITE_CONFLICT_ERROR);
          }

          if (update.type === "content") {
            content += update.value;
          } else {
            reasoning += update.value;
          }
          return Promise.resolve();
        },
        5,
        1
      );
    }

    expect(content).toBe("The answer is 42.");
    expect(reasoning).toBe("Analyzing: computing result. Done.");
    expect(totalConflicts).toBeGreaterThan(0);
  });
});

describe("edge cases", () => {
  test("handles null document gracefully", async () => {
    let patchCalled = false;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(null)),
        patch: mock(() => {
          patchCalled = true;
          return Promise.resolve(undefined);
        }),
      },
    });

    await withRetry(async () => {
      const message = await ctx.db.get("messages", "nonexistent");
      if (!message) {
        return;
      }
      await ctx.db.patch("messages", "nonexistent", { status: "done" });
    });

    expect(patchCalled).toBe(false);
  });

  test("does not retry on non-conflict errors", async () => {
    let patchCount = 0;

    const ctx = makeConvexCtx({
      db: {
        get: mock(() =>
          Promise.resolve({ _id: "msg123", status: "streaming" })
        ),
        patch: mock(() => {
          patchCount++;
          return Promise.reject(new Error("Permission denied"));
        }),
      },
    });

    await expect(
      withRetry(async () => {
        const message = await ctx.db.get("messages", "msg123");
        if (!message) {
          return;
        }
        await ctx.db.patch("messages", "msg123", { status: "done" });
      })
    ).rejects.toThrow("Permission denied");

    expect(patchCount).toBe(1);
  });

  test("handles error status protection pattern", async () => {
    let patchCalled = false;
    const mockMessage = {
      _id: "msg123",
      status: "error",
      metadata: { error: "Something failed" },
    };

    const ctx = makeConvexCtx({
      db: {
        get: mock(() => Promise.resolve(mockMessage)),
        patch: mock(() => {
          patchCalled = true;
          return Promise.resolve(undefined);
        }),
      },
    });

    // Pattern: Don't overwrite error status
    await withRetry(async () => {
      const message = await ctx.db.get("messages", "msg123");
      if (!message) {
        return;
      }

      // Skip if already in error state (pattern from updateMessageStatus)
      if (message.status === "error") {
        return;
      }

      await ctx.db.patch("messages", "msg123", { status: "done" });
    });

    expect(patchCalled).toBe(false);
  });
});
