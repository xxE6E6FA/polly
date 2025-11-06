import { beforeEach, describe, expect, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useClearOnConversationChange } from "./use-clear-on-conversation-change";

describe("useClearOnConversationChange", () => {
  const mockClear = mock(() => {
    /* empty */
  });

  beforeEach(() => {
    mockClear.mockClear();
  });

  test("does not call clear on initial mount", () => {
    renderHook(() => useClearOnConversationChange("conversation-1", mockClear));
    expect(mockClear).not.toHaveBeenCalled();
  });

  test("calls clear when key changes", () => {
    const { rerender } = renderHook(
      ({ key }) => useClearOnConversationChange(key, mockClear),
      {
        initialProps: { key: "conversation-1" },
      }
    );

    // Change the key
    rerender({ key: "conversation-2" });

    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledWith("conversation-1");
  });

  test("calls clear with previous key when changing multiple times", () => {
    const { rerender } = renderHook(
      ({ key }) => useClearOnConversationChange(key, mockClear),
      {
        initialProps: { key: "conversation-1" },
      }
    );

    // First change
    rerender({ key: "conversation-2" });
    expect(mockClear).toHaveBeenCalledWith("conversation-1");

    // Second change
    rerender({ key: "conversation-3" });
    expect(mockClear).toHaveBeenCalledWith("conversation-2");

    expect(mockClear).toHaveBeenCalledTimes(2);
  });

  test("does not call clear when key remains the same", () => {
    const { rerender } = renderHook(
      ({ key }) => useClearOnConversationChange(key, mockClear),
      {
        initialProps: { key: "conversation-1" },
      }
    );

    // Rerender with same key
    rerender({ key: "conversation-1" });

    expect(mockClear).not.toHaveBeenCalled();
  });

  test("uses latest clear function", () => {
    const mockClear1 = mock(() => {
      /* empty */
    });
    const mockClear2 = mock(() => {
      /* empty */
    });

    const { rerender } = renderHook(
      ({ key, clear }) => useClearOnConversationChange(key, clear),
      {
        initialProps: { key: "conversation-1", clear: mockClear1 },
      }
    );

    // Update clear function
    rerender({ key: "conversation-1", clear: mockClear2 });

    // Now change key
    rerender({ key: "conversation-2", clear: mockClear2 });

    // Should use the latest clear function (mockClear2)
    expect(mockClear1).not.toHaveBeenCalled();
    expect(mockClear2).toHaveBeenCalledTimes(1);
    expect(mockClear2).toHaveBeenCalledWith("conversation-1");
  });

  test("handles undefined to defined key transition", () => {
    const { rerender } = renderHook(
      ({ key }) => useClearOnConversationChange(key, mockClear),
      {
        initialProps: { key: undefined as unknown as string },
      }
    );

    rerender({ key: "conversation-1" });

    // Should not call clear when transitioning from undefined
    expect(mockClear).not.toHaveBeenCalled();
  });

  test("handles rapid key changes", () => {
    const { rerender } = renderHook(
      ({ key }) => useClearOnConversationChange(key, mockClear),
      {
        initialProps: { key: "conversation-1" },
      }
    );

    rerender({ key: "conversation-2" });
    rerender({ key: "conversation-3" });
    rerender({ key: "conversation-4" });
    rerender({ key: "conversation-5" });

    expect(mockClear).toHaveBeenCalledTimes(4);
    expect(mockClear).toHaveBeenNthCalledWith(1, "conversation-1");
    expect(mockClear).toHaveBeenNthCalledWith(2, "conversation-2");
    expect(mockClear).toHaveBeenNthCalledWith(3, "conversation-3");
    expect(mockClear).toHaveBeenNthCalledWith(4, "conversation-4");
  });
});
