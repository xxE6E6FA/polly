import { describe, test, expect, mock } from "bun:test";
import { mockModuleWithRestore } from "../../../src/test/utils";

await mockModuleWithRestore(
  import.meta.resolve("../logger"),
  () => ({
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
  })
);

await mockModuleWithRestore(
  import.meta.resolve("../model_resolution"),
  () => ({
    getUserEffectiveModelWithCapabilities: mock(async () => ({
      modelId: "x",
      provider: "google",
      name: "x",
      supportsReasoning: false,
      contextLength: 50,
    })),
  })
);

const summarizationModule = await import("./summarization");
const processSummariesMock = mock(async () => [
  { summary: "SUM", chunkIndex: 0, originalMessageCount: 2 },
]);
const createMetaSummaryMock = mock(async (_ctx: any, _cid: string, summaries: string[]) =>
  summaries.map(s => ({ summary: s }))
);
const summarizeChunkMock = mock(async () => "SUM");
const storeChunkSummaryMock = mock(async () => {});

await mockModuleWithRestore(
  import.meta.resolve("./summarization"),
  () => ({
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
  })
);

const { buildHierarchicalContextMessages } = await import("./context_building?test=token-threshold");

describe("context building: token-based threshold", () => {

  const mkMsg = (role: string, len: number) => ({ _id: Math.random().toString(), _creationTime: Date.now(), role, content: "x".repeat(len) });

  test("returns empty when token estimate is below min(context, cap)", async () => {
    const ctx: any = { runQuery: mock().mockResolvedValue([mkMsg("user", 20), mkMsg("assistant", 20)]) };
    const res = await buildHierarchicalContextMessages(ctx, "c1" as any, "u1" as any, "m1", 0);
    expect(res).toEqual([]);
  });

  test("returns a context system message when token estimate exceeds threshold", async () => {
    // 400 + 400 chars ≈ 200 tokens (chars/4), exceeds context window of 50 → summarize
    const ctx: any = { runQuery: mock().mockResolvedValue([mkMsg("user", 400), mkMsg("assistant", 400)]) };
    const res = await buildHierarchicalContextMessages(ctx, "c2" as any, "u1" as any, "m1", 0);
    expect(res).toHaveLength(1);
    const first = res[0];
    expect(first).toBeDefined();
    expect(first?.role).toBe("system");
    expect(first?.content).toContain("SUM");
  });
});
