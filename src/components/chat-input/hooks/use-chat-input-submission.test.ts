import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act } from "@testing-library/react";
import { renderHook } from "../../../test/hook-utils";
import { mockModuleWithRestore } from "../../../test/utils";

let useActionMock: ReturnType<typeof mock>;
let useConvexFileUploadMock: ReturnType<typeof mock>;
let useNotificationDialogMock: ReturnType<typeof mock>;
let useReasoningConfigMock: ReturnType<typeof mock>;
let usePrivateModeMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useAction: (...args: unknown[]) => useActionMock(...args),
}));
mock.module("@convex/_generated/api", () => ({
  api: {
    conversationSummary: {
      generateConversationSummary:
        "conversationSummary:generateConversationSummary",
    },
  },
}));
mock.module("@/hooks/use-convex-file-upload", () => ({
  useConvexFileUpload: (...args: unknown[]) => useConvexFileUploadMock(...args),
}));
mock.module("@/hooks/use-dialog-management", () => ({
  useNotificationDialog: (...args: unknown[]) =>
    useNotificationDialogMock(...args),
}));
mock.module("@/hooks/use-reasoning", () => ({
  useReasoningConfig: (...args: unknown[]) => useReasoningConfigMock(...args),
}));

await mockModuleWithRestore("@/providers/private-mode-context", actual => ({
  ...actual,
  usePrivateMode: (...args: unknown[]) => usePrivateModeMock(...args),
}));

import type { Id } from "@convex/_generated/dataModel";
import type { Attachment } from "@/types";
import { useChatInputSubmission } from "./use-chat-input-submission";

describe("useChatInputSubmission", () => {
  beforeEach(() => {
    useActionMock = mock();
    useConvexFileUploadMock = mock();
    useNotificationDialogMock = mock();
    useReasoningConfigMock = mock();
    usePrivateModeMock = mock();

    useActionMock.mockReturnValue(mock());
    useConvexFileUploadMock.mockReturnValue({ uploadFile: mock() });
    useNotificationDialogMock.mockReturnValue({ notify: mock() });
    useReasoningConfigMock.mockReturnValue([{ enabled: false }, mock()]);
    usePrivateModeMock.mockReturnValue({ isPrivateMode: false });
  });

  test("early returns when input and attachments are empty", async () => {
    const onSendMessage = mock();
    const { result } = renderHook(() =>
      useChatInputSubmission({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: null,
        temperature: 0.5,
        onSendMessage,
        onSendAsNewConversation: mock(),
        handleImageGenerationSubmit: mock(),
        handleImageGenerationSendAsNew: mock(),
        onResetInputState: mock(),
      })
    );
    await act(async () => {
      await result.current.submit("   ", [], "text");
    });
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(result.current.isProcessing).toBe(false);
  });

  test("handles image mode submit and resets state; errors show notification", async () => {
    const ok = mock().mockResolvedValue(undefined);
    const onReset = mock();
    const notify = mock();
    useNotificationDialogMock.mockReturnValue({ notify });
    const { result, rerender } = renderHook(
      ({ handler }) =>
        useChatInputSubmission({
          conversationId: "c1" as Id<"conversations">,
          selectedPersonaId: null,
          onSendMessage: mock(),
          handleImageGenerationSubmit: handler,
          handleImageGenerationSendAsNew: mock(),
          onResetInputState: onReset,
        }),
      { initialProps: { handler: ok } }
    );

    await act(async () => {
      await result.current.submit("hello", [], "image");
    });
    expect(ok).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();

    const bad = mock().mockRejectedValue(new Error("boom"));
    await act(async () => rerender({ handler: bad }));
    await act(async () => {
      await result.current.submit("hello", [], "image");
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error" })
    );
  });

  test("text mode: private mode converts attachments to data URLs and sends with reasoning", async () => {
    usePrivateModeMock.mockReturnValue({
      isPrivateMode: true,
    });
    useReasoningConfigMock.mockReturnValue([
      { enabled: true, effort: "medium" },
      mock(),
    ]);

    const onSendMessage = mock();
    const onReset = mock();
    const attText = {
      type: "text" as const,
      content: "SGVsbG8=",
      mimeType: "text/plain",
      name: "a.txt",
      url: "blob:test",
      size: 5,
    };
    const attStored = {
      type: "image" as const,
      storageId: "sid" as Id<"_storage">,
      name: "img.png",
      mimeType: "image/png",
      url: "https://example.com/img.png",
      size: 1024,
    };

    const { result } = renderHook(() =>
      useChatInputSubmission({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: "p1" as Id<"personas">,
        temperature: 0.7,
        onSendMessage,
        handleImageGenerationSubmit: mock(),
        handleImageGenerationSendAsNew: mock(),
        onResetInputState: onReset,
      })
    );

    await act(async () => {
      await result.current.submit("  hi  ", [attText, attStored], "text");
    });

    expect(onSendMessage).toHaveBeenCalled();
    const [, processed, personaId, reasoning, temp] =
      onSendMessage.mock.calls[0];
    expect(personaId).toBe("p1");
    expect(reasoning).toEqual({ enabled: true, effort: "medium" });
    expect(temp).toBe(0.7);
    // Text gets data URL, stored image unchanged
    expect(processed[0]).toMatchObject({
      url: expect.stringContaining("data:text/plain;base64,SGVsbG8="),
      contentType: "text/plain",
    });
    expect(processed[1]).toBe(attStored);
    expect(onReset).toHaveBeenCalled();
  });

  test("text mode: non-private uploads new attachments and preserves pdf extractedText", async () => {
    // atob polyfill for Node
    (globalThis as unknown as { atob: (b64: string) => string }).atob = (
      b64: string
    ) => Buffer.from(b64, "base64").toString("binary");
    const uploadFile = mock()
      .mockResolvedValueOnce({
        type: "image",
        storageId: "s1",
        name: "img.png",
        url: "",
        mimeType: "image/png",
        size: 2,
      })
      .mockResolvedValueOnce({
        type: "pdf",
        storageId: "s2",
        name: "doc.pdf",
        url: "",
        mimeType: "application/pdf",
        size: 3,
      });
    useConvexFileUploadMock.mockReturnValue({ uploadFile });

    const onSendMessage = mock();
    const onReset = mock();
    const attImage: Attachment = {
      type: "image",
      content: "AQID",
      mimeType: "image/png",
      name: "img.png",
      url: "",
      size: 4,
    };
    const attPdf: Attachment = {
      type: "pdf",
      content: "AA==",
      mimeType: "application/pdf",
      name: "doc.pdf",
      extractedText: "pdf text",
      url: "",
      size: 2,
    };
    const attText: Attachment = {
      type: "text",
      content: "abc",
      mimeType: "text/plain",
      name: "a.txt",
      url: "",
      size: 3,
    };

    const { result } = renderHook(() =>
      useChatInputSubmission({
        conversationId: undefined,
        selectedPersonaId: null,
        temperature: undefined,
        onSendMessage,
        handleImageGenerationSubmit: mock(),
        handleImageGenerationSendAsNew: mock(),
        onResetInputState: onReset,
      })
    );

    await act(async () => {
      await result.current.submit(" hey ", [attImage, attPdf, attText], "text");
    });
    expect(uploadFile).toHaveBeenCalledTimes(2);
    const sendCall = (onSendMessage.mock.calls[0] ?? []) as [
      unknown,
      Record<string, unknown>[] | undefined,
    ];
    const sentAttachments = sendCall[1] ?? [];
    expect(sentAttachments[0]).toMatchObject({
      storageId: "s1",
      type: "image",
    });
    expect(sentAttachments[1]).toMatchObject({
      storageId: "s2",
      type: "pdf",
      extractedText: "pdf text",
    });
    expect(sentAttachments[2]).toBe(attText);
    expect(onReset).toHaveBeenCalled();
  });

  test("handleSendAsNewConversation generates summary, uploads, forwards, and resets on success", async () => {
    const genSummary = mock().mockResolvedValue("ctx");
    useActionMock.mockReturnValue(genSummary);
    const uploadFile = mock().mockResolvedValue({
      type: "image",
      storageId: "s1",
    });
    useConvexFileUploadMock.mockReturnValue({ uploadFile });

    const onSendAsNewConversation = mock().mockResolvedValue("newC");
    const onReset = mock();
    const { result } = renderHook(() =>
      useChatInputSubmission({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: "p1" as Id<"personas">,
        onSendMessage: mock(),
        onSendAsNewConversation,
        handleImageGenerationSubmit: mock(),
        onResetInputState: onReset,
        handleImageGenerationSendAsNew: mock(),
      })
    );

    await act(async () => {
      await result.current.handleSendAsNewConversation(
        "question?",
        [
          {
            type: "image",
            content: "AQID",
            mimeType: "image/png",
            name: "a",
            url: "",
            size: 4,
          },
        ],
        true,
        "p2" as Id<"personas">,
        { enabled: true },
        "text"
      );
    });
    expect(genSummary).toHaveBeenCalled();
    expect(onSendAsNewConversation).toHaveBeenCalledWith(
      "question?",
      true,
      expect.any(Array),
      "ctx",
      "c1",
      "p2",
      { enabled: true },
      undefined
    );
    expect(onReset).toHaveBeenCalled();

    // If it returns undefined, no reset
    onReset.mockClear();
    onSendAsNewConversation.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.handleSendAsNewConversation(
        "q",
        [],
        true,
        undefined,
        undefined,
        "text"
      );
    });
    expect(onReset).not.toHaveBeenCalled();
  });

  test("routes image forks through the image generation handler", async () => {
    const genSummary = mock();
    useActionMock.mockReturnValue(genSummary);

    const imageHandler = mock().mockResolvedValue("new-img");
    const onSendAsNewConversation = mock();
    const onReset = mock();

    const { result } = renderHook(() =>
      useChatInputSubmission({
        conversationId: "c1" as Id<"conversations">,
        selectedPersonaId: "p1" as Id<"personas">,
        onSendMessage: mock(),
        onSendAsNewConversation,
        handleImageGenerationSubmit: mock(),
        handleImageGenerationSendAsNew: imageHandler,
        onResetInputState: onReset,
      })
    );

    await act(async () => {
      await result.current.handleSendAsNewConversation(
        "describe",
        [],
        false,
        "p2" as Id<"personas">,
        undefined,
        "image"
      );
    });

    expect(imageHandler).toHaveBeenCalledWith(false, "p2");
    expect(onSendAsNewConversation).not.toHaveBeenCalled();
    expect(onReset).toHaveBeenCalled();
  });
});
