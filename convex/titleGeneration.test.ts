import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test/helpers";

// Quiet logger noise in tests
vi.mock("./lib/logger", () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("titleGeneration actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Ensure process.env exists in edge-runtime
    if (
      !(globalThis as { process?: { env: Record<string, string | undefined> } })
        .process
    ) {
      (
        globalThis as { process?: { env: Record<string, string | undefined> } }
      ).process = { env: {} };
    }
  });

  it("generateTitle patches conversation with model title (Gemini branch)", async () => {
    const t = await makeConvexTest();

    // Create a test user first
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
      conversationCount: 0,
      totalMessageCount: 0,
    });

    // Create a test conversation
    const conversationId = await t.db.insert("conversations", {
      title: "Test Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isStreaming: false,
      userId,
    });

    (process.env as Record<string, string | undefined>).GEMINI_API_KEY =
      "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "My AI Title" }] } }],
      }),
    } as unknown as Response);

    const title = await t.action(api.titleGeneration.generateTitle, {
      message: "Hello world",
      conversationId,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(title).toBe("My AI Title");

    // Verify the conversation was updated
    const updatedConversation = await t.db.get(conversationId);
    expect(updatedConversation?.title).toBe("My AI Title");
  });

  it("generateTitle falls back and patches when no API key", async () => {
    const t = await makeConvexTest();

    // Create a test user first
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
      conversationCount: 0,
      totalMessageCount: 0,
    });

    // Create a test conversation
    const conversationId = await t.db.insert("conversations", {
      title: "Test Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isStreaming: false,
      userId,
    });

    (process.env as Record<string, string | undefined>).GEMINI_API_KEY =
      undefined;

    const title = await t.action(api.titleGeneration.generateTitle, {
      message:
        "A very long message that should be truncated to ensure we do not exceed sixty characters in the title",
      conversationId,
    });

    expect(title.length).toBeLessThanOrEqual(60);

    // Verify the conversation was updated
    const updatedConversation = await t.db.get(conversationId);
    expect(updatedConversation?.title).toBe(title);
  });

  it("generateTitleBackground generates title and updates conversation", async () => {
    const t = await makeConvexTest();

    // Create a test user first
    const userId = await t.db.insert("users", {
      isAnonymous: false,
      createdAt: Date.now(),
      conversationCount: 0,
      totalMessageCount: 0,
    });

    // Create a test conversation
    const conversationId = await t.db.insert("conversations", {
      title: "Test Conversation",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isStreaming: false,
      userId,
    });

    (process.env as Record<string, string | undefined>).GEMINI_API_KEY =
      "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Test Title" }] } }],
      }),
    } as unknown as Response);

    await t.action(api.titleGeneration.generateTitleBackground, {
      conversationId,
      message: "Hello",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Verify the conversation was updated
    const updatedConversation = await t.db.get(conversationId);
    expect(updatedConversation?.title).toBe("Test Title");
  });
});
