import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { ActivitySection } from "@/components/settings/chat-history-tab/ActivitySection";
import { ConversationSelectionList } from "@/components/settings/chat-history-tab/ConversationSelectionList";
import { ImportExportActions } from "@/components/settings/chat-history-tab/ImportExportActions";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConversationSelection } from "@/hooks/use-conversation-selection";
import { generateBackgroundExportFilename } from "@/lib/export";
import { useToast } from "@/providers/toast-context";

export default function ChatHistoryPage() {
  const conversationSelection = useConversationSelection();
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [pendingFilename, setPendingFilename] = useState<string | null>(null);

  const downloadData = useQuery(
    api.backgroundJobs.getExportDownloadUrl,
    downloadingJobId ? { jobId: downloadingJobId } : "skip"
  );

  const handleDownload = useCallback((jobId: string, filename?: string) => {
    setPendingFilename(filename ?? null);
    setDownloadingJobId(jobId);
  }, []);

  useEffect(() => {
    if (!(downloadData && downloadingJobId)) {
      return;
    }

    const downloadFile = async () => {
      let loadingToastId: string | number | undefined;

      try {
        if (downloadData.downloadUrl) {
          // Show loading state
          loadingToastId = managedToast.loading("Preparing download...");

          // Fetch the file as a blob
          const response = await fetch(downloadData.downloadUrl);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const blob = await response.blob();

          // Generate filename
          let filename = pendingFilename ?? "export.json";
          if (filename === "export.json") {
            filename = generateBackgroundExportFilename(downloadData.manifest);
          }

          // Create a blob URL and download link
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = filename;

          // Add to DOM, click, and cleanup
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // Clean up the blob URL
          window.URL.revokeObjectURL(blobUrl);

          // Dismiss loading toast and show success
          if (loadingToastId) {
            managedToast.dismiss(loadingToastId);
          }
          managedToast.success("Download started", {
            description: `Export file downloaded as ${filename}`,
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
    setPendingFilename(null);
  }, [
    downloadData,
    downloadingJobId,
    managedToast.success,
    managedToast.error,
    managedToast.loading,
    managedToast.dismiss,
    pendingFilename,
  ]);

  // Listen for download events from toast actions
  useEffect(() => {
    const handleDownloadExport = (event: CustomEvent) => {
      const { jobId, filename } = event.detail as {
        jobId: string;
        filename?: string;
      };
      handleDownload(jobId, filename);
    };

    window.addEventListener(
      "downloadExport",
      handleDownloadExport as EventListener
    );

    return () => {
      window.removeEventListener(
        "downloadExport",
        handleDownloadExport as EventListener
      );
    };
  }, [handleDownload]);

  const handleRemove = (jobId: string) => {
    backgroundJobs.removeJob(jobId);
  };

  const jobs = backgroundJobs.activeJobs;
  const recentlyImportedIds = jobs
    .filter(
      job =>
        job.type === "import" &&
        job.status === "completed" &&
        job.result?.conversationIds
    )
    .flatMap(job => job.result?.conversationIds || []);

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Chat History"
        description="Manage your conversation history - import, export, and organize your chats"
      />

      <ActivitySection
        jobs={jobs}
        onDownload={handleDownload}
        onRemove={handleRemove}
        isDownloading={downloadingJobId !== null}
        downloadingJobId={downloadingJobId}
        showDetailed={true}
        title="Import & Export Activity"
        description="Track your recent imports and exports. Files are automatically deleted after 30 days."
      />

      <ImportExportActions />

      <ConversationSelectionList
        selectedConversations={conversationSelection.selectedConversations}
        onConversationSelect={conversationSelection.handleConversationSelect}
        onSelectAll={conversationSelection.onSelectAll}
        clearSelection={conversationSelection.clearSelection}
        recentlyImportedIds={
          new Set(recentlyImportedIds as Id<"conversations">[])
        }
        includeAttachments={conversationSelection.includeAttachments}
        onIncludeAttachmentsChange={
          conversationSelection.onIncludeAttachmentsChange
        }
      />
    </SettingsPageLayout>
  );
}
