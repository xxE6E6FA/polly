import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "convex/_generated/api";
import { useConfirmationDialog } from "./use-confirmation-dialog";
import type { Id } from "convex/_generated/dataModel";

export interface JobManagementOptions {
  showActiveOnly?: boolean;
  showCompletedOnly?: boolean;
  limit?: number;
}

export function useJobManagement(options: JobManagementOptions = {}) {
  const {
    showActiveOnly = false,
    showCompletedOnly = false,
    limit = 20,
  } = options;
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [recentlyImportedIds, setRecentlyImportedIds] = useState<
    Set<Id<"conversations">>
  >(new Set());
  const confirmDialog = useConfirmationDialog();

  const deleteJob = useMutation(api.backgroundJobs.deleteJob);
  const allJobs = useQuery(api.backgroundJobs.listUserJobs, { limit });

  const downloadUrlData = useQuery(
    api.backgroundJobs.getExportDownloadUrl,
    downloadingJobId ? { jobId: downloadingJobId } : "skip"
  );

  // Filter and categorize jobs
  const { activeJobs, completedJobs, filteredJobs } = useMemo(() => {
    if (!allJobs)
      return { activeJobs: [], completedJobs: [], filteredJobs: [] };

    const active = allJobs
      .filter(job => job.status === "processing" || job.status === "scheduled")
      .sort((a, b) => b.createdAt - a.createdAt);

    const completed = allJobs
      .filter(job => job.status === "completed" || job.status === "failed")
      .sort(
        (a, b) =>
          (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt)
      );

    let filtered = [...active, ...completed];

    if (showActiveOnly) {
      filtered = active;
    } else if (showCompletedOnly) {
      filtered = completed;
    }

    return {
      activeJobs: active,
      completedJobs: completed,
      filteredJobs: filtered,
    };
  }, [allJobs, showActiveOnly, showCompletedOnly]);

  // Track import completion for highlighting
  useEffect(() => {
    const completedImports = activeJobs.filter(
      job => job.type === "import" && job.status === "completed"
    );

    if (completedImports.length > 0) {
      const allImportedIds = new Set<Id<"conversations">>();
      completedImports.forEach(job => {
        // Type assertion for jobs with result field
        const jobWithResult = job as typeof job & {
          result?: { conversationIds?: string[] };
        };
        jobWithResult.result?.conversationIds?.forEach((id: string) =>
          allImportedIds.add(id as Id<"conversations">)
        );
      });

      setRecentlyImportedIds(allImportedIds);

      const timer = setTimeout(() => {
        setRecentlyImportedIds(new Set());
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [activeJobs]);

  // Handle download trigger
  const triggerDownload = useCallback(
    async (downloadUrl: string, jobId: string) => {
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.style.display = "none";
        a.href = url;
        a.download = `polly-export-${jobId.slice(0, 8)}-${new Date().toISOString().split("T")[0]}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast.success("Export file downloaded successfully");
      } catch (error) {
        console.error("Download failed:", error);
        toast.error("Failed to download export file");
      } finally {
        setDownloadingJobId(null);
      }
    },
    []
  );

  // Auto-trigger download when URL is ready
  useEffect(() => {
    if (downloadUrlData?.downloadUrl && downloadingJobId) {
      triggerDownload(downloadUrlData.downloadUrl, downloadingJobId);
    }
  }, [downloadUrlData?.downloadUrl, downloadingJobId, triggerDownload]);

  const handleDownload = useCallback((jobId: string) => {
    setDownloadingJobId(jobId);
  }, []);

  const handleRemoveJob = useCallback(
    (jobId: string) => {
      const job = allJobs?.find(j => j.jobId === jobId);

      if (!job) return;

      const isExport = job.type === "export";

      confirmDialog.confirm(
        {
          title: "Clear Activity",
          description: isExport
            ? "Are you sure you want to clear this activity? This action cannot be undone and you won't be able to download the export file anymore."
            : "Are you sure you want to clear this activity? This action cannot be undone.",
          confirmText: "Clear",
          cancelText: "Cancel",
          variant: "destructive",
        },
        async () => {
          try {
            await deleteJob({ jobId });
            toast.success("Activity cleared successfully");
          } catch (error) {
            console.error("Failed to clear activity:", error);
            toast.error("Failed to clear activity", {
              description:
                error instanceof Error
                  ? error.message
                  : "Unknown error occurred",
            });
          }
        }
      );
    },
    [deleteJob, confirmDialog, allJobs]
  );

  const handleImportSuccess = useCallback(
    (importedIds: Id<"conversations">[]) => {
      setRecentlyImportedIds(new Set(importedIds));
      setTimeout(() => {
        setRecentlyImportedIds(new Set());
      }, 10000);
    },
    []
  );

  return {
    // Data
    allJobs: filteredJobs,
    activeJobs,
    completedJobs,
    recentlyImportedIds,
    isDownloading: downloadingJobId !== null,
    downloadingJobId,

    // Actions
    handleDownload,
    handleRemoveJob,
    handleImportSuccess,

    // Dialog
    confirmDialog,
  };
}
