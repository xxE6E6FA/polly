import { describe, test, expect, mock } from "bun:test";
import type { Id } from "../_generated/dataModel";
import { mockModuleWithRestore } from "../../src/test/utils";

await mockModuleWithRestore(
  import.meta.resolve("./logger"),
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
  import.meta.resolve("../ai/pdf"),
  actual => ({
    ...actual,
    shouldExtractPdfText: mock(() => true),
  })
);

const { processAttachmentsForLLM } = await import("./process_attachments");

function findStatusCall(
  calls: unknown[],
  status: string
): [unknown, { status?: string } | undefined] | undefined {
  return calls.find(call => {
    const [, args] = (call as [unknown, { status?: string } | undefined]) ?? [];
    return args?.status === status;
  }) as [unknown, { status?: string } | undefined] | undefined;
}

describe("lib/process_attachments", () => {
  test("returns undefined when attachments not provided", async () => {
    const res = await processAttachmentsForLLM({} as any, undefined, "google", "m", true);
    expect(res).toBeUndefined();
  });

  test("passes through non-PDF attachments when extraction not needed", async () => {
    const atts = [
      { type: "image", url: "u", name: "i", size: 1 },
    ] as any;
    const res = await processAttachmentsForLLM({} as any, atts, "google", "m", true);
    expect(res?.[0]?.url).toBe("u");
  });

  test("uses stored text via textFileId and clears status when messageId present", async () => {
    const text = new Blob(["Hello PDF"], { type: "text/plain" });
    const storage = { get: mock(async () => text), store: mock() };
    const ctx: any = {
      storage,
      runMutation: mock(async () => {}),
    };
    const res = await processAttachmentsForLLM(
      ctx,
      [
        {
          type: "pdf",
          name: "doc.pdf",
          size: 5,
          textFileId: "tid" as Id<"_storage">,
        } as any,
      ],
      "google",
      "m",
      false,
      "msg1" as any
    );
    expect(res?.[0]?.content).toContain("Hello PDF");
    expect(ctx.runMutation).toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ messageId: "msg1", status: "reading_pdf" })
    );
    const thinkingStatusCall = findStatusCall(ctx.runMutation.mock.calls, "thinking");
    expect(thinkingStatusCall).toBeTruthy();
  });

  test("stores extractedText to storage when provided inline and returns textFileId", async () => {
    const storage = { store: mock(async () => "newTextId"), get: mock() };
    const ctx: any = { storage, runMutation: mock(async () => {}) };
    const res = await processAttachmentsForLLM(
      ctx,
      [
        {
          type: "pdf",
          name: "doc.pdf",
          size: 5,
          extractedText: "EXTRACT",
        } as any,
      ],
      "google",
      "m",
      false,
      "msg1" as any
    );
    expect(storage.store).toHaveBeenCalled();
    expect(String(res?.[0]?.textFileId ?? "")).toBe("newTextId");
    expect(res?.[0]?.content).toBe("EXTRACT");
    const readingStatusCall = findStatusCall(ctx.runMutation.mock.calls, "reading_pdf");
    expect(readingStatusCall).toBeTruthy();
    const thinkingStatusCall = findStatusCall(ctx.runMutation.mock.calls, "thinking");
    expect(thinkingStatusCall).toBeTruthy();
  });

  test("calls server extraction when only storageId available and handles error", async () => {
    const storage = { get: mock(async () => new Blob(["PDF"], { type: "application/pdf" })) };
    // Simulate server action returning extracted text
    const ctx: any = {
      storage,
      runAction: mock(async () => ({ text: "TEXT", textFileId: "tid" })),
      runMutation: mock(async () => {}),
    };
    const res1 = await processAttachmentsForLLM(
      ctx,
      [
        {
          type: "pdf",
          name: "x.pdf",
          size: 10,
          storageId: "sid" as Id<"_storage">,
        } as any,
      ],
      "google",
      "m",
      false,
      "m1" as any
    );
    expect(ctx.runAction).toHaveBeenCalled();
    expect(res1?.[0]?.content).toBe("TEXT");
    expect(String(res1?.[0]?.textFileId ?? "")).toBe("tid");

    // Error path → extractionError present
    ctx.runAction = mock(async () => {
      throw new Error("bad");
    });
    const res2 = await processAttachmentsForLLM(
      ctx,
      [
        {
          type: "pdf",
          name: "x.pdf",
          size: 10,
          storageId: "sid" as Id<"_storage">,
        } as any,
      ],
      "google",
      "m",
      false,
      "m1" as any
    );
    expect(res2?.[0]?.extractionError).toBeDefined();
  });
});
