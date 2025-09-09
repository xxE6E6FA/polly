import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("convex/react", () => ({ useConvex: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: vi.fn() }));
vi.mock("@/lib/ai/image-generation-handlers", () => ({
  handleImageGeneration: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useConvex } from "convex/react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { useSubmitLogic } from "./use-submit-logic";

describe("useSubmitLogic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when image mode without model", async () => {
    (useConvex as unknown as vi.Mock).mockReturnValue({ action: vi.fn() });
    const { result } = renderHook(() =>
      useSubmitLogic({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        generationMode: "image",
        imageParams: { model: "" },
        setInput: vi.fn(),
        setAttachments: vi.fn(),
        resetImageParams: vi.fn(),
        clearChatInputState: vi.fn(),
        shouldUsePreservedState: false,
        textareaRef: { current: null },
      })
    );
    await expect(result.current.submit()).rejects.toThrow(/Replicate model ID/);
  });

  it("submits image mode in existing conversation and resets form state", async () => {
    const action = vi.fn().mockResolvedValueOnce({ userMessageId: "m1" });
    (useConvex as unknown as vi.Mock).mockReturnValue({ action });
    (handleImageGeneration as unknown as vi.Mock).mockResolvedValue(undefined);
    const navigate = vi.fn();
    (useNavigate as unknown as vi.Mock).mockReturnValue(navigate);

    const setInput = vi.fn();
    const setAttachments = vi.fn();
    const reset = vi.fn();
    const clearPreserved = vi.fn();
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
    expect(handleImageGeneration).toHaveBeenCalledWith(
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

  it("creates new conversation in image mode and navigates", async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ conversationId: "newC" })
      .mockResolvedValueOnce({ userMessageId: "m2" });
    (useConvex as unknown as vi.Mock).mockReturnValue({ action });
    (handleImageGeneration as unknown as vi.Mock).mockResolvedValue(undefined);
    const navigate = vi.fn();
    (useNavigate as unknown as vi.Mock).mockReturnValue(navigate);

    const setInput = vi.fn();
    const setAttachments = vi.fn();
    const reset = vi.fn();
    const { result } = renderHook(() =>
      useSubmitLogic({
        conversationId: undefined,
        selectedPersonaId: null,
        generationMode: "image",
        imageParams: { model: "replicate/xx" },
        setInput,
        setAttachments,
        resetImageParams: reset,
        clearChatInputState: vi.fn(),
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
  });

  it("text mode still resets state without calling image handlers", async () => {
    (useConvex as unknown as vi.Mock).mockReturnValue({ action: vi.fn() });
    const setInput = vi.fn();
    const setAttachments = vi.fn();
    const reset = vi.fn();
    const clear = vi.fn();

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
