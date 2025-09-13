import { api } from "@convex/_generated/api";
import { CheckIcon, CircleIcon, GitBranchIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Spinner } from "@/components/spinner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ControlledShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConversationPreload } from "@/hooks/use-conversation-preload";
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
import { useBatchSelection } from "@/providers/batch-selection-context";
import { useToast } from "@/providers/toast-context";
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
  allVisibleIds: ConversationId[];
};

const ConversationItemComponent = ({
  conversation,
  currentConversationId,
  allVisibleIds,
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
  const {
    isSelectionMode,
    isSelected,
    toggleSelection,
    hasSelection,
    selectRange,
    isShiftPressed,
  } = useBatchSelection();
  const navigate = useNavigate();
  const confirmationDialog = useConfirmationDialog();
  const managedToast = useToast();
  const backgroundJobs = useBackgroundJobs();
  const { preloadConversation } = useConversationPreload();

  const isCurrentConversation = currentConversationId === conversation._id;
  const isItemSelected = isSelected(conversation._id);
  const isBulkMode = isSelectionMode || hasSelection;
  const isActionsHovered = isHovered || isDesktopPopoverOpen;

  // Never show actions padding while editing to avoid layout shift
  const shouldShowActions =
    !(isMobile || isBulkMode || isEditing) && isActionsHovered;

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

        managedToast.success("Export successful", {
          description: `Conversation exported as ${filename}`,
          id: `export-${conversation._id}`,
        });
      } catch (_error) {
        managedToast.error("Export failed", {
          description: "An error occurred while exporting the conversation",
          id: `export-error-${conversation._id}`,
        });
      } finally {
        setExportingFormat(null);
      }
    }
  }, [
    exportData,
    exportingFormat,
    conversation.title,
    conversation._id,
    managedToast,
  ]);

  // Error handlers
  const handleError = useMemo(
    () => ({
      async delete(operation: () => Promise<unknown>) {
        try {
          const result = await operation();
          managedToast.success("Conversation deleted", {
            description: "The conversation has been permanently removed.",
            id: `delete-${conversation._id}`,
          });
          // Invalidate conversations cache to reflect deleted conversation
          del(CACHE_KEYS.conversations);
          return result;
        } catch (error) {
          managedToast.error("Failed to delete conversation", {
            description: "Unable to delete conversation. Please try again.",
            id: `delete-error-${conversation._id}`,
          });
          throw error;
        }
      },

      async archive(operation: () => Promise<unknown>) {
        try {
          const result = await operation();
          managedToast.success("Conversation archived", {
            description: "The conversation has been moved to archive.",
            id: `archive-${conversation._id}`,
          });
          return result;
        } catch (error) {
          managedToast.error("Failed to archive conversation", {
            description: "Unable to archive conversation. Please try again.",
            id: `archive-error-${conversation._id}`,
          });
          throw error;
        }
      },
    }),
    [managedToast, conversation._id]
  );

  const handleStartEdit = useCallback(() => {
    // Always close any open menus before handling edit/navigation
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);

    // Only allow editing when this row is the current/selected conversation.
    if (!isCurrentConversation) {
      // Navigate to the conversation if user tries to edit a non-selected one
      navigate(ROUTES.CHAT_CONVERSATION(conversation._id));
      return;
    }
    setIsEditing(true);
  }, [conversation._id, isCurrentConversation, navigate]);

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

  const handleConversationClick = useCallback(
    (e: React.MouseEvent) => {
      // If in selection mode, handle selection instead of navigating
      if (isSelectionMode || hasSelection) {
        e.preventDefault();

        // If Shift is held and we're in selection mode, do range selection
        if (isShiftPressed && hasSelection) {
          selectRange(conversation._id, allVisibleIds);
        } else {
          // Otherwise, just toggle this item
          toggleSelection(conversation._id);
        }
        return;
      }

      if (isMobile) {
        setSidebarVisible(false);
      }
    },
    [
      isMobile,
      setSidebarVisible,
      isSelectionMode,
      hasSelection,
      isShiftPressed,
      toggleSelection,
      selectRange,
      conversation._id,
      allVisibleIds,
    ]
  );

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group relative flex items-center rounded-md transition-all duration-200 ease-in-out my-0",
              isCurrentConversation || isEditing
                ? "bg-accent text-foreground shadow-sm"
                : "text-foreground/80 hover:text-foreground hover:bg-accent/70"
            )}
            onMouseEnter={() => {
              if (!isMobile) {
                setIsHovered(true);
                // Preload conversation data on hover for faster navigation
                preloadConversation(conversation._id);
              }
            }}
            onMouseLeave={() => !isMobile && setIsHovered(false)}
          >
            {/* Selection checkbox - positioned absolutely, slides in from left when in bulk mode */}
            <div className="absolute left-2 top-0 h-full flex items-center">
              <div
                className={cn(
                  "flex items-center transition-all duration-200 ease-in-out",
                  isBulkMode
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-2 pointer-events-none"
                )}
              >
                <button
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();

                    // If Shift is held and we have a selection, do range selection
                    if (isShiftPressed && hasSelection) {
                      selectRange(conversation._id, allVisibleIds);
                    } else {
                      toggleSelection(conversation._id);
                    }
                  }}
                  className="flex items-center justify-center w-4 h-4 rounded border border-muted-foreground/30 hover:border-muted-foreground/50 transition-colors"
                >
                  {isItemSelected ? (
                    <CheckIcon
                      className="w-2.5 h-2.5 text-primary"
                      weight="bold"
                    />
                  ) : (
                    <CircleIcon className="w-2.5 h-2.5 text-transparent" />
                  )}
                </button>
              </div>
            </div>

            <Link
              to={ROUTES.CHAT_CONVERSATION(conversation._id)}
              className={cn(
                "flex-1 flex items-center min-w-0 no-underline text-inherit rounded-md transition-all duration-200 ease-in-out",
                isMobile ? "py-2" : "py-1.5",
                // Adjust padding dynamically based on checkbox visibility
                isBulkMode ? "px-2 pl-8" : "px-2"
              )}
              onClick={
                isEditing ? e => e.preventDefault() : handleConversationClick
              }
              data-conversation-id={conversation._id}
            >
              <div
                className={cn(
                  "flex-1 min-w-0 transition-all duration-200 ease-in-out",
                  // Only add padding when actions are visible (not on mobile and not in bulk mode)
                  shouldShowActions ? "pr-16" : "pr-2"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {conversation.parentConversationId && (
                    <GitBranchIcon
                      className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
                      aria-label="Branched conversation"
                      weight="bold"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <EditableConversationTitle
                      title={conversation.title}
                      isEditing={isEditing}
                      isCurrentConversation={isCurrentConversation}
                      isMobile={isMobile}
                      hasActionsVisible={shouldShowActions}
                      onStartEdit={handleStartEdit}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                    />
                  </div>
                </div>
              </div>

              {conversation.isStreaming && (!isHovered || isMobile) && (
                <div className="mr-1 flex items-center">
                  <Spinner className="text-muted-foreground" size="sm" />
                </div>
              )}
            </Link>

            {/* Position actions absolutely to overlay title area */}
            <div className="absolute right-2 top-0 h-full flex items-center">
              <ConversationActions
                conversation={conversation}
                isEditing={isEditing}
                isHovered={isHovered}
                isMobile={isMobile}
                isMobilePopoverOpen={isMobilePopoverOpen}
                isDesktopPopoverOpen={isDesktopPopoverOpen}
                exportingFormat={exportingFormat}
                isDeleteJobInProgress={isDeleteJobInProgress}
                isBulkMode={isBulkMode}
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

export const ConversationItem = memo(
  ConversationItemComponent,
  (prevProps, nextProps) => {
    // Re-render if this specific conversation doc changed in a meaningful way
    const prev = prevProps.conversation;
    const next = nextProps.conversation;

    if (
      prev._id !== next._id ||
      prev.title !== next.title ||
      prev.isPinned !== next.isPinned ||
      prev.isArchived !== next.isArchived ||
      prev.updatedAt !== next.updatedAt ||
      Boolean(prev.isStreaming) !== Boolean(next.isStreaming)
    ) {
      return false;
    }

    // Only the previously-selected and newly-selected rows need to update
    const prevWasCurrent = prevProps.currentConversationId === prev._id;
    const nextIsCurrent = nextProps.currentConversationId === next._id;
    if (prevWasCurrent !== nextIsCurrent) {
      return false;
    }

    // Ignore changes to allVisibleIds to avoid list-wide re-renders
    return true;
  }
);
