import { describe, expect, test } from "bun:test";
import type { Attachment } from "@/types";
import { convertAttachmentsForAI } from "./attachment-conversion";

describe("convertAttachmentsForAI", () => {
  test("returns empty array for undefined attachments", () => {
    const result = convertAttachmentsForAI(undefined);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty attachments array", () => {
    const result = convertAttachmentsForAI([]);
    expect(result).toEqual([]);
  });

  test("converts image attachment to AI format", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.png",
      type: "image",
      content: "base64data",
      mimeType: "image/png",
      size: 123,
    };

    const result = convertAttachmentsForAI([attachment]);
    expect(result).toEqual([
      {
        type: "image",
        image: "data:image/png;base64,base64data",
      },
    ]);
  });

  test("uses default mimeType for image without mimeType", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.jpg",
      type: "image",
      content: "base64data",
      size: 123,
    };

    const result = convertAttachmentsForAI([attachment]);
    expect(result).toEqual([
      {
        type: "image",
        image: "data:image/jpeg;base64,base64data",
      },
    ]);
  });

  test("throws error for image without content", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.png",
      type: "image",
      content: "",
      size: 123,
    };

    expect(() => convertAttachmentsForAI([attachment])).toThrow(
      "Image attachment test.png has no content"
    );
  });

  test("converts text attachment to AI format", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.txt",
      type: "text",
      content: "Hello world",
      size: 11,
    };

    const result = convertAttachmentsForAI([attachment]);
    expect(result).toEqual([
      {
        type: "text",
        text: "Hello world",
      },
    ]);
  });

  test("throws error for text attachment without content", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.txt",
      type: "text",
      content: "",
      size: 0,
    };

    expect(() => convertAttachmentsForAI([attachment])).toThrow(
      "Text attachment test.txt has no content"
    );
  });

  test("converts PDF attachment to text format", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.pdf",
      type: "pdf",
      content: "raw pdf data",
      extractedText: "Extracted text content",
      size: 1234,
    };

    const result = convertAttachmentsForAI([attachment]);
    expect(result).toEqual([
      {
        type: "text",
        text: "Extracted text content",
      },
    ]);
  });

  test("falls back to content for PDF without extractedText", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.pdf",
      type: "pdf",
      content: "raw pdf data",
      size: 1234,
    };

    const result = convertAttachmentsForAI([attachment]);
    expect(result).toEqual([
      {
        type: "text",
        text: "raw pdf data",
      },
    ]);
  });

  test("throws error for PDF without content or extractedText", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.pdf",
      type: "pdf",
      content: "",
      size: 0,
    };

    expect(() => convertAttachmentsForAI([attachment])).toThrow(
      "PDF attachment test.pdf has no content"
    );
  });

  test("throws error for unsupported attachment type", () => {
    const attachment: Attachment = {
      id: "1",
      name: "test.unknown",
      type: "unknown" as unknown as "image" | "text" | "pdf",
      content: "data",
      size: 123,
    };

    expect(() => convertAttachmentsForAI([attachment])).toThrow(
      "Unsupported attachment type: unknown"
    );
  });

  test("converts multiple attachments", () => {
    const attachments: Attachment[] = [
      {
        id: "1",
        name: "image.png",
        type: "image",
        content: "imageData",
        mimeType: "image/png",
        size: 100,
      },
      {
        id: "2",
        name: "text.txt",
        type: "text",
        content: "Hello",
        size: 5,
      },
      {
        id: "3",
        name: "doc.pdf",
        type: "pdf",
        content: "pdfData",
        extractedText: "PDF content",
        size: 200,
      },
    ];

    const result = convertAttachmentsForAI(attachments);
    expect(result).toEqual([
      {
        type: "image",
        image: "data:image/png;base64,imageData",
      },
      {
        type: "text",
        text: "Hello",
      },
      {
        type: "text",
        text: "PDF content",
      },
    ]);
  });
});
