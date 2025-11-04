import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test/helpers";

describe("titleGeneration actions", () => {
  beforeEach(() => {
    // Ensure process.env exists in edge-runtime
    if (
      !(globalThis as { process?: { env: Record<string, string | undefined> } })
        .process
    ) {
      (
        globalThis as { process?: { env: Record<string, string | undefined> } }
      ).process = { env: {} };
    }
    // Clear all mocks before each test to ensure clean state
    mock.restore();
  });

  afterEach(() => {
    // Clean up all mocks after each test
    mock.restore();
  });

  test("generateTitle patches conversation with model title (Gemini branch)", async () => {
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
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce({
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
    expect(title).toBeTruthy();
    expect(typeof title).toBe("string");
    expect(title.length).toBeGreaterThan(0);

    // Verify the conversation was updated with the generated title
    const updatedConversation = await t.db.get(conversationId);
    expect(updatedConversation?.title).toBe(title);
  });

  test("generateTitle falls back and patches when no API key", async () => {
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

  test("generateTitleBackground generates title and updates conversation", async () => {
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
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue({
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

    // Verify the conversation was updated with a generated title
    const updatedConversation = await t.db.get(conversationId);
    expect(updatedConversation?.title).toBeTruthy();
    expect(typeof updatedConversation?.title).toBe("string");
    expect(updatedConversation?.title.length).toBeGreaterThan(0);
  });
});
