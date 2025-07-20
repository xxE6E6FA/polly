import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ActivitySection } from "@/components/settings/chat-history-tab/ActivitySection";
import { ConversationSelectionList } from "@/components/settings/chat-history-tab/ConversationSelectionList";
import { ImportExportActions } from "@/components/settings/chat-history-tab/ImportExportActions";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConversationSelection } from "@/hooks/use-conversation-selection";

export default function ChatHistoryPage() {
  const conversationSelection = useConversationSelection();
  const backgroundJobs = useBackgroundJobs();
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);

  const downloadData = useQuery(
    api.backgroundJobs.getExportDownloadUrl,
    downloadingJobId ? { jobId: downloadingJobId } : "skip"
  );

  const handleDownload = (jobId: string) => {
    setDownloadingJobId(jobId);
  };

  useEffect(() => {
    if (!(downloadData && downloadingJobId)) {
      return;
    }

    const downloadFile = async () => {
      let loadingToastId: string | number | undefined;

      try {
        if (downloadData.downloadUrl) {
          // Show loading state
          loadingToastId = toast.loading("Preparing download...");

          // Fetch the file as a blob
          const response = await fetch(downloadData.downloadUrl);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const blob = await response.blob();

          // Generate filename
          let filename = "export.json";
          if (downloadData.manifest) {
            const timestamp = new Date().toISOString().split("T")[0];
            const conversationCount = downloadData.manifest.totalConversations;
            filename = `polly-export-${conversationCount}-conversations-${timestamp}.json`;
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
            toast.dismiss(loadingToastId);
          }
          toast.success("Download started", {
            description: `Export file downloaded as ${filename}`,
          });
        } else {
          // Dismiss loading toast and show error
          if (loadingToastId) {
            toast.dismiss(loadingToastId);
          }
          toast.error("Download failed", {
            description: "Export file is not available for download",
          });
        }
      } catch (error) {
        console.error("Download error:", error);
        // Dismiss loading toast and show error
        if (loadingToastId) {
          toast.dismiss(loadingToastId);
        }
        toast.error("Download failed", {
          description: "An error occurred while downloading the file",
        });
      }
    };

    downloadFile();
    setDownloadingJobId(null);
  }, [downloadData, downloadingJobId]);

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
          new Set(recentlyImportedIds as Array<Id<"conversations">>)
        }
        includeAttachments={conversationSelection.includeAttachments}
        onIncludeAttachmentsChange={
          conversationSelection.onIncludeAttachmentsChange
        }
      />
    </SettingsPageLayout>
  );
}
