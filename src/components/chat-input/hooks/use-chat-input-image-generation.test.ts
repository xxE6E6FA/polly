import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../../../test/hook-utils";

vi.mock("convex/react", () => ({
  useConvex: vi.fn(),
  useAction: vi.fn(),
}));
vi.mock("@/hooks/use-convex-file-upload", () => ({
  useConvexFileUpload: vi.fn(),
}));
vi.mock("@/providers/private-mode-context", () => ({
  usePrivateMode: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useNavigate: vi.fn() }));
vi.mock("@/lib/ai/image-generation-handlers", () => ({
  handleImageGeneration: vi.fn(),
}));
vi.mock("@/hooks/use-enabled-image-models", () => ({
  useEnabledImageModels: vi.fn(),
}));
vi.mock("@/hooks/use-generation", () => ({
  useImageParams: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useImageParams } from "@/hooks/use-generation";
import { handleImageGeneration } from "@/lib/ai/image-generation-handlers";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useChatInputImageGeneration } from "./use-chat-input-image-generation";

describe("useChatInputImageGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useConvexFileUpload as ReturnType<typeof vi.fn>).mockReturnValue({
      uploadFile: vi.fn(),
    });
    (usePrivateMode as ReturnType<typeof vi.fn>).mockReturnValue({
      isPrivateMode: false,
    });
    (useEnabledImageModels as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (useImageParams as ReturnType<typeof vi.fn>).mockReturnValue({
      setParams: vi.fn(),
      setNegativePromptEnabled: vi.fn(),
    });
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
    const [, firstPayload] = action.mock.calls[0];
    expect(firstPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });
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
    const [, secondPayload] = action.mock.calls[1];
    expect(secondPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });
    expect(onReset).toHaveBeenCalled();
  });

  it("uploads attachments in non-private mode and sends storage-backed refs", async () => {
    // polyfill atob for Node
    (globalThis as unknown as { atob: (b64: string) => string }).atob = (
      b64: string
    ) => Buffer.from(b64, "base64").toString("binary");

    const uploadFile = vi.fn().mockResolvedValue({
      type: "image",
      storageId: "s1",
      name: "ref.png",
      url: "",
      mimeType: "image/png",
      size: 4,
    });
    (useConvexFileUpload as unknown as vi.Mock).mockReturnValue({ uploadFile });

    const action = vi.fn().mockResolvedValue({ userMessageId: "m1" });
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({ action });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    (handleImageGeneration as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "hi",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: vi.fn(),
        attachments: [
          {
            type: "image",
            content: "AQID",
            mimeType: "image/png",
            name: "ref.png",
            url: "",
            size: 4,
          },
        ],
      })
    );

    await act(async () => {
      await result.current.handleImageGenerationSubmit();
    });

    expect(uploadFile).toHaveBeenCalled();
    // attachments passed to createUserMessage should include storage-backed item
    const call = (useConvex as unknown as vi.Mock).mock.results[0].value.action
      .mock.calls[0][1];
    expect(call.attachments[0]).toMatchObject({
      storageId: "s1",
      type: "image",
    });
    expect(call).toMatchObject({ model: "seedream/4", provider: "replicate" });
  });

  it("uses data URLs for attachments in private mode", async () => {
    (usePrivateMode as unknown as vi.Mock).mockReturnValue({
      isPrivateMode: true,
    });
    const action = vi.fn().mockResolvedValue({ userMessageId: "m1" });
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({ action });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    (handleImageGeneration as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined
    );

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "hi",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: vi.fn(),
        attachments: [
          {
            type: "image",
            content: "AQID",
            mimeType: "image/png",
            name: "ref.png",
            url: "",
            size: 4,
          },
        ],
      })
    );

    await act(async () => {
      await result.current.handleImageGenerationSubmit();
    });
    const call = (useConvex as unknown as vi.Mock).mock.results[0].value.action
      .mock.calls[0][1];
    expect(call.attachments[0].url).toMatch(/^data:image\/png;base64,AQID/);
    expect(call).toMatchObject({ model: "seedream/4", provider: "replicate" });
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

    const [, secondPayload] = action.mock.calls[1];
    expect(secondPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });

    vi.clearAllMocks();
    // Should not navigate when shouldNavigate=false and accept override persona
    await result.current.handleSendAsNewConversation(
      false,
      "p2" as Id<"personas">
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("returns capability flags when enabled model matches selection", () => {
    (useEnabledImageModels as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        modelId: "seedream/4",
        name: "Seedream",
        supportsMultipleImages: true,
        supportsNegativePrompt: true,
      },
    ]);
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({
      action: vi.fn(),
    });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "prompt",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: vi.fn(),
      })
    );

    expect(result.current.selectedImageModel).toEqual({
      modelId: "seedream/4",
      supportsMultipleImages: true,
      supportsNegativePrompt: true,
    });
  });

  it("falls back to defaults when model capabilities unavailable", () => {
    (useEnabledImageModels as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        modelId: "other/model",
        name: "Other",
        supportsMultipleImages: true,
        supportsNegativePrompt: true,
      },
    ]);
    (useConvex as ReturnType<typeof vi.fn>).mockReturnValue({
      action: vi.fn(),
    });
    (useAction as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "prompt",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: vi.fn(),
      })
    );

    expect(result.current.selectedImageModel).toEqual({
      modelId: "seedream/4",
      supportsMultipleImages: false,
      supportsNegativePrompt: false,
    });
  });
});
