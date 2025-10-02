import { act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/types";
import { renderHook } from "../../test/hook-utils";

vi.mock("./message-utils", () => ({
  convertServerMessages: vi.fn((s: unknown) => s as unknown[]),
  findStreamingMessage: vi.fn(() => undefined),
  isMessageStreaming: vi.fn(() => false),
}));

import {
  convertServerMessages,
  findStreamingMessage,
  isMessageStreaming,
} from "./message-utils";
import { useMessageState } from "./use-message-state";

describe("use-message-state", () => {
  it("private mode: manages local state and streaming from messages", async () => {
    const { result } = renderHook(() => useMessageState());
    (isMessageStreaming as unknown as vi.Mock).mockImplementation(
      (m: { content?: string }) => {
        return m?.content === "hello";
      }
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages).toEqual([]);

    // add a message
    const m1 = {
      id: "1",
      role: "user",
      content: "hi",
      isMainBranch: true,
      createdAt: Date.now(),
    } as ChatMessage;
    act(() => {
      result.current.addMessage(m1);
    });
    // update a message
    act(() => {
      result.current.updateMessage("1", { content: "hello" });
    });
    // after updates, messages reflect changes
    await waitFor(() => {
      expect(result.current.messages.length).toBe(1);
      expect(result.current.messages[0].content).toBe("hello");
    });

    // streaming computed via isMessageStreaming
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    // clear
    act(() => {
      result.current.clearMessages();
    });
    await waitFor(() => {
      expect(result.current.messages).toEqual([]);
    });
  });

  it("server mode: converts messages, toggles loading, and detects streaming via findStreamingMessage", async () => {
    (convertServerMessages as unknown as vi.Mock).mockImplementation(
      (_s: unknown) => [
        {
          id: "s1",
          role: "user",
          content: "x",
          isMainBranch: true,
          createdAt: 0,
        },
      ]
    );
    (findStreamingMessage as unknown as vi.Mock)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({});

    const resultRef = renderHook(
      (p?: { conversationId?: string; serverMessages?: unknown }) =>
        useMessageState(p?.conversationId as any, p?.serverMessages),
      {
        initialProps: {
          conversationId: "c1",
          serverMessages: [{ id: "raw" }],
        },
      }
    );

    // initial with data present should be converted
    expect(resultRef.result.current.isLoading).toBe(false);
    expect(resultRef.result.current.messages[0].id).toBe("s1");
    expect(resultRef.result.current.isStreaming).toBe(false);

    // simulate server streaming later
    resultRef.rerender({
      conversationId: "c1",
      serverMessages: [{ id: "raw2" }],
    });
    await waitFor(() => {
      expect(resultRef.result.current.isStreaming).toBe(true);
    });

    // when serverMessages missing, loading true
    resultRef.rerender({
      conversationId: "c1",
      serverMessages: undefined as any,
    });
    await waitFor(() => {
      expect(resultRef.result.current.isLoading).toBe(true);
    });
  });
});
