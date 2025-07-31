import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { downloadFromUrl } from "@/lib/export";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { useBatchSelection } from "@/providers/batch-selection-context";
import { useToast } from "@/providers/toast-context";
import type { ConversationId } from "@/types";

interface BulkActionConfig {
  title: string;
  description: (count: number) => string;
  confirmText: string;
  variant?: "default" | "destructive";
}

const BULK_ACTION_CONFIGS: Record<string, BulkActionConfig> = {
  archive: {
    title: "Archive conversations",
    description: (count: number) =>
      `Are you sure you want to archive ${count} conversation${count !== 1 ? "s" : ""}? You can restore them later from archived conversations.`,
    confirmText: "Archive",
    variant: "default",
  },
  delete: {
    title: "Delete conversations",
    description: (count: number) =>
      `Are you sure you want to delete ${count} conversation${count !== 1 ? "s" : ""}? This action cannot be undone.`,
    confirmText: "Delete",
    variant: "destructive",
  },
  "export-json": {
    title: "Export conversations",
    description: (count: number) =>
      `Export ${count} conversation${count !== 1 ? "s" : ""} as JSON? This will start a background export and you'll be notified when it's ready.`,
    confirmText: "Export",
    variant: "default",
  },
};

const BACKGROUND_THRESHOLD = 10;

function generateExportFilename(manifest?: {
  totalConversations: number;
}): string {
  if (!manifest) {
    return "export.json";
  }

  const timestamp = new Date().toISOString().split("T")[0];
  const conversationCount = manifest.totalConversations;
  return `polly-export-${conversationCount}-conversations-${timestamp}.json`;
}

export function useBulkActions() {
  const { getSelectedIds, clearSelection } = useBatchSelection();
  const confirmationDialog = useConfirmationDialog();
  const managedToast = useToast();

  // Track exports that should auto-download
  const [pendingAutoDownloads, setPendingAutoDownloads] = useState<Set<string>>(
    new Set()
  );
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  const backgroundJobs = useBackgroundJobs({ suppressToasts: true });

  // Direct mutations for smaller operations
  const bulkRemove = useMutation(api.conversations.bulkRemove);
  const patchConversation = useMutation(api.conversations.patch);

  // Query for download URL when needed
  const downloadData = useQuery(
    api.backgroundJobs.getExportDownloadUrl,
    downloadingJobId ? { jobId: downloadingJobId } : "skip"
  );

  // Monitor background jobs for completed exports that should auto-download
  useEffect(() => {
    const completedExports = backgroundJobs.activeJobs.filter(
      job =>
        job.type === "export" &&
        job.status === "completed" &&
        pendingAutoDownloads.has(job.id)
    );

    if (completedExports.length > 0) {
      // Auto-download the first completed export
      const jobToDownload = completedExports[0];
      setDownloadingJobId(jobToDownload.id);

      // Remove from pending list
      setPendingAutoDownloads(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobToDownload.id);
        return newSet;
      });
    }
  }, [backgroundJobs.activeJobs, pendingAutoDownloads]);

  // Handle automatic download using shared utility
  useEffect(() => {
    if (!(downloadData && downloadingJobId)) {
      return;
    }

    const downloadFile = async () => {
      let loadingToastId: string | number | undefined;

      try {
        if (downloadData.downloadUrl) {
          // Show loading state
          loadingToastId = managedToast.loading("Preparing download...", {
            id: `loading-download-${downloadingJobId}`,
          });

          const filename = generateExportFilename(downloadData.manifest);

          // Use shared download utility
          await downloadFromUrl(downloadData.downloadUrl, filename);

          // Dismiss loading toast and show success
          if (loadingToastId) {
            managedToast.dismiss(loadingToastId);
          }

          managedToast.success("Download started", {
            description: `Export file downloaded as ${filename}`,
            id: `download-${downloadingJobId}`,
          });
        } else {
          // Dismiss loading toast and show error
          if (loadingToastId) {
            managedToast.dismiss(loadingToastId);
          }

          managedToast.error("Download failed", {
            description: "Export file is not available for download",
          });
        }
      } catch (_error) {
        // Dismiss loading toast and show error
        if (loadingToastId) {
          managedToast.dismiss(loadingToastId);
        }

        managedToast.error("Download failed", {
          description: "An error occurred while downloading the file",
        });
      }
    };

    downloadFile();
    setDownloadingJobId(null);
  }, [downloadData, downloadingJobId, managedToast]);

  const executeBulkAction = useCallback(
    async (actionKey: string, selectedIds: ConversationId[]) => {
      const ids = selectedIds as Id<"conversations">[];

      switch (actionKey) {
        case "archive": {
          // For archive, patch each conversation individually (no bulk archive backend yet)
          let successCount = 0;
          let errorCount = 0;

          for (const id of ids) {
            try {
              await patchConversation({ id, updates: { isArchived: true } });
              successCount++;
            } catch {
              errorCount++;
            }
          }

          if (successCount > 0) {
            managedToast.success(
              `Archived ${successCount} conversation${successCount !== 1 ? "s" : ""}`,
              { id: `bulk-archive-success-${Date.now()}` }
            );
          }
          if (errorCount > 0) {
            managedToast.error(
              `Failed to archive ${errorCount} conversation${errorCount !== 1 ? "s" : ""}`,
              { id: `bulk-archive-error-${Date.now()}` }
            );
          }
          break;
        }

        case "delete": {
          // Use the same logic as settings page: background for large, direct for small
          if (ids.length > BACKGROUND_THRESHOLD) {
            await backgroundJobs.startBulkDelete(ids);

            managedToast.success(
              `Started deleting ${ids.length} conversations in background. You'll be notified when complete.`,
              { id: `bulk-delete-background-${Date.now()}` }
            );
          } else {
            await bulkRemove({ ids });

            managedToast.success("Conversations Deleted", {
              description: `${ids.length} conversation${ids.length === 1 ? "" : "s"} deleted successfully.`,
              id: `bulk-delete-direct-${Date.now()}`,
            });
            // Invalidate conversations cache to reflect deleted conversations
            del(CACHE_KEYS.conversations);
          }
          break;
        }

        case "export-json": {
          // Always use background jobs for exports (consistent with settings page)
          const jobId = await backgroundJobs.startExport(ids, {
            includeAttachmentContent: false,
          });

          // Track this export for auto-download
          if (jobId) {
            setPendingAutoDownloads(prev => new Set(prev).add(jobId));
          }
          break;
        }

        default:
          throw new Error(`Unsupported action: ${actionKey}`);
      }
    },
    [patchConversation, bulkRemove, backgroundJobs, managedToast]
  );

  const performBulkAction = useCallback(
    (actionKey: string) => {
      const selectedIds = getSelectedIds();
      const config = BULK_ACTION_CONFIGS[actionKey];

      if (!config) {
        managedToast.error(`Unknown action: ${actionKey}`);
        return;
      }

      if (selectedIds.length === 0) {
        managedToast.error("No conversations selected");
        return;
      }

      confirmationDialog.confirm(
        {
          title: config.title,
          description: config.description(selectedIds.length),
          confirmText: config.confirmText,
          cancelText: "Cancel",
          variant: config.variant,
        },
        async () => {
          try {
            await executeBulkAction(actionKey, selectedIds);
            clearSelection();
          } catch (error) {
            managedToast.error("Operation failed");
            console.error(`Bulk ${actionKey} error:`, error);
          }
        }
      );
    },
    [
      getSelectedIds,
      confirmationDialog,
      executeBulkAction,
      clearSelection,
      managedToast,
    ]
  );

  return {
    performBulkAction,
    confirmationDialog,
    availableActions: Object.keys(BULK_ACTION_CONFIGS),
  };
}
