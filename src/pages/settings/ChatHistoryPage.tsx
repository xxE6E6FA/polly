import { ActivitySection } from "@/components/settings/activity-section";
import { ConversationSelectionList } from "@/components/settings/conversation-selection-list";
import { ImportExportActions } from "@/components/settings/import-export-actions";
import { SettingsHeader } from "@/components/settings/settings-header";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConversationSelection } from "@/hooks/use-conversation-selection";
import { useJobManagement } from "@/hooks/use-job-management";

export default function ChatHistoryPage() {
  const conversationSelection = useConversationSelection();
  const jobManagement = useJobManagement({ limit: 20 });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SettingsHeader
        title="Chat History"
        description="Manage your conversation history - import, export, and organize your chats"
      />

      <ActivitySection
        jobs={jobManagement.allJobs}
        onDownload={jobManagement.handleDownload}
        onRemove={jobManagement.handleRemoveJob}
        isDownloading={jobManagement.isDownloading}
        downloadingJobId={jobManagement.downloadingJobId}
        showDetailed={true}
        title="Import & Export Activity"
        description="Track your recent imports and exports. Files are automatically deleted after 30 days."
      />

      <ImportExportActions
        selectedConversations={conversationSelection.selectedConversations}
        includeAttachments={conversationSelection.includeAttachments}
        onIncludeAttachmentsChange={conversationSelection.setIncludeAttachments}
      />

      <ConversationSelectionList
        selectedConversations={conversationSelection.selectedConversations}
        onConversationSelect={conversationSelection.handleConversationSelect}
        onSelectAll={conversationSelection.handleSelectAll}
        onBulkSelect={conversationSelection.handleBulkSelect}
        clearSelection={conversationSelection.clearSelection}
        includeArchived={true}
        includePinned={true}
        recentlyImportedIds={jobManagement.recentlyImportedIds}
      />

      <ConfirmationDialog
        open={jobManagement.confirmDialog.isOpen}
        onOpenChange={jobManagement.confirmDialog.handleOpenChange}
        title={jobManagement.confirmDialog.options.title}
        description={jobManagement.confirmDialog.options.description}
        confirmText={jobManagement.confirmDialog.options.confirmText}
        cancelText={jobManagement.confirmDialog.options.cancelText}
        variant={jobManagement.confirmDialog.options.variant}
        onConfirm={jobManagement.confirmDialog.handleConfirm}
        onCancel={jobManagement.confirmDialog.handleCancel}
      />
    </div>
  );
}
