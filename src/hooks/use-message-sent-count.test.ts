import { describe, expect, mock, test } from "bun:test";
import { renderHook } from "../test/hook-utils";

let useQueryMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

import { useQuery } from "convex/react";
import { useMessageSentCount } from "./use-message-sent-count";

describe("useMessageSentCount", () => {
  test("returns zeros when query undefined", () => {
    useQueryMock = mock(() => undefined);
    const { result } = renderHook(() => useMessageSentCount());
    expect(result.current).toEqual({ messagesSent: 0, monthlyMessagesSent: 0 });
  });

  test("maps query values to fields", () => {
    useQueryMock = mock(() => ({
      messagesSent: 5,
      monthlyMessagesSent: 12,
    }));
    const { result } = renderHook(() => useMessageSentCount());
    expect(result.current).toEqual({
      messagesSent: 5,
      monthlyMessagesSent: 12,
    });
  });
});
