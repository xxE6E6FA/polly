import { ContextMenu } from "@base-ui/react/context-menu";
import { api } from "@convex/_generated/api";
import { CheckIcon, CircleIcon, GitBranchIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ControlledShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useArchiveConversation } from "@/hooks/use-archive-conversation";
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
  isMobile: boolean;
  onCloseSidebar: () => void;
};

const ConversationItemComponent = ({
  conversation,
  currentConversationId,
  allVisibleIds,
  isMobile,
  onCloseSidebar,
}: ConversationItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobilePopoverOpen, setIsMobilePopoverOpen] = useState(false);
  const [isDesktopPopoverOpen, setIsDesktopPopoverOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<"json" | "md" | null>(
    null
  );

  // Optimistic state for immediate UI feedback
  const [optimisticPinned, setOptimisticPinned] = useState<boolean | null>(
    null
  );

  // Reset optimistic state when server data changes (mutation complete)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally reset when server value changes
  useEffect(() => {
    setOptimisticPinned(null);
  }, [conversation.isPinned]);

  // Use optimistic value if set, otherwise use server value
  const isPinned = optimisticPinned ?? conversation.isPinned;

  // Create optimistic conversation object for child components
  const optimisticConversation = useMemo(
    () =>
      optimisticPinned !== null
        ? { ...conversation, isPinned: optimisticPinned }
        : conversation,
    [conversation, optimisticPinned]
  );

  const {
    isSelectionMode,
    isSelected,
    toggleSelection,
    hasSelection,
    selectRange,
    isShiftPressed,
    isPendingDeletion,
  } = useBatchSelection();
  const navigate = useNavigate();
  const confirmationDialog = useConfirmationDialog();
  const managedToast = useToast();
  const backgroundJobs = useBackgroundJobs();

  const isCurrentConversation = currentConversationId === conversation._id;
  const isItemSelected = isSelected(conversation._id);
  const isBulkMode = isSelectionMode || hasSelection;
  const isBeingDeleted = isPendingDeletion(conversation._id);

  // Mutations
  const patchConversation = useMutation(api.conversations.patch);
  const deleteConversation = useMutation(api.conversations.remove);
  const { archiveConversation: performArchive } = useArchiveConversation({
    currentConversationId,
  });

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

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

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
        await handleError.archive(async () => {
          await performArchive(conversation._id);
        });
      }
    );
  }, [
    confirmationDialog,
    conversation.title,
    conversation._id,
    performArchive,
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

      // Optimistic update: toggle pin state immediately
      const newPinnedState = !isPinned;
      setOptimisticPinned(newPinnedState);

      try {
        await patchConversation({
          id: conversation._id,
          updates: { isPinned: newPinnedState },
        });
      } catch {
        // Revert optimistic update on error
        setOptimisticPinned(null);
      }
    },
    [conversation._id, isPinned, patchConversation]
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
        onCloseSidebar();
      }
    },
    [
      isMobile,
      onCloseSidebar,
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
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          <div
            className={cn(
              "group relative flex items-center rounded-lg transition-all duration-200 ease-in-out my-0",
              isCurrentConversation || isEditing
                ? "bg-muted text-sidebar-foreground"
                : "text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover",
              isBeingDeleted && "opacity-50 pointer-events-none"
            )}
            onMouseEnter={() => {
              if (!isMobile) {
                setIsHovered(true);
              }
            }}
            onMouseLeave={() => !isMobile && setIsHovered(false)}
          >
            {/* Selection checkbox - positioned absolutely, slides in from left when in bulk mode */}
            <div className="absolute left-2 top-0 h-full flex items-center z-10">
              <div
                className={cn(
                  "flex items-center transition-all duration-200 ease-in-out",
                  isBulkMode
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 -translate-x-2 pointer-events-none"
                )}
              >
                <button
                  type="button"
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
                  className="flex items-center justify-center w-4 h-4 rounded border border-sidebar-muted/30 hover:border-sidebar-muted/50 transition-colors"
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

            {/* Main content area - Link only covers content, not actions */}
            <Link
              to={ROUTES.CHAT_CONVERSATION(conversation._id)}
              prefetch="intent"
              className={cn(
                "flex-1 flex items-center min-w-0 no-underline text-inherit rounded-lg transition-all duration-200 ease-in-out",
                isMobile ? "py-2.5" : "py-2",
                // Bulk mode: extra left padding for checkbox
                // Mobile: reserve space for always-visible actions button
                // Desktop: expand right padding on hover to make room for actions
                isBulkMode && "pl-8 pr-2.5",
                !isBulkMode && isMobile && "pl-2.5 pr-10",
                !(isBulkMode || isMobile) && "px-2.5 group-hover:pr-20"
              )}
              onClick={
                isEditing ? e => e.preventDefault() : handleConversationClick
              }
              data-conversation-id={conversation._id}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  {conversation.parentConversationId && (
                    <GitBranchIcon
                      className="w-3.5 h-3.5 text-sidebar-muted flex-shrink-0"
                      aria-label="Branched conversation"
                      weight="bold"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <EditableConversationTitle
                      conversation={conversation}
                      isEditing={isEditing}
                      isMobile={isMobile}
                      isCurrentConversation={isCurrentConversation}
                      onStartEdit={handleStartEdit}
                      onSave={handleSaveEdit}
                      onCancel={handleCancelEdit}
                    />
                  </div>
                </div>
              </div>
            </Link>

            {/* Right side: spinner or actions - absolutely positioned to avoid reserving space */}
            <div className="absolute right-2 top-0 h-full flex items-center">
              {isBeingDeleted && (
                <Spinner className="text-destructive/70" size="sm" />
              )}
              {!isBeingDeleted && conversation.isStreaming && (
                <Spinner className="text-sidebar-muted" size="sm" />
              )}
              {!(isBeingDeleted || conversation.isStreaming) && (
                <ConversationActions
                  conversation={optimisticConversation}
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
              )}
            </div>
          </div>
        </ContextMenu.Trigger>

        <ConversationContextMenu
          conversation={optimisticConversation}
          currentConversationId={currentConversationId}
          exportingFormat={exportingFormat}
          isDeleteJobInProgress={isDeleteJobInProgress}
          onPinToggle={handlePinToggle}
          onStartEdit={handleStartEdit}
          onShare={handleShareClick}
          onExport={handleExport}
          onArchive={handleArchiveClick}
          onDelete={handleDeleteClick}
        />
      </ContextMenu.Root>

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

    // Check if isMobile changed
    if (prevProps.isMobile !== nextProps.isMobile) {
      return false;
    }

    // Ignore changes to allVisibleIds to avoid list-wide re-renders
    return true;
  }
);
