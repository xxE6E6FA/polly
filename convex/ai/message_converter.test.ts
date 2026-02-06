import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { makeConvexCtx } from "../../test/convex-ctx";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  convertAttachmentToAISDK,
  convertLegacyPartToAISDK,
  convertStoredMessageToAISDK,
  convertStoredMessagesToAISDK,
  resetRetryConfig,
  setRetryConfig,
  type ConversionOptions,
  type StoredAttachment,
} from "./message_converter";

// Disable retry delays for all tests to avoid timeouts
beforeEach(() => {
  setRetryConfig({ maxRetries: 0, baseDelayMs: 0 });
});

afterEach(() => {
  resetRetryConfig();
});

// Default conversion options
const defaultOptions: ConversionOptions = {
  provider: "openai",
  modelId: "gpt-4",
  supportsFiles: false,
};

// Helper to create a stored attachment
function makeAttachment(
  overrides: Partial<StoredAttachment> & { type: StoredAttachment["type"] }
): StoredAttachment {
  return {
    url: "",
    name: "test-file",
    size: 1024,
    ...overrides,
  };
}

describe("convertAttachmentToAISDK", () => {
  describe("image attachments", () => {
    test("converts image with storageId using storage URL (priority 1)", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() =>
            Promise.resolve("https://storage.convex.cloud/image.png")
          ),
        },
      });

      const attachment = makeAttachment({
        type: "image",
        storageId: "storage-123" as Id<"_storage">,
        name: "photo.jpg",
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("image");
      expect((result as { image: string }).image).toBe(
        "https://storage.convex.cloud/image.png"
      );
    });

    test("falls back to data URL when getUrl returns null (priority 2)", async () => {
      const mockBlob = new Blob(["image data"], { type: "image/png" });
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() => Promise.resolve(null)),
          get: mock(() => Promise.resolve(mockBlob)),
        },
      });

      const attachment = makeAttachment({
        type: "image",
        storageId: "storage-123" as Id<"_storage">,
        name: "photo.jpg",
        mimeType: "image/png",
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("image");
      expect((result as { image: string }).image).toContain("data:image/png");
    });

    test("uses content (base64) when no storageId (priority 3 - private mode)", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "image",
        name: "photo.jpg",
        content: "base64imagedata",
        mimeType: "image/jpeg",
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("image");
      expect((result as { image: string }).image).toBe(
        "data:image/jpeg;base64,base64imagedata"
      );
    });

    test("uses url as final fallback (priority 4)", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "image",
        name: "photo.jpg",
        url: "https://example.com/image.png",
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("image");
      expect((result as { image: string }).image).toBe(
        "https://example.com/image.png"
      );
    });

    test("returns placeholder text when no valid image source (graceful degradation)", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() => Promise.resolve(null)),
          get: mock(() => Promise.resolve(null)),
        },
      });

      const attachment = makeAttachment({
        type: "image",
        name: "photo.jpg",
        storageId: "storage-123" as Id<"_storage">,
        // No content, no url
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        'Image "photo.jpg" is no longer available'
      );
    });

    test("defaults mimeType to image/jpeg when not specified", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "image",
        name: "photo.jpg",
        content: "base64imagedata",
        // No mimeType specified
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect((result as { image: string }).image).toBe(
        "data:image/jpeg;base64,base64imagedata"
      );
    });
  });

  describe("PDF attachments - text extraction path", () => {
    test("uses textFileId when available (priority 1)", async () => {
      const mockTextBlob = new Blob(["Cached PDF text from storage"], {
        type: "text/plain",
      });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockTextBlob)),
        },
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
        textFileId: "text-storage-456" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "Cached PDF text from storage"
      );
      expect((result as { text: string }).text).toContain("document.pdf");
    });

    test("uses extractedText when textFileId not available (priority 2)", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
        extractedText: "Previously extracted text",
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "Previously extracted text"
      );
    });

    test("triggers extraction when no cached text (priority 3)", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.resolve({
            text: "Newly extracted from Gemini",
            textFileId: "new-text-id" as Id<"_storage">,
          })
        ),
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "Newly extracted from Gemini"
      );
      expect(ctx.runAction).toHaveBeenCalled();
    });

    test("uses content as last resort (priority 4 - private mode)", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        content: "PDF text content from private mode",
        // No storageId, no textFileId, no extractedText
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "PDF text content from private mode"
      );
    });

    test("returns error message when extraction fails", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() => Promise.reject(new Error("Gemini API error"))),
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "PDF extraction failed"
      );
      expect((result as { text: string }).text).toContain("document.pdf");
      expect((result as { text: string }).text).toContain("Gemini API error");
    });

    test("returns error message when no source available", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        // No storageId, no content, nothing
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain("Unable to read PDF");
    });
  });

  describe("PDF attachments - native support path", () => {
    test("sends raw PDF for Anthropic with file support", async () => {
      const mockPdfBlob = new Blob(["PDF binary data"], {
        type: "application/pdf",
      });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockPdfBlob)),
        },
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        { provider: "anthropic", modelId: "claude-3-opus", supportsFiles: true }
      );

      expect(result.type).toBe("file");
      expect((result as { data: Uint8Array }).data).toBeInstanceOf(Uint8Array);
      expect((result as { mediaType: string }).mediaType).toBe(
        "application/pdf"
      );
    });

    test("sends raw PDF for Google with file support", async () => {
      const mockPdfBlob = new Blob(["PDF binary data"], {
        type: "application/pdf",
      });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockPdfBlob)),
        },
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        { provider: "google", modelId: "gemini-pro", supportsFiles: true }
      );

      expect(result.type).toBe("file");
    });

    test("extracts text for Anthropic without file support", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.resolve({
            text: "Extracted for non-file model",
            textFileId: "text-id" as Id<"_storage">,
          })
        ),
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        {
          provider: "anthropic",
          modelId: "claude-2",
          supportsFiles: false,
        }
      );

      expect(result.type).toBe("text");
    });

    test("extracts text for OpenAI (never has native PDF support)", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.resolve({
            text: "Extracted for OpenAI",
            textFileId: "text-id" as Id<"_storage">,
          })
        ),
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        { provider: "openai", modelId: "gpt-4o", supportsFiles: true }
      );

      // OpenAI doesn't support native PDFs, so extraction should happen
      expect(result.type).toBe("text");
      expect(ctx.runAction).toHaveBeenCalled();
    });

    test("falls back to extraction when storage.get fails for native PDF", async () => {
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.reject(new Error("Storage error"))),
        },
        runAction: mock(() =>
          Promise.resolve({
            text: "Fallback extraction",
            textFileId: "text-id" as Id<"_storage">,
          })
        ),
      });

      const attachment = makeAttachment({
        type: "pdf",
        name: "document.pdf",
        storageId: "pdf-storage" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        { provider: "anthropic", modelId: "claude-3-opus", supportsFiles: true }
      );

      // Should fall back to text extraction
      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain("Fallback extraction");
    });
  });

  describe("text file attachments", () => {
    test("uses content when available (priority 1)", async () => {
      const ctx = makeConvexCtx();

      const attachment = makeAttachment({
        type: "text",
        name: "readme.txt",
        content: "Text file content here",
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "Text file content here"
      );
      expect((result as { text: string }).text).toContain("readme.txt");
    });

    test("retrieves from storage when content not available (priority 2)", async () => {
      const mockTextBlob = new Blob(["Stored text file content"], {
        type: "text/plain",
      });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockTextBlob)),
        },
      });

      const attachment = makeAttachment({
        type: "text",
        name: "readme.txt",
        storageId: "storage-123" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "Stored text file content"
      );
    });

    test("returns error message when no source available", async () => {
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(null)),
        },
      });

      const attachment = makeAttachment({
        type: "text",
        name: "readme.txt",
        storageId: "storage-123" as Id<"_storage">,
      });

      const result = await convertAttachmentToAISDK(
        ctx as unknown as ActionCtx,
        attachment,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "Unable to read text file"
      );
    });
  });
});

describe("convertLegacyPartToAISDK", () => {
  describe("plain text parts", () => {
    test("converts text part correctly", async () => {
      const ctx = makeConvexCtx();

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        { type: "text", text: "Hello world" },
        defaultOptions
      );

      expect(result).toEqual({ type: "text", text: "Hello world" });
    });
  });

  describe("legacy image_url format", () => {
    test("converts image_url with attachment using storage URL", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() =>
            Promise.resolve("https://storage.convex.cloud/image.png")
          ),
        },
      });

      const part = {
        type: "image_url" as const,
        image_url: { url: "https://example.com/fallback.png" },
        attachment: makeAttachment({
          type: "image",
          storageId: "storage-123" as Id<"_storage">,
        }),
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result.type).toBe("image");
      expect((result as { image: string }).image).toBe(
        "https://storage.convex.cloud/image.png"
      );
    });

    test("falls back to image_url.url when no attachment", async () => {
      const ctx = makeConvexCtx();

      const part = {
        type: "image_url" as const,
        image_url: { url: "https://example.com/image.png" },
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result).toEqual({
        type: "image",
        image: "https://example.com/image.png",
      });
    });
  });

  describe("legacy file format", () => {
    test("converts file part with PDF attachment", async () => {
      const ctx = makeConvexCtx();

      const part = {
        type: "file" as const,
        file: { filename: "document.pdf" },
        attachment: makeAttachment({
          type: "pdf",
          extractedText: "PDF content from file part",
        }),
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain(
        "PDF content from file part"
      );
    });

    test("converts file part with text attachment", async () => {
      const ctx = makeConvexCtx();

      const part = {
        type: "file" as const,
        file: { filename: "readme.txt" },
        attachment: makeAttachment({
          type: "text",
          content: "Text file content",
        }),
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result.type).toBe("text");
      expect((result as { text: string }).text).toContain("Text file content");
    });
  });

  describe("new unified format (attachment passed directly)", () => {
    test("converts image type with attachment", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() =>
            Promise.resolve("https://storage.convex.cloud/img.png")
          ),
        },
      });

      const part = {
        type: "image" as const,
        attachment: makeAttachment({
          type: "image",
          storageId: "storage-123" as Id<"_storage">,
        }),
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result.type).toBe("image");
    });

    test("converts pdf type with attachment", async () => {
      const ctx = makeConvexCtx();

      const part = {
        type: "pdf" as const,
        attachment: makeAttachment({
          type: "pdf",
          extractedText: "PDF text",
        }),
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result.type).toBe("text");
    });

    test("converts text type with attachment", async () => {
      const ctx = makeConvexCtx();

      const part = {
        type: "text" as const,
        attachment: makeAttachment({
          type: "text",
          content: "File text",
        }),
      };

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        part,
        defaultOptions
      );

      expect(result.type).toBe("text");
    });
  });

  describe("unknown formats", () => {
    test("returns empty text for unknown part type", async () => {
      const ctx = makeConvexCtx();

      const result = await convertLegacyPartToAISDK(
        ctx as unknown as ActionCtx,
        { type: "unknown" as any, data: "something" },
        defaultOptions
      );

      expect(result).toEqual({ type: "text", text: "" });
    });
  });
});

describe("convertStoredMessageToAISDK", () => {
  test("converts simple text message", async () => {
    const ctx = makeConvexCtx();

    const result = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      { role: "user", content: "Hello world" },
      defaultOptions
    );

    expect(result).toEqual({ role: "user", content: "Hello world" });
  });

  test("converts message with image attachment", async () => {
    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.convex.cloud/img.png")
        ),
      },
    });

    const result = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      {
        role: "user",
        content: "Look at this image",
        attachments: [
          makeAttachment({
            type: "image",
            storageId: "storage-123" as Id<"_storage">,
          }),
        ],
      },
      defaultOptions
    );

    expect(result.role).toBe("user");
    expect(Array.isArray(result.content)).toBe(true);
    const parts = result.content as Array<{ type: string }>;
    expect(parts).toHaveLength(2);
    expect(parts[0]?.type).toBe("text");
    expect(parts[1]?.type).toBe("image");
  });

  test("converts message with multiple attachments", async () => {
    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.convex.cloud/img.png")
        ),
      },
    });

    const result = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      {
        role: "user",
        content: "Check these files",
        attachments: [
          makeAttachment({
            type: "image",
            storageId: "img-1" as Id<"_storage">,
          }),
          makeAttachment({
            type: "pdf",
            extractedText: "PDF content",
          }),
          makeAttachment({
            type: "text",
            content: "Text file content",
          }),
        ],
      },
      defaultOptions
    );

    const parts = result.content as Array<{ type: string }>;
    expect(parts).toHaveLength(4); // 1 text + 3 attachments
    expect(parts[0]?.type).toBe("text"); // Original message content
    expect(parts[1]?.type).toBe("image");
    expect(parts[2]?.type).toBe("text"); // PDF as text
    expect(parts[3]?.type).toBe("text"); // Text file
  });

  test("handles empty content with attachments", async () => {
    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.convex.cloud/img.png")
        ),
      },
    });

    const result = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      {
        role: "user",
        content: "", // Empty content
        attachments: [
          makeAttachment({
            type: "image",
            storageId: "storage-123" as Id<"_storage">,
          }),
        ],
      },
      defaultOptions
    );

    const parts = result.content as Array<{ type: string }>;
    expect(parts).toHaveLength(1); // Only the image, no empty text part
    expect(parts[0]?.type).toBe("image");
  });

  test("handles whitespace-only content with attachments", async () => {
    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.convex.cloud/img.png")
        ),
      },
    });

    const result = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      {
        role: "user",
        content: "   ", // Whitespace only
        attachments: [
          makeAttachment({
            type: "image",
            storageId: "storage-123" as Id<"_storage">,
          }),
        ],
      },
      defaultOptions
    );

    const parts = result.content as Array<{ type: string }>;
    expect(parts).toHaveLength(1); // Only the image
  });

  test("preserves message roles", async () => {
    const ctx = makeConvexCtx();

    const systemResult = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      { role: "system", content: "You are helpful" },
      defaultOptions
    );
    expect(systemResult.role).toBe("system");

    const userResult = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      { role: "user", content: "Hello" },
      defaultOptions
    );
    expect(userResult.role).toBe("user");

    const assistantResult = await convertStoredMessageToAISDK(
      ctx as unknown as ActionCtx,
      { role: "assistant", content: "Hi there" },
      defaultOptions
    );
    expect(assistantResult.role).toBe("assistant");
  });
});

describe("convertStoredMessagesToAISDK", () => {
  test("converts multiple messages", async () => {
    const ctx = makeConvexCtx();

    const result = await convertStoredMessagesToAISDK(
      ctx as unknown as ActionCtx,
      [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ],
      defaultOptions
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: "system", content: "You are helpful" });
    expect(result[1]).toEqual({ role: "user", content: "Hello" });
    expect(result[2]).toEqual({ role: "assistant", content: "Hi there!" });
  });

  test("handles empty messages array", async () => {
    const ctx = makeConvexCtx();

    const result = await convertStoredMessagesToAISDK(
      ctx as unknown as ActionCtx,
      [],
      defaultOptions
    );

    expect(result).toEqual([]);
  });

  test("converts messages with mixed content types", async () => {
    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.convex.cloud/img.png")
        ),
      },
    });

    const result = await convertStoredMessagesToAISDK(
      ctx as unknown as ActionCtx,
      [
        { role: "user", content: "Simple text" },
        {
          role: "user",
          content: "With image",
          attachments: [
            makeAttachment({
              type: "image",
              storageId: "storage-123" as Id<"_storage">,
            }),
          ],
        },
        { role: "assistant", content: "Response" },
      ],
      defaultOptions
    );

    expect(result).toHaveLength(3);
    expect(result[0]?.content).toBe("Simple text");
    expect(Array.isArray(result[1]?.content)).toBe(true);
    expect(result[2]?.content).toBe("Response");
  });

  test("processes messages in parallel", async () => {
    const ctx = makeConvexCtx({
      storage: {
        getUrl: mock(() =>
          Promise.resolve("https://storage.convex.cloud/img.png")
        ),
      },
    });

    // This test verifies that Promise.all is used internally
    // by checking that multiple messages with attachments complete correctly
    const result = await convertStoredMessagesToAISDK(
      ctx as unknown as ActionCtx,
      [
        {
          role: "user",
          content: "Image 1",
          attachments: [
            makeAttachment({
              type: "image",
              storageId: "storage-1" as Id<"_storage">,
            }),
          ],
        },
        {
          role: "user",
          content: "Image 2",
          attachments: [
            makeAttachment({
              type: "image",
              storageId: "storage-2" as Id<"_storage">,
            }),
          ],
        },
        {
          role: "user",
          content: "Image 3",
          attachments: [
            makeAttachment({
              type: "image",
              storageId: "storage-3" as Id<"_storage">,
            }),
          ],
        },
      ],
      defaultOptions
    );

    expect(result).toHaveLength(3);
    // All should have converted successfully
    for (const msg of result) {
      expect(Array.isArray(msg.content)).toBe(true);
      expect((msg.content as Array<{ type: string }>).length).toBe(2);
    }
  });
});

describe("audio/video media attachments", () => {
  test("sends audio file part for Google provider", async () => {
    const audioBlob = new Blob(["audio-data"], { type: "audio/mpeg" });
    const ctx = makeConvexCtx({
      storage: {
        get: mock(() => Promise.resolve(audioBlob)),
      },
    });

    const attachment = makeAttachment({
      type: "audio",
      name: "recording.mp3",
      mimeType: "audio/mpeg",
      storageId: "audio-storage" as Id<"_storage">,
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      { provider: "google", modelId: "gemini-2.0-flash", supportsFiles: true }
    );

    expect(result.type).toBe("file");
  });

  test("sends video file part for Google provider", async () => {
    const videoBlob = new Blob(["video-data"], { type: "video/mp4" });
    const ctx = makeConvexCtx({
      storage: {
        get: mock(() => Promise.resolve(videoBlob)),
      },
    });

    const attachment = makeAttachment({
      type: "video",
      name: "clip.mp4",
      mimeType: "video/mp4",
      storageId: "video-storage" as Id<"_storage">,
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      { provider: "google", modelId: "gemini-2.0-flash", supportsFiles: true }
    );

    expect(result.type).toBe("file");
  });

  test("returns text fallback for OpenAI provider with audio", async () => {
    const ctx = makeConvexCtx();

    const attachment = makeAttachment({
      type: "audio",
      name: "recording.mp3",
      mimeType: "audio/mpeg",
      storageId: "audio-storage" as Id<"_storage">,
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      { provider: "openai", modelId: "gpt-4o", supportsFiles: true }
    );

    expect(result.type).toBe("text");
    expect((result as { text: string }).text).toContain("recording.mp3");
    expect((result as { text: string }).text).toContain(
      "does not support audio input"
    );
  });

  test("sends audio file part for OpenRouter provider", async () => {
    const audioBlob = new Blob(["audio-data"], { type: "audio/mpeg" });
    const ctx = makeConvexCtx({
      storage: {
        get: mock(() => Promise.resolve(audioBlob)),
      },
    });

    const attachment = makeAttachment({
      type: "audio",
      name: "recording.mp3",
      mimeType: "audio/mpeg",
      storageId: "audio-storage" as Id<"_storage">,
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      {
        provider: "openrouter",
        modelId: "google/gemini-2.0-flash",
        supportsFiles: true,
      }
    );

    expect(result.type).toBe("file");
  });

  test("sends video file part for OpenRouter provider", async () => {
    const videoBlob = new Blob(["video-data"], { type: "video/mp4" });
    const ctx = makeConvexCtx({
      storage: {
        get: mock(() => Promise.resolve(videoBlob)),
      },
    });

    const attachment = makeAttachment({
      type: "video",
      name: "clip.mp4",
      mimeType: "video/mp4",
      storageId: "video-storage" as Id<"_storage">,
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      {
        provider: "openrouter",
        modelId: "google/gemini-2.0-flash",
        supportsFiles: true,
      }
    );

    expect(result.type).toBe("file");
  });

  test("returns text fallback for Anthropic provider with audio", async () => {
    const ctx = makeConvexCtx();

    const attachment = makeAttachment({
      type: "audio",
      name: "voice.wav",
      mimeType: "audio/wav",
      storageId: "audio-storage" as Id<"_storage">,
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      {
        provider: "anthropic",
        modelId: "claude-3-opus",
        supportsFiles: true,
      }
    );

    expect(result.type).toBe("text");
    expect((result as { text: string }).text).toContain("voice.wav");
  });

  test("Google audio with inline content falls back when no storageId", async () => {
    const ctx = makeConvexCtx();

    const attachment = makeAttachment({
      type: "audio",
      name: "recording.mp3",
      mimeType: "audio/mpeg",
      content: "base64-audio-data",
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      { provider: "google", modelId: "gemini-2.0-flash", supportsFiles: true }
    );

    expect(result.type).toBe("file");
  });

  test("Google video graceful degradation when unavailable", async () => {
    const ctx = makeConvexCtx();

    const attachment = makeAttachment({
      type: "video",
      name: "clip.mp4",
      mimeType: "video/mp4",
      // No storageId, no content
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      { provider: "google", modelId: "gemini-2.0-flash", supportsFiles: true }
    );

    expect(result.type).toBe("text");
    expect((result as { text: string }).text).toContain("no longer available");
  });
});

describe("text formatting", () => {
  test("formats PDF text with filename header", async () => {
    const ctx = makeConvexCtx();

    const attachment = makeAttachment({
      type: "pdf",
      name: "report.pdf",
      extractedText: "This is the report content",
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      defaultOptions
    );

    expect((result as { text: string }).text).toBe(
      "--- Content from report.pdf ---\nThis is the report content"
    );
  });

  test("formats text file with filename header", async () => {
    const ctx = makeConvexCtx();

    const attachment = makeAttachment({
      type: "text",
      name: "readme.md",
      content: "# README\n\nThis is the readme.",
    });

    const result = await convertAttachmentToAISDK(
      ctx as unknown as ActionCtx,
      attachment,
      defaultOptions
    );

    expect((result as { text: string }).text).toBe(
      "--- Content from readme.md ---\n# README\n\nThis is the readme."
    );
  });
});
