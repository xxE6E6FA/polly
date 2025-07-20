import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ControlledShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  generateFilename,
} from "@/lib/export";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useUI } from "@/providers/ui-provider";
import type { Conversation, ConversationId } from "@/types";
import {
  ConversationActions,
  ConversationContextMenu,
} from "./conversation-actions";
import { EditableConversationTitle } from "./editable-conversation-title";

type ConversationItemProps = {
  conversation: Conversation;
  currentConversationId?: ConversationId;
};

export const ConversationItem = ({
  conversation,
  currentConversationId,
}: ConversationItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobilePopoverOpen, setIsMobilePopoverOpen] = useState(false);
  const [isDesktopPopoverOpen, setIsDesktopPopoverOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );

  const { isMobile, setSidebarVisible } = useUI();
  const navigate = useNavigate();
  const confirmationDialog = useConfirmationDialog();
  const backgroundJobs = useBackgroundJobs();

  const isCurrentConversation = currentConversationId === conversation._id;

  // Mutations
  const patchConversation = useMutation(api.conversations.patch);
  const deleteConversation = useMutation(api.conversations.remove);

  // Check if there are any active delete jobs
  const activeDeleteJobs = backgroundJobs
    .getActiveJobs()
    .filter(job => job.type === "bulk_delete");
  const isDeleteJobInProgress = activeDeleteJobs.length > 0;

  const exportData = useQuery(
    api.conversations.getForExport,
    exportingFormat && conversation._id ? { id: conversation._id } : "skip"
  );

  // Handle export when data is ready
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

  // Error handlers
  const handleError = useMemo(
    () => ({
      async delete(operation: () => Promise<unknown>) {
        try {
          const result = await operation();
          toast.success("Conversation deleted", {
            description: "The conversation has been permanently removed.",
          });
          // Invalidate conversations cache to reflect deleted conversation
          del(CACHE_KEYS.conversations);
          return result;
        } catch (error) {
          toast.error("Failed to delete conversation", {
            description: "Unable to delete conversation. Please try again.",
          });
          throw error;
        }
      },

      async archive(operation: () => Promise<unknown>) {
        try {
          const result = await operation();
          toast.success("Conversation archived", {
            description: "The conversation has been moved to archive.",
          });
          return result;
        } catch (error) {
          toast.error("Failed to archive conversation", {
            description: "Unable to archive conversation. Please try again.",
          });
          throw error;
        }
      },
    }),
    []
  );

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
  }, []);

  const handleSaveEdit = useCallback(
    async (newTitle: string) => {
      await patchConversation({
        id: conversation._id,
        updates: { title: newTitle },
      });
      setIsEditing(false);
    },
    [conversation, patchConversation]
  );

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleArchiveClick = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);

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

        await handleError.archive(async () => {
          await patchConversation({
            id: conversation._id,
            updates: { isArchived: true },
          });
          // Invalidate conversations cache to reflect archived conversation
          del(CACHE_KEYS.conversations);
        });
      }
    );
  }, [
    confirmationDialog,
    conversation.title,
    conversation._id,
    patchConversation,
    isCurrentConversation,
    navigate,
    handleError,
  ]);

  const handleDeleteClick = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);

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

        await handleError.delete(async () => {
          await deleteConversation({ id: conversation._id });
        });
      }
    );
  }, [
    confirmationDialog,
    conversation.title,
    conversation._id,
    deleteConversation,
    isCurrentConversation,
    navigate,
    handleError,
  ]);

  const handlePinToggle = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      setIsMobilePopoverOpen(false);
      setIsDesktopPopoverOpen(false);

      await patchConversation({
        id: conversation._id,
        updates: { isPinned: !conversation.isPinned },
      });
    },
    [conversation, patchConversation]
  );

  const handleExport = useCallback(
    (format: "json" | "md") => {
      if (exportingFormat || isDeleteJobInProgress) {
        return;
      }
      setExportingFormat(format);
    },
    [exportingFormat, isDeleteJobInProgress]
  );

  const handleShareClick = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
    setIsShareDialogOpen(true);
  }, []);

  const handleConversationClick = useCallback(() => {
    if (isMobile) {
      setSidebarVisible(false);
    }
  }, [isMobile, setSidebarVisible]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group relative flex items-center rounded-lg transition-all duration-200",
              isCurrentConversation || isEditing
                ? "bg-accent text-foreground shadow-sm"
                : "text-foreground/80 hover:text-foreground hover:bg-accent/50",
              isMobile ? "mx-1 my-0.5" : "mx-1 my-0.5"
            )}
            onMouseEnter={() => !isMobile && setIsHovered(true)}
            onMouseLeave={() => !isMobile && setIsHovered(false)}
          >
            <Link
              to={ROUTES.CHAT_CONVERSATION(conversation._id)}
              className={cn(
                "flex-1 flex items-center min-w-0 no-underline text-inherit rounded-lg",
                isMobile ? "px-3 py-2.5" : "px-3 py-2"
              )}
              onClick={
                isEditing ? e => e.preventDefault() : handleConversationClick
              }
            >
              <div className={cn("flex-1 min-w-0", isMobile ? "pr-3" : "pr-2")}>
                <EditableConversationTitle
                  title={conversation.title}
                  isEditing={isEditing}
                  isCurrentConversation={isCurrentConversation}
                  isMobile={isMobile}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                />
              </div>

              {conversation.isStreaming && (!isHovered || isMobile) && (
                <div className="mr-1 flex items-center">
                  <Spinner className="text-foreground/60" size="sm" />
                </div>
              )}
            </Link>

            <ConversationActions
              conversation={conversation}
              isEditing={isEditing}
              isHovered={isHovered}
              isMobile={isMobile}
              isMobilePopoverOpen={isMobilePopoverOpen}
              isDesktopPopoverOpen={isDesktopPopoverOpen}
              exportingFormat={exportingFormat}
              isDeleteJobInProgress={isDeleteJobInProgress}
              onMobilePopoverChange={setIsMobilePopoverOpen}
              onDesktopPopoverChange={setIsDesktopPopoverOpen}
              onStartEdit={handleStartEdit}
              onArchive={handleArchiveClick}
              onDelete={handleDeleteClick}
              onPinToggle={handlePinToggle}
              onExport={handleExport}
              onShare={handleShareClick}
            />
          </div>
        </ContextMenuTrigger>

        <ConversationContextMenu
          conversation={conversation}
          exportingFormat={exportingFormat}
          isDeleteJobInProgress={isDeleteJobInProgress}
          onPinToggle={handlePinToggle}
          onStartEdit={handleStartEdit}
          onShare={handleShareClick}
          onExport={handleExport}
          onArchive={handleArchiveClick}
          onDelete={handleDeleteClick}
        />
      </ContextMenu>

      <ConfirmationDialog
        cancelText={confirmationDialog.state.cancelText}
        confirmText={confirmationDialog.state.confirmText}
        description={confirmationDialog.state.description}
        open={confirmationDialog.state.isOpen}
        title={confirmationDialog.state.title}
        variant={confirmationDialog.state.variant}
        onCancel={confirmationDialog.handleCancel}
        onConfirm={confirmationDialog.handleConfirm}
        onOpenChange={confirmationDialog.handleOpenChange}
      />

      <ControlledShareConversationDialog
        conversationId={conversation._id}
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
      />
    </>
  );
};
