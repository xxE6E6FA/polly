import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger to keep output clean
vi.mock("../logger", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock summarization helpers used by the module
vi.mock("./summarization", () => ({
  CONTEXT_CONFIG: { SUMMARY_THRESHOLD: 5 },
  processChunksWithStoredSummaries: vi.fn(),
  createRecursiveMetaSummary: vi.fn(),
  summarizeChunk: vi.fn(),
  storeChunkSummary: vi.fn(),
}));

// Mock auth and persona/merge helpers used by buildContextMessages
vi.mock("@convex-dev/auth/server", () => ({ getAuthUserId: vi.fn() }));
vi.mock("../conversation/message_handling", () => ({
  getPersonaPrompt: vi.fn(async () => "persona"),
  mergeSystemPrompts: vi.fn((a: string, b: string) => `${a}\n${b}`),
}));
vi.mock("../../constants", () => ({ getBaselineInstructions: vi.fn(() => "base") }));

import {
  buildHierarchicalContextMessages,
  buildFinalContext,
  buildContextContent,
  buildAIInstructions,
  buildSummaryGuidance,
  buildContextMessages,
} from "./context_building";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  processChunksWithStoredSummaries,
  summarizeChunk,
  storeChunkSummary,
  createRecursiveMetaSummary,
} from "./summarization";

describe("conversation/context_building", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty when no messages or under threshold", async () => {
    const ctx: any = { runQuery: vi.fn().mockResolvedValueOnce([]) };
    const res1 = await buildHierarchicalContextMessages(ctx, "c1" as any);
    expect(res1).toEqual([]);

    // Under threshold
    const msgs = Array.from({ length: 5 }, (_, i) => ({ _id: `m${i}`, _creationTime: i, role: "user", content: "x" }));
    const ctx2: any = { runQuery: vi.fn().mockResolvedValueOnce(msgs) };
    const res2 = await buildHierarchicalContextMessages(ctx2, "c2" as any);
    expect(res2).toEqual([]);
  });

  it("summarizes older messages and returns a system context when content generated", async () => {
    const total = 8; // exceed threshold (mocked as 5)
    const messages = Array.from({ length: total }, (_, i) => ({ _id: `m${i}`, _creationTime: i, role: i % 2 ? "assistant" : "user", content: `msg${i}` }));
    const ctx: any = { runQuery: vi.fn().mockResolvedValueOnce(messages) };

    // First pass returns one chunk needing summarization
    (processChunksWithStoredSummaries as any).mockResolvedValueOnce([
      { messages: messages.slice(0, 3), chunkIndex: 0, originalMessageCount: 3 },
    ]);
    (summarizeChunk as any).mockResolvedValueOnce("SUM-0");
    (storeChunkSummary as any).mockResolvedValue(undefined);
    (createRecursiveMetaSummary as any).mockResolvedValueOnce(undefined);

    const res = await buildHierarchicalContextMessages(ctx, "conv" as any, undefined as any, undefined as any, 2);
    // Should produce a single system message with content containing our summary
    expect(res).toHaveLength(1);
    expect(res[0].role).toBe("system");
    expect(res[0].content).toContain("SUM-0");
  });

  it("buildFinalContext varies header/instructions/guidance by layers", async () => {
    const chunks = [
      { summary: "S1", originalMessageCount: 10 },
      { summary: "S2", originalMessageCount: 20, isMetaSummary: true },
    ];

    const out1 = await buildFinalContext(chunks as any, 1);
    expect(out1).toContain("CONVERSATION CONTEXT");
    expect(out1.length).toBeGreaterThan(0);
    expect(out1).toContain("S1");

    const out2 = await buildFinalContext(chunks as any, 2);
    expect(out2).toContain("CONVERSATION CONTEXT");
    expect(out2).toContain("S1");
    expect(out2).toContain("S2");
    expect(out2.length).toBeGreaterThan(out1.length);

    const out4 = await buildFinalContext(chunks as any, 4);
    expect(out4).toContain("CONVERSATION CONTEXT");
    expect(out4).toContain("S1");
    expect(out4).toContain("S2");
    expect(out4.length).toBeGreaterThan(out2.length);
    expect(out4.toLowerCase()).toContain("important");
  });

  it("buildContextContent includes chunk type and counts", () => {
    const txt = buildContextContent([
      { summary: "A", originalMessageCount: 5 },
      { summary: "B", originalMessageCount: 7, isMetaSummary: true },
    ] as any, 3);
    expect(txt).toContain("CONVERSATION CONTEXT");
    expect(txt).toContain("A");
    expect(txt).toContain("B");
    expect(txt).toContain("5");
    expect(txt).toContain("7");
    expect(txt.toLowerCase()).toContain("summary");
    expect(txt.toLowerCase()).toContain("meta");
  });

  it("buildAIInstructions changes text by layers", () => {
    const layer0 = buildAIInstructions(0);
    const layer2 = buildAIInstructions(2);
    const layer3 = buildAIInstructions(3);
    const layer4 = buildAIInstructions(4);
    
    expect(layer0.length).toBeGreaterThan(0);
    expect(layer2.length).toBeGreaterThan(layer0.length);
    expect(layer3.length).toBeGreaterThan(layer2.length);
    expect(layer4.length).toBeGreaterThan(layer3.length);
    expect(layer4.toLowerCase()).toContain("important");
    expect(layer2.toLowerCase()).toContain("summar");
    expect(layer3.toLowerCase()).toContain("summar");
  });

  it("buildSummaryGuidance contains bullet points", () => {
    const g = buildSummaryGuidance();
    expect(g.length).toBeGreaterThan(0);
    expect(g).toContain("•");
    expect(g.toLowerCase()).toContain("summar");
    expect(g.toLowerCase()).toContain("use");
  });

  it("buildContextMessages composes baseline system and conversation messages", async () => {
    // Auth user
    (getAuthUserId as any).mockResolvedValue("u1");

    // Conversation messages including system/context to be filtered
    const all = [
      { role: "system", content: "ignore", _id: "s1", _creationTime: 1 },
      { role: "user", content: "u1", _id: "m1", _creationTime: 2 },
      { role: "assistant", content: "a1", _id: "m2", _creationTime: 3 },
      { role: "context", content: "ignore", _id: "c1", _creationTime: 4 },
      { role: "user", content: "u2", _id: "m3", _creationTime: 5 },
    ];
    const ctx: any = { runQuery: vi.fn().mockResolvedValue(all) };

    const res = await buildContextMessages(ctx, {
      conversationId: "c1" as any,
      includeUpToIndex: 3, // include first 4 items (last is context, will be filtered)
    });
    const msgs = res.contextMessages;
    // First baseline+persona system, then any context returned by builder (may be empty), then conversation messages (filtered)
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toContain("base\npersona");
    // Conversation messages present after any optional context
    const trailing = msgs.slice(1);
    expect(trailing).toEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
    ]);
  });
});
