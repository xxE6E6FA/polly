import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../ai/pdf", () => ({
  shouldExtractPdfText: vi.fn(),
}));
vi.mock("../ai/pdf_status", () => ({
  updatePdfReadingStatus: vi.fn(async () => {}),
  clearPdfReadingStatus: vi.fn(async () => {}),
}));
vi.mock("./logger", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { shouldExtractPdfText } from "../ai/pdf";
import { updatePdfReadingStatus, clearPdfReadingStatus } from "../ai/pdf_status";
import { processAttachmentsForLLM } from "./process_attachments";

describe("lib/process_attachments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns undefined when attachments not provided", async () => {
    const res = await processAttachmentsForLLM({} as any, undefined, "google", "m", true);
    expect(res).toBeUndefined();
  });

  it("passes through non-PDF attachments when extraction not needed", async () => {
    vi.mocked(shouldExtractPdfText).mockReturnValue(false as any);
    const atts = [
      { type: "image", url: "u", name: "i", size: 1 },
    ] as any;
    const res = await processAttachmentsForLLM({} as any, atts, "google", "m", true);
    expect(res?.[0].url).toBe("u");
  });

  it("uses stored text via textFileId and clears status when messageId present", async () => {
    vi.mocked(shouldExtractPdfText).mockReturnValue(true as any);
    const text = new Blob(["Hello PDF"], { type: "text/plain" });
    const storage = { get: vi.fn(async () => text), store: vi.fn() };
    const ctx: any = {
      storage,
      runMutation: vi.fn(async () => {}),
    };
    const res = await processAttachmentsForLLM(
      ctx,
      [{ type: "pdf", name: "doc.pdf", size: 5, textFileId: "tid" } as any],
      "google",
      "m",
      false,
      "msg1" as any
    );
    expect(res?.[0].content).toContain("Hello PDF");
    expect(ctx.runMutation).toHaveBeenCalled();
    expect(clearPdfReadingStatus).toHaveBeenCalled();
  });

  it("stores extractedText to storage when provided inline and returns textFileId", async () => {
    vi.mocked(shouldExtractPdfText).mockReturnValue(true as any);
    const storage = { store: vi.fn(async () => "newTextId"), get: vi.fn() };
    const ctx: any = { storage, runMutation: vi.fn(async () => {}) };
    const res = await processAttachmentsForLLM(
      ctx,
      [{ type: "pdf", name: "doc.pdf", size: 5, extractedText: "EXTRACT" } as any],
      "google",
      "m",
      false,
      "msg1" as any
    );
    expect(storage.store).toHaveBeenCalled();
    expect(res?.[0].textFileId).toBe("newTextId");
    expect(res?.[0].content).toBe("EXTRACT");
    expect(clearPdfReadingStatus).toHaveBeenCalled();
  });

  it("calls server extraction when only storageId available and handles error", async () => {
    vi.mocked(shouldExtractPdfText).mockReturnValue(true as any);
    const storage = { get: vi.fn(async () => new Blob(["PDF"], { type: "application/pdf" })) };
    // Simulate server action returning extracted text
    const ctx: any = {
      storage,
      runAction: vi.fn(async () => ({ text: "TEXT", textFileId: "tid" })),
      runMutation: vi.fn(async () => {}),
    };
    const res1 = await processAttachmentsForLLM(
      ctx,
      [{ type: "pdf", name: "x.pdf", size: 10, storageId: "sid" } as any],
      "google",
      "m",
      false,
      "m1" as any
    );
    expect(ctx.runAction).toHaveBeenCalled();
    expect(res1?.[0].content).toBe("TEXT");
    expect(res1?.[0].textFileId).toBe("tid");

    // Error path → extractionError present
    ctx.runAction = vi.fn(async () => { throw new Error("bad"); });
    const res2 = await processAttachmentsForLLM(
      ctx,
      [{ type: "pdf", name: "x.pdf", size: 10, storageId: "sid" } as any],
      "google",
      "m",
      false,
      "m1" as any
    );
    expect(res2?.[0].extractionError).toBeDefined();
  });
});
