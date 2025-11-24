import { describe, expect, it, mock } from "bun:test";
import { FILE_LIMITS } from "../../shared/file-constants";
import { processFilesForAttachments } from "./process-files";

// Mock dependencies with proper relative paths
mock.module("../lib/file-utils", () => ({
  readFileAsText: () => Promise.resolve("mock text content"),
  readFileAsBase64: () => Promise.resolve("mock base64 content"),
  convertImageToWebP: () =>
    Promise.resolve({ base64: "mock webp content", mimeType: "image/webp" }),
}));

mock.module("../../shared/model-capabilities-config", () => ({
  isFileTypeSupported: (fileType: string, model: any) => {
    if (fileType === "application/x-unsupported") {
      return { supported: false, category: "unsupported" };
    }
    if (fileType.startsWith("image/")) {
      // Check if model supports images
      if (model?.supportsImages) {
        return { supported: true, category: "image" };
      }
      return { supported: false, category: "unsupported" };
    }
    if (fileType === "application/pdf") {
      return { supported: true, category: "pdf" };
    }
    if (
      fileType.startsWith("text/") ||
      fileType === "application/json" ||
      fileType === "application/xml" ||
      fileType === "application/javascript" ||
      fileType === "application/typescript" ||
      fileType === "application/yaml" ||
      fileType === "application/x-yaml"
    ) {
      return { supported: true, category: "text" };
    }
    return { supported: false, category: "unsupported" };
  },
  // Include other exports to avoid breaking other functionality
  isImageType: (fileType: string) => fileType.startsWith("image/"),
  isTextType: (fileType: string) => {
    if (!fileType || fileType === "application/octet-stream") {
      return true;
    }
    return (
      fileType.startsWith("text/") ||
      fileType === "application/json" ||
      fileType === "application/xml" ||
      fileType === "application/javascript" ||
      fileType === "application/typescript" ||
      fileType === "application/yaml" ||
      fileType === "application/x-yaml"
    );
  },
  checkModelCapability: (capability: string, model: any) => {
    if (!model) {
      return false;
    }
    return model[capability] ?? false;
  },
}));

describe("processFilesForAttachments", () => {
  const mockModel = {
    provider: "openai",
    modelId: "gpt-4o",
    supportsImages: true,
  };

  const createMockFile = (name: string, type: string, size: number) => {
    return {
      name,
      type,
      size,
    } as File;
  };

  it("should process text files", async () => {
    const files = [
      createMockFile("test.txt", "text/plain", 100),
    ] as unknown as FileList;
    // Mock Array.from for FileList
    (files as any)[Symbol.iterator] = function* () {
      yield files[0];
    };

    const result = await processFilesForAttachments(files, mockModel);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "text",
      url: "",
      name: "test.txt",
      size: 100,
      content: "mock text content",
    });
  });

  it("should process image files", async () => {
    const files = [
      createMockFile("test.png", "image/png", 100),
    ] as unknown as FileList;
    (files as any)[Symbol.iterator] = function* () {
      yield files[0];
    };

    const result = await processFilesForAttachments(files, mockModel);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "image",
      url: "",
      name: "test.png",
      size: 100,
      content: "mock webp content",
      mimeType: "image/webp",
    });
  });

  it("should process pdf files", async () => {
    const files = [
      createMockFile("test.pdf", "application/pdf", 100),
    ] as unknown as FileList;
    (files as any)[Symbol.iterator] = function* () {
      yield files[0];
    };

    const result = await processFilesForAttachments(files, mockModel);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "pdf",
      url: "",
      name: "test.pdf",
      size: 100,
      content: "mock base64 content",
      mimeType: "application/pdf",
    });
  });

  it("should skip files exceeding size limit", async () => {
    const files = [
      createMockFile("large.txt", "text/plain", FILE_LIMITS.MAX_SIZE_BYTES + 1),
    ] as unknown as FileList;
    (files as any)[Symbol.iterator] = function* () {
      yield files[0];
    };

    const notify = mock();
    const result = await processFilesForAttachments(files, mockModel, notify);

    expect(result).toHaveLength(0);
    expect(notify).toHaveBeenCalled();
    expect(notify.mock.calls[0][0].title).toBe("File Too Large");
  });

  it("should notify if no model selected", async () => {
    const files = [
      createMockFile("test.txt", "text/plain", 100),
    ] as unknown as FileList;
    (files as any)[Symbol.iterator] = function* () {
      yield files[0];
    };

    const notify = mock();
    const result = await processFilesForAttachments(files, null, notify);

    expect(result).toHaveLength(0);
    expect(notify).toHaveBeenCalled();
    expect(notify.mock.calls[0][0].title).toBe("No Model Selected");
  });

  it("should notify if file type unsupported", async () => {
    const files = [
      createMockFile("test.xyz", "application/x-unsupported", 100),
    ] as unknown as FileList;
    (files as any)[Symbol.iterator] = function* () {
      yield files[0];
    };

    const notify = mock();
    const result = await processFilesForAttachments(files, mockModel, notify);

    expect(result).toHaveLength(0);
    expect(notify).toHaveBeenCalled();
    expect(notify.mock.calls[0][0].title).toBe("Unsupported File Type");
  });
});
