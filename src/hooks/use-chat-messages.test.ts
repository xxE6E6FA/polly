import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { useMutation } from "convex/react";
import type { ChatMessage } from "@/types";
import { renderHook } from "../test/hook-utils";

let useQueryMock: ReturnType<typeof mock>;
let useMutationMock: ReturnType<typeof mock>;
let useNavigateMock: ReturnType<typeof mock>;
let useUserDataContextMock: ReturnType<typeof mock>;
let findStreamingMessageMock: ReturnType<typeof mock>;
let isMessageStreamingMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));
mock.module("react-router-dom", () => ({
  useNavigate: () => useNavigateMock,
}));
mock.module("@/providers/user-data-context", () => ({
  useUserDataContext: (...args: unknown[]) => useUserDataContextMock(...args),
}));
mock.module("@/lib/chat/message-utils", () => ({
  convertServerMessage: (m: Doc<"messages">) => ({
    id: m._id,
    role: m.role,
    content: m.content,
    createdAt: m._creationTime,
  }),
  extractMessagesArray: (x: unknown) =>
    Array.isArray(x) ? x : (x as { page?: unknown[] })?.page || [],
  findStreamingMessage: (...args: unknown[]) =>
    findStreamingMessageMock(...args),
  isMessageStreaming: (...args: unknown[]) => isMessageStreamingMock(...args),
}));

import { useQuery } from "convex/react";
import * as msgUtils from "@/lib/chat/message-utils";
import { useChatMessages } from "./use-chat-messages";

describe("useChatMessages", () => {
  beforeEach(() => {
    useQueryMock = mock(() => undefined);
    useMutationMock = mock(() =>
      mock(async () => {
        /* noop */
      })
    );
    useNavigateMock = mock();
    useUserDataContextMock = mock(() => ({ user: { _id: "u1" } }));
    findStreamingMessageMock = mock(() => null);
    isMessageStreamingMock = mock(() => false);
  });

  function setupMutationSpies() {
    const calls: ReturnType<typeof mock>[] = [];
    useMutationMock.mockImplementation(() => {
      const fn = mock(async () => {
        /* noop */
      });
      calls.push(fn);
      return fn;
    });
    return calls;
  }

  afterAll(() => {
    mock.restore();
  });

  test("combines server and optimistic messages without duplicates", () => {
    useQueryMock.mockImplementation(() => [
      { _id: "1", role: "user", content: "a", _creationTime: 1 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    act(() =>
      result.current.addOptimisticMessage({
        id: "x",
        role: "assistant",
        content: "b",
        createdAt: 2,
        isMainBranch: true,
      } as ChatMessage)
    );
    expect(result.current.messages.map(m => m.content)).toEqual(["a", "b"]);
  });

  test("filters optimistic duplicates that match server messages by role/content", () => {
    useQueryMock.mockImplementation(() => [
      { _id: "1", role: "user", content: "dup", _creationTime: 1 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    act(() =>
      result.current.addOptimisticMessage({
        id: "x",
        role: "user",
        content: "dup",
        createdAt: 2,
        isMainBranch: true,
      } as ChatMessage)
    );
    expect(result.current.messages.map(m => m.content)).toEqual(["dup"]);
  });

  test("deleteMessagesAfter deletes via mutation for messages after index", async () => {
    const mutationCalls = setupMutationSpies();
    useQueryMock.mockImplementation(() => [
      { _id: "m1", role: "user", content: "a", _creationTime: 1 },
      { _id: "m2", role: "assistant", content: "b", _creationTime: 2 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    await act(async () => {
      await result.current.deleteMessagesAfter(1);
    });
    // Assert any mutation was called with removeMultiple payload
    const called = mutationCalls.some(m =>
      m.mock.calls.some(
        (args: unknown[]) =>
          JSON.stringify(args[0]) === JSON.stringify({ ids: ["m2"] })
      )
    );
    expect(called).toBe(true);
  });

  test("editMessage calls update mutation when allowed", async () => {
    const mutationCalls = setupMutationSpies();
    useQueryMock.mockImplementation(() => [
      { _id: "m1", role: "user", content: "a", _creationTime: 1 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    await act(async () => {
      await result.current.editMessage("m1", "new");
    });
    const called = mutationCalls.some(m =>
      m.mock.calls.some(
        (args: unknown[]) =>
          JSON.stringify(args[0]) ===
          JSON.stringify({ id: "m1", content: "new" })
      )
    );
    expect(called).toBe(true);
  });

  test("deleteMessage deletes conversation when last visible message", async () => {
    const mutationCalls = setupMutationSpies();
    useQueryMock.mockImplementation(() => [
      { _id: "m1", role: "user", content: "a", _creationTime: 1 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    await act(async () => {
      await result.current.deleteMessage("m1");
    });
    const called = mutationCalls.some(m =>
      m.mock.calls.some(
        (args: unknown[]) =>
          JSON.stringify(args[0]) === JSON.stringify({ id: "c1" })
      )
    );
    expect(called).toBe(true);
  });

  test("deleteMessage removes message via mutation when others remain", async () => {
    const mutationCalls = setupMutationSpies();
    useQueryMock.mockImplementation(() => [
      { _id: "m1", role: "user", content: "a", _creationTime: 1 },
      { _id: "m2", role: "assistant", content: "b", _creationTime: 2 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    await act(async () => {
      await result.current.deleteMessage("m2");
    });
    const called = mutationCalls.some(m =>
      m.mock.calls.some(
        (args: unknown[]) =>
          JSON.stringify(args[0]) === JSON.stringify({ ids: ["m2"] })
      )
    );
    expect(called).toBe(true);
  });

  test("isMessageStreaming() returns true for current streaming message id", () => {
    useQueryMock.mockImplementation(() => ({ page: [] }));
    findStreamingMessageMock.mockImplementation(() => ({
      id: "s1",
      isStreaming: true,
    }));
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    expect(result.current.isMessageStreaming("s1", true)).toBe(true);
  });

  test("isMessageStreaming() falls back to util when id differs", () => {
    useQueryMock.mockImplementation(() => [
      { _id: "x", role: "assistant", content: "b", _creationTime: 2 },
    ]);
    findStreamingMessageMock.mockImplementation(() => ({
      id: "other",
      isStreaming: true,
    }));
    isMessageStreamingMock.mockImplementation(() => true);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    expect(result.current.isMessageStreaming("x", true)).toBe(true);
  });
});
