import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("convex/react", () => ({
  useConvex: vi.fn(),
  useAction: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useNavigate: vi.fn() }));
vi.mock("@/lib/ai/image-generation-handlers", () => ({
  handleImageGeneration: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useNavigate } from "react-router-dom";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { useChatInputImageGeneration } from "./use-chat-input-image-generation";

describe("useChatInputImageGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when model missing", async () => {
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({
      action: vi.fn(),
    });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "hello",
        imageParams: { model: "", prompt: "test prompt" },
        generationMode: "image",
        onResetInputState: vi.fn(),
      })
    );
    await expect(result.current.handleImageGenerationSubmit()).rejects.toThrow(
      /Replicate model ID/
    );
  });

  it("handles submission for existing conversation and resets state", async () => {
    const action = vi
      .fn()
      // createUserMessage
      .mockResolvedValueOnce({ userMessageId: "m1" })
      // handleImageGeneration calls are separate
      .mockResolvedValue({});
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({ action });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    (handleImageGeneration as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    const onReset = vi.fn();

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "  hello  ",
        imageParams: { model: "replicate/xx", prompt: "test prompt" },
        generationMode: "image",
        onResetInputState: onReset,
      })
    );

    await act(async () => {
      await result.current.handleImageGenerationSubmit();
    });
    expect(action).toHaveBeenCalled();
    expect(handleImageGeneration).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "m1",
      "hello",
      expect.objectContaining({ model: "replicate/xx" })
    );
    expect(onReset).toHaveBeenCalled();
  });

  it("creates new conversation when none exists and navigates", async () => {
    const navigate = vi.fn();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(navigate);
    const action = vi
      .fn()
      // createConversationAction
      .mockResolvedValueOnce({ conversationId: "newC" })
      // createUserMessage
      .mockResolvedValueOnce({ userMessageId: "m2" });
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({ action });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    (handleImageGeneration as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );
    const onReset = vi.fn();

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: undefined,
        selectedPersonaId: null,
        input: "hi",
        imageParams: { model: "replicate/xx", prompt: "test prompt" },
        generationMode: "image",
        onResetInputState: onReset,
      })
    );

    await act(async () => {
      await result.current.handleImageGenerationSubmit();
    });
    expect(navigate).toHaveBeenCalledWith(
      expect.stringContaining("/chat/newC")
    );
    expect(onReset).toHaveBeenCalled();
  });

  it("handleSendAsNewConversation optionally navigates and returns id", async () => {
    const navigate = vi.fn();
    (useNavigate as ReturnType<typeof vi.fn>).mockReturnValue(navigate);
    const generateSummary = vi.fn().mockResolvedValue("summary");
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(generateSummary);
    const action = vi
      .fn()
      // createConversationAction
      .mockResolvedValueOnce({ conversationId: "nc" })
      // createUserMessage
      .mockResolvedValueOnce({ userMessageId: "m3" });
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({ action });
    (handleImageGeneration as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const onReset = vi.fn();
    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: "p1" as Id<"personas">,
        input: "query",
        imageParams: { model: "replicate/xx", prompt: "test prompt" },
        generationMode: "image",
        onResetInputState: onReset,
      })
    );

    // Should navigate by default and return new id
    await result.current.handleSendAsNewConversation();
    expect(navigate).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();

    vi.clearAllMocks();
    // Should not navigate when shouldNavigate=false and accept override persona
    await result.current.handleSendAsNewConversation(
      false,
      "p2" as Id<"personas">
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
