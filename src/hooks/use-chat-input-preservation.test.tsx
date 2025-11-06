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
import type { ConversationId } from "@/types";
import { TestProviders } from "../../test/TestProviders";
import { useChatInputPreservation } from "./use-chat-input-preservation";

function wrapper({ children }: PropsWithChildren) {
  return <TestProviders>{children}</TestProviders>;
}

const originalConsoleError = console.error;

beforeEach(() => {
  console.error = ((message?: unknown, ...rest: unknown[]) => {
    if (typeof message === "string" && message.includes("act")) {
      throw new Error(message);
    }
    originalConsoleError(message, ...rest);
  }) as typeof console.error;

  localStorage.clear();
});

afterEach(() => {
  console.error = originalConsoleError;
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe("useChatInputPreservation", () => {
  test("stores and retrieves global state while avoiding unnecessary writes", async () => {
    const { result } = renderHook(() => useChatInputPreservation(), {
      wrapper: wrapper,
    });

    expect(result.current.getChatInputState()).toMatchObject({
      input: "",
      attachments: [],
      reasoningConfig: expect.objectContaining({ enabled: false }),
      temperature: undefined,
    });

    const firstGlobal = result.current.getChatInputState();

    act(() => {
      result.current.setChatInputState({ input: "Hello there" });
    });

    await waitFor(() => {
      expect(result.current.getChatInputState()).toMatchObject({
        input: "Hello there",
      });
    });

    const secondGlobal = result.current.getChatInputState();
    expect(secondGlobal).not.toBe(firstGlobal);

    act(() => {
      result.current.setChatInputState({ input: "Hello there" });
    });

    expect(result.current.getChatInputState()).toBe(secondGlobal);

    act(() => {
      result.current.clearChatInputState();
    });

    expect(result.current.getChatInputState()).toMatchObject({
      input: "",
    });
  });

  test("keeps per-conversation state separate from global state", async () => {
    const { result } = renderHook(() => useChatInputPreservation(), {
      wrapper: wrapper,
    });

    act(() => {
      result.current.setChatInputState(
        { input: "First draft", temperature: 0.5 },
        "conv-1" as ConversationId
      );
      result.current.setChatInputState(
        { input: "Second draft", temperature: 0.8 },
        "conv-2" as ConversationId
      );
    });

    await waitFor(() => {
      expect(
        result.current.getChatInputState("conv-1" as ConversationId)
      ).toMatchObject({
        input: "First draft",
        temperature: 0.5,
      });
      expect(
        result.current.getChatInputState("conv-2" as ConversationId)
      ).toMatchObject({
        input: "Second draft",
        temperature: 0.8,
      });
    });

    expect(result.current.getChatInputState()).toMatchObject({
      input: "",
    });

    const convState = result.current.getChatInputState(
      "conv-1" as ConversationId
    );

    act(() => {
      result.current.setChatInputState(
        { input: "First draft" },
        "conv-1" as ConversationId
      );
    });

    expect(result.current.getChatInputState("conv-1" as ConversationId)).toBe(
      convState
    );

    act(() => {
      result.current.clearChatInputState("conv-1" as ConversationId);
    });

    expect(
      result.current.getChatInputState("conv-1" as ConversationId)
    ).toMatchObject({
      input: "",
    });
  });

  test("clears all conversation states and resets global defaults", () => {
    const { result } = renderHook(() => useChatInputPreservation(), {
      wrapper: wrapper,
    });

    act(() => {
      result.current.setChatInputState({ input: "Global" });
      result.current.setChatInputState(
        { input: "Per-conversation" },
        "conv-3" as ConversationId
      );
    });

    expect(result.current.getChatInputState()).toMatchObject({
      input: "Global",
    });
    expect(
      result.current.getChatInputState("conv-3" as ConversationId)
    ).toMatchObject({
      input: "Per-conversation",
    });

    act(() => {
      result.current.clearAllConversationStates();
    });

    expect(result.current.getChatInputState()).toMatchObject({ input: "" });
    expect(
      result.current.getChatInputState("conv-3" as ConversationId)
    ).toMatchObject({
      input: "",
    });
  });
});
