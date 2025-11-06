import { describe, expect, test } from "bun:test";
import type { Attachment } from "@/types";
import { convertMessageForAI } from "./message-conversion";

describe("convertMessageForAI", () => {
  test("converts message without attachments to simple format", () => {
    const message = {
      role: "user",
      content: "Hello world",
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: "Hello world",
    });
  });

  test("converts message with empty attachments array", () => {
    const message = {
      role: "user",
      content: "Hello world",
      attachments: [],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: "Hello world",
    });
  });

  test("converts message with image attachment", () => {
    const message = {
      role: "user",
      content: "Check this image",
      attachments: [
        {
          id: "1",
          name: "test.png",
          type: "image",
          content: "base64data",
          mimeType: "image/png",
          size: 123,
        },
      ] as Attachment[],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Check this image",
        },
        {
          type: "image",
          image: "data:image/png;base64,base64data",
        },
      ],
    });
  });

  test("converts message with text attachment", () => {
    const message = {
      role: "user",
      content: "Check this file",
      attachments: [
        {
          id: "1",
          name: "test.txt",
          type: "text",
          content: "File content",
          size: 12,
        },
      ] as Attachment[],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Check this file",
        },
        {
          type: "text",
          text: "File content",
        },
      ],
    });
  });

  test("converts message with PDF attachment", () => {
    const message = {
      role: "user",
      content: "Check this PDF",
      attachments: [
        {
          id: "1",
          name: "test.pdf",
          type: "pdf",
          content: "pdf data",
          extractedText: "PDF text content",
          size: 1234,
        },
      ] as Attachment[],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Check this PDF",
        },
        {
          type: "text",
          text: "PDF text content",
        },
      ],
    });
  });

  test("handles message with only attachments and no content", () => {
    const message = {
      role: "user",
      content: "",
      attachments: [
        {
          id: "1",
          name: "test.png",
          type: "image",
          content: "base64data",
          mimeType: "image/png",
          size: 123,
        },
      ] as Attachment[],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "image",
          image: "data:image/png;base64,base64data",
        },
      ],
    });
  });

  test("handles message with whitespace-only content", () => {
    const message = {
      role: "user",
      content: "   ",
      attachments: [
        {
          id: "1",
          name: "test.png",
          type: "image",
          content: "base64data",
          mimeType: "image/png",
          size: 123,
        },
      ] as Attachment[],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "image",
          image: "data:image/png;base64,base64data",
        },
      ],
    });
  });

  test("converts multiple attachments", () => {
    const message = {
      role: "user",
      content: "Multiple files",
      attachments: [
        {
          id: "1",
          name: "test.png",
          type: "image",
          content: "imageData",
          mimeType: "image/png",
          size: 100,
        },
        {
          id: "2",
          name: "test.txt",
          type: "text",
          content: "text content",
          size: 12,
        },
      ] as Attachment[],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "user",
      content: [
        {
          type: "text",
          text: "Multiple files",
        },
        {
          type: "image",
          image: "data:image/png;base64,imageData",
        },
        {
          type: "text",
          text: "text content",
        },
      ],
    });
  });

  test("converts assistant role messages", () => {
    const message = {
      role: "assistant",
      content: "Response",
      attachments: [],
    };

    const result = convertMessageForAI(message);
    expect(result).toEqual({
      role: "assistant",
      content: "Response",
    });
  });
});
