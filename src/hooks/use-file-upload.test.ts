import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("@shared/file-constants", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock shape mirrors real module */
  FILE_LIMITS: {
    /* biome-ignore lint/style/useNamingConvention: constant name from module */
    MAX_SIZE_BYTES: 5 * 1024 * 1024,
    /* biome-ignore lint/style/useNamingConvention: constant name from module */
    PDF_MAX_SIZE_BYTES: 10 * 1024 * 1024,
    /* biome-ignore lint/style/useNamingConvention: constant name from module */
    MAX_DIMENSION: 1024,
    /* biome-ignore lint/style/useNamingConvention: constant name from module */
    IMAGE_QUALITY: 0.8,
    /* biome-ignore lint/style/useNamingConvention: constant name from module */
    THUMBNAIL_SIZE: 256,
  },
}));
vi.mock("@shared/model-capabilities-config", () => ({
  isFileTypeSupported: vi.fn(),
}));
vi.mock("@/hooks/use-convex-file-upload", () => ({
  useConvexFileUpload: () => ({
    uploadFile: vi.fn(async (file: File) => ({
      type: "image",
      url: "https://storage/c1",
      name: file.name,
      size: file.size,
      storageId: "sid" as Id<"_storage">,
    })),
  }),
}));
vi.mock("@/hooks/use-dialog-management", () => ({
  useNotificationDialog: () => ({ notify: vi.fn() }),
}));
vi.mock("@/providers/toast-context", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  }),
}));
vi.mock("@/lib/file-utils", () => ({
  readFileAsText: vi.fn(async () => "hello world"),
  readFileAsBase64: vi.fn(async () => "YmFzZTY0"),
  convertImageToWebP: vi.fn(async () => ({
    base64: "d2VicA==",
    mimeType: "image/webp",
  })),
}));
vi.mock("@/stores/actions/chat-input-actions", () => ({
  appendAttachments: vi.fn(),
  removeAttachmentAt: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
import { convertImageToWebP, readFileAsText } from "@/lib/file-utils";
import {
  appendAttachments,
  removeAttachmentAt,
} from "@/stores/actions/chat-input-actions";
import type { AIModel, Attachment } from "@/types";
import { makeFileList } from "../test/utils";
import { useFileUpload } from "./use-file-upload";

describe("useFileUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds text and image attachments and supports removal/clear", async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        currentModel: {
          provider: "openai",
          modelId: "gpt",
          _id: "m1",
          name: "gpt",
        } as unknown as AIModel,
      })
    );

    const text = new File(["Hello"], "note.txt", { type: "text/plain" });
    const img = new File([new ArrayBuffer(128)], "pic.png", {
      type: "image/png",
    });
    const files = makeFileList([text, img]);

    vi.mocked(isFileTypeSupported)
      .mockReturnValueOnce({ supported: true, category: "text" })
      .mockReturnValueOnce({ supported: true, category: "image" });

    await act(async () => {
      await result.current.handleFileUpload(files);
    });

    expect(readFileAsText).toHaveBeenCalled();
    expect(convertImageToWebP).toHaveBeenCalled();
    expect(result.current.attachments.length).toBe(2);

    // remove first attachment
    await act(async () => {
      await result.current.removeAttachment(0);
    });
    expect(result.current.attachments.length).toBe(1);

    act(() => {
      result.current.clearAttachments();
    });
    expect(result.current.attachments.length).toBe(0);
  });

  it("uploadAttachmentsToConvex returns data URLs in private mode", async () => {
    const { result } = renderHook(() => useFileUpload({ privateMode: true }));
    // prime attachments with one image-like base64 entry
    const att: Attachment = {
      type: "image",
      name: "p.png",
      size: 10,
      content: "YmFzZTY0",
      mimeType: "image/png",
      url: "",
    };
    const uploaded = await result.current.uploadAttachmentsToConvex([att]);
    expect(uploaded[0].url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("uploadAttachmentsToConvex keeps text attachments as-is in non-private mode", async () => {
    const { result } = renderHook(() => useFileUpload({ privateMode: false }));
    const att: Attachment = {
      type: "text",
      name: "t.txt",
      size: 5,
      content: "hello",
      url: "",
    };
    const uploaded = await result.current.uploadAttachmentsToConvex([att]);
    expect(uploaded[0]).toEqual(att);
  });

  it("conversation-scoped: appends and removes attachments via actions", async () => {
    const { result } = renderHook(() =>
      useFileUpload({
        currentModel: {
          provider: "openai",
          modelId: "gpt",
          _id: "m1",
          name: "gpt",
        } as unknown as AIModel,
        conversationId: "c1",
      })
    );
    const file = new File(["Hello"], "a.txt", { type: "text/plain" });
    vi.mocked(isFileTypeSupported).mockReturnValue({
      supported: true,
      category: "text",
    });

    await act(async () => {
      await result.current.handleFileUpload(makeFileList([file]));
    });
    expect(appendAttachments).toHaveBeenCalled();
    expect(vi.mocked(appendAttachments).mock.calls[0][0]).toBe("c1");

    await act(async () => {
      await result.current.removeAttachment(0);
    });
    expect(removeAttachmentAt).toHaveBeenCalledWith("c1", 0);
  });
});
