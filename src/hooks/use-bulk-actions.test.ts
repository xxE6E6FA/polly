import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { act } from "@testing-library/react";
import { generateBackgroundExportFilename as realGenerateBackgroundExportFilename } from "@/lib/export";
import { renderHook } from "../test/hook-utils";

let useMutationMock: ReturnType<typeof mock>;
let useQueryMock: ReturnType<typeof mock>;
let useBackgroundJobsMock: ReturnType<typeof mock>;
let useConfirmationDialogMock: ReturnType<typeof mock>;
let useBatchSelectionMock: ReturnType<typeof mock>;
let useToastMock: ReturnType<typeof mock>;
let downloadFromUrlMock: ReturnType<typeof mock>;

mock.module("convex/react", () => ({
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));
mock.module("@/hooks/use-background-jobs", () => ({
  useBackgroundJobs: (...args: unknown[]) => useBackgroundJobsMock(...args),
}));
mock.module("@/hooks/use-dialog-management", () => ({
  useConfirmationDialog: (...args: unknown[]) =>
    useConfirmationDialogMock(...args),
}));
mock.module("@/providers/batch-selection-context", () => ({
  useBatchSelection: (...args: unknown[]) => useBatchSelectionMock(...args),
}));
mock.module("@/providers/toast-context", () => ({
  useToast: (...args: unknown[]) => useToastMock(...args),
}));
mock.module("@/lib/export", () => ({
  exportAsJSON: mock(),
  exportAsMarkdown: mock(),
  downloadFile: mock(),
  downloadFromUrl: (...args: unknown[]) => downloadFromUrlMock(...args),
  generateFilename: mock(),
  generateBackgroundExportFilename: realGenerateBackgroundExportFilename,
}));

import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { downloadFromUrl } from "@/lib/export";
import * as LocalStorageModule from "@/lib/local-storage";
import { useBatchSelection } from "@/providers/batch-selection-context";
import { useToast } from "@/providers/toast-context";
import { useBackgroundJobs } from "./use-background-jobs";
import { useBulkActions } from "./use-bulk-actions";
import { useConfirmationDialog } from "./use-dialog-management";

describe("useBulkActions", () => {
  let delSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    useMutationMock = mock();
    useQueryMock = mock(() => undefined);
    useBackgroundJobsMock = mock(() => ({
      startExport: mock(() => Promise.resolve("job1")),
      startBulkDelete: mock(() => Promise.resolve("job2")),
      activeJobs: [],
    }));
    useConfirmationDialogMock = mock(() => ({
      confirm: (_config: unknown, onConfirm: () => Promise<void>) => {
        return onConfirm();
      },
    }));
    useBatchSelectionMock = mock(() => ({
      getSelectedIds: () => [],
      clearSelection: mock(),
      selectAllVisible: mock(),
    }));
    useToastMock = mock(() => ({
      success: mock(),
      error: mock(),
      loading: mock(),
      dismiss: mock(),
      dismissAll: mock(),
    }));
    downloadFromUrlMock = mock();

    delSpy = spyOn(LocalStorageModule, "del").mockImplementation(() => {
      // Intentional no-op for test mock
    });
  });

  afterEach(() => {
    delSpy.mockRestore();
  });

  function setupCommonMocks(selected: string[] = ["c1", "c2"]) {
    useBatchSelectionMock.mockImplementation(() => ({
      getSelectedIds: () => selected,
      clearSelection: mock(),
      selectAllVisible: mock(),
    }));

    useConfirmationDialogMock.mockImplementation(() => ({
      confirm: (_config: unknown, onConfirm: () => Promise<void>) => {
        // Immediately execute confirm callback
        return onConfirm();
      },
    }));

    const toast = {
      success: mock(),
      error: mock(),
      loading: mock(),
      dismiss: mock(),
      dismissAll: mock(),
    };
    useToastMock.mockImplementation(() => toast);

    const startExportFn = mock(() => Promise.resolve("job1"));
    const startBulkDeleteFn = mock(() => Promise.resolve("job2"));
    useBackgroundJobsMock.mockImplementation(() => ({
      startExport: startExportFn,
      startBulkDelete: startBulkDeleteFn,
      activeJobs: [],
    }));

    // Mutations: [bulkRemove, patch]
    const bulkRemove = mock(() => Promise.resolve(undefined));
    const patch = mock(() => Promise.resolve(undefined));
    useMutationMock
      .mockImplementationOnce(() => bulkRemove)
      .mockImplementationOnce(() => patch);

    // download url query not used unless exporting completed; return undefined
    useQueryMock.mockImplementation(() => undefined);

    return { toast, bulkRemove, patch };
  }

  test("archives by patching and toasts success", async () => {
    const { toast, patch } = setupCommonMocks([
      "a" as Id<"conversations">,
      "b" as Id<"conversations">,
    ]);
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("archive");
      await Promise.resolve();
    });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalled();
  });

  test("deletes small selection directly and clears conversations cache", async () => {
    const { toast, bulkRemove } = setupCommonMocks([
      "a" as Id<"conversations">,
    ]);
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("delete");
      await Promise.resolve();
    });
    expect(bulkRemove).toHaveBeenCalled();
    expect(delSpy).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  test("exports via background job", async () => {
    setupCommonMocks();
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("export-json");
      await Promise.resolve();
    });
    expect(useBackgroundJobsMock).toHaveBeenCalled();
  });

  test("auto-downloads when export job completes", async () => {
    // First render: start export and register pending auto-download
    const toast = {
      success: mock(),
      error: mock(),
      loading: mock(() => "toast-id"),
      dismiss: mock(),
      dismissAll: mock(),
    };
    useToastMock.mockImplementation(() => toast);
    useBatchSelectionMock.mockImplementation(() => ({
      getSelectedIds: () => ["c1", "c2"],
      clearSelection: mock(),
      selectAllVisible: mock(),
    }));
    useConfirmationDialogMock.mockImplementation(() => ({
      confirm: (_config: unknown, onConfirm: () => Promise<void>) => {
        return onConfirm();
      },
    }));
    const startExport = mock(() => Promise.resolve("job-1"));
    useBackgroundJobsMock.mockImplementation(() => ({
      startExport,
      startBulkDelete: mock(),
      activeJobs: [],
    }));
    useMutationMock.mockImplementation(() => mock());
    // download url is not available during first render
    useQueryMock.mockImplementation(() => undefined);

    const { result, rerender } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("export-json");
    });

    // Second render: backgroundJobs now includes completed export with same job id
    useBackgroundJobsMock.mockImplementation(() => ({
      startExport,
      startBulkDelete: mock(),
      activeJobs: [
        {
          id: "job-1",
          type: "export",
          status: "completed",
          manifest: { totalConversations: 2 },
          fileStorageId: "s1",
        },
      ],
    }));
    // Provide download data for the job
    useQueryMock.mockImplementation(() => ({
      downloadUrl: "https://file/url",
      manifest: { totalConversations: 2 },
    }));

    await act(async () => {
      rerender();
      // flush useEffect
      await Promise.resolve();
    });

    expect(downloadFromUrlMock).toHaveBeenCalledWith(
      "https://file/url",
      expect.stringMatching(/^polly-export-2-conversations-/)
    );
    expect(toast.dismiss).toHaveBeenCalledWith("toast-id");
    expect(toast.success).toHaveBeenCalled();
  });

  test("selects all visible when requested", async () => {
    const selectAllVisible = mock();
    useBatchSelectionMock.mockImplementation(() => ({
      getSelectedIds: () => [],
      selectAllVisible,
      clearSelection: mock(),
    }));
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("select-all-visible", {
        visibleIds: ["x", "y"],
      });
    });
    expect(selectAllVisible).toHaveBeenCalledWith(["x", "y"]);
  });
});
