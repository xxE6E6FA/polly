import type { Id } from "@convex/_generated/dataModel";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("@/providers/user-data-context", () => ({
  useUserDataContext: vi.fn(() => ({
    user: { _id: "u1", isAnonymous: false },
  })),
}));

import { useMutation, useQuery } from "convex/react";
import { useUserDataContext } from "@/providers/user-data-context";
import { useConversationModelOverride } from "./use-conversation-model-override";

describe("useConversationModelOverride", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls selectModel when last used differs from current selection", () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useQuery as unknown as vi.Mock)
      // lastUsedModel
      .mockReturnValueOnce({ modelId: "gpt", provider: "openai" })
      // currentSelectedModel
      .mockReturnValueOnce({ modelId: "other", provider: "x" });

    renderHook(() => useConversationModelOverride("c1" as Id<"conversations">));

    expect(mutate).toHaveBeenCalledWith({ modelId: "gpt", provider: "openai" });
  });

  it("does not call when models match", () => {
    const mutate = vi.fn(async () => {
      /* noop */
    });
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useQuery as unknown as vi.Mock)
      .mockReturnValueOnce({ modelId: "m", provider: "p" })
      .mockReturnValueOnce({ modelId: "m", provider: "p" });
    renderHook(() => useConversationModelOverride("c2" as Id<"conversations">));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not call when user is anonymous", () => {
    // Force anonymous user for this test
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { _id: "u1", isAnonymous: true },
    });
    const mutate = vi.fn(async () => {
      /* noop */
    });
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useQuery as unknown as vi.Mock)
      .mockReturnValueOnce({ modelId: "x", provider: "y" })
      .mockReturnValueOnce({ modelId: "a", provider: "b" });
    renderHook(() => useConversationModelOverride("c3" as Id<"conversations">));
    expect(mutate).not.toHaveBeenCalled();
    // Reset mock return for other tests
    (useUserDataContext as unknown as vi.Mock).mockReturnValue({
      user: { _id: "u1", isAnonymous: false },
    });
  });

  it("only processes a conversation id once until it changes or resets", () => {
    const mutate = vi.fn(async () => {
      /* noop */
    });
    (useMutation as unknown as vi.Mock).mockReturnValue(mutate);
    (useQuery as unknown as vi.Mock)
      .mockReturnValueOnce({ modelId: "g1", provider: "p1" })
      .mockReturnValueOnce({ modelId: "g2", provider: "p2" });
    const { rerender } = renderHook(() =>
      useConversationModelOverride("c5" as Id<"conversations">)
    );
    expect(mutate).toHaveBeenCalledTimes(1);
    // Rerender with same id should not call again
    rerender();
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
