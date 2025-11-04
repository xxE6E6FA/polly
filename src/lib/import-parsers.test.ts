import { describe, expect, test } from "bun:test";
import { detectAndParseImportData } from "./import-parsers";

describe("import-parsers", () => {
  describe("detectAndParseImportData", () => {
    test("parses valid Polly format", () => {
      const pollyData = {
        conversations: [
          {
            title: "Test Conversation",
            messages: [
              {
                role: "user",
                content: "Hello",
                createdAt: 1234567890,
                model: "gpt-4",
                provider: "openai",
              },
              {
                role: "assistant",
                content: "Hi there!",
                createdAt: 1234567891,
                reasoning: "Friendly greeting",
              },
            ],
            createdAt: 1234567890,
            updatedAt: 1234567900,
            isArchived: false,
            isPinned: true,
          },
        ],
      };

      const result = detectAndParseImportData(JSON.stringify(pollyData));

      expect(result.source).toBe("polly");
      expect(result.count).toBe(1);
      expect(result.errors).toEqual([]);
      expect(result.conversations).toHaveLength(1);

      const conversation = result.conversations[0];
      if (!conversation) {
        throw new Error("Expected parsed conversation");
      }
      expect(conversation.title).toBe("Test Conversation");
      expect(conversation.messages).toHaveLength(2);
      expect(conversation.createdAt).toBe(1234567890);
      expect(conversation.updatedAt).toBe(1234567900);
      expect(conversation.isArchived).toBe(false);
      expect(conversation.isPinned).toBe(true);

      const userMessage = conversation.messages[0];
      if (!userMessage) {
        throw new Error("Expected user message");
      }
      expect(userMessage.role).toBe("user");
      expect(userMessage.content).toBe("Hello");
      expect(userMessage.createdAt).toBe(1234567890);
      expect(userMessage.model).toBe("gpt-4");
      expect(userMessage.provider).toBe("openai");

      const assistantMessage = conversation.messages[1];
      expect(assistantMessage.role).toBe("assistant");
      expect(assistantMessage.content).toBe("Hi there!");
      expect(assistantMessage.reasoning).toBe("Friendly greeting");
    });

    test("handles minimal Polly format", () => {
      const minimalData = {
        conversations: [
          {
            title: "Minimal Chat",
            messages: [
              {
                role: "user",
                content: "Test",
              },
            ],
          },
        ],
      };

      const result = detectAndParseImportData(JSON.stringify(minimalData));

      expect(result.source).toBe("polly");
      expect(result.count).toBe(1);
      expect(result.errors).toEqual([]);

      const conversation = result.conversations[0];
      expect(conversation.title).toBe("Minimal Chat");
      expect(conversation.messages).toHaveLength(1);
      expect(conversation.createdAt).toBeUndefined();
      expect(conversation.isArchived).toBe(false);
      expect(conversation.isPinned).toBe(false);

      const message = conversation.messages[0];
      expect(message.role).toBe("user");
      expect(message.content).toBe("Test");
      expect(message.createdAt).toBeUndefined();
      expect(message.model).toBeUndefined();
    });

    test("handles empty conversations array", () => {
      const emptyData = { conversations: [] };
      const result = detectAndParseImportData(JSON.stringify(emptyData));

      expect(result.source).toBe("polly");
      expect(result.count).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.conversations).toEqual([]);
    });

    test("handles missing conversation properties gracefully", () => {
      const incompleteData = {
        conversations: [
          {
            // Missing title
            messages: null, // Invalid messages
          },
          {
            title: 123, // Invalid title type
            messages: [
              {
                role: "invalid_role", // Will default to user
                content: null, // Will be converted to string
                createdAt: "invalid_date", // Will be undefined
              },
            ],
          },
        ],
      };

      const result = detectAndParseImportData(JSON.stringify(incompleteData));

      expect(result.source).toBe("polly");
      expect(result.count).toBe(2);
      expect(result.errors).toEqual([]);

      const firstConv = result.conversations[0];
      expect(firstConv.title).toBeTruthy();
      expect(typeof firstConv.title).toBe("string");
      expect(firstConv.messages).toEqual([]);

      const secondConv = result.conversations[1];
      expect(secondConv.title).toBe("123");
      expect(secondConv.messages).toHaveLength(1);
      expect(secondConv.messages[0].role).toBe("user");
      expect(secondConv.messages[0].content).toBe("null");
      expect(secondConv.messages[0].createdAt).toBeUndefined();
    });

    test("handles attachments in messages", () => {
      const dataWithAttachments = {
        conversations: [
          {
            title: "Chat with Files",
            messages: [
              {
                role: "user",
                content: "Check this image",
                attachments: [
                  {
                    type: "image",
                    name: "photo.jpg",
                    size: 12345,
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = detectAndParseImportData(
        JSON.stringify(dataWithAttachments)
      );

      expect(result.conversations[0].messages[0].attachments).toEqual([
        {
          type: "image",
          name: "photo.jpg",
          size: 12345,
        },
      ]);
    });

    test("rejects non-Polly formats", () => {
      const chatGptData = {
        title: "ChatGPT Export",
        mapping: {
          "msg-1": { message: { content: "test" } },
        },
      };

      const result = detectAndParseImportData(JSON.stringify(chatGptData));

      expect(result.source).toBe("unknown");
      expect(result.count).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].length).toBeGreaterThan(0);
      expect(result.conversations).toEqual([]);
    });

    test("handles invalid JSON", () => {
      const invalidJson = '{"invalid": json}';
      const result = detectAndParseImportData(invalidJson);

      expect(result.source).toBe("unknown");
      expect(result.count).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].length).toBeGreaterThan(0);
      expect(result.conversations).toEqual([]);
    });

    test("handles corrupted Polly data", () => {
      // Valid JSON but parsing will fail
      const corruptedData = {
        conversations: "not_an_array",
      };

      const result = detectAndParseImportData(JSON.stringify(corruptedData));

      expect(result.source).toBe("polly");
      expect(result.count).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].length).toBeGreaterThan(0);
      expect(result.conversations).toEqual([]);
    });

    test("validates conversation structure correctly", () => {
      const invalidStructure = {
        conversations: [
          {
            title: "Valid Title",
            messages: [
              {
                // Missing required properties, but parser is lenient
                missingRole: true,
              },
            ],
          },
        ],
      };

      const result = detectAndParseImportData(JSON.stringify(invalidStructure));

      expect(result.source).toBe("polly");
      expect(result.count).toBe(1);
      expect(result.conversations[0].messages[0].role).toBe("user"); // Default
      expect(result.conversations[0].messages[0].content).toBe(""); // Default
    });

    test("handles multiple conversations correctly", () => {
      const multipleConvs = {
        conversations: [
          {
            title: "First Chat",
            messages: [{ role: "user", content: "Hello 1" }],
            isArchived: true,
          },
          {
            title: "Second Chat",
            messages: [{ role: "user", content: "Hello 2" }],
            isPinned: true,
          },
        ],
      };

      const result = detectAndParseImportData(JSON.stringify(multipleConvs));

      expect(result.count).toBe(2);
      expect(result.conversations[0].title).toBe("First Chat");
      expect(result.conversations[0].isArchived).toBe(true);
      expect(result.conversations[0].isPinned).toBe(false);
      expect(result.conversations[1].title).toBe("Second Chat");
      expect(result.conversations[1].isArchived).toBe(false);
      expect(result.conversations[1].isPinned).toBe(true);
    });
  });
});
