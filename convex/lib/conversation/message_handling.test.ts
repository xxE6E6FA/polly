import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx, makeUnauthenticatedCtx } from "../../../test/convex-ctx";
import type { Id, Doc } from "../../_generated/dataModel";
import type { ActionCtx, QueryCtx } from "../../_generated/server";
import {
  checkConversationAccess,
  handleMessageDeletion,
  getPersonaPrompt,
  createMessage,
  incrementUserMessageStats,
} from "./message_handling";

// ── Helpers ──────────────────────────────────────────────────────────────

const userId = "test-user-id" as Id<"users">;
const conversationId = "conv-123" as Id<"conversations">;

function makeConversation(overrides?: Partial<Doc<"conversations">>): Doc<"conversations"> {
  return {
    _id: conversationId,
    _creationTime: Date.now(),
    userId,
    title: "Test Conversation",
    ...overrides,
  } as Doc<"conversations">;
}

// ── checkConversationAccess (legacy overload) ────────────────────────────

describe("checkConversationAccess - legacy overload", () => {
  test("throws 'Not authenticated' when no userId provided and not authenticated", async () => {
    const ctx = makeUnauthenticatedCtx();

    await expect(
      checkConversationAccess(ctx as unknown as QueryCtx, conversationId, undefined as any),
    ).rejects.toThrow("Not authenticated");
  });

  test("throws 'Conversation not found' for missing conversation", async () => {
    const ctx = makeConvexCtx({
      db: { get: mock(() => Promise.resolve(null)) },
    });

    await expect(
      checkConversationAccess(ctx as unknown as QueryCtx, conversationId, userId),
    ).rejects.toThrow("Conversation not found");
  });

  test("throws 'Access denied' for wrong user", async () => {
    const wrongUserId = "other-user" as Id<"users">;
    const conversation = makeConversation();
    const ctx = makeConvexCtx({
      db: { get: mock(() => Promise.resolve(conversation)) },
    });

    await expect(
      checkConversationAccess(ctx as unknown as QueryCtx, conversationId, wrongUserId),
    ).rejects.toThrow("Access denied");
  });

  test("returns conversation on success", async () => {
    const conversation = makeConversation();
    const ctx = makeConvexCtx({
      db: { get: mock(() => Promise.resolve(conversation)) },
    });

    const result = await checkConversationAccess(
      ctx as unknown as QueryCtx,
      conversationId,
      userId,
    );
    expect(result).toEqual(conversation);
  });
});

// ── checkConversationAccess (boolean overload) ───────────────────────────

describe("checkConversationAccess - boolean overload", () => {
  test("returns hasAccess: false when not authenticated", async () => {
    const ctx = makeUnauthenticatedCtx();

    const result = await checkConversationAccess(
      ctx as unknown as QueryCtx,
      conversationId,
      true,
    );
    expect(result).toHaveProperty("hasAccess", false);
  });

  test("returns hasAccess: false and isDeleted: true for missing conversation", async () => {
    const ctx = makeConvexCtx({
      db: { get: mock(() => Promise.resolve(null)) },
    });

    const result = await checkConversationAccess(
      ctx as unknown as QueryCtx,
      conversationId,
      true,
    );
    expect(result).toHaveProperty("hasAccess", false);
    expect(result).toHaveProperty("isDeleted", true);
  });

  test("returns hasAccess: true for owner", async () => {
    const conversation = makeConversation();
    const ctx = makeConvexCtx({
      db: { get: mock(() => Promise.resolve(conversation)) },
    });

    const result = await checkConversationAccess(
      ctx as unknown as QueryCtx,
      conversationId,
      true,
    );
    expect(result).toHaveProperty("hasAccess", true);
    expect((result as any).conversation).toEqual(conversation);
  });

  test("returns hasAccess: false for non-owner", async () => {
    const conversation = makeConversation({ userId: "other-user" as Id<"users"> });
    const ctx = makeConvexCtx({
      db: { get: mock(() => Promise.resolve(conversation)) },
    });

    const result = await checkConversationAccess(
      ctx as unknown as QueryCtx,
      conversationId,
      true,
    );
    expect(result).toHaveProperty("hasAccess", false);
    expect((result as any).conversation).toBeNull();
  });
});

// ── handleMessageDeletion ────────────────────────────────────────────────

describe("handleMessageDeletion", () => {
  const makeMessages = () =>
    [
      { _id: "msg-1" as Id<"messages">, role: "user", content: "hello" },
      { _id: "msg-2" as Id<"messages">, role: "assistant", content: "hi there" },
      { _id: "msg-3" as Id<"messages">, role: "context", content: "ctx" },
      { _id: "msg-4" as Id<"messages">, role: "user", content: "follow up" },
      { _id: "msg-5" as Id<"messages">, role: "assistant", content: "response" },
    ] as Doc<"messages">[];

  test("assistant retry: deletes assistant message and everything after, preserves context", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeConvexCtx({ runMutation });
    const messages = makeMessages();

    // Retry from assistant message at index 1
    await handleMessageDeletion(ctx as unknown as ActionCtx, messages, 1, "assistant");

    // Should delete msg-2 (assistant), msg-4 (user), msg-5 (assistant)
    // Should NOT delete msg-3 (context)
    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    const deletedIds = calls.map((c: any) => c[1]?.id);
    expect(deletedIds).toContain("msg-2");
    expect(deletedIds).toContain("msg-4");
    expect(deletedIds).toContain("msg-5");
    expect(deletedIds).not.toContain("msg-3");
  });

  test("user retry: deletes messages after user message, preserves context", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeConvexCtx({ runMutation });
    const messages = makeMessages();

    // Retry from user message at index 0
    await handleMessageDeletion(ctx as unknown as ActionCtx, messages, 0, "user");

    // Should call removeMultiple with msg-2 (assistant after), msg-4 (user), msg-5 (assistant)
    // Should NOT include msg-1 (the user message itself) or msg-3 (context)
    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    // For user retry, it calls api.messages.removeMultiple once
    expect(calls.length).toBe(1);
    const removeMultipleArgs = calls[0][1];
    expect(removeMultipleArgs.ids).toContain("msg-2");
    expect(removeMultipleArgs.ids).toContain("msg-4");
    expect(removeMultipleArgs.ids).toContain("msg-5");
    expect(removeMultipleArgs.ids).not.toContain("msg-1");
    expect(removeMultipleArgs.ids).not.toContain("msg-3");
  });

  test("user retry: handles next message being non-assistant (e.g. context)", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeConvexCtx({ runMutation });
    const messages = [
      { _id: "msg-1" as Id<"messages">, role: "user", content: "hello" },
      { _id: "msg-2" as Id<"messages">, role: "context", content: "ctx" },
      { _id: "msg-3" as Id<"messages">, role: "assistant", content: "response" },
    ] as Doc<"messages">[];

    await handleMessageDeletion(ctx as unknown as ActionCtx, messages, 0, "user");

    const calls = (runMutation as ReturnType<typeof mock>).mock.calls;
    // removeMultiple should include msg-3 (assistant) but not msg-2 (context)
    // The nextMessage check at index+1 finds context (not assistant), so msg-2 is not added via that path
    // But msg-3 is still included via the slice(messageIndex + 1) path
    expect(calls.length).toBe(1);
    const ids = calls[0][1].ids;
    expect(ids).toContain("msg-3");
    expect(ids).not.toContain("msg-2");
    expect(ids).not.toContain("msg-1");
  });

  test("user retry: does nothing when no messages after user message", async () => {
    const runMutation = mock(() => Promise.resolve());
    const ctx = makeConvexCtx({ runMutation });
    const messages = [
      { _id: "msg-1" as Id<"messages">, role: "user", content: "hello" },
    ] as Doc<"messages">[];

    await handleMessageDeletion(ctx as unknown as ActionCtx, messages, 0, "user");

    expect(runMutation).not.toHaveBeenCalled();
  });
});

// ── getPersonaPrompt ─────────────────────────────────────────────────────

describe("getPersonaPrompt", () => {
  test("returns empty string when no personaId", async () => {
    const ctx = makeConvexCtx();
    const result = await getPersonaPrompt(ctx as unknown as QueryCtx);
    expect(result).toBe("");
  });

  test("returns empty string when personaId is null", async () => {
    const ctx = makeConvexCtx();
    const result = await getPersonaPrompt(ctx as unknown as QueryCtx, null);
    expect(result).toBe("");
  });

  test("returns persona prompt when found", async () => {
    const runQuery = mock(() => Promise.resolve({ prompt: "You are a pirate" }));
    const ctx = makeConvexCtx({ runQuery });
    const personaId = "persona-1" as Id<"personas">;

    const result = await getPersonaPrompt(ctx as unknown as QueryCtx, personaId);
    expect(result).toBe("You are a pirate");
  });

  test("returns empty string when persona not found", async () => {
    const runQuery = mock(() => Promise.resolve(null));
    const ctx = makeConvexCtx({ runQuery });
    const personaId = "persona-1" as Id<"personas">;

    const result = await getPersonaPrompt(ctx as unknown as QueryCtx, personaId);
    expect(result).toBe("");
  });
});

// ── createMessage ────────────────────────────────────────────────────────

describe("createMessage", () => {
  test("calls api.messages.create and returns the ID", async () => {
    const newMsgId = "msg-new" as Id<"messages">;
    const runMutation = mock(() => Promise.resolve(newMsgId));
    const ctx = makeConvexCtx({ runMutation });

    const result = await createMessage(ctx as unknown as ActionCtx, {
      conversationId,
      role: "assistant",
      content: "Hello!",
    } as any);

    expect(result).toBe(newMsgId);
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});

// ── incrementUserMessageStats ────────────────────────────────────────────

describe("incrementUserMessageStats", () => {
  test("does not throw on failure", async () => {
    // Set up ctx where scheduler is disabled (test env) so scheduleRunAfter is a no-op
    const ctx = makeConvexCtx();

    // Should not throw even if something goes wrong internally
    await incrementUserMessageStats(
      ctx as unknown as ActionCtx,
      userId,
      "gpt-4",
      "openai",
      100,
    );
  });

  test("accepts explicit countTowardsMonthly option", async () => {
    const ctx = makeConvexCtx();

    // Should not throw
    await incrementUserMessageStats(
      ctx as unknown as ActionCtx,
      userId,
      "gpt-4",
      "openai",
      100,
      { countTowardsMonthly: true },
    );
  });
});
