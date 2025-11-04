import {
  afterAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import type { AIModel, Attachment } from "@/types";
import { renderHook } from "../test/hook-utils";
import { createToastMock, makeFileList, mockToastContext } from "../test/utils";

mock.module("@shared/file-constants", () => ({
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
mock.module("@shared/model-capabilities-config", () => ({
  isFileTypeSupported: mock(),
}));
mock.module("@/hooks/use-convex-file-upload", () => ({
  useConvexFileUpload: () => ({
    uploadFile: mock(async (file: File) => ({
      type: "image",
      url: "https://storage/c1",
      name: file.name,
      size: file.size,
      storageId: "sid" as Id<"_storage">,
    })),
  }),
}));
mock.module("@/hooks/use-dialog-management", () => ({
  useNotificationDialog: () => ({ notify: mock() }),
}));
const toastMock = createToastMock();
await mockToastContext(toastMock);
mock.module("@/stores/actions/chat-input-actions", () => ({
  appendAttachments: mock(),
  removeAttachmentAt: mock(),
  setPersona: mock(),
  setTemperature: mock(),
}));

const { isFileTypeSupported } = await import(
  "@shared/model-capabilities-config"
);
const fileUtils = await import("@/lib/file-utils");
const { appendAttachments, removeAttachmentAt } = await import(
  "@/stores/actions/chat-input-actions"
);
const { useFileUpload } = await import("./use-file-upload");

const readFileAsTextSpy = spyOn(fileUtils, "readFileAsText").mockResolvedValue(
  "hello world"
);
const convertImageToWebPSpy = spyOn(
  fileUtils,
  "convertImageToWebP"
).mockResolvedValue({ base64: "d2VicA==", mimeType: "image/webp" });

afterAll(() => {
  mock.restore();
  readFileAsTextSpy.mockRestore();
  convertImageToWebPSpy.mockRestore();
});

describe("useFileUpload", () => {
  beforeEach(() => {
    for (const fn of Object.values(toastMock)) {
      fn.mockClear();
    }
  });

  test("adds text and image attachments and supports removal/clear", async () => {
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

    (isFileTypeSupported as ReturnType<typeof mock>)
      .mockReturnValueOnce({ supported: true, category: "text" })
      .mockReturnValueOnce({ supported: true, category: "image" });

    await act(async () => {
      await result.current.handleFileUpload(files);
    });

    expect(readFileAsTextSpy).toHaveBeenCalled();
    expect(convertImageToWebPSpy).toHaveBeenCalled();
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

  test("uploadAttachmentsToConvex returns data URLs in private mode", async () => {
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
    expect(uploaded[0]?.url.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("uploadAttachmentsToConvex keeps text attachments as-is in non-private mode", async () => {
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

  test("conversation-scoped: appends and removes attachments via actions", async () => {
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
    (isFileTypeSupported as ReturnType<typeof mock>).mockReturnValue({
      supported: true,
      category: "text",
    });

    await act(async () => {
      await result.current.handleFileUpload(makeFileList([file]));
    });
    expect(appendAttachments).toHaveBeenCalled();
    const calls = (appendAttachments as ReturnType<typeof mock>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.[0]).toBe("c1");

    await act(async () => {
      await result.current.removeAttachment(0);
    });
    expect(removeAttachmentAt).toHaveBeenCalledWith("c1", 0);
  });
});
