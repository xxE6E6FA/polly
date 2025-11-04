import { describe, expect, test } from "bun:test";
import { ROUTES } from "./routes";

describe("routes", () => {
  describe("ROUTES constants", () => {
    test("has correct static route paths", () => {
      expect(ROUTES.HOME).toBe("/");
      expect(ROUTES.AUTH).toBe("/auth");
      expect(ROUTES.CHAT).toBe("/chat");
      expect(ROUTES.PRIVATE_CHAT).toBe("/private");
      expect(ROUTES.FAVORITES).toBe("/chat/favorites");
      expect(ROUTES.NOT_FOUND).toBe("/404");
    });

    test("has correct settings routes", () => {
      expect(ROUTES.SETTINGS.ROOT).toBe("/settings");
      expect(ROUTES.SETTINGS.API_KEYS).toBe("/settings/api-keys");
      expect(ROUTES.SETTINGS.MODELS).toBe("/settings/models");
      expect(ROUTES.SETTINGS.TEXT_MODELS).toBe("/settings/models/text");
      expect(ROUTES.SETTINGS.IMAGE_MODELS).toBe("/settings/models/image");
      expect(ROUTES.SETTINGS.PERSONAS).toBe("/settings/personas");
      expect(ROUTES.SETTINGS.PERSONAS_NEW).toBe("/settings/personas/new");
      expect(ROUTES.SETTINGS.SHARED_CONVERSATIONS).toBe(
        "/settings/shared-conversations"
      );
      expect(ROUTES.SETTINGS.ARCHIVED_CONVERSATIONS).toBe(
        "/settings/archived-conversations"
      );
      expect(ROUTES.SETTINGS.CHAT_HISTORY).toBe("/settings/chat-history");
      expect(ROUTES.SETTINGS.ATTACHMENTS).toBe("/settings/attachments");
      expect(ROUTES.SETTINGS.GENERAL).toBe("/settings/general");
    });
  });

  describe("dynamic route functions", () => {
    test("generates correct chat conversation routes", () => {
      expect(ROUTES.CHAT_CONVERSATION("abc123")).toBe("/chat/abc123");
      expect(ROUTES.CHAT_CONVERSATION("conversation_456")).toBe(
        "/chat/conversation_456"
      );
      expect(ROUTES.CHAT_CONVERSATION("")).toBe("/chat/");
    });

    test("generates correct share routes", () => {
      expect(ROUTES.SHARE("share123")).toBe("/share/share123");
      expect(ROUTES.SHARE("public_abc")).toBe("/share/public_abc");
      expect(ROUTES.SHARE("")).toBe("/share/");
    });

    test("generates correct persona edit routes", () => {
      expect(ROUTES.SETTINGS.PERSONAS_EDIT("persona123")).toBe(
        "/settings/personas/persona123/edit"
      );
      expect(ROUTES.SETTINGS.PERSONAS_EDIT("my_persona")).toBe(
        "/settings/personas/my_persona/edit"
      );
      expect(ROUTES.SETTINGS.PERSONAS_EDIT("")).toBe(
        "/settings/personas//edit"
      );
    });
  });

  describe("route parameter handling", () => {
    test("handles special characters in IDs", () => {
      expect(ROUTES.CHAT_CONVERSATION("test-123_abc")).toBe(
        "/chat/test-123_abc"
      );
      expect(ROUTES.SHARE("share.with.dots")).toBe("/share/share.with.dots");
      expect(ROUTES.SETTINGS.PERSONAS_EDIT("persona-name_123")).toBe(
        "/settings/personas/persona-name_123/edit"
      );
    });

    test("preserves URL encoding in parameters", () => {
      const encodedId = "test%20with%20spaces";
      expect(ROUTES.CHAT_CONVERSATION(encodedId)).toBe(`/chat/${encodedId}`);
      expect(ROUTES.SHARE(encodedId)).toBe(`/share/${encodedId}`);
      expect(ROUTES.SETTINGS.PERSONAS_EDIT(encodedId)).toBe(
        `/settings/personas/${encodedId}/edit`
      );
    });
  });
});
