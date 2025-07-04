import { useCallback, useEffect, useState } from "react";

import { useNavigate } from "react-router";

import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { conversationErrorHandlers } from "@/hooks/use-conversations";
import {
  removeCachedConversation,
  updateCachedConversation,
} from "@/lib/conversation-cache";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { ROUTES } from "@/lib/routes";
import { type Conversation } from "@/types";

export const useConversationActions = (
  conversation: Conversation,
  isCurrentConversation: boolean
) => {
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );
  const confirmationDialog = useConfirmationDialog();
  const navigate = useNavigate();
  const backgroundJobs = useBackgroundJobs();

  const archiveConversation = useMutation(api.conversations.archive);
  const deleteConversation = useMutation(api.conversations.remove);
  const updateConversationTitle = useMutation(api.conversations.updateTitle);
  const setPinned = useMutation(api.conversations.setPinned);

  // Check if there are any active delete jobs
  const activeDeleteJobs = backgroundJobs
    .getActiveJobs()
    .filter(job => job.type === "bulk_delete");
  const isDeleteJobInProgress = activeDeleteJobs.length > 0;

  const exportData = useQuery(
    api.conversations.getForExport,
    exportingFormat && conversation._id ? { id: conversation._id } : "skip"
  );

  useEffect(() => {
    if (exportData && exportingFormat) {
      try {
        let content: string;
        let mimeType: string;

        if (exportingFormat === "json") {
          content = exportAsJSON(exportData);
          mimeType = "application/json";
        } else {
          content = exportAsMarkdown(exportData);
          mimeType = "text/markdown";
        }

        const filename = generateFilename(conversation.title, exportingFormat);
        downloadFile(content, filename, mimeType);

        toast.success("Export successful", {
          description: `Conversation exported as ${filename}`,
        });
      } catch (_error) {
        toast.error("Export failed", {
          description: "An error occurred while exporting the conversation",
        });
      } finally {
        setExportingFormat(null);
      }
    }
  }, [exportData, exportingFormat, conversation.title]);

  const handleArchive = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }

      confirmationDialog.confirm(
        {
          title: "Archive Conversation",
          description: `Are you sure you want to archive "${conversation.title}"? You can restore it later from the archived conversations.`,
          confirmText: "Archive",
          cancelText: "Cancel",
          variant: "default",
        },
        async () => {
          if (isCurrentConversation) {
            navigate(ROUTES.HOME);
          }

          if (isCurrentConversation) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          await conversationErrorHandlers.handleArchive(async () => {
            await archiveConversation({ id: conversation._id });
            removeCachedConversation(conversation._id);
          });
        }
      );
    },
    [
      confirmationDialog,
      conversation.title,
      conversation._id,
      archiveConversation,
      isCurrentConversation,
      navigate,
    ]
  );

  const handleDelete = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }

      confirmationDialog.confirm(
        {
          title: "Delete Conversation",
          description: `Are you sure you want to permanently delete "${conversation.title}"? This action cannot be undone.`,
          confirmText: "Delete",
          cancelText: "Cancel",
          variant: "destructive",
        },
        async () => {
          if (isCurrentConversation) {
            navigate(ROUTES.HOME);
          }

          if (isCurrentConversation) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          await conversationErrorHandlers.handleDelete(async () => {
            await deleteConversation({ id: conversation._id });
            removeCachedConversation(conversation._id);
          });
        }
      );
    },
    [
      confirmationDialog,
      conversation.title,
      conversation._id,
      deleteConversation,
      isCurrentConversation,
      navigate,
    ]
  );

  const handlePinToggle = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }

      await setPinned({
        id: conversation._id,
        isPinned: !conversation.isPinned,
      });
      updateCachedConversation({
        ...conversation,
        isPinned: !conversation.isPinned,
        updatedAt: Date.now(),
      });
    },
    [conversation, setPinned]
  );

  const handleTitleUpdate = useCallback(
    async (newTitle: string) => {
      await updateConversationTitle({
        id: conversation._id,
        title: newTitle,
      });
      updateCachedConversation({
        ...conversation,
        title: newTitle,
      });
    },
    [conversation, updateConversationTitle]
  );

  const handleExport = useCallback(
    (format: "json" | "md") => {
      if (exportingFormat || isDeleteJobInProgress) return;
      setExportingFormat(format);
    },
    [exportingFormat, isDeleteJobInProgress]
  );

  return {
    confirmationDialog,
    exportingFormat,
    isDeleteJobInProgress,
    handleArchive,
    handleDelete,
    handlePinToggle,
    handleTitleUpdate,
    handleExport,
  };
};
