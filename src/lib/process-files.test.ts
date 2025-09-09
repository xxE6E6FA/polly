import { describe, expect, it, vi } from "vitest";
import { makeFileList } from "../test/utils";
import { type Notifier, processFilesForAttachments } from "./process-files";

// Mock dependencies
vi.mock("@shared/file-constants", () => ({
  /* biome-ignore lint/style/useNamingConvention: mirror real module shape */
  FILE_LIMITS: {
    /* biome-ignore lint/style/useNamingConvention: constant from module */
    MAX_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
    /* biome-ignore lint/style/useNamingConvention: constant from module */
    PDF_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  },
}));

vi.mock("@shared/model-capabilities-config", () => ({
  isFileTypeSupported: vi.fn(),
}));

vi.mock("@/lib/file-utils", () => ({
  readFileAsText: vi.fn(),
  readFileAsBase64: vi.fn(),
  convertImageToWebP: vi.fn(),
}));

vi.mock("@/lib/type-guards", () => ({
  isUserModel: vi.fn(),
}));

import { isFileTypeSupported } from "@shared/model-capabilities-config";
import {
  convertImageToWebP,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { isUserModel } from "@/lib/type-guards";

describe("process-files", () => {
  const mockNotify: Notifier = vi.fn();

  const validModel = {
    _id: "model_123",
    _creationTime: 123456789,
    modelId: "gpt-4-vision",
    provider: "openai",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("processFilesForAttachments", () => {
    it("processes text files successfully", async () => {
      const textFile = new File(["Hello world"], "test.txt", {
        type: "text/plain",
      });
      const fileList = makeFileList([textFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "text",
      });
      vi.mocked(readFileAsText).mockResolvedValue("Hello world");

      const result = await processFilesForAttachments(fileList, validModel);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "text",
        url: "",
        name: "test.txt",
        size: 11,
        content: "Hello world",
      });
      expect(readFileAsText).toHaveBeenCalledWith(textFile);
    });

    it("processes PDF files successfully", async () => {
      const pdfFile = new File([new ArrayBuffer(1024)], "document.pdf", {
        type: "application/pdf",
      });
      const fileList = makeFileList([pdfFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "pdf",
      });
      vi.mocked(readFileAsBase64).mockResolvedValue("base64content");

      const result = await processFilesForAttachments(fileList, validModel);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "pdf",
        url: "",
        name: "document.pdf",
        size: 1024,
        content: "base64content",
        mimeType: "application/pdf",
      });
      expect(readFileAsBase64).toHaveBeenCalledWith(pdfFile);
    });

    it("processes image files with WebP conversion", async () => {
      const imageFile = new File([new ArrayBuffer(2048)], "image.png", {
        type: "image/png",
      });
      const fileList = makeFileList([imageFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "image",
      });
      vi.mocked(convertImageToWebP).mockResolvedValue({
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
      expect(convertImageToWebP).toHaveBeenCalledWith(imageFile);
    });

    it("falls back to original format when WebP conversion fails", async () => {
      const imageFile = new File([new ArrayBuffer(2048)], "image.png", {
        type: "image/png",
      });
      const fileList = makeFileList([imageFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "image",
      });
      vi.mocked(convertImageToWebP).mockRejectedValue(
        new Error("Conversion failed")
      );
      vi.mocked(readFileAsBase64).mockResolvedValue("originalbase64");

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

    it("rejects files that are too large", async () => {
      // Create file larger than 5MB limit
      const largeFile = new File(
        [new ArrayBuffer(6 * 1024 * 1024)],
        "large.txt",
        { type: "text/plain" }
      );
      const fileList = makeFileList([largeFile]);

      vi.mocked(isUserModel).mockReturnValue(true);

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

    it("handles different size limits for PDF files", async () => {
      // Create PDF file larger than regular limit but smaller than PDF limit
      const largePdfFile = new File(
        [new ArrayBuffer(8 * 1024 * 1024)],
        "large.pdf",
        { type: "application/pdf" }
      );
      const fileList = makeFileList([largePdfFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "pdf",
      });
      vi.mocked(readFileAsBase64).mockResolvedValue("pdfcontent");

      const result = await processFilesForAttachments(fileList, validModel);

      expect(result).toHaveLength(1);
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it("rejects files when no model is selected", async () => {
      const textFile = new File(["Hello"], "test.txt", { type: "text/plain" });
      const fileList = makeFileList([textFile]);

      vi.mocked(isUserModel).mockReturnValue(false);

      const result = await processFilesForAttachments(
        fileList,
        null,
        mockNotify
      );

      expect(result).toHaveLength(0);
      expect(mockNotify).toHaveBeenCalledWith({
        title: "No Model Selected",
        description: "Please select a model to upload files.",
        type: "error",
      });
    });

    it("rejects files with unsupported types", async () => {
      const unsupportedFile = new File(["data"], "file.xyz", {
        type: "application/unknown",
      });
      const fileList = makeFileList([unsupportedFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: false,
        category: null,
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

    it("handles file processing errors gracefully", async () => {
      const textFile = new File(["Hello"], "test.txt", { type: "text/plain" });
      const fileList = makeFileList([textFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "text",
      });
      vi.mocked(readFileAsText).mockRejectedValue(new Error("Read failed"));

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

    it("processes multiple files correctly", async () => {
      const textFile = new File(["Text content"], "text.txt", {
        type: "text/plain",
      });
      const imageFile = new File([new ArrayBuffer(1024)], "image.png", {
        type: "image/png",
      });
      const files = [textFile, imageFile];
      const fileList = makeFileList(files);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported)
        .mockReturnValueOnce({ supported: true, category: "text" })
        .mockReturnValueOnce({ supported: true, category: "image" });
      vi.mocked(readFileAsText).mockResolvedValue("Text content");
      vi.mocked(convertImageToWebP).mockResolvedValue({
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

    it("continues processing after individual file failures", async () => {
      const goodFile = new File(["Good content"], "good.txt", {
        type: "text/plain",
      });
      const badFile = new File(["Bad content"], "bad.txt", {
        type: "text/plain",
      });
      const files = [goodFile, badFile];
      const fileList = makeFileList(files);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "text",
      });
      vi.mocked(readFileAsText)
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

    it("works without notification callback", async () => {
      const textFile = new File(["Content"], "test.txt", {
        type: "text/plain",
      });
      const fileList = makeFileList([textFile]);

      vi.mocked(isUserModel).mockReturnValue(true);
      vi.mocked(isFileTypeSupported).mockReturnValue({
        supported: true,
        category: "text",
      });
      vi.mocked(readFileAsText).mockResolvedValue("Content");

      // Should not throw when notify is undefined
      const result = await processFilesForAttachments(fileList, validModel);
      expect(result).toHaveLength(1);
    });
  });
});
