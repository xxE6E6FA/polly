import { describe, expect, test } from "bun:test";
import {
  isAttachmentPart,
  stripAttachmentsFromOlderMessages,
} from "./streaming_actions";

describe("isAttachmentPart", () => {
  describe("returns false for non-attachment content", () => {
    test("returns false for null", () => {
      expect(isAttachmentPart(null)).toBe(false);
    });

    test("returns false for undefined", () => {
      expect(isAttachmentPart(undefined)).toBe(false);
    });

    test("returns false for string", () => {
      expect(isAttachmentPart("hello")).toBe(false);
    });

    test("returns false for number", () => {
      expect(isAttachmentPart(123)).toBe(false);
    });

    test("returns false for plain text part", () => {
      expect(isAttachmentPart({ type: "text", text: "Hello world" })).toBe(
        false
      );
    });

    test("returns false for empty object", () => {
      expect(isAttachmentPart({})).toBe(false);
    });

    test("returns false for object with unrelated type", () => {
      expect(isAttachmentPart({ type: "tool_result" })).toBe(false);
    });
  });

  describe("returns true for attachment content", () => {
    test("returns true for object with attachment property", () => {
      expect(
        isAttachmentPart({
          type: "image",
          attachment: { storageId: "123", name: "photo.jpg" },
        })
      ).toBe(true);
    });

    test("returns true for legacy image_url format", () => {
      expect(
        isAttachmentPart({
          type: "image_url",
          image_url: { url: "https://example.com/image.jpg" },
        })
      ).toBe(true);
    });

    test("returns true for file type", () => {
      expect(
        isAttachmentPart({
          type: "file",
          file: { url: "https://example.com/doc.pdf" },
        })
      ).toBe(true);
    });

    test("returns true for image type", () => {
      expect(isAttachmentPart({ type: "image", image: "base64data" })).toBe(
        true
      );
    });

    test("returns true for pdf type", () => {
      expect(isAttachmentPart({ type: "pdf", data: "base64data" })).toBe(true);
    });

    test("returns true for audio type", () => {
      expect(isAttachmentPart({ type: "audio", data: "base64data" })).toBe(
        true
      );
    });

    test("returns true for video type", () => {
      expect(isAttachmentPart({ type: "video", data: "base64data" })).toBe(
        true
      );
    });

    test("returns true for attachment property even without type", () => {
      expect(isAttachmentPart({ attachment: { name: "file.txt" } })).toBe(true);
    });
  });
});

describe("stripAttachmentsFromOlderMessages", () => {
  describe("handles edge cases", () => {
    test("returns empty array for empty input", () => {
      expect(stripAttachmentsFromOlderMessages([])).toEqual([]);
    });

    test("returns messages unchanged when no user messages exist", () => {
      const messages = [
        { role: "system", content: "You are a helpful assistant" },
        { role: "assistant", content: "Hello!" },
      ];
      expect(stripAttachmentsFromOlderMessages(messages)).toEqual(messages);
    });

    test("handles single user message with string content", () => {
      const messages = [{ role: "user", content: "Hello" }];
      expect(stripAttachmentsFromOlderMessages(messages)).toEqual(messages);
    });
  });

  describe("preserves attachments on last user message", () => {
    test("keeps attachments on the only user message", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this" },
            { type: "image", attachment: { name: "photo.jpg" } },
          ],
        },
      ];
      expect(stripAttachmentsFromOlderMessages(messages)).toEqual(messages);
    });

    test("keeps attachments on last user message in conversation", () => {
      const messages = [
        { role: "user", content: "First message" },
        { role: "assistant", content: "Response" },
        {
          role: "user",
          content: [
            { type: "text", text: "Look at this" },
            { type: "image", attachment: { name: "photo.jpg" } },
          ],
        },
      ];
      expect(stripAttachmentsFromOlderMessages(messages)).toEqual(messages);
    });
  });

  describe("strips attachments from earlier messages", () => {
    test("removes attachments from earlier user messages", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "First image" },
            { type: "image", attachment: { name: "old.jpg" } },
          ],
        },
        { role: "assistant", content: "I see the first image" },
        {
          role: "user",
          content: [
            { type: "text", text: "Second image" },
            { type: "image", attachment: { name: "new.jpg" } },
          ],
        },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      // First user message should have attachment stripped
      expect(result[0]?.content).toEqual([
        { type: "text", text: "First image" },
      ]);
      // Assistant message unchanged
      expect(result[1]?.content).toBe("I see the first image");
      // Last user message keeps attachments
      expect(result[2]?.content).toEqual([
        { type: "text", text: "Second image" },
        { type: "image", attachment: { name: "new.jpg" } },
      ]);
    });

    test("removes attachments from assistant messages", () => {
      const messages = [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Here is an image" },
            { type: "image", attachment: { name: "generated.jpg" } },
          ],
        },
        { role: "user", content: "Thanks!" },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      // Assistant message should have attachment stripped
      expect(result[0]?.content).toEqual([
        { type: "text", text: "Here is an image" },
      ]);
      // User message unchanged
      expect(result[1]?.content).toBe("Thanks!");
    });

    test("handles all attachment types", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "Multiple attachments" },
            { type: "image", attachment: { name: "photo.jpg" } },
            {
              type: "image_url",
              image_url: { url: "https://example.com/img.jpg" },
            },
            { type: "file", file: { url: "https://example.com/doc.txt" } },
            { type: "pdf", data: "base64pdf" },
          ],
        },
        { role: "user", content: "Last message" },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      // First message should only have text
      expect(result[0]?.content).toEqual([
        { type: "text", text: "Multiple attachments" },
      ]);
    });
  });

  describe("handles messages with only attachments", () => {
    test("replaces attachment-only message with empty text part", () => {
      const messages = [
        {
          role: "user",
          content: [{ type: "image", attachment: { name: "only-image.jpg" } }],
        },
        { role: "user", content: "Last message" },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      // First message should have empty text part to maintain structure
      expect(result[0]?.content).toEqual([{ type: "text", text: "" }]);
    });

    test("preserves attachment-only message if it is the last user message", () => {
      const messages = [
        { role: "user", content: "Text first" },
        {
          role: "user",
          content: [{ type: "image", attachment: { name: "photo.jpg" } }],
        },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      // Last user message keeps its attachment
      expect(result[1]?.content).toEqual([
        { type: "image", attachment: { name: "photo.jpg" } },
      ]);
    });
  });

  describe("preserves string content", () => {
    test("keeps string content unchanged for all messages", () => {
      const messages = [
        { role: "system", content: "System prompt" },
        { role: "user", content: "User message 1" },
        { role: "assistant", content: "Assistant response" },
        { role: "user", content: "User message 2" },
      ];

      expect(stripAttachmentsFromOlderMessages(messages)).toEqual(messages);
    });
  });

  describe("handles mixed content", () => {
    test("strips only attachments, keeps text parts", () => {
      const messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "First" },
            { type: "image", attachment: { name: "a.jpg" } },
            { type: "text", text: "Second" },
            { type: "pdf", data: "pdfdata" },
          ],
        },
        { role: "user", content: "Last" },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      expect(result[0]?.content).toEqual([
        { type: "text", text: "First" },
        { type: "text", text: "Second" },
      ]);
    });
  });

  describe("handles complex conversations", () => {
    test("correctly processes long conversation with multiple attachment types", () => {
      const messages = [
        { role: "system", content: "You are helpful" },
        {
          role: "user",
          content: [
            { type: "text", text: "Image 1" },
            { type: "image", attachment: { name: "1.jpg" } },
          ],
        },
        { role: "assistant", content: "I see image 1" },
        {
          role: "user",
          content: [
            { type: "text", text: "Image 2" },
            { type: "image", attachment: { name: "2.jpg" } },
          ],
        },
        { role: "assistant", content: "I see image 2" },
        {
          role: "user",
          content: [
            { type: "text", text: "PDF" },
            { type: "pdf", data: "pdfdata" },
          ],
        },
        { role: "assistant", content: "I read the PDF" },
        {
          role: "user",
          content: [
            { type: "text", text: "Final image" },
            { type: "image", attachment: { name: "final.jpg" } },
          ],
        },
      ];

      const result = stripAttachmentsFromOlderMessages(messages);

      // System message unchanged
      expect(result[0]?.content).toBe("You are helpful");

      // First user message - attachment stripped
      expect(result[1]?.content).toEqual([{ type: "text", text: "Image 1" }]);

      // First assistant unchanged
      expect(result[2]?.content).toBe("I see image 1");

      // Second user message - attachment stripped
      expect(result[3]?.content).toEqual([{ type: "text", text: "Image 2" }]);

      // Second assistant unchanged
      expect(result[4]?.content).toBe("I see image 2");

      // Third user message - attachment stripped
      expect(result[5]?.content).toEqual([{ type: "text", text: "PDF" }]);

      // Third assistant unchanged
      expect(result[6]?.content).toBe("I read the PDF");

      // Last user message - keeps attachment
      expect(result[7]?.content).toEqual([
        { type: "text", text: "Final image" },
        { type: "image", attachment: { name: "final.jpg" } },
      ]);
    });
  });

  describe("immutability", () => {
    test("does not mutate original messages array", () => {
      const originalContent = [
        { type: "text", text: "Hello" },
        { type: "image", attachment: { name: "photo.jpg" } },
      ];
      const messages = [
        { role: "user", content: [...originalContent] },
        { role: "user", content: "Last" },
      ];

      stripAttachmentsFromOlderMessages(messages);

      // Original should be unchanged
      expect(messages[0]?.content).toEqual(originalContent);
    });
  });
});
