import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import React, { type PropsWithChildren } from "react";
import {
  createChatUIStore,
  getChatUIStore,
  setChatUIStoreApi,
} from "@/stores/chat-ui-store";
import type { ConversationId } from "@/types";
import { TestProviders } from "../../test/TestProviders";
import { useChatFullscreen } from "./use-chat-fullscreen";

function wrapper({ children }: PropsWithChildren) {
  return <TestProviders>{children}</TestProviders>;
}

const originalConsoleError = console.error;
const originalStore = getChatUIStore();

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  setChatUIStoreApi(createChatUIStore());
  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
});

afterAll(() => {
  console.error = originalConsoleError;
  setChatUIStoreApi(originalStore);
});

describe("useChatFullscreen", () => {
  test("toggles fullscreen state and resets via clearOnSend", async () => {
    const { result } = renderHook(
      () => useChatFullscreen("conv-1" as ConversationId),
      {
        wrapper: wrapper,
      }
    );

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isMultiline).toBe(false);
    expect(result.current.isTransitioning).toBe(false);

    act(() => {
      result.current.toggleFullscreen();
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(true);
    });

    act(() => {
      result.current.onHeightChange(true);
    });

    expect(result.current.isMultiline).toBe(true);

    act(() => {
      result.current.setTransitioning(true);
    });

    expect(result.current.isTransitioning).toBe(true);

    act(() => {
      result.current.clearOnSend();
    });

    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isMultiline).toBe(false);
  });

  test("closeFullscreen forces false regardless of prior state", async () => {
    const { result } = renderHook(() => useChatFullscreen(), {
      wrapper: wrapper,
    });

    act(() => {
      result.current.setFullscreen(true);
    });

    await waitFor(() => {
      expect(result.current.isFullscreen).toBe(true);
    });

    act(() => {
      result.current.closeFullscreen();
    });

    expect(result.current.isFullscreen).toBe(false);
  });
});
