import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act } from "@testing-library/react";
import * as LocalStorageModule from "@/lib/local-storage";
import { renderHook } from "../test/hook-utils";
import { createToastMock, mockToastContext } from "../test/utils";
import { useBackgroundJobs } from "./use-background-jobs";

const toastMock = createToastMock();
await mockToastContext(toastMock);

describe("useBackgroundJobs", () => {
  let delSpy: ReturnType<typeof spyOn<typeof LocalStorageModule, "del">>;

  beforeEach(() => {
    delSpy = spyOn(LocalStorageModule, "del");
    Object.assign(toastMock, createToastMock());
  });

  afterEach(() => {
    delSpy.mockRestore();
  });

  test("maps job statuses and supports startExport/import/bulkDelete + toasts", async () => {
    let jobStatuses: Array<{
      _id: string;
      type: string;
      status: string;
      totalItems: number;
      processedItems: number;
      _creationTime: number;
      fileStorageId?: string;
    }> = [];

    const scheduleBackgroundExport = mock(() => Promise.resolve(undefined));
    const scheduleBackgroundImport = mock(() => Promise.resolve(undefined));
    const scheduleBackgroundBulkDelete = mock(() => Promise.resolve(undefined));
    let actionCallCount = 0;
    const useActionMock = mock(() => {
      if (actionCallCount === 0) {
        actionCallCount++;
        return scheduleBackgroundExport;
      }
      if (actionCallCount === 1) {
        actionCallCount++;
        return scheduleBackgroundImport;
      }
      return scheduleBackgroundBulkDelete;
    });

    const deleteJob = mock(() => Promise.resolve(undefined));
    const useMutationMock = mock(() => deleteJob);

    const success = mock();
    const error = mock();
    const loading = mock();
    const dismiss = mock();
    Object.assign(toastMock, {
      success,
      error,
      loading,
      dismiss,
      dismissAll: mock(),
    });

    const useQueryMock = mock(() => {
      return [...jobStatuses];
    });
    const useConvexMock = mock(() => ({
      query: mock(() =>
        Promise.resolve({
          downloadUrl: "https://example.com/download",
          manifest: { totalConversations: 1, includeAttachments: false },
        })
      ),
    }));

    mock.module("convex/react", () => ({
      useAction: useActionMock,
      useMutation: useMutationMock,
      useQuery: useQueryMock,
      useConvex: useConvexMock,
    }));

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
    rerender();
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
    rerender();
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
    rerender();
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
    rerender();
    expect(success).toHaveBeenCalledWith("Import completed successfully!", {
      id: expect.stringMatching(/^job-/),
    });
    expect(delSpy).toHaveBeenCalled();
  });

  test("removeJob calls mutation and shows toast", async () => {
    const deleteJob = mock(() => Promise.resolve(undefined));
    const useMutationMock = mock(() => deleteJob);
    const success = mock();
    Object.assign(toastMock, {
      success,
      error: mock(),
      loading: mock(),
      dismiss: mock(),
      dismissAll: mock(),
    });

    mock.module("convex/react", () => ({
      useAction: mock(),
      useMutation: useMutationMock,
      useQuery: mock(() => []),
      useConvex: mock(),
    }));

    const { result } = renderHook(() => useBackgroundJobs());
    await act(async () => {
      await result.current.removeJob("jid");
    });
    expect(deleteJob).toHaveBeenCalledWith({ jobId: "jid" });
    expect(success).toHaveBeenCalledWith("Job removed successfully");
  });

  test("getActiveJobs/getCompletedJobs/getJob expose mapped lists", () => {
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

    const useQueryMock = mock(() => {
      return [...jobStatuses];
    });

    Object.assign(toastMock, createToastMock());

    mock.module("convex/react", () => ({
      useAction: mock(),
      useMutation: mock(),
      useQuery: useQueryMock,
      useConvex: mock(),
    }));

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
    rerender();
    expect(result.current.getActiveJobs().length).toBe(0);
    expect(result.current.getCompletedJobs().length).toBe(1);
  });
});
