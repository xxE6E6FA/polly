import { beforeEach, describe, expect, mock, test } from "bun:test";
import { makeFileList } from "../test/utils";
import { type Notifier, processFilesForAttachments } from "./process-files";

let isFileTypeSupportedMock: ReturnType<typeof mock>;
let readFileAsTextMock: ReturnType<typeof mock>;
let readFileAsBase64Mock: ReturnType<typeof mock>;
let convertImageToWebPMock: ReturnType<typeof mock>;
let isUserModelMock: ReturnType<typeof mock>;

mock.module("@shared/file-constants", () => ({
  /* biome-ignore lint/style/useNamingConvention: mirror real module shape */
  FILE_LIMITS: {
    /* biome-ignore lint/style/useNamingConvention: constant from module */
    MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
    /* biome-ignore lint/style/useNamingConvention: constant from module */
    PDF_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  },
}));

mock.module("@shared/model-capabilities-config", () => ({
  isFileTypeSupported: (...args: unknown[]) => isFileTypeSupportedMock(...args),
}));

mock.module("@/lib/file-utils", () => ({
  readFileAsText: (...args: unknown[]) => readFileAsTextMock(...args),
  readFileAsBase64: (...args: unknown[]) => readFileAsBase64Mock(...args),
  convertImageToWebP: (...args: unknown[]) => convertImageToWebPMock(...args),
}));

mock.module("@/lib/type-guards", () => ({
  isUserModel: (...args: unknown[]) => isUserModelMock(...args),
}));

import { isFileTypeSupported } from "@shared/model-capabilities-config";
import {
  convertImageToWebP,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { isUserModel } from "@/lib/type-guards";

describe("process-files", () => {
  let mockNotify: ReturnType<typeof mock<Notifier>>;

  const validModel = {
    _id: "model_123",
    name: "Test Model",
    provider: "openai",
    modelId: "gpt-4o",
  };

  beforeEach(() => {
    mockNotify = mock<Notifier>();
    isFileTypeSupportedMock = mock();
    readFileAsTextMock = mock();
    readFileAsBase64Mock = mock();
    convertImageToWebPMock = mock();
    isUserModelMock = mock();
  });

  test("converts images to WebP format", async () => {
    const imageFile = new File([new ArrayBuffer(2048)], "image.png", {
      type: "image/png",
    });
    const fileList = makeFileList([imageFile]);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: true,
      category: "image",
    });
    convertImageToWebPMock.mockResolvedValue({
      base64: "webpbase64",
      mimeType: "image/webp",
    });

    const result = await processFilesForAttachments(fileList, validModel);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "image",
      url: "",
      name: "image.png",
      size: 2048,
      content: "webpbase64",
      mimeType: "image/webp",
    });
    expect(convertImageToWebPMock).toHaveBeenCalledWith(imageFile);
  });

  test("falls back to original format when WebP conversion fails", async () => {
    const imageFile = new File([new ArrayBuffer(2048)], "image.png", {
      type: "image/png",
    });
    const fileList = makeFileList([imageFile]);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: true,
      category: "image",
    });
    convertImageToWebPMock.mockRejectedValue(new Error("Conversion failed"));
    readFileAsBase64Mock.mockResolvedValue("originalbase64");

    const result = await processFilesForAttachments(fileList, validModel);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "image",
      url: "",
      name: "image.png",
      size: 2048,
      content: "originalbase64",
      mimeType: "image/png",
    });
  });

  test("rejects files that are too large", async () => {
    // Create file larger than 5MB limit
    const largeFile = new File(
      [new ArrayBuffer(6 * 1024 * 1024)],
      "large.txt",
      { type: "text/plain" }
    );
    const fileList = makeFileList([largeFile]);

    isUserModelMock.mockReturnValue(true);

    const result = await processFilesForAttachments(
      fileList,
      validModel,
      mockNotify
    );

    expect(result).toHaveLength(0);
    expect(mockNotify).toHaveBeenCalledWith({
      title: "File Too Large",
      description: "File large.txt exceeds the 5MB limit.",
      type: "error",
    });
  });

  test("handles different size limits for PDF files", async () => {
    // Create PDF file larger than regular limit but smaller than PDF limit
    const largePdfFile = new File(
      [new ArrayBuffer(8 * 1024 * 1024)],
      "large.pdf",
      { type: "application/pdf" }
    );
    const fileList = makeFileList([largePdfFile]);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: true,
      category: "pdf",
    });
    readFileAsBase64Mock.mockResolvedValue("pdfcontent");

    const result = await processFilesForAttachments(fileList, validModel);

    expect(result).toHaveLength(1);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  test("rejects files when no model is selected", async () => {
    const textFile = new File(["Hello"], "test.txt", { type: "text/plain" });
    const fileList = makeFileList([textFile]);

    isUserModelMock.mockReturnValue(false);

    const result = await processFilesForAttachments(fileList, null, mockNotify);

    expect(result).toHaveLength(0);
    expect(mockNotify).toHaveBeenCalledWith({
      title: "No Model Selected",
      description: "Please select a model to upload files.",
      type: "error",
    });
  });

  test("rejects files with unsupported types", async () => {
    const unsupportedFile = new File(["data"], "file.xyz", {
      type: "application/unknown",
    });
    const fileList = makeFileList([unsupportedFile]);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: false,
      category: "unsupported",
    });

    const result = await processFilesForAttachments(
      fileList,
      validModel,
      mockNotify
    );

    expect(result).toHaveLength(0);
    expect(mockNotify).toHaveBeenCalledWith({
      title: "Unsupported File Type",
      description: "File file.xyz is not supported by the current model.",
      type: "error",
    });
  });

  test("handles file processing errors gracefully", async () => {
    const textFile = new File(["Hello"], "test.txt", { type: "text/plain" });
    const fileList = makeFileList([textFile]);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: true,
      category: "text",
    });
    readFileAsTextMock.mockRejectedValue(new Error("Read failed"));

    const result = await processFilesForAttachments(
      fileList,
      validModel,
      mockNotify
    );

    expect(result).toHaveLength(0);
    expect(mockNotify).toHaveBeenCalledWith({
      title: "File Upload Failed",
      description: "Failed to process test.txt",
      type: "error",
    });
  });

  test("processes multiple files correctly", async () => {
    const textFile = new File(["Text content"], "text.txt", {
      type: "text/plain",
    });
    const imageFile = new File([new ArrayBuffer(1024)], "image.png", {
      type: "image/png",
    });
    const files = [textFile, imageFile];
    const fileList = makeFileList(files);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock
      .mockReturnValueOnce({ supported: true, category: "text" })
      .mockReturnValueOnce({ supported: true, category: "image" });
    readFileAsTextMock.mockResolvedValue("Text content");
    convertImageToWebPMock.mockResolvedValue({
      base64: "imagebase64",
      mimeType: "image/webp",
    });

    const result = await processFilesForAttachments(fileList, validModel);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[0].name).toBe("text.txt");
    expect(result[1].type).toBe("image");
    expect(result[1].name).toBe("image.png");
  });

  test("continues processing after individual file failures", async () => {
    const goodFile = new File(["Good content"], "good.txt", {
      type: "text/plain",
    });
    const badFile = new File(["Bad content"], "bad.txt", {
      type: "text/plain",
    });
    const files = [goodFile, badFile];
    const fileList = makeFileList(files);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: true,
      category: "text",
    });
    readFileAsTextMock
      .mockResolvedValueOnce("Good content")
      .mockRejectedValueOnce(new Error("Processing failed"));

    const result = await processFilesForAttachments(
      fileList,
      validModel,
      mockNotify
    );

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("good.txt");
    expect(mockNotify).toHaveBeenCalledWith({
      title: "File Upload Failed",
      description: "Failed to process bad.txt",
      type: "error",
    });
  });

  test("works without notification callback", async () => {
    const textFile = new File(["Content"], "test.txt", {
      type: "text/plain",
    });
    const fileList = makeFileList([textFile]);

    isUserModelMock.mockReturnValue(true);
    isFileTypeSupportedMock.mockReturnValue({
      supported: true,
      category: "text",
    });
    readFileAsTextMock.mockResolvedValue("Content");

    // Should not throw when notify is undefined
    const result = await processFilesForAttachments(fileList, validModel);
    expect(result).toHaveLength(1);
  });
});
