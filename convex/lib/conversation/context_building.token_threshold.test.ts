import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger to keep output quiet
vi.mock("../logger", () => ({ log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

// Mock model resolution to provide a context window
vi.mock("../model_resolution", () => ({
  getUserEffectiveModelWithCapabilities: vi.fn(async () => ({
    modelId: "x",
    provider: "google",
    name: "x",
    supportsReasoning: false,
    contextLength: 50, // small context window for test
  })),
}));

// Mock summarization helpers and config with a very small MIN_TOKEN_THRESHOLD
vi.mock("./summarization", () => ({
  CONTEXT_CONFIG: { SUMMARY_THRESHOLD: 9999, MAX_SUMMARY_CHUNKS: 5, MIN_TOKEN_THRESHOLD: 10 },
  processChunksWithStoredSummaries: vi.fn(async (_ctx: any, _cid: string, _msgs: any[]) => [
    { summary: "SUM", chunkIndex: 0, originalMessageCount: 2 },
  ]),
  createRecursiveMetaSummary: vi.fn(async (_ctx: any, _cid: string, summaries: string[]) => summaries.map(s => ({ summary: s }))),
  summarizeChunk: vi.fn(async () => "SUM"),
  storeChunkSummary: vi.fn(async () => {}),
}));

import { buildHierarchicalContextMessages } from "./context_building";

describe("context building: token-based threshold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mkMsg = (role: string, len: number) => ({ _id: Math.random().toString(), _creationTime: Date.now(), role, content: "x".repeat(len) });

  it("returns empty when token estimate is below min(context, cap)", async () => {
    const ctx: any = { runQuery: vi.fn().mockResolvedValue([mkMsg("user", 20), mkMsg("assistant", 20)]) };
    const res = await buildHierarchicalContextMessages(ctx, "c1" as any, "u1" as any, "m1", 0);
    expect(res).toEqual([]);
  });

  it("returns a context system message when token estimate exceeds threshold", async () => {
    // 60 + 60 chars ≈ 30 tokens (chars/4), MIN_TOKEN_THRESHOLD=10 → summarize
    const ctx: any = { runQuery: vi.fn().mockResolvedValue([mkMsg("user", 60), mkMsg("assistant", 60)]) };
    const res = await buildHierarchicalContextMessages(ctx, "c2" as any, "u1" as any, "m1", 0);
    expect(res).toHaveLength(1);
    expect(res[0].role).toBe("system");
    expect(res[0].content).toContain("SUM");
  });
});

