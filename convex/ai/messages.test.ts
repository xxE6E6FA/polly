import { describe, expect, mock, test, beforeEach } from "bun:test";
import { makeConvexCtx } from "../../test/convex-ctx";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { convertMessagePart, convertMessages } from "./messages";

// Mock the pdf module
const mockShouldExtractPdfText = mock((provider: string, modelId: string, supportsFiles?: boolean) => {
  // Anthropic and Google with file support don't need extraction
  if (supportsFiles && (provider === "anthropic" || provider === "google")) {
    return false;
  }
  return true;
});

// We'll mock the actual implementation behavior in tests

describe("convertMessagePart", () => {
  describe("text parts", () => {
    test("converts text part correctly", async () => {
      const ctx = makeConvexCtx();
      const part = { type: "text", text: "Hello world" };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({ type: "text", text: "Hello world" });
    });

    test("handles empty text", async () => {
      const ctx = makeConvexCtx();
      const part = { type: "text", text: "" };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({ type: "text", text: "" });
    });

    test("handles missing text field", async () => {
      const ctx = makeConvexCtx();
      const part = { type: "text" };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({ type: "text", text: "" });
    });
  });

  describe("raw image attachments (from createConversation)", () => {
    test("converts image with storageId using storage URL", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() => Promise.resolve("https://storage.convex.cloud/image.png")),
        },
      });

      const part = {
        type: "image",
        storageId: "storage-123" as Id<"_storage">,
        name: "test.png",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result.type).toBe("image");
      expect(result.image).toBe("https://storage.convex.cloud/image.png");
    });

    test("falls back to data URL when getUrl returns null", async () => {
      const mockBlob = new Blob(["image data"], { type: "image/png" });
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() => Promise.resolve(null)),
          get: mock(() => Promise.resolve(mockBlob)),
        },
      });

      const part = {
        type: "image",
        storageId: "storage-123" as Id<"_storage">,
        name: "test.png",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result.type).toBe("image");
      expect(result.image).toContain("data:");
    });

    test("converts image with url fallback", async () => {
      const ctx = makeConvexCtx();
      const part = {
        type: "image",
        url: "https://example.com/image.png",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "image",
        image: "https://example.com/image.png",
      });
    });

    test("returns empty text for image without storageId or url", async () => {
      const ctx = makeConvexCtx();
      const part = { type: "image", name: "test.png" };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({ type: "text", text: "" });
    });
  });

  describe("raw PDF attachments (from createConversation)", () => {
    test("uses extractedText when available", async () => {
      const ctx = makeConvexCtx();
      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
        extractedText: "This is the extracted PDF content",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "This is the extracted PDF content",
      });
    });

    test("retrieves text from textFileId when extractedText not available", async () => {
      const mockTextBlob = new Blob(["Stored PDF text"], { type: "text/plain" });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockTextBlob)),
        },
      });

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
        textFileId: "text-storage-456" as Id<"_storage">,
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Stored PDF text",
      });
    });

    test("triggers PDF extraction when no cached text available", async () => {
      const extractedText = "Extracted from Gemini";
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.resolve({
            text: extractedText,
            textFileId: "new-text-id" as Id<"_storage">,
          })
        ),
      });

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: extractedText,
      });
      expect(ctx.runAction).toHaveBeenCalled();
    });

    test("returns error message when PDF extraction fails", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.reject(new Error("Gemini API error"))
        ),
      });

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result.type).toBe("text");
      expect(result.text).toContain("PDF extraction failed");
      expect(result.text).toContain("document.pdf");
    });

    test("returns error message for PDF without storageId", async () => {
      const ctx = makeConvexCtx();
      const part = {
        type: "pdf",
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result.type).toBe("text");
      expect(result.text).toContain("Unable to process PDF");
    });
  });

  describe("raw text file attachments (from createConversation)", () => {
    test("uses content when available", async () => {
      const ctx = makeConvexCtx();
      const part = {
        type: "text",
        storageId: "storage-123" as Id<"_storage">,
        name: "readme.txt",
        content: "File content here",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "File content here",
      });
    });

    test("retrieves text from storage when content not available", async () => {
      const mockTextBlob = new Blob(["Stored file content"], { type: "text/plain" });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockTextBlob)),
        },
      });

      const part = {
        type: "text",
        storageId: "storage-123" as Id<"_storage">,
        name: "readme.txt",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Stored file content",
      });
    });
  });

  describe("image_url parts (from buildContextMessages)", () => {
    test("converts image_url with attachment storageId using storage URL", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() => Promise.resolve("https://storage.convex.cloud/image.png")),
        },
      });

      const part = {
        type: "image_url",
        image_url: { url: "https://example.com/image.png" },
        attachment: {
          storageId: "storage-123" as Id<"_storage">,
          type: "image",
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result.type).toBe("image");
      expect(result.image).toBe("https://storage.convex.cloud/image.png");
    });

    test("falls back to url when getUrl and get both fail", async () => {
      const ctx = makeConvexCtx({
        storage: {
          getUrl: mock(() => Promise.resolve(null)),
          get: mock(() => Promise.reject(new Error("Storage error"))),
        },
      });

      const part = {
        type: "image_url",
        image_url: { url: "https://example.com/image.png" },
        attachment: {
          storageId: "storage-123" as Id<"_storage">,
          type: "image",
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "image",
        image: "https://example.com/image.png",
      });
    });
  });

  describe("file parts with PDF attachment (from buildContextMessages)", () => {
    test("uses extractedText when available", async () => {
      const ctx = makeConvexCtx();
      const part = {
        type: "file",
        file: { filename: "document.pdf" },
        attachment: {
          type: "pdf",
          storageId: "storage-123" as Id<"_storage">,
          extractedText: "Pre-extracted text",
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Pre-extracted text",
      });
    });

    test("retrieves text from textFileId", async () => {
      const mockTextBlob = new Blob(["Cached PDF text"], { type: "text/plain" });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockTextBlob)),
        },
      });

      const part = {
        type: "file",
        file: { filename: "document.pdf" },
        attachment: {
          type: "pdf",
          storageId: "storage-123" as Id<"_storage">,
          textFileId: "text-storage-456" as Id<"_storage">,
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Cached PDF text",
      });
    });

    test("triggers extraction when no cached text", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.resolve({
            text: "Newly extracted text",
            textFileId: "new-text-id" as Id<"_storage">,
          })
        ),
      });

      const part = {
        type: "file",
        file: { filename: "document.pdf" },
        attachment: {
          type: "pdf",
          storageId: "storage-123" as Id<"_storage">,
          name: "document.pdf",
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Newly extracted text",
      });
      expect(ctx.runAction).toHaveBeenCalled();
    });
  });

  describe("native PDF support (Anthropic/Google)", () => {
    test("sends raw PDF for Anthropic with file support", async () => {
      const mockPdfBlob = new Blob(["PDF binary data"], { type: "application/pdf" });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockPdfBlob)),
        },
      });

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "anthropic",
        "claude-3-opus",
        true // supportsFiles = true
      );

      expect(result.type).toBe("file");
      expect(result.data).toBeInstanceOf(ArrayBuffer);
      expect(result.mimeType).toBe("application/pdf");
    });

    test("sends raw PDF for Google with file support", async () => {
      const mockPdfBlob = new Blob(["PDF binary data"], { type: "application/pdf" });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockPdfBlob)),
        },
      });

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "google",
        "gemini-pro",
        true // supportsFiles = true
      );

      expect(result.type).toBe("file");
      expect(result.data).toBeInstanceOf(ArrayBuffer);
    });

    test("extracts text for Anthropic without file support", async () => {
      const ctx = makeConvexCtx({
        runAction: mock(() =>
          Promise.resolve({
            text: "Extracted for non-file-supporting model",
            textFileId: "text-id" as Id<"_storage">,
          })
        ),
      });

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "anthropic",
        "claude-2",
        false // supportsFiles = false
      );

      expect(result.type).toBe("text");
      expect(result.text).toBe("Extracted for non-file-supporting model");
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

      const part = {
        type: "pdf",
        storageId: "storage-123" as Id<"_storage">,
        name: "document.pdf",
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4o",
        true // Even with supportsFiles, OpenAI doesn't handle PDFs natively
      );

      expect(result.type).toBe("text");
      expect(ctx.runAction).toHaveBeenCalled();
    });
  });

  describe("file parts with text attachment", () => {
    test("uses content when available", async () => {
      const ctx = makeConvexCtx();
      const part = {
        type: "file",
        file: { filename: "readme.txt" },
        attachment: {
          type: "text",
          content: "Text file content",
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Text file content",
      });
    });

    test("retrieves text from storage when no content", async () => {
      const mockTextBlob = new Blob(["Stored text content"], { type: "text/plain" });
      const ctx = makeConvexCtx({
        storage: {
          get: mock(() => Promise.resolve(mockTextBlob)),
        },
      });

      const part = {
        type: "file",
        file: { filename: "readme.txt" },
        attachment: {
          type: "text",
          storageId: "storage-123" as Id<"_storage">,
        },
      };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({
        type: "text",
        text: "Stored text content",
      });
    });
  });

  describe("unknown part types", () => {
    test("returns empty text for unknown type", async () => {
      const ctx = makeConvexCtx();
      const part = { type: "unknown", data: "something" };

      const result = await convertMessagePart(
        ctx as unknown as ActionCtx,
        part,
        "openai",
        "gpt-4",
        false
      );

      expect(result).toEqual({ type: "text", text: "" });
    });
  });
});

describe("convertMessages", () => {
  test("converts string content messages", async () => {
    const ctx = makeConvexCtx();
    const messages = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ];

    const result = await convertMessages(
      ctx as unknown as ActionCtx,
      messages,
      "openai",
      "gpt-4",
      false
    );

    expect(result).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  test("converts messages with array content", async () => {
    const ctx = makeConvexCtx();
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Look at this:" },
          { type: "text", text: "Some more text" },
        ],
      },
    ];

    const result = await convertMessages(
      ctx as unknown as ActionCtx,
      messages,
      "openai",
      "gpt-4",
      false
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
    expect(result[0]?.content).toHaveLength(2);
    expect(result[0]?.content[0]).toEqual({ type: "text", text: "Look at this:" });
  });

  test("converts messages with PDF attachments", async () => {
    const ctx = makeConvexCtx();
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Check this PDF:" },
          {
            type: "pdf",
            storageId: "storage-123" as Id<"_storage">,
            name: "document.pdf",
            extractedText: "PDF content",
          },
        ],
      },
    ];

    const result = await convertMessages(
      ctx as unknown as ActionCtx,
      messages,
      "openai",
      "gpt-4",
      false
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.content).toHaveLength(2);
    expect(result[0]?.content[0]).toEqual({ type: "text", text: "Check this PDF:" });
    expect(result[0]?.content[1]).toEqual({ type: "text", text: "PDF content" });
  });

  test("preserves message roles correctly", async () => {
    const ctx = makeConvexCtx();
    const messages = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ];

    const result = await convertMessages(
      ctx as unknown as ActionCtx,
      messages,
      "openai",
      "gpt-4",
      false
    );

    expect(result[0]?.role).toBe("system");
    expect(result[1]?.role).toBe("user");
    expect(result[2]?.role).toBe("assistant");
  });

  test("handles mixed string and array content messages", async () => {
    const ctx = makeConvexCtx();
    const messages = [
      { role: "user", content: "Simple text" },
      {
        role: "user",
        content: [{ type: "text", text: "Array text" }],
      },
      { role: "assistant", content: "Response" },
    ];

    const result = await convertMessages(
      ctx as unknown as ActionCtx,
      messages,
      "openai",
      "gpt-4",
      false
    );

    expect(result[0]?.content).toBe("Simple text");
    expect(result[1]?.content).toEqual([{ type: "text", text: "Array text" }]);
    expect(result[2]?.content).toBe("Response");
  });
});
