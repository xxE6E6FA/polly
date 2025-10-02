import type { Doc, Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { useMutation } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: vi.fn(() => vi.fn()),
}));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/providers/user-data-context", () => ({
  useUserDataContext: vi.fn(() => ({ user: { _id: "u1" } })),
}));
vi.mock("@/lib/chat/message-utils", () => ({
  convertServerMessage: (m: Doc<"messages">) => ({
    id: m._id,
    role: m.role,
    content: m.content,
    createdAt: m._creationTime,
  }),
  extractMessagesArray: (x: unknown) =>
    Array.isArray(x) ? x : (x as { page?: unknown[] })?.page || [],
  findStreamingMessage: vi.fn(() => null),
  isMessageStreaming: vi.fn(() => false),
}));

import { useQuery } from "convex/react";
import * as msgUtils from "@/lib/chat/message-utils";
import { useChatMessages } from "./use-chat-messages";

describe("useChatMessages", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupMutationSpies() {
    const calls: Array<vi.Mock> = [];
    (useMutation as unknown as vi.Mock).mockImplementation(() => {
      const fn = vi.fn(async () => {
        /* noop */
      });
      calls.push(fn);
      return fn;
    });
    return calls;
  }

  it("combines server and optimistic messages without duplicates", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue([
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

  it("filters optimistic duplicates that match server messages by role/content", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue([
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

  it("deleteMessagesAfter deletes via mutation for messages after index", async () => {
    const mutationCalls = setupMutationSpies();
    (useQuery as unknown as vi.Mock).mockReturnValue([
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

  it("editMessage calls update mutation when allowed", async () => {
    const mutationCalls = setupMutationSpies();
    (useQuery as unknown as vi.Mock).mockReturnValue([
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

  it("deleteMessage deletes conversation when last visible message", async () => {
    vi.useFakeTimers();
    const mutationCalls = setupMutationSpies();
    (useQuery as unknown as vi.Mock).mockReturnValue([
      { _id: "m1", role: "user", content: "a", _creationTime: 1 },
    ]);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    await act(async () => {
      const p = result.current.deleteMessage("m1");
      vi.advanceTimersByTime(110);
      await p;
    });
    const called = mutationCalls.some(m =>
      m.mock.calls.some(
        (args: unknown[]) =>
          JSON.stringify(args[0]) === JSON.stringify({ id: "c1" })
      )
    );
    expect(called).toBe(true);
    vi.useRealTimers();
  });

  it("deleteMessage removes message via mutation when others remain", async () => {
    const mutationCalls = setupMutationSpies();
    (useQuery as unknown as vi.Mock).mockReturnValue([
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

  it("isMessageStreaming() returns true for current streaming message id", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue({ page: [] });
    vi.mocked(msgUtils.findStreamingMessage).mockReturnValue({
      id: "s1",
      isStreaming: true,
    });
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    expect(result.current.isMessageStreaming("s1", true)).toBe(true);
  });

  it("isMessageStreaming() falls back to util when id differs", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue([
      { _id: "x", role: "assistant", content: "b", _creationTime: 2 },
    ]);
    vi.mocked(msgUtils.findStreamingMessage).mockReturnValue({
      id: "other",
      isStreaming: true,
    });
    vi.mocked(msgUtils.isMessageStreaming).mockReturnValue(true);
    const { result } = renderHook(() =>
      useChatMessages({ conversationId: "c1" as Id<"conversations"> })
    );
    expect(result.current.isMessageStreaming("x", true)).toBe(true);
  });
});
