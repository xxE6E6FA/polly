import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { renderHook } from "../test/hook-utils";
import { mockModuleWithRestore } from "../test/utils";

let useMutationMock: ReturnType<typeof mock>;
let useQueryMock: ReturnType<typeof mock>;
let useUserDataContextMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

await mockModuleWithRestore("@/providers/user-data-context", actual => ({
  ...actual,
  useUserDataContext: (...args: unknown[]) => useUserDataContextMock(...args),
}));

import { useMutation, useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useConversationModelOverride } from "./use-conversation-model-override";

describe("useConversationModelOverride", () => {
  beforeEach(() => {
    useUserDataContextMock = mock(() => ({
      user: { _id: "u1", isAnonymous: false },
    }));
  });

  test("calls selectModel when last used differs from current selection", () => {
    const mutate = mock(() => Promise.resolve(undefined));
    useMutationMock = mock(() => mutate);
    useQueryMock = mock();
    useQueryMock
      // lastUsedModel
      .mockImplementationOnce(() => ({ modelId: "gpt", provider: "openai" }))
      // currentSelectedModel
      .mockImplementationOnce(() => ({ modelId: "other", provider: "x" }))
      // resolvedModel
      .mockImplementationOnce(() => ({ modelId: "gpt", provider: "openai" }));

    renderHook(() => useConversationModelOverride("c1" as Id<"conversations">));

    expect(mutate).toHaveBeenCalledWith({ modelId: "gpt", provider: "openai" });
  });

  test("does not call when models match", () => {
    const mutate = mock(async () => {
      /* noop */
    });
    useMutationMock = mock(() => mutate);
    useQueryMock = mock();
    useQueryMock
      .mockImplementationOnce(() => ({ modelId: "m", provider: "p" }))
      .mockImplementationOnce(() => ({ modelId: "m", provider: "p" }))
      .mockImplementationOnce(() => ({ modelId: "m", provider: "p" }));
    renderHook(() => useConversationModelOverride("c2" as Id<"conversations">));
    expect(mutate).not.toHaveBeenCalled();
  });

  test("does not call when user is anonymous", () => {
    // Force anonymous user for this test
    useUserDataContextMock = mock(() => ({
      user: { _id: "u1", isAnonymous: true },
    }));
    const mutate = mock(async () => {
      /* noop */
    });
    useMutationMock = mock(() => mutate);
    useQueryMock = mock();
    useQueryMock
      .mockImplementationOnce(() => ({ modelId: "x", provider: "y" }))
      .mockImplementationOnce(() => ({ modelId: "a", provider: "b" }))
      .mockImplementationOnce(() => ({ modelId: "x", provider: "y" }));
    renderHook(() => useConversationModelOverride("c3" as Id<"conversations">));
    expect(mutate).not.toHaveBeenCalled();
    // Reset mock return for other tests
    useUserDataContextMock = mock(() => ({
      user: { _id: "u1", isAnonymous: false },
    }));
  });

  test("only processes a conversation id once until it changes or resets", () => {
    const mutate = mock(async () => {
      /* noop */
    });
    useMutationMock = mock(() => mutate);
    useQueryMock = mock();
    useQueryMock
      .mockImplementationOnce(() => ({ modelId: "g1", provider: "p1" }))
      .mockImplementationOnce(() => ({ modelId: "g2", provider: "p2" }))
      .mockImplementationOnce(() => ({ modelId: "g1", provider: "p1" }));
    const { rerender } = renderHook(() =>
      useConversationModelOverride("c5" as Id<"conversations">)
    );
    expect(mutate).toHaveBeenCalledTimes(1);
    // Rerender with same id should not call again
    rerender();
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
