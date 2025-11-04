import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";

let useConvexMock: ReturnType<typeof mock>;
let useActionMock: ReturnType<typeof mock>;
let useConvexFileUploadMock: ReturnType<typeof mock>;
let usePrivateModeMock: ReturnType<typeof mock>;
let useNavigateMock: ReturnType<typeof mock>;
let handleImageGenerationMock: ReturnType<typeof mock>;
let useEnabledImageModelsMock: ReturnType<typeof mock>;
let useImageParamsMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useConvex: (...args: unknown[]) => useConvexMock(...args),
  useAction: (...args: unknown[]) => useActionMock(...args),
}));
mock.module("@convex/_generated/api", () => ({
  api: {
    conversationSummary: {
      generateConversationSummary:
        "conversationSummary:generateConversationSummary",
    },
    conversations: {
      createUserMessage: "conversations:createUserMessage",
      createConversationAction: "conversations:createConversationAction",
    },
  },
}));
mock.module("@/hooks/use-convex-file-upload", () => ({
  useConvexFileUpload: (...args: unknown[]) => useConvexFileUploadMock(...args),
}));
mock.module("@/providers/private-mode-context", () => ({
  usePrivateMode: (...args: unknown[]) => usePrivateModeMock(...args),
}));
mock.module("react-router-dom", () => ({
  useNavigate: (...args: unknown[]) => useNavigateMock(...args),
}));
mock.module("@/lib/ai/image-generation-handlers", () => ({
  handleImageGeneration: (...args: unknown[]) =>
    handleImageGenerationMock(...args),
}));
mock.module("@/hooks/use-enabled-image-models", () => ({
  useEnabledImageModels: (...args: unknown[]) =>
    useEnabledImageModelsMock(...args),
}));
mock.module("@/hooks/use-generation", () => ({
  useImageParams: (...args: unknown[]) => useImageParamsMock(...args),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useAction, useConvex } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useConvexFileUpload } from "@/hooks/use-convex-file-upload";
import { useEnabledImageModels } from "@/hooks/use-enabled-image-models";
import { useImageParams } from "@/hooks/use-generation";
import { usePrivateMode } from "@/providers/private-mode-context";
import { useChatInputImageGeneration } from "./use-chat-input-image-generation";

describe("useChatInputImageGeneration", () => {
  beforeEach(() => {
    useConvexFileUploadMock = mock();
    usePrivateModeMock = mock();
    useEnabledImageModelsMock = mock();
    useImageParamsMock = mock();
    useConvexMock = mock();
    useActionMock = mock();
    useNavigateMock = mock();
    handleImageGenerationMock = mock();

    useConvexFileUploadMock.mockReturnValue({
      uploadFile: mock(),
    });
    usePrivateModeMock.mockReturnValue({
      isPrivateMode: false,
    });
    useEnabledImageModelsMock.mockReturnValue([]);
    useImageParamsMock.mockReturnValue({
      setParams: mock(),
      setNegativePromptEnabled: mock(),
    });
  });

  test("throws when model missing", async () => {
    useConvexMock.mockReturnValue({
      action: mock(),
    });
    useActionMock.mockReturnValue(mock());
    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "hello",
        imageParams: { model: "", prompt: "test prompt" },
        generationMode: "image",
        onResetInputState: mock(),
      })
    );
    await expect(result.current.handleImageGenerationSubmit()).rejects.toThrow(
      /Replicate model ID/
    );
  });

  test("handles submission for existing conversation and resets state", async () => {
    const action = mock()
      .mockResolvedValueOnce({ userMessageId: "m1" })
      .mockResolvedValue({});
    useConvexMock.mockReturnValue({ action });
    useActionMock.mockReturnValue(mock());
    handleImageGenerationMock.mockResolvedValue(undefined);
    const onReset = mock();

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
    const firstCall = (action.mock.calls as unknown[])[0] as
      | [unknown, Record<string, unknown>]
      | undefined;
    const firstPayload = firstCall?.[1];
    expect(firstPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });
    expect(handleImageGenerationMock).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      "m1",
      "hello",
      expect.objectContaining({ model: "replicate/xx" })
    );
    expect(onReset).toHaveBeenCalled();
  });

  test("creates new conversation when none exists and navigates", async () => {
    const navigate = mock();
    useNavigateMock.mockReturnValue(navigate);
    const action = mock()
      .mockResolvedValueOnce({ conversationId: "newC" })
      .mockResolvedValueOnce({ userMessageId: "m2" });
    useConvexMock.mockReturnValue({ action });
    useActionMock.mockReturnValue(mock());
    handleImageGenerationMock.mockResolvedValue(undefined);
    const onReset = mock();

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
    const secondCall = (action.mock.calls as unknown[])[1] as
      | [unknown, Record<string, unknown>]
      | undefined;
    const secondPayload = secondCall?.[1];
    expect(secondPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });
    expect(onReset).toHaveBeenCalled();
  });

  test("uploads attachments in non-private mode and sends storage-backed refs", async () => {
    // polyfill atob for Node
    (globalThis as unknown as { atob: (b64: string) => string }).atob = (
      b64: string
    ) => Buffer.from(b64, "base64").toString("binary");

    const uploadFile = mock().mockResolvedValue({
      type: "image",
      storageId: "s1",
      name: "ref.png",
      url: "",
      mimeType: "image/png",
      size: 4,
    });
    useConvexFileUploadMock.mockReturnValue({ uploadFile });

    const action = mock().mockResolvedValue({ userMessageId: "m1" });
    useConvexMock.mockReturnValue({ action });
    useActionMock.mockReturnValue(mock());
    handleImageGenerationMock.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "hi",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: mock(),
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
    const uploadCall = (action.mock.calls[0] ?? []) as [
      unknown,
      { attachments?: Record<string, unknown>[] },
    ];
    const callPayload = uploadCall[1] ?? {};
    expect(callPayload.attachments?.[0]).toMatchObject({
      storageId: "s1",
      type: "image",
    });
    expect(callPayload).toMatchObject({
      model: "seedream/4",
      provider: "replicate",
    });
  });

  test("uses data URLs for attachments in private mode", async () => {
    usePrivateModeMock.mockReturnValue({
      isPrivateMode: true,
    });
    const action = mock().mockResolvedValue({ userMessageId: "m1" });
    useConvexMock.mockReturnValue({ action });
    useActionMock.mockReturnValue(mock());
    handleImageGenerationMock.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "hi",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: mock(),
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
    const uploadCall = (action.mock.calls[0] ?? []) as [
      unknown,
      { attachments?: Record<string, unknown>[] },
    ];
    const callPayload = uploadCall[1] ?? {};
    expect(callPayload.attachments?.[0]?.url).toMatch(
      /^data:image\/png;base64,AQID/
    );
    expect(callPayload).toMatchObject({
      model: "seedream/4",
      provider: "replicate",
    });
  });

  test("handleSendAsNewConversation optionally navigates and returns id", async () => {
    const navigate = mock();
    useNavigateMock.mockReturnValue(navigate);
    const generateSummary = mock().mockResolvedValue("summary");
    useActionMock.mockReturnValue(generateSummary);
    const action = mock()
      .mockResolvedValueOnce({ conversationId: "nc" })
      .mockResolvedValueOnce({ userMessageId: "m3" });
    useConvexMock.mockReturnValue({ action });
    handleImageGenerationMock.mockResolvedValue(undefined);

    const onReset = mock();
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

    const secondCall = (action.mock.calls[1] ?? []) as [
      unknown,
      Record<string, unknown> | undefined,
    ];
    const secondPayload = secondCall[1];
    expect(secondPayload).toMatchObject({
      model: "replicate/xx",
      provider: "replicate",
    });

    // Should not navigate when shouldNavigate=false and accept override persona
    navigate.mockClear();
    await result.current.handleSendAsNewConversation(
      false,
      "p2" as Id<"personas">
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  test("returns capability flags when enabled model matches selection", () => {
    useEnabledImageModelsMock.mockReturnValue([
      {
        modelId: "seedream/4",
        name: "Seedream",
        supportsMultipleImages: true,
        supportsNegativePrompt: true,
      },
    ]);
    useConvexMock.mockReturnValue({
      action: mock(),
    });
    useActionMock.mockReturnValue(mock());

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "prompt",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: mock(),
      })
    );

    expect(result.current.selectedImageModel).toEqual({
      modelId: "seedream/4",
      supportsMultipleImages: true,
      supportsNegativePrompt: true,
    });
  });

  test("falls back to defaults when model capabilities unavailable", () => {
    useEnabledImageModelsMock.mockReturnValue([
      {
        modelId: "other/model",
        name: "Other",
        supportsMultipleImages: true,
        supportsNegativePrompt: true,
      },
    ]);
    useConvexMock.mockReturnValue({
      action: mock(),
    });
    useActionMock.mockReturnValue(mock());

    const { result } = renderHook(() =>
      useChatInputImageGeneration({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        input: "prompt",
        imageParams: { model: "seedream/4", prompt: "" },
        generationMode: "image",
        onResetInputState: mock(),
      })
    );

    expect(result.current.selectedImageModel).toEqual({
      modelId: "seedream/4",
      supportsMultipleImages: false,
      supportsNegativePrompt: false,
    });
  });
});
