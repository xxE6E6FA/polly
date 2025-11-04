import { beforeEach, describe, expect, mock, test } from "bun:test";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { renderHook } from "../test/hook-utils";
import {
  getDefaultReasoningConfig,
  useLastMessageReasoningConfig,
} from "./message-reasoning-utils";

let useQueryMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

describe("message-reasoning-utils", () => {
  beforeEach(() => {
    useQueryMock = mock();
  });

  test("getDefaultReasoningConfig returns disabled, medium effort", () => {
    const cfg = getDefaultReasoningConfig();
    expect(cfg).toEqual({ enabled: false, effort: "medium" });
  });

  test("useLastMessageReasoningConfig returns null when query undefined", () => {
    useQueryMock.mockReturnValue(undefined);

    const { result } = renderHook(() => useLastMessageReasoningConfig("c1"));
    expect(result.current).toBeNull();
    expect(useQueryMock).toHaveBeenCalledWith(api.messages.list, {
      conversationId: "c1",
      paginationOpts: { numItems: 10, cursor: null },
    });
  });

  test("useLastMessageReasoningConfig handles array results", () => {
    const reasoningConfig = { enabled: true, effort: "high" };
    const messages: Doc<"messages">[] = [
      {
        role: "assistant",
      } as unknown as Doc<"messages">,
      {
        role: "user",
        reasoningConfig,
      } as unknown as Doc<"messages">,
    ];

    useQueryMock.mockReturnValue(messages);

    const { result } = renderHook(() => useLastMessageReasoningConfig("c1"));
    expect(result.current).toEqual(reasoningConfig);
  });

  test("useLastMessageReasoningConfig handles paginated responses", () => {
    const reasoningConfig = { enabled: true, effort: "medium" };
    const paginated = {
      page: [
        {
          role: "user",
          reasoningConfig,
        } as unknown as Doc<"messages">,
      ],
      isDone: true,
    };

    useQueryMock.mockReturnValue(paginated);

    const { result } = renderHook(() => useLastMessageReasoningConfig("c1"));
    expect(result.current).toEqual(reasoningConfig);
  });
});
