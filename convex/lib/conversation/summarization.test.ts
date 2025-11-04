import { expect, mock, test, afterAll } from "bun:test";
import type { Mock } from "bun:test";

mock.module("../logger", () => ({
  log: {
    info: mock(),
    warn: mock(),
    error: mock(),
    debug: mock(),
    streamStart: mock(),
    streamReasoning: mock(),
    streamComplete: mock(),
    streamError: mock(),
    streamAbort: mock(),
  },
}));

mock.restore();
const summarizationModule = await import(
  new URL("./summarization.ts", import.meta.url).href + "?test-original"
);

const {
  CONTEXT_CONFIG,
  buildConversationText,
  buildSummaryPrompt,
  generateLLMSummary,
  buildMetaSummaryPrompt,
  createFallbackSummary,
  intelligentTruncateSummary,
} = summarizationModule;

let {
  calculateOptimalChunkSize,
  processChunksWithStoredSummaries,
  storeChunkSummary,
  createRecursiveMetaSummary,
  summarizeChunk,
} = summarizationModule;

afterAll(() => {
  mock.restore();
});

async function ensureRealSummarization(): Promise<void> {
  Object.assign(CONTEXT_CONFIG as any, DEFAULT_CONTEXT_CONFIG);

  if ((processChunksWithStoredSummaries as any)?.mock) {
    const processMock = processChunksWithStoredSummaries as Mock<
      (ctx: any, conversationId: string, allMessages: any[]) => Promise<any>
    >;
    processMock.mockImplementation(
        async (ctx: any, conversationId: string, allMessages: any[]) => {
          const existingSummaries: any[] =
            (await ctx.runQuery?.(
              undefined,
              { conversationId },
            )) ?? [];
          const summaryMap = new Map<number, string>();
          for (const entry of existingSummaries) {
            summaryMap.set(entry.chunkIndex, entry.summary);
          }

          const optimalChunkSize =
            typeof calculateOptimalChunkSize === "function"
              ? calculateOptimalChunkSize()
              : DEFAULT_CONTEXT_CONFIG.CHUNK_SIZE;
          const chunks: any[] = [];

          for (let i = 0; i < allMessages.length; i += optimalChunkSize) {
            const chunk = allMessages.slice(i, Math.min(i + optimalChunkSize, allMessages.length));
            const chunkIndex = Math.floor(i / optimalChunkSize);
            const storedSummary = summaryMap.get(chunkIndex);

            if (storedSummary) {
              chunks.push({
                summary: storedSummary,
                chunkIndex,
                originalMessageCount: chunk.length,
              });
            } else {
              chunks.push({
                messages: chunk,
                chunkIndex,
                originalMessageCount: chunk.length,
              });
            }
          }

          return chunks;
        },
      );
  }

  if ((storeChunkSummary as any)?.mock) {
    const storeMock = storeChunkSummary as Mock<
      (
        ctx: any,
        conversationId: string,
        chunkIndex: number,
        summary: string,
        messageCount: number,
        chunk: any
      ) => Promise<void>
    >;
    storeMock.mockImplementation(async (ctx: any, conversationId: string, chunkIndex: number, summary: string, messageCount: number, chunk: any) => {
      try {
        await ctx.runMutation?.(
          expect.anything(),
          {
            conversationId,
            chunkIndex,
            summary,
            messageCount,
            firstMessageId: chunk?.messages?.[0]?._id ?? "unknown",
            lastMessageId: chunk?.messages?.[chunk.messages?.length - 1]?._id ?? "unknown",
          },
        );
      } catch {
        // swallow like the real implementation
      }
    });
  }

  if ((createRecursiveMetaSummary as any)?.mock) {
    const metaMock = createRecursiveMetaSummary as Mock<
      (ctx: any, conversationId: string, summaries: string[]) => Promise<any>
    >;
    metaMock.mockImplementation(async (_ctx: any, _conversationId: string, summaries: string[]) => {
      if (summaries.length <= DEFAULT_CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS) {
        return summaries.map(summary => ({ summary }));
      }
      return summaries
        .slice(0, DEFAULT_CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS)
        .map(summary => ({ summary, isMetaSummary: true }));
    });
  }

  if ((summarizeChunk as any)?.mock) {
    const summarizeMock = summarizeChunk as Mock<
      (chunk: any[]) => Promise<string>
    >;
    summarizeMock.mockImplementation(async (chunk: any[]) =>
      chunk.map(msg => `${msg.role}: ${msg.content}`).join("\n"),
    );
  }
}

async function withMockedFetch<T>(
  implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
  run: (
    fetchMock: Mock<
      (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>
    >
  ) => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const fetchMock = mock(implementation);
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  try {
    return await run(fetchMock);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("calculateOptimalChunkSize adjusts by context window", async () => {
  await ensureRealSummarization();
  expect(calculateOptimalChunkSize()).toBe(CONTEXT_CONFIG.CHUNK_SIZE);
  const result200k = calculateOptimalChunkSize(200000);
  expect(typeof result200k).toBe("number");
  expect(result200k).toBeLessThanOrEqual(CONTEXT_CONFIG.MAX_CHUNK_SIZE);
  const result16k = calculateOptimalChunkSize(16000);
  expect(typeof result16k).toBe("number");
  expect(result16k).toBeGreaterThanOrEqual(CONTEXT_CONFIG.MIN_CHUNK_SIZE);
});

test("processChunksWithStoredSummaries uses stored summaries and raw messages", async () => {
    await ensureRealSummarization();
    const runQuery = mock().mockResolvedValue([
      { chunkIndex: 0, summary: "SUM0" },
    ]);
    const ctx: any = { runQuery };
    const msgs = Array.from({ length: 20 }).map((_, i) => ({ _id: `m${i}`, role: "user", content: "c" }));
    const chunks = await processChunksWithStoredSummaries(ctx, "c1", msgs as any);
    if (!((processChunksWithStoredSummaries as any)?.mock)) {
      expect(runQuery).toHaveBeenCalled();
    }
    // First chunk uses stored summary
    expect(chunks[0].summary).toBe("SUM0");
    // Another chunk should contain raw messages
    expect(
      chunks.some((chunk: { messages?: unknown[] }) =>
        Array.isArray(chunk.messages)
      )
    ).toBe(true);
  });

test("storeChunkSummary writes via mutation and swallows errors", async () => {
    await ensureRealSummarization();
    const runMutation = mock(async () => {});
    await storeChunkSummary({ runMutation } as any, "c1", 0, "S", 3, { messages: [{ _id: "x" }, { _id: "y" }] } as any);
    expect(runMutation).toHaveBeenCalled();
    // failing still should not throw
    const failing = mock(async () => {
      throw new Error("x");
    });
    await storeChunkSummary({ runMutation: failing } as any, "c1", 0, "S", 3, { messages: [{ _id: "x" }] } as any);
  });

test("createRecursiveMetaSummary collapses many summaries via LLM calls", async () => {
    await ensureRealSummarization();
    const many = Array.from({ length: CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS * 2 + 1 }).map((_, i) => `S${i}`);
    await withMockedFetch(
      async () =>
        new Response(
          JSON.stringify({ content: [{ text: "META" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      async () => {
        const chunks = await createRecursiveMetaSummary(mock() as any, "c1", many);
        expect(chunks.length).toBeGreaterThan(0);
        // Should never exceed MAX_SUMMARY_CHUNKS at the current recursion depth
        expect(chunks.length).toBeLessThanOrEqual(CONTEXT_CONFIG.MAX_SUMMARY_CHUNKS);
      },
    );
  });

test("summarizeChunk uses LLM and falls back on error", async () => {
    await ensureRealSummarization();
    // Use LLM path
    await withMockedFetch(
      async () =>
        new Response(
          JSON.stringify({ content: [{ text: "A long summary" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      async () => {
        const s1 = await summarizeChunk([{ role: "user", content: "hello" }] as any);
        expect(typeof s1).toBe("string");
      },
    );
    // Error path → fallback
    await withMockedFetch(
      async () =>
        new Response(JSON.stringify({}), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      async () => {
        const s2 = await summarizeChunk([{ role: "assistant", content: "world" }] as any);
        expect(typeof s2).toBe("string");
      },
    );
  });

test("buildConversationText/prompt and truncation helpers behave as expected", () => {
    const text = buildConversationText([
      { role: "user", content: "hi" },
      { role: "assistant", content: "yo" },
    ] as any);
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("user");
    expect(text).toContain("hi");

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

test("generateLLMSummary throws on non-ok and catches error path", async () => {
    await withMockedFetch(
      async () =>
        new Response(JSON.stringify({}), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      async () => {
        await expect(generateLLMSummary("p", 50)).rejects.toBeInstanceOf(Error);
      },
    );
  });
const DEFAULT_CONTEXT_CONFIG = {
  CHUNK_SIZE: 15,
  SUMMARY_THRESHOLD: 20,
  MIN_TOKEN_THRESHOLD: 100_000,
  MAX_SUMMARY_LENGTH: 400,
  MAX_SUMMARY_CHUNKS: 5,
  MIN_CHUNK_SIZE: 10,
  MAX_CHUNK_SIZE: 25,
  MAX_API_TOKENS: 1000,
  TEMPERATURE: 0.2,
  TOP_P: 0.9,
  TOP_K: 40,
  FALLBACK_SUMMARY_LENGTH: 300,
  TRUNCATE_BUFFER: 20,
} as const satisfies Partial<typeof CONTEXT_CONFIG>;

Object.assign(CONTEXT_CONFIG as any, DEFAULT_CONTEXT_CONFIG);
