import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({
  useConvex: vi.fn(),
}));
vi.mock("@/routes", () => ({
  preloadChatConversation: vi.fn(),
}));

import { useConvex } from "convex/react";
import { preloadChatConversation } from "@/routes";
import { useConversationPreload } from "./use-conversation-preload";

describe("useConversationPreload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  it("preloads conversation data after debounce and caches it", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ access: true })
      .mockResolvedValueOnce(["m1"])
      .mockResolvedValueOnce({ modelId: "m", provider: "p" })
      .mockResolvedValueOnce({ streaming: false });
    (useConvex as unknown as vi.Mock).mockReturnValue({ query });

    const { result } = renderHook(() => useConversationPreload());

    await act(async () => {
      result.current.preloadConversation("c1" as Id<"conversations">);
      vi.advanceTimersByTime(200);
      // Flush microtasks from Promise.all inside the debounce
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(preloadChatConversation).toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(4);

    const cached = result.current.getCachedData("c1" as Id<"conversations">);
    expect(cached).not.toBeNull();
    expect(cached?.isActive).toBe(false);

    // Mark active and ensure subsequent preloads are ignored
    act(() =>
      result.current.markConversationActive("c1" as Id<"conversations">)
    );
    act(() => {
      result.current.preloadConversation("c1" as Id<"conversations">);
      vi.advanceTimersByTime(200);
    });
    expect(query).toHaveBeenCalledTimes(4);

    // TTL expiry clears cache
    vi.setSystemTime(new Date(6 * 60 * 1000));
    const expired = result.current.getCachedData("c1" as Id<"conversations">);
    expect(expired).toBeNull();

    // Clearing functions
    act(() =>
      result.current.clearConversationCache("c1" as Id<"conversations">)
    );
    act(() => result.current.clearPreloadCache());
  });
});
