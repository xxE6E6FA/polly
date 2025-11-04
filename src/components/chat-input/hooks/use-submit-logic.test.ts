import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";

let useConvexMock: ReturnType<typeof mock>;
let useNavigateMock: ReturnType<typeof mock>;
let handleImageGenerationMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useConvex: (...args: unknown[]) => useConvexMock(...args),
}));
mock.module("@convex/_generated/api", () => ({
  api: {
    conversations: {
      createUserMessage: "conversations:createUserMessage",
      createConversationAction: "conversations:createConversationAction",
    },
  },
}));
mock.module("react-router-dom", () => ({
  useNavigate: (...args: unknown[]) => useNavigateMock(...args),
}));
mock.module("@/lib/ai/image-generation-handlers", () => ({
  handleImageGeneration: (...args: unknown[]) =>
    handleImageGenerationMock(...args),
}));

import type { Id } from "@convex/_generated/dataModel";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { useSubmitLogic } from "./use-submit-logic";

describe("useSubmitLogic", () => {
  beforeEach(() => {
    useConvexMock = mock();
    useNavigateMock = mock();
    handleImageGenerationMock = mock();
  });

  test("throws when image mode without model", async () => {
    useConvexMock.mockReturnValue({ action: mock() });
    const { result } = renderHook(() =>
      useSubmitLogic({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        generationMode: "image",
        imageParams: { model: "" },
        setInput: mock(),
        setAttachments: mock(),
        resetImageParams: mock(),
        clearChatInputState: mock(),
        shouldUsePreservedState: false,
        textareaRef: { current: null },
      })
    );
    await expect(result.current.submit()).rejects.toThrow(/Replicate model ID/);
  });

  test("submits image mode in existing conversation and resets form state", async () => {
    const action = mock().mockResolvedValueOnce({ userMessageId: "m1" });
    useConvexMock.mockReturnValue({ action });
    handleImageGenerationMock.mockResolvedValue(undefined);
    const navigate = mock();
    useNavigateMock.mockReturnValue(navigate);

    const setInput = mock();
    const setAttachments = mock();
    const reset = mock();
    const clearPreserved = mock();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    const textareaRef = {
      current: textarea,
    } as React.RefObject<HTMLTextAreaElement>;

    const { result } = renderHook(() =>
      useSubmitLogic({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        generationMode: "image",
        imageParams: { model: "replicate/xx", prompt: undefined },
        setInput,
        setAttachments,
        resetImageParams: reset,
        clearChatInputState: clearPreserved,
        shouldUsePreservedState: true,
        textareaRef,
      })
    );

    await act(async () => {
      await result.current.submit();
    });

    expect(action).toHaveBeenCalled();
    expect(action.mock.calls.length).toBeGreaterThan(0);
    const [, firstPayload] = action.mock.calls[0];
    expect(firstPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });
    expect(handleImageGenerationMock).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "m1",
      "",
      expect.objectContaining({ model: "replicate/xx", prompt: "" })
    );
    expect(setInput).toHaveBeenCalledWith("");
    expect(setAttachments).toHaveBeenCalledWith([]);
    expect(reset).toHaveBeenCalled();
    expect(clearPreserved).toHaveBeenCalled();
  });

  test("creates new conversation in image mode and navigates", async () => {
    const action = mock()
      .mockResolvedValueOnce({ conversationId: "newC" })
      .mockResolvedValueOnce({ userMessageId: "m2" });
    useConvexMock.mockReturnValue({ action });
    handleImageGenerationMock.mockResolvedValue(undefined);
    const navigate = mock();
    useNavigateMock.mockReturnValue(navigate);

    const setInput = mock();
    const setAttachments = mock();
    const reset = mock();
    const { result } = renderHook(() =>
      useSubmitLogic({
        conversationId: undefined,
        selectedPersonaId: null,
        generationMode: "image",
        imageParams: { model: "replicate/xx" },
        setInput,
        setAttachments,
        resetImageParams: reset,
        clearChatInputState: mock(),
        shouldUsePreservedState: false,
        textareaRef: { current: null },
      })
    );

    await act(async () => {
      await result.current.submit();
    });
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/chat/newC")
    );
    expect(action.mock.calls.length).toBeGreaterThan(1);
    const [, secondPayload] = action.mock.calls[1];
    expect(secondPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });
  });

  test("text mode still resets state without calling image handlers", async () => {
    useConvexMock.mockReturnValue({ action: mock() });
    const setInput = mock();
    const setAttachments = mock();
    const reset = mock();
    const clear = mock();

    const { result } = renderHook(() =>
      useSubmitLogic({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        generationMode: "text",
        imageParams: { model: "ignored" },
        setInput,
        setAttachments,
        resetImageParams: reset,
        clearChatInputState: clear,
        shouldUsePreservedState: true,
        textareaRef: { current: null },
      })
    );

    await act(async () => {
      await result.current.submit();
    });
    expect(setInput).toHaveBeenCalledWith("");
    expect(setAttachments).toHaveBeenCalledWith([]);
    expect(reset).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });
});
