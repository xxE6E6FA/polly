import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubGlobal("fetch", vi.fn());
vi.mock("../logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import {
  CONTEXT_CONFIG,
  calculateOptimalChunkSize,
  processChunksWithStoredSummaries,
  storeChunkSummary,
  createRecursiveMetaSummary,
  summarizeChunk,
  buildConversationText,
  buildSummaryPrompt,
  generateLLMSummary,
  buildMetaSummaryPrompt,
  createFallbackSummary,
  intelligentTruncateSummary,
} from "./summarization";

describe("conversation/summarization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculateOptimalChunkSize adjusts by context window", () => {
    expect(calculateOptimalChunkSize()).toBe(CONTEXT_CONFIG.CHUNK_SIZE);
    expect(calculateOptimalChunkSize(200000)).toBeLessThanOrEqual(CONTEXT_CONFIG.MAX_CHUNK_SIZE);
    expect(calculateOptimalChunkSize(16000)).toBeGreaterThanOrEqual(CONTEXT_CONFIG.MIN_CHUNK_SIZE);
  });

  it("processChunksWithStoredSummaries uses stored summaries and raw messages", async () => {
    const runQuery = vi.fn().mockResolvedValue([
      { chunkIndex: 0, summary: "SUM0" },
    ]);
    const ctx: any = { runQuery };
    const msgs = Array.from({ length: 20 }).map((_, i) => ({ _id: `m${i}`, role: "user", content: "c" }));
    const chunks = await processChunksWithStoredSummaries(ctx, "c1", msgs as any);
    // First chunk uses stored summary
    expect(chunks[0].summary).toBe("SUM0");
    // Another chunk should contain raw messages
    expect(chunks.some(c => c.messages)).toBe(true);
  });

  it("storeChunkSummary writes via mutation and swallows errors", async () => {
    const runMutation = vi.fn(async () => {});
    await storeChunkSummary({ runMutation } as any, "c1", 0, "S", 3, { messages: [{ _id: "x" }, { _id: "y" }] } as any);
    expect(runMutation).toHaveBeenCalled();
    // failing still should not throw
    const failing = vi.fn(async () => { throw new Error("x"); });
    await storeChunkSummary({ runMutation: failing } as any, "c1", 0, "S", 3, { messages: [{ _id: "x" }] } as any);
  });

  it("createRecursiveMetaSummary collapses many summaries via LLM calls", async () => {
    const many = Array.from({ length: CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS * 2 + 1 }).map((_, i) => `S${i}`);
    vi.mocked(fetch as any).mockResolvedValue({ ok: true, json: async () => ({ content: [{ text: "META" }] }) });
    const chunks = await createRecursiveMetaSummary({} as any, "c1", many);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("summarizeChunk uses LLM and falls back on error", async () => {
    // Use LLM path
    vi.mocked(fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ content: [{ text: "A long summary" }] }) });
    const s1 = await summarizeChunk([{ role: "user", content: "hello" }] as any);
    expect(typeof s1).toBe("string");
    // Error path → fallback
    vi.mocked(fetch as any).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const s2 = await summarizeChunk([{ role: "assistant", content: "world" }] as any);
    expect(typeof s2).toBe("string");
  });

  it("buildConversationText/prompt and truncation helpers behave as expected", () => {
    const text = buildConversationText([
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" },
    ] as any);
    expect(text).toContain("User:");

    const prompt = buildSummaryPrompt("abc", 100);
    expect(prompt).toContain("abc");

    const long = "Sentence one. Sentence two. Sentence three.";
    const truncated = intelligentTruncateSummary(long, 20);
    expect(truncated.length).toBeLessThanOrEqual(20);

    const fallback = createFallbackSummary("a ".repeat(200), 60);
    expect(fallback.length).toBeLessThanOrEqual(60);

    const meta = buildMetaSummaryPrompt("S1\nS2", 200);
    expect(meta).toContain("S1");
  });

  it("generateLLMSummary throws on non-ok and catches error path", async () => {
    vi.mocked(fetch as any).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(generateLLMSummary("p", 50)).rejects.toBeInstanceOf(Error);
  });
});
