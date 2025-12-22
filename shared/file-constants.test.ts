import { describe, expect, test } from "bun:test";
import {
  BATCH_PROCESSING,
  FILE_EXTENSIONS,
  FILE_LIMITS,
  SUPPORTED_MIME_TYPES,
} from "./file-constants";

describe("FILE_LIMITS", () => {
  test("has correct max size bytes", () => {
    expect(FILE_LIMITS.MAX_SIZE_BYTES).toBe(20 * 1024 * 1024); // 20MB
  });

  test("has correct PDF max size bytes", () => {
    expect(FILE_LIMITS.PDF_MAX_SIZE_BYTES).toBe(50 * 1024 * 1024); // 50MB
  });

  test("has correct max dimension", () => {
    expect(FILE_LIMITS.MAX_DIMENSION).toBe(1024);
  });

  test("has correct thumbnail size", () => {
    expect(FILE_LIMITS.THUMBNAIL_SIZE).toBe(200);
  });

  test("has correct image quality", () => {
    expect(FILE_LIMITS.IMAGE_QUALITY).toBe(0.8);
  });
});

describe("BATCH_PROCESSING", () => {
  test("has correct size", () => {
    expect(BATCH_PROCESSING.SIZE).toBe(20);
  });

  test("has correct timeout ms", () => {
    expect(BATCH_PROCESSING.TIMEOUT_MS).toBe(75);
  });

  test("has correct check interval ms", () => {
    expect(BATCH_PROCESSING.CHECK_INTERVAL_MS).toBe(500);
  });
});

describe("SUPPORTED_MIME_TYPES", () => {
  test("has correct PDF mime type", () => {
    expect(SUPPORTED_MIME_TYPES.PDF).toBe("application/pdf");
  });

  test("has correct text mime type", () => {
    expect(SUPPORTED_MIME_TYPES.TEXT).toBe("text/plain");
  });

  test("has correct image mime types", () => {
    expect(SUPPORTED_MIME_TYPES.IMAGE_JPEG).toBe("image/jpeg");
    expect(SUPPORTED_MIME_TYPES.IMAGE_WEBP).toBe("image/webp");
  });

  test("has correct default mime type", () => {
    expect(SUPPORTED_MIME_TYPES.DEFAULT).toBe("application/octet-stream");
  });
});

describe("FILE_EXTENSIONS", () => {
  test("has correct text extensions", () => {
    expect(FILE_EXTENSIONS.TEXT).toEqual([
      "txt",
      "text",
      "md",
      "markdown",
      "mdx",
      "rtf",
      "log",
      "csv",
      "tsv",
    ]);
  });

  test("has correct code extensions", () => {
    const expectedCode = [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "cs",
      "php",
      "rb",
      "go",
      "rs",
      "swift",
      "html",
      "css",
      "json",
      "xml",
      "yaml",
      "sql",
      "sh",
    ];
    expect(FILE_EXTENSIONS.CODE).toEqual(expectedCode);
  });

  test("has correct image extensions", () => {
    expect(FILE_EXTENSIONS.IMAGE).toEqual([
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "bmp",
      "heic",
      "heif",
    ]);
  });

  test("has correct PDF extensions", () => {
    expect(FILE_EXTENSIONS.PDF).toEqual(["pdf"]);
  });
});
