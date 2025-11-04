import { describe, test, expect, mock, afterAll, beforeAll } from "bun:test";

// Mock logger to keep output quiet
mock.module("../logger", () => ({
  log: {
    debug: mock(),
    info: mock(),
    warn: mock(),
    error: mock(),
    streamStart: mock(),
    streamReasoning: mock(),
    streamComplete: mock(),
    streamError: mock(),
    streamAbort: mock(),
  },
}));

// Mock model resolution to provide a context window
mock.module("../model_resolution", () => ({
  getUserEffectiveModelWithCapabilities: mock(async () => ({
    modelId: "x",
    provider: "google",
    name: "x",
    supportsReasoning: false,
    contextLength: 50, // small context window for test
  })),
}));

const summarizationModule = await import("./summarization");
const processSummariesMock = mock(async (_ctx: any, _cid: string, _msgs: any[]) => [
  { summary: "SUM", chunkIndex: 0, originalMessageCount: 2 },
]);
const createMetaSummaryMock = mock(async (_ctx: any, _cid: string, summaries: string[]) =>
  summaries.map(s => ({ summary: s })),
);
const summarizeChunkMock = mock(async () => "SUM");
const storeChunkSummaryMock = mock(async () => {});

beforeAll(() => {
  mock.module("./summarization", () => ({
    ...summarizationModule,
    CONTEXT_CONFIG: {
      ...summarizationModule.CONTEXT_CONFIG,
      SUMMARY_THRESHOLD: 9999,
      MAX_SUMMARY_CHUNKS: 5,
      MIN_TOKEN_THRESHOLD: 10,
    },
    processChunksWithStoredSummaries: processSummariesMock,
    createRecursiveMetaSummary: createMetaSummaryMock,
    summarizeChunk: summarizeChunkMock,
    storeChunkSummary: storeChunkSummaryMock,
  }));
});
afterAll(() => {
  mock.restore();
});

import { buildHierarchicalContextMessages } from "./context_building";

describe("context building: token-based threshold", () => {

  const mkMsg = (role: string, len: number) => ({ _id: Math.random().toString(), _creationTime: Date.now(), role, content: "x".repeat(len) });

  test("returns empty when token estimate is below min(context, cap)", async () => {
    const ctx: any = { runQuery: mock().mockResolvedValue([mkMsg("user", 20), mkMsg("assistant", 20)]) };
    const res = await buildHierarchicalContextMessages(ctx, "c1" as any, "u1" as any, "m1", 0);
    expect(res).toEqual([]);
  });

  test("returns a context system message when token estimate exceeds threshold", async () => {
    // 60 + 60 chars ≈ 30 tokens (chars/4), MIN_TOKEN_THRESHOLD=10 → summarize
    const ctx: any = { runQuery: mock().mockResolvedValue([mkMsg("user", 60), mkMsg("assistant", 60)]) };
    const res = await buildHierarchicalContextMessages(ctx, "c2" as any, "u1" as any, "m1", 0);
    expect(res).toHaveLength(1);
    const first = res[0];
    expect(first).toBeDefined();
    expect(first?.role).toBe("system");
    expect(first?.content).toContain("SUM");
  });
});
