import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "../test/hook-utils";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));
vi.mock("@/hooks/use-background-jobs", () => ({
  useBackgroundJobs: vi.fn(),
}));
vi.mock("@/hooks/use-dialog-management", () => ({
  useConfirmationDialog: vi.fn(),
}));
vi.mock("@/providers/batch-selection-context", () => ({
  useBatchSelection: vi.fn(),
}));
vi.mock("@/providers/toast-context", () => ({
  useToast: vi.fn(),
}));
vi.mock("@/lib/local-storage", () => ({
  /* biome-ignore lint/style/useNamingConvention: mirror module shape */
  CACHE_KEYS: { conversations: "conversations" },
  del: vi.fn(),
}));
vi.mock("@/lib/export", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/export")>("@/lib/export");

  return {
    ...actual,
    downloadFromUrl: vi.fn(),
  };
});

import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { downloadFromUrl } from "@/lib/export";
import { del } from "@/lib/local-storage";
import { useBatchSelection } from "@/providers/batch-selection-context";
import { useToast } from "@/providers/toast-context";
import { useBackgroundJobs } from "./use-background-jobs";
import { useBulkActions } from "./use-bulk-actions";
import { useConfirmationDialog } from "./use-dialog-management";

describe("useBulkActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupCommonMocks(selected: string[] = ["c1", "c2"]) {
    (useBatchSelection as unknown as vi.Mock).mockReturnValue({
      getSelectedIds: () => selected,
      clearSelection: vi.fn(),
      selectAllVisible: vi.fn(),
    });

    (useConfirmationDialog as unknown as vi.Mock).mockReturnValue({
      confirm: (_config: unknown, onConfirm: () => Promise<void>) => {
        // Immediately execute confirm callback
        return onConfirm();
      },
    });

    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    };
    (useToast as unknown as vi.Mock).mockReturnValue(toast);

    (useBackgroundJobs as unknown as vi.Mock).mockReturnValue({
      startExport: vi.fn().mockResolvedValue("job1"),
      startBulkDelete: vi.fn().mockResolvedValue("job2"),
      activeJobs: [],
    });

    // Mutations: [bulkRemove, patch]
    const bulkRemove = vi.fn().mockResolvedValue(undefined);
    const patch = vi.fn().mockResolvedValue(undefined);
    (useMutation as unknown as vi.Mock)
      .mockReturnValueOnce(bulkRemove)
      .mockReturnValueOnce(patch);

    // download url query not used unless exporting completed; return undefined
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);

    return { toast, bulkRemove, patch };
  }

  it("archives by patching and toasts success", async () => {
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

  it("deletes small selection directly and clears conversations cache", async () => {
    const { toast, bulkRemove } = setupCommonMocks([
      "a" as Id<"conversations">,
    ]);
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("delete");
      await Promise.resolve();
    });
    expect(bulkRemove).toHaveBeenCalled();
    expect(del).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("exports via background job", async () => {
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("export-json");
      await Promise.resolve();
    });
    expect(useBackgroundJobs).toHaveBeenCalled();
  });

  it("auto-downloads when export job completes", async () => {
    // First render: start export and register pending auto-download
    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(() => "toast-id"),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
    };
    (useToast as unknown as vi.Mock).mockReturnValue(toast);
    const startExport = vi.fn().mockResolvedValue("job-1");
    (useBackgroundJobs as unknown as vi.Mock).mockReturnValue({
      startExport,
      startBulkDelete: vi.fn(),
      activeJobs: [],
    });
    // download url is not available during first render
    (useQuery as unknown as vi.Mock).mockReturnValue(undefined);

    const { result, rerender } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("export-json");
    });

    // Second render: backgroundJobs now includes completed export with same job id
    (useBackgroundJobs as unknown as vi.Mock).mockReturnValue({
      startExport,
      startBulkDelete: vi.fn(),
      activeJobs: [
        {
          id: "job-1",
          type: "export",
          status: "completed",
          manifest: { totalConversations: 2 },
          fileStorageId: "s1",
        },
      ],
    });
    // Provide download data for the job
    (useQuery as unknown as vi.Mock).mockReturnValue({
      downloadUrl: "https://file/url",
      manifest: { totalConversations: 2 },
    });

    await act(async () => {
      rerender();
      // flush useEffect
      await Promise.resolve();
    });

    expect(downloadFromUrl).toHaveBeenCalledWith(
      "https://file/url",
      expect.stringMatching(/^polly-export-2-conversations-/)
    );
    expect(toast.dismiss).toHaveBeenCalledWith("toast-id");
    expect(toast.success).toHaveBeenCalled();
  });

  it("selects all visible when requested", async () => {
    const selectAllVisible = vi.fn();
    (useBatchSelection as unknown as vi.Mock).mockReturnValue({
      getSelectedIds: () => [],
      selectAllVisible,
      clearSelection: vi.fn(),
    });
    const { result } = renderHook(() => useBulkActions());
    await act(async () => {
      await result.current.performBulkAction("select-all-visible", {
        visibleIds: ["x", "y"],
      });
    });
    expect(selectAllVisible).toHaveBeenCalledWith(["x", "y"]);
  });
});
