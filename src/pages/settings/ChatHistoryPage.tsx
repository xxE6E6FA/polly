import { useState, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "convex/_generated/api";

import { SettingsHeader } from "@/components/settings/settings-header";
import { ConversationSelectionList } from "@/components/settings/conversation-selection-list";
import { ImportExportActions } from "@/components/settings/import-export-actions";
import { ExportHistory } from "@/components/settings/export-history";
import { MultiJobProgress } from "@/components/ui/progress";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";

export default function ChatHistoryPage() {
  const [selectedConversations, setSelectedConversations] = useState<
    Set<string>
  >(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null
  );
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const confirmDialog = useConfirmationDialog();

  const backgroundJobs = useBackgroundJobs();

  const conversationData = useQuery(
    api.conversations.getConversationsSummaryForExport,
    {
      includeArchived: true,
      includePinned: true,
      limit: 1000,
    }
  );

  const conversations = useMemo(() => {
    return conversationData?.conversations || [];
  }, [conversationData?.conversations]);

  const handleConversationSelect = useCallback(
    (conversationId: string, index: number, isShiftKey: boolean) => {
      setSelectedConversations(prev => {
        const newSelected = new Set(prev);

        if (
          isShiftKey &&
          lastSelectedIndex !== null &&
          conversations.length > 0
        ) {
          const start = Math.min(lastSelectedIndex, index);
          const end = Math.max(lastSelectedIndex, index);

          for (let i = start; i <= end; i++) {
            if (i < conversations.length) {
              newSelected.add(conversations[i]._id);
            }
          }
        } else if (newSelected.has(conversationId)) {
          newSelected.delete(conversationId);
        } else {
          newSelected.add(conversationId);
        }

        return newSelected;
      });

      setLastSelectedIndex(index);
    },
    [lastSelectedIndex, conversations]
  );

  const handleSelectAll = useCallback(() => {
    if (conversations.length === 0) return;

    const allSelected = conversations.every(conv =>
      selectedConversations.has(conv._id)
    );

    if (allSelected) {
      setSelectedConversations(new Set());
    } else {
      setSelectedConversations(new Set(conversations.map(conv => conv._id)));
    }
  }, [conversations, selectedConversations]);

  const handleBulkSelect = useCallback(
    (conversationIds: string[]) => {
      if (conversationIds.length === 0) return;

      const allSelected = conversationIds.every(id =>
        selectedConversations.has(id)
      );

      if (allSelected) {
        setSelectedConversations(prev => {
          const newSelected = new Set(prev);
          conversationIds.forEach(id => newSelected.delete(id));
          return newSelected;
        });
      } else {
        setSelectedConversations(prev => {
          const newSelected = new Set(prev);
          conversationIds.forEach(id => newSelected.add(id));
          return newSelected;
        });
      }
    },
    [selectedConversations]
  );

  // Get all jobs for display - show active jobs and failed jobs
  const allJobs = backgroundJobs.activeJobs.filter(
    job =>
      job.status === "scheduled" ||
      job.status === "processing" ||
      job.status === "failed"
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <SettingsHeader
        title="Chat History"
        description="Manage your conversation history - import, export, and organize your chats"
      />

      <MultiJobProgress jobs={allJobs} onRemoveJob={backgroundJobs.removeJob} />

      <ImportExportActions
        selectedConversations={selectedConversations}
        includeAttachments={includeAttachments}
        onIncludeAttachmentsChange={setIncludeAttachments}
      />

      <ConversationSelectionList
        selectedConversations={selectedConversations}
        onConversationSelect={handleConversationSelect}
        onSelectAll={handleSelectAll}
        onBulkSelect={handleBulkSelect}
        includeArchived={true}
        includePinned={true}
      />

      <ExportHistory />

      <ConfirmationDialog
        open={confirmDialog.isOpen}
        onOpenChange={confirmDialog.handleOpenChange}
        title={confirmDialog.options.title}
        description={confirmDialog.options.description}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
        onConfirm={confirmDialog.handleConfirm}
        onCancel={confirmDialog.handleCancel}
      />
    </div>
  );
}
