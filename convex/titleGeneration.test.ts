import { beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { generateTitle, generateTitleBackground } from "./titleGeneration";

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
    (process.env as Record<string, string | undefined>).GEMINI_API_KEY =
      "test-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "My AI Title" }] } }],
      }),
    } as unknown as Response);

    const runMutation = vi.fn(async () => {
      // Mock implementation - do nothing
    });
    const ctx = { runMutation };

    const title = await (generateTitle as any)(ctx, {
      message: "Hello world",
      conversationId: "c1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(title).toBe("My AI Title");
    expect(runMutation).toHaveBeenCalledWith(
      internal.conversations.internalPatch,
      {
        id: "c1",
        updates: { title: "My AI Title" },
        setUpdatedAt: true,
      }
    );
  });

  it("generateTitle falls back and patches when no API key", async () => {
    (process.env as Record<string, string | undefined>).GEMINI_API_KEY =
      undefined;
    const runMutation = vi.fn(async () => {
      // Mock implementation - do nothing
    });
    const ctx = { runMutation };

    const title = await (generateTitle as any)(ctx, {
      message:
        "A very long message that should be truncated to ensure we do not exceed sixty characters in the title",
      conversationId: "c2",
    });

    expect(title.length).toBeLessThanOrEqual(60);
    expect(runMutation).toHaveBeenCalledWith(
      internal.conversations.internalPatch,
      expect.objectContaining({ id: "c2", setUpdatedAt: true })
    );
  });

  it("generateTitleBackground delegates to generateTitle action", async () => {
    const runAction = vi.fn(async () => {
      // Mock implementation - do nothing
    });
    const ctx = { runAction, scheduler: { runAfter: vi.fn() } };

    await (generateTitleBackground as any)(ctx, {
      conversationId: "c3",
      message: "Hello",
    });

    expect(runAction).toHaveBeenCalledWith(api.titleGeneration.generateTitle, {
      conversationId: "c3",
      message: "Hello",
    });
  });
});
