import { describe, it, expect, vi, beforeEach } from "vitest";

// Make Convex `action` return the raw definition so we can call `handler`
vi.mock("../../_generated/server", () => ({
  action: (def: any) => def,
}));

// Mock auth util so we can control user presence
vi.mock("@convex-dev/auth/server", () => ({
  getAuthUserId: vi.fn(),
}));

import { getAuthUserId } from "@convex-dev/auth/server";
import {
  scheduleBackgroundImport,
  scheduleBackgroundBulkDelete,
  processBulkDelete,
} from "./background_operations";

describe("conversation/background_operations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scheduleBackgroundImport requires auth and schedules processing", async () => {
    // Unauthed
    (getAuthUserId as any).mockResolvedValueOnce(null);
    await expect(
      (scheduleBackgroundImport as any).handler({} as any, {
        conversations: [{ id: 1 }],
        importId: "imp-1",
        title: "T",
        description: "D",
      })
    ).rejects.toThrow(/User not authenticated/);

    // Authed
    (getAuthUserId as any).mockResolvedValueOnce("u1");
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const runAfter = vi.fn().mockResolvedValue(undefined);

    const ctx: any = { runMutation, scheduler: { runAfter } };
    const res = await (scheduleBackgroundImport as any).handler(ctx, {
      conversations: [{ id: 1 }, { id: 2 }],
      importId: "imp-2",
      title: "Import Title",
      description: "Import Desc",
    });

    expect(res).toEqual({ importId: "imp-2", status: "scheduled" });
    // Created job with totals and metadata
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), {
      jobId: "imp-2",
      type: "import",
      totalItems: 2,
      title: "Import Title",
      description: "Import Desc",
    });
    // Scheduled processing with userId propagated
    expect(runAfter).toHaveBeenCalledWith(
      100,
      expect.anything(),
      expect.objectContaining({ importId: "imp-2", userId: "u1", skipDuplicates: true })
    );
  });

  it("scheduleBackgroundBulkDelete validates ownership and enqueues job", async () => {
    (getAuthUserId as any).mockResolvedValue("u1");

    // First, simulate one invalid conversation (wrong user) → error
    const runQueryInvalid = vi
      .fn()
      .mockImplementation((_fn, { id }: any) =>
        Promise.resolve({ _id: id, userId: id === "c1" ? "u1" : "u2" })
      );

    await expect(
      (scheduleBackgroundBulkDelete as any).handler(
        { runQuery: runQueryInvalid } as any,
        { conversationIds: ["c1" as any, "c2" as any], jobId: "job-1" }
      )
    ).rejects.toThrow(/Some conversations not found or access denied/);

    // Now all valid → job created and scheduled
    const runQuery = vi
      .fn()
      .mockImplementation((_fn, { id }: any) => Promise.resolve({ _id: id, userId: "u1" }));
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const runAfter = vi.fn().mockResolvedValue(undefined);

    const ctx: any = { runQuery, runMutation, scheduler: { runAfter } };
    const res = await (scheduleBackgroundBulkDelete as any).handler(ctx, {
      conversationIds: ["a" as any, "b" as any],
      jobId: "job-2",
    });

    expect(res).toEqual({ jobId: "job-2", status: "scheduled" });
    // Created job with conversation IDs and metadata
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        jobId: "job-2",
        type: "bulk_delete",
        totalItems: 2,
        conversationIds: ["a", "b"],
        title: expect.stringContaining("Delete 2 Conversations - "),
        description: expect.stringContaining("Background deletion of 2 conversations"),
      })
    );
    // Scheduled processing action
    expect(runAfter).toHaveBeenCalledWith(
      100,
      expect.anything(),
      { conversationIds: ["a", "b"], jobId: "job-2", userId: "u1" }
    );
  });

  it("scheduleBackgroundBulkDelete formats title/description for single conversation", async () => {
    (getAuthUserId as any).mockResolvedValue("u1");
    const runQuery = vi.fn().mockResolvedValue({ _id: "c1", userId: "u1" });
    const runMutation = vi.fn().mockResolvedValue(undefined);
    const runAfter = vi.fn().mockResolvedValue(undefined);
    const ctx: any = { runQuery, runMutation, scheduler: { runAfter } };

    await (scheduleBackgroundBulkDelete as any).handler(ctx, { conversationIds: ["c1" as any], jobId: "job-3" });
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: expect.stringContaining("Delete Conversation - "),
        description: expect.stringContaining("Background deletion of 1 conversation "),
      })
    );
  });

  it("processBulkDelete processes in batches, tracks progress, and saves result", async () => {
    const runMutation = vi.fn().mockImplementation((_fn, arg: any) => {
      if (arg && "ids" in arg) {
        // Simulate batch delete: first batch (10) → 8 deleted, 2 failed; second batch (2) → both deleted
        const ids: string[] = arg.ids as any;
        if (ids.length === 10) {
          return Promise.resolve(
            ids.map((id, i) => ({ id, status: i < 8 ? "deleted" : "kept" }))
          );
        }
        return Promise.resolve(ids.map(id => ({ id, status: "deleted" })));
      }
      return Promise.resolve(undefined);
    });

    const ctx: any = { runMutation };
    const ids = Array.from({ length: 12 }, (_, i) => `c${i + 1}` as any);
    const res = await (processBulkDelete as any).handler(ctx, {
      conversationIds: ids as any,
      jobId: "job-3",
      userId: "u1" as any,
    });

    expect(res).toEqual({ success: true, totalDeleted: 10 });

    // Final saveImportResult called with totals and errors for the 2 failed items
    const saveCall = runMutation.mock.calls.find(([, arg]: any[]) => arg && arg.status === "completed");
    expect(saveCall?.[1]).toEqual(
      expect.objectContaining({
        jobId: "job-3",
        status: "completed",
        result: expect.objectContaining({ totalImported: 10, totalProcessed: 12 }),
      })
    );
    // Ensure errors array contains two failures
    expect(saveCall?.[1].result.errors.length).toBe(2);

    // Progress updates include initial 0, after first batch 10, and after second batch 20
    const progressArgs = runMutation.mock.calls
      .map(([, arg]: any[]) => arg)
      .filter((arg: any) => arg && Object.prototype.hasOwnProperty.call(arg, "processedItems"));
    expect(progressArgs).toEqual(
      expect.anything(),
    );
    expect(progressArgs.some((a: any) => a.processedItems === 0)).toBe(true);
    expect(progressArgs.some((a: any) => a.processedItems === 10)).toBe(true);
    expect(progressArgs.some((a: any) => a.processedItems === 20)).toBe(true);
  });

  it("processBulkDelete marks failed on outer exception and rethrows", async () => {
    const runMutation = vi.fn().mockImplementation((_fn, arg: any) => {
      // Force an error before entering batch loop (updateStatus 'processing')
      if (arg && arg.status === "processing") {
        throw new Error("prep-failure");
      }
      // Allow catch block's updateStatus('failed') to succeed
      return Promise.resolve(undefined);
    });

    const ctx: any = { runMutation };
    await expect(
      (processBulkDelete as any).handler(ctx, {
        conversationIds: ["x" as any],
        jobId: "job-err",
        userId: "u1" as any,
      })
    ).rejects.toThrow("prep-failure");

    // Ensure status updated to failed in catch block
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ jobId: "job-err", status: "failed" })
    );
  });
});
