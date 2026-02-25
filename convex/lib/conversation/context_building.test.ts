import { describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../../../test/convex-ctx";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { buildContextMessages } from "./context_building";

// ── Helpers ──────────────────────────────────────────────────────────────

const userId = "test-user-id" as Id<"users">;
const conversationId = "conv-123" as Id<"conversations">;

function makeMessage(
  role: "user" | "assistant" | "system" | "context",
  content: string,
  extra?: Record<string, unknown>,
) {
  return {
    _id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    ...extra,
  };
}

type RoutingMap = Record<string, (...args: any[]) => any>;

function makeRoutingCtx(routes: RoutingMap) {
  const runQuery = mock((_fnRef: any, fnArgs: any) => {
    // Match by the function reference string or use default
    for (const [key, handler] of Object.entries(routes)) {
      if (key === "default") continue;
      if (String(_fnRef).includes(key) || _fnRef === key) {
        return handler(fnArgs);
      }
    }
    return routes.default?.(fnArgs) ?? Promise.resolve(null);
  });

  const runAction = mock((...args: any[]) => Promise.resolve([]));
  return makeConvexCtx({ runQuery, runAction }) as unknown as ActionCtx;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("buildContextMessages", () => {
  test("returns system message with merged prompts", async () => {
    const ctx = makeRoutingCtx({
      default: () => Promise.resolve([]),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      memories: [],
    });

    expect(contextMessages.length).toBeGreaterThanOrEqual(1);
    expect(contextMessages[0].role).toBe("system");
    expect(contextMessages[0].content.length).toBeGreaterThan(0);
  });

  test("filters out system and context role messages", async () => {
    const messages = [
      makeMessage("system", "system msg"),
      makeMessage("context", "context msg"),
      makeMessage("user", "hello"),
      makeMessage("assistant", "hi there"),
    ];

    const ctx = makeRoutingCtx({
      default: () => Promise.resolve(messages),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      memories: [],
    });

    // Should have: 1 system (merged) + 2 conversation (user + assistant)
    const roles = contextMessages.map((m) => m.role);
    expect(roles.filter((r) => r === "system")).toHaveLength(1);
    expect(roles).toContain("user");
    expect(roles).toContain("assistant");
    // The original system/context from DB should be filtered out
    expect(contextMessages.some((m) => m.content === "system msg")).toBe(false);
    expect(contextMessages.some((m) => m.content === "context msg")).toBe(false);
  });

  test("filters out empty messages", async () => {
    const messages = [
      makeMessage("user", "hello"),
      makeMessage("assistant", ""),
      makeMessage("user", "   "),
      makeMessage("assistant", "valid response"),
    ];

    const ctx = makeRoutingCtx({
      default: () => Promise.resolve(messages),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      memories: [],
    });

    // system + user "hello" + assistant "valid response"
    const nonSystem = contextMessages.filter((m) => m.role !== "system");
    expect(nonSystem).toHaveLength(2);
    expect(nonSystem[0].content).toBe("hello");
    expect(nonSystem[1].content).toBe("valid response");
  });

  test("respects includeUpToIndex parameter", async () => {
    const messages = [
      makeMessage("user", "first"),
      makeMessage("assistant", "response 1"),
      makeMessage("user", "second"),
      makeMessage("assistant", "response 2"),
    ];

    const ctx = makeRoutingCtx({
      default: () => Promise.resolve(messages),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      includeUpToIndex: 1,
      memories: [],
    });

    // system + "first" + "response 1" (index 0 and 1 only)
    const nonSystem = contextMessages.filter((m) => m.role !== "system");
    expect(nonSystem).toHaveLength(2);
    expect(nonSystem[0].content).toBe("first");
    expect(nonSystem[1].content).toBe("response 1");
  });

  test("returns text-only for older messages with attachments", async () => {
    const messages = [
      makeMessage("user", "old message", { attachments: [{ type: "image", url: "http://example.com/img.png" }] }),
      makeMessage("assistant", "old response"),
      makeMessage("user", "new message"),
    ];

    const ctx = makeRoutingCtx({
      default: () => Promise.resolve(messages),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      memories: [],
    });

    // The old user message with attachments should be text-only
    const nonSystem = contextMessages.filter((m) => m.role !== "system");
    expect(nonSystem[0].content).toBe("old message");
    // It should be a string, not an array of parts
    expect(typeof nonSystem[0].content).toBe("string");
  });

  test("builds memory context when memories are provided", async () => {
    const memories = [
      { content: "User likes TypeScript", category: "preference" },
      { content: "User works at Acme Corp", category: "fact" },
    ];

    const ctx = makeRoutingCtx({
      default: () => Promise.resolve([makeMessage("user", "hello")]),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      memories,
    });

    // The system message should contain memory context
    const systemMsg = contextMessages[0];
    expect(systemMsg.role).toBe("system");
    expect(systemMsg.content).toContain("TypeScript");
    expect(systemMsg.content).toContain("Acme Corp");
  });

  test("returns only system message when conversation has no messages", async () => {
    const ctx = makeRoutingCtx({
      default: () => Promise.resolve([]),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      memories: [],
    });

    expect(contextMessages).toHaveLength(1);
    expect(contextMessages[0].role).toBe("system");
  });

  test("includeUpToIndex 0 includes only the first message", async () => {
    const messages = [
      makeMessage("user", "first"),
      makeMessage("assistant", "response 1"),
      makeMessage("user", "second"),
    ];

    const ctx = makeRoutingCtx({
      default: () => Promise.resolve(messages),
    });

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      includeUpToIndex: 0,
      memories: [],
    });

    const nonSystem = contextMessages.filter((m) => m.role !== "system");
    expect(nonSystem).toHaveLength(1);
    expect(nonSystem[0].content).toBe("first");
  });

  test("includes persona prompt in system message when personaId provided", async () => {
    const personaId = "persona-1" as Id<"personas">;
    const messages = [makeMessage("user", "hello")];

    // Track call order to differentiate between queries
    let queryCallCount = 0;
    const runQuery = mock((_fnRef: any, _args: any) => {
      queryCallCount++;
      // First call: getAllInConversationInternal
      if (queryCallCount === 1) return Promise.resolve(messages);
      // Second call: internalGetById (persona) — runs in Promise.all
      if (queryCallCount === 2) return Promise.resolve({ prompt: "You are a helpful pirate" });
      // Any additional calls
      return Promise.resolve(null);
    });
    const runAction = mock(() => Promise.resolve([]));
    const ctx = makeConvexCtx({ runQuery, runAction }) as unknown as ActionCtx;

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
      personaId,
      memories: [],
    });

    const systemMsg = contextMessages[0];
    expect(systemMsg.content).toContain("pirate");
  });

  test("retrieves memories without scheduling an action", async () => {
    const messages = [makeMessage("user", "hello")];

    let queryCallCount = 0;
    const runQuery = mock((_fnRef: any, _args: any) => {
      queryCallCount++;
      // First call: getAllInConversationInternal
      if (queryCallCount === 1) return Promise.resolve(messages);
      // Second call: getUserMemorySettings (memory enabled)
      if (queryCallCount === 2) return Promise.resolve({ memoryEnabled: true });
      return Promise.resolve(null);
    });
    const runAction = mock(() => Promise.resolve([]));
    const vectorSearch = mock(() => Promise.resolve([]));
    const ctx = {
      ...makeConvexCtx({ runQuery, runAction }),
      vectorSearch,
    } as unknown as ActionCtx;

    const { contextMessages } = await buildContextMessages(ctx, {
      userId,
      conversationId,
    });

    expect(runAction).not.toHaveBeenCalled();
    expect(contextMessages.length).toBeGreaterThanOrEqual(1);
    expect(contextMessages[0].role).toBe("system");
  });
});
