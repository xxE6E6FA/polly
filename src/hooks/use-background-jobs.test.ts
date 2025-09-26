import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", async () => {
  const actual =
    await vi.importActual<typeof import("convex/react")>("convex/react");

  return {
    ...actual,
    useAction: vi.fn(),
    useMutation: vi.fn(),
    useQuery: vi.fn(),
  };
});
vi.mock("@/providers/toast-context", () => ({
  useToast: vi.fn(),
}));
vi.mock("@/lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mirror module shape */
  CACHE_KEYS: { conversations: "conversations" },
  del: vi.fn(),
}));

import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { del } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";
import { useBackgroundJobs } from "./use-background-jobs";

describe("useBackgroundJobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it("maps job statuses and supports startExport/import/bulkDelete + toasts", async () => {
    let jobStatuses: Array<{
      _id: string;
      type: string;
      status: string;
      totalItems: number;
      processedItems: number;
      _creationTime: number;
      fileStorageId?: string;
    }> = [];
    (useQuery as unknown as vi.Mock).mockImplementation(() => jobStatuses);

    const scheduleBackgroundExport = vi.fn().mockResolvedValue(undefined);
    const scheduleBackgroundImport = vi.fn().mockResolvedValue(undefined);
    const scheduleBackgroundBulkDelete = vi.fn().mockResolvedValue(undefined);
    (useAction as unknown as vi.Mock)
      .mockReturnValueOnce(scheduleBackgroundExport)
      .mockReturnValueOnce(scheduleBackgroundImport)
      .mockReturnValueOnce(scheduleBackgroundBulkDelete);

    const deleteJob = vi.fn().mockResolvedValue(undefined);
    (useMutation as unknown as vi.Mock).mockReturnValue(deleteJob);

    const success = vi.fn();
    const error = vi.fn();
    const loading = vi.fn();
    const dismiss = vi.fn();
    (useToast as unknown as vi.Mock).mockReturnValue({
      success,
      error,
      loading,
      dismiss,
      dismissAll: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useBackgroundJobs());

    // Initially no jobs
    expect(result.current.activeJobs).toEqual([]);

    // Start an export
    const exportJobId = await act(async () => {
      return await result.current.startExport(["c1" as Id<"conversations">], {
        includeAttachmentContent: false,
      });
    });
    expect(scheduleBackgroundExport).toHaveBeenCalled();
    expect(typeof exportJobId).toBe("string");
    expect(success).toHaveBeenCalled();

    // Update jobStatuses to include an export that completes to verify toast
    jobStatuses = [
      {
        _id: "j1",
        type: "export",
        status: "scheduled",
        totalItems: 1,
        processedItems: 0,
        _creationTime: 1,
      },
    ];
    act(() => {
      rerender();
    });
    // Transition to completed should trigger success toast
    jobStatuses = [
      {
        _id: "j1",
        type: "export",
        status: "completed",
        totalItems: 1,
        processedItems: 1,
        fileStorageId: "s1",
        _creationTime: 1,
      },
    ];
    act(() => {
      rerender();
    });
    expect(success).toHaveBeenCalledWith(
      "Export completed successfully!",
      expect.objectContaining({
        id: expect.stringMatching(/^job-/),
      })
    );

    // Import completion triggers cache invalidation
    jobStatuses = [
      {
        _id: "j2",
        type: "import",
        status: "scheduled",
        totalItems: 1,
        processedItems: 0,
        _creationTime: 2,
      },
    ];
    act(() => {
      rerender();
    });
    jobStatuses = [
      {
        _id: "j2",
        type: "import",
        status: "completed",
        totalItems: 1,
        processedItems: 1,
        _creationTime: 2,
      },
    ];
    act(() => {
      rerender();
    });
    expect(success).toHaveBeenCalledWith("Import completed successfully!", {
      id: expect.stringMatching(/^job-/),
    });
    expect(del).toHaveBeenCalled();
  });

  it("removeJob calls mutation and shows toast", async () => {
    (useQuery as unknown as vi.Mock).mockReturnValue([]);
    const deleteJob = vi.fn().mockResolvedValue(undefined);
    (useMutation as unknown as vi.Mock).mockReturnValue(deleteJob);
    const success = vi.fn();
    (useToast as unknown as vi.Mock).mockReturnValue({
      success,
      error: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    });

    const { result } = renderHook(() => useBackgroundJobs());
    await act(async () => {
      await result.current.removeJob("jid");
    });
    expect(deleteJob).toHaveBeenCalledWith({ jobId: "jid" });
    expect(success).toHaveBeenCalledWith("Job removed successfully");
  });

  it("getActiveJobs/getCompletedJobs/getJob expose mapped lists", () => {
    let jobStatuses: Array<{
      _id: string;
      jobId: string;
      type: string;
      status: string;
      totalItems: number;
      processedItems: number;
      _creationTime: number;
    }> = [
      {
        _id: "a",
        jobId: "a",
        type: "export",
        status: "scheduled",
        totalItems: 2,
        processedItems: 1,
        _creationTime: 1,
      },
      {
        _id: "b",
        jobId: "b",
        type: "import",
        status: "completed",
        totalItems: 3,
        processedItems: 3,
        _creationTime: 2,
      },
    ];
    (useQuery as unknown as vi.Mock).mockImplementation(() => jobStatuses);
    (useAction as unknown as vi.Mock).mockReturnValue(vi.fn());
    (useMutation as unknown as vi.Mock).mockReturnValue(vi.fn());
    (useToast as unknown as vi.Mock).mockReturnValue({
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    });

    const { result, rerender } = renderHook(() => useBackgroundJobs());
    expect(result.current.getActiveJobs().length).toBe(1);
    expect(result.current.getCompletedJobs().length).toBe(1);
    expect(result.current.getJob("a")?.id).toBe("a");

    // Change statuses and verify
    jobStatuses = [
      {
        _id: "c",
        jobId: "c",
        type: "export",
        status: "failed",
        totalItems: 1,
        processedItems: 0,
        _creationTime: 3,
      },
    ];
    act(() => rerender());
    expect(result.current.getActiveJobs().length).toBe(0);
    expect(result.current.getCompletedJobs().length).toBe(1);
  });
});
