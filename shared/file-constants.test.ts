import { describe, expect, test } from "bun:test";
import {
  AUDIO_EXTENSIONS,
  BATCH_PROCESSING,
  buildAcceptAttribute,
  describeSupportedTypes,
  FILE_EXTENSIONS,
  FILE_LIMITS,
  getAllowedMimeTypes,
  MIME_TYPES,
  TEXT_EXTENSIONS,
  VIDEO_EXTENSIONS,
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

  test("has audio and video max size bytes", () => {
    expect(FILE_LIMITS.AUDIO_MAX_SIZE_BYTES).toBe(50 * 1024 * 1024);
    expect(FILE_LIMITS.VIDEO_MAX_SIZE_BYTES).toBe(50 * 1024 * 1024);
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

describe("MIME_TYPES", () => {
  test("has image MIME types", () => {
    expect(MIME_TYPES.IMAGE.has("image/jpeg")).toBe(true);
    expect(MIME_TYPES.IMAGE.has("image/png")).toBe(true);
    expect(MIME_TYPES.IMAGE.has("image/webp")).toBe(true);
  });

  test("has PDF MIME type", () => {
    expect(MIME_TYPES.PDF.has("application/pdf")).toBe(true);
  });

  test("has text MIME types", () => {
    expect(MIME_TYPES.TEXT.has("text/plain")).toBe(true);
    expect(MIME_TYPES.TEXT.has("application/json")).toBe(true);
  });

  test("has audio MIME types", () => {
    expect(MIME_TYPES.AUDIO.has("audio/mpeg")).toBe(true);
    expect(MIME_TYPES.AUDIO.has("audio/wav")).toBe(true);
  });

  test("has video MIME types", () => {
    expect(MIME_TYPES.VIDEO.has("video/mp4")).toBe(true);
    expect(MIME_TYPES.VIDEO.has("video/webm")).toBe(true);
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

  test("has audio extensions", () => {
    expect(FILE_EXTENSIONS.AUDIO).toContain("mp3");
    expect(FILE_EXTENSIONS.AUDIO).toContain("wav");
    expect(FILE_EXTENSIONS.AUDIO).toContain("m4a");
  });

  test("has video extensions", () => {
    expect(FILE_EXTENSIONS.VIDEO).toContain("mp4");
    expect(FILE_EXTENSIONS.VIDEO).toContain("mov");
  });
});

describe("Extension sets", () => {
  test("TEXT_EXTENSIONS includes text and code extensions", () => {
    expect(TEXT_EXTENSIONS.has("txt")).toBe(true);
    expect(TEXT_EXTENSIONS.has("py")).toBe(true);
    expect(TEXT_EXTENSIONS.has("json")).toBe(true);
  });

  test("AUDIO_EXTENSIONS matches FILE_EXTENSIONS.AUDIO", () => {
    for (const ext of FILE_EXTENSIONS.AUDIO) {
      expect(AUDIO_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  test("VIDEO_EXTENSIONS matches FILE_EXTENSIONS.VIDEO", () => {
    for (const ext of FILE_EXTENSIONS.VIDEO) {
      expect(VIDEO_EXTENSIONS.has(ext)).toBe(true);
    }
  });
});

describe("getAllowedMimeTypes", () => {
  test("returns a union of all MIME type sets", () => {
    const all = getAllowedMimeTypes();
    expect(all.has("image/jpeg")).toBe(true);
    expect(all.has("application/pdf")).toBe(true);
    expect(all.has("text/plain")).toBe(true);
    expect(all.has("audio/mpeg")).toBe(true);
    expect(all.has("video/mp4")).toBe(true);
  });
});

describe("buildAcceptAttribute", () => {
  test("returns empty for no options", () => {
    expect(buildAcceptAttribute({})).toBe("");
  });

  test("includes image/* when image is true", () => {
    const result = buildAcceptAttribute({ image: true });
    expect(result).toContain("image/*");
  });

  test("includes .pdf when pdf is true", () => {
    const result = buildAcceptAttribute({ pdf: true });
    expect(result).toContain(".pdf");
  });

  test("includes text extensions when text is true", () => {
    const result = buildAcceptAttribute({ text: true });
    expect(result).toContain(".txt");
    expect(result).toContain(".py");
  });

  test("includes audio extensions when audio is true", () => {
    const result = buildAcceptAttribute({ audio: true });
    expect(result).toContain(".mp3");
    expect(result).toContain(".wav");
  });

  test("includes video extensions when video is true", () => {
    const result = buildAcceptAttribute({ video: true });
    expect(result).toContain(".mp4");
    expect(result).toContain(".mov");
  });
});

describe("describeSupportedTypes", () => {
  test("returns 'No file types supported' for empty options", () => {
    expect(describeSupportedTypes({})).toBe("No file types supported");
  });

  test("returns single type description", () => {
    expect(describeSupportedTypes({ image: true })).toBe("Supports images");
  });

  test("returns multi-type description", () => {
    expect(describeSupportedTypes({ image: true, pdf: true, text: true })).toBe(
      "Supports images, PDFs & text & code files"
    );
  });

  test("includes audio and video", () => {
    const desc = describeSupportedTypes({
      image: true,
      pdf: true,
      text: true,
      audio: true,
      video: true,
    });
    expect(desc).toContain("audio");
    expect(desc).toContain("video");
  });
});
