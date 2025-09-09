import { describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

import { useQuery } from "convex/react";
import { useMessageSentCount } from "./use-message-sent-count";

describe("useMessageSentCount", () => {
  it("returns zeros when query undefined", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() => useMessageSentCount());
    expect(result.current).toEqual({ messagesSent: 0, monthlyMessagesSent: 0 });
  });

  it("maps query values to fields", () => {
    (useQuery as unknown as vi.Mock).mockReturnValue({
      messagesSent: 5,
      monthlyMessagesSent: 12,
    });
    const { result } = renderHook(() => useMessageSentCount());
    expect(result.current).toEqual({
      messagesSent: 5,
      monthlyMessagesSent: 12,
    });
  });
});
