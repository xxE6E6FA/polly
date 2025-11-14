import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretUpIcon,
  DownloadIcon,
  LinkIcon,
  PushPinIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DataList,
  type DataListColumn,
  ListEmptyState,
  ListLoadingState,
} from "@/components/data-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useListSelection } from "@/hooks/use-list-selection";
import { useListSort } from "@/hooks/use-list-sort";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { useToast } from "@/providers/toast-context";

type ConversationSummary = {
  _id: Id<"conversations">;
  _creationTime: number;
  title: string;
  isArchived?: boolean;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

type SortField = "title" | "created";

interface ConversationSelectionListProps {
  recentlyImportedIds?: Set<Id<"conversations">>;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ConversationSelectionList({
  recentlyImportedIds,
}: ConversationSelectionListProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [includeAttachments, setIncludeAttachments] = useState(true);

  // Query conversations with pagination
  const {
    results: conversationsData,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.conversations.list,
    {
      includeArchived: true,
    },
    { initialNumItems: 50 }
  );

  const navigate = useNavigate();
  const bulkRemove = useMutation(api.conversations.bulkRemove);
  const removeConversation = useMutation(api.conversations.remove);
  const patchConversation = useMutation(api.conversations.patch);
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();

  // Filter out null entries and ensure type safety
  const conversations = useMemo(() => {
    if (!conversationsData) {
      return [];
    }
    return conversationsData.filter(
      (conv): conv is ConversationSummary => conv !== null
    );
  }, [conversationsData]);

  // Conversation key generation for selection
  const getConversationKey = useCallback((conv: ConversationSummary) => {
    return conv._id;
  }, []);

  // Sorting hook
  const { sortField, sortDirection, toggleSort, sortItems } = useListSort<
    SortField,
    ConversationSummary
  >("created", "desc", (conv, field) => {
    if (field === "title") {
      return conv.title.toLowerCase();
    }
    return conv.createdAt;
  });

  // Selection hook
  const selection = useListSelection<ConversationSummary>(getConversationKey);

  // Apply sorting
  const sortedConversations = useMemo(
    () => sortItems(conversations),
    [sortItems, conversations]
  );

  const handleExport = useCallback(async () => {
    if (selection.selectedCount === 0) {
      managedToast.error("Please select conversations to export");
      return;
    }

    try {
      const conversationIds = Array.from(
        selection.selectedKeys
      ) as Id<"conversations">[];
      await backgroundJobs.startExport(conversationIds, {
        includeAttachmentContent: includeAttachments,
      });
      managedToast.success(
        `Started exporting ${conversationIds.length} conversation${conversationIds.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      managedToast.error("Failed to start export", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }, [
    selection.selectedKeys,
    selection.selectedCount,
    includeAttachments,
    backgroundJobs,
    managedToast,
  ]);

  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selection.selectedKeys) as Id<"conversations">[];
      const BackgroundThreshold = 10;

      if (ids.length > BackgroundThreshold) {
        await backgroundJobs.startBulkDelete(ids);
        managedToast.success(
          `Started deleting ${ids.length} conversations in background. You'll be notified when complete.`
        );
      } else {
        await bulkRemove({ ids });
        managedToast.success("Conversations Deleted", {
          description: `${ids.length} conversation${
            ids.length === 1 ? "" : "s"
          } deleted successfully.`,
        });
        // Invalidate conversations cache to reflect deleted conversations
        del(CACHE_KEYS.conversations);
      }

      selection.clearSelection();
    } catch (_error) {
      managedToast.error("Delete Failed", {
        description: "Failed to delete conversations. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [selection, bulkRemove, backgroundJobs, managedToast]);

  const handleGoToConversation = useCallback(
    (conversationId: Id<"conversations">) => {
      navigate(`/chat/${conversationId}`);
    },
    [navigate]
  );

  const handleTogglePin = useCallback(
    async (conversationId: Id<"conversations">, isPinned: boolean) => {
      try {
        await patchConversation({
          conversationId,
          isPinned: !isPinned,
        });
        managedToast.success(
          isPinned ? "Conversation unpinned" : "Conversation pinned"
        );
      } catch (error) {
        managedToast.error("Failed to update pin status", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    },
    [patchConversation, managedToast]
  );

  const handleToggleArchive = useCallback(
    async (conversationId: Id<"conversations">, isArchived: boolean) => {
      try {
        await patchConversation({
          conversationId,
          isArchived: !isArchived,
        });
        managedToast.success(
          isArchived ? "Conversation unarchived" : "Conversation archived"
        );
      } catch (error) {
        managedToast.error("Failed to update archive status", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    },
    [patchConversation, managedToast]
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: Id<"conversations">) => {
      try {
        await removeConversation({ id: conversationId });
        managedToast.success("Conversation deleted");
        // Invalidate conversations cache
        del(CACHE_KEYS.conversations);
      } catch (error) {
        managedToast.error("Failed to delete conversation", {
          description:
            error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    },
    [removeConversation, managedToast]
  );

  // Render badges for a conversation
  const renderBadges = useCallback(
    (conversation: ConversationSummary) => {
      const isRecentlyImported = recentlyImportedIds?.has(conversation._id);
      const hasBadges =
        isRecentlyImported || conversation.isPinned || conversation.isArchived;

      if (!hasBadges) {
        return null;
      }

      return (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isRecentlyImported && (
            <Badge
              variant="default"
              className="h-5 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
            >
              New
            </Badge>
          )}
          {conversation.isPinned && (
            <PushPinIcon className="w-4 h-4 text-blue-500" />
          )}
          {conversation.isArchived && (
            <ArchiveIcon className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      );
    },
    [recentlyImportedIds]
  );

  // Define columns for DataList
  const columns: DataListColumn<ConversationSummary, SortField>[] = useMemo(
    () => [
      {
        key: "title",
        label: "",
        sortable: true,
        sortField: "title",
        className: "flex-1 min-w-0",
        render: conversation => (
          <div className="flex items-start gap-2 min-w-0">
            {renderBadges(conversation)}
            <span className="text-sm font-medium line-clamp-2 sm:truncate">
              {conversation.title}
            </span>
          </div>
        ),
      },
      {
        key: "created",
        label: "Created",
        sortable: true,
        sortField: "created",
        width: "w-32 flex-shrink-0 ml-4",
        className: "text-sm text-muted-foreground text-right",
        hideOnMobile: true,
        render: conversation => formatDate(conversation.createdAt),
      },
      {
        key: "actions",
        label: "Actions",
        width: "w-40 flex-shrink-0",
        className: "flex items-center justify-end gap-1",
        hideOnMobile: true,
        render: conversation => (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={e => {
                e.stopPropagation();
                handleGoToConversation(conversation._id);
              }}
              className="h-8 px-2"
              title="Go to conversation"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={e => {
                e.stopPropagation();
                handleTogglePin(conversation._id, !!conversation.isPinned);
              }}
              className={`h-8 px-2 ${conversation.isPinned ? "text-blue-500" : ""}`}
              title={conversation.isPinned ? "Unpin" : "Pin"}
            >
              <PushPinIcon className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={e => {
                e.stopPropagation();
                handleToggleArchive(
                  conversation._id,
                  !!conversation.isArchived
                );
              }}
              className={`h-8 px-2 ${conversation.isArchived ? "text-muted-foreground" : ""}`}
              title={conversation.isArchived ? "Unarchive" : "Archive"}
            >
              {conversation.isArchived ? (
                <ArrowCounterClockwiseIcon className="h-4 w-4" />
              ) : (
                <ArchiveIcon className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={e => {
                e.stopPropagation();
                handleDeleteConversation(conversation._id);
              }}
              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Delete conversation"
            >
              <TrashIcon className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [
      renderBadges,
      handleGoToConversation,
      handleTogglePin,
      handleToggleArchive,
      handleDeleteConversation,
    ]
  );

  // Check if export is currently running
  const activeJobs = backgroundJobs.getActiveJobs();
  const isExporting = activeJobs.some(job => job.type === "export");

  const someSelected = selection.selectedCount > 0;
  const isLoading = status === "LoadingFirstPage";

  return (
    <>
      {/* Controls */}
      {someSelected && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  "Exporting..."
                ) : (
                  <>
                    <DownloadIcon className="mr-2 h-4 w-4" />
                    Export ({selection.selectedCount})
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <TrashIcon className="mr-2 h-4 w-4" />
                Delete ({selection.selectedCount})
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={selection.clearSelection}
              >
                Clear
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={e => setIncludeAttachments(e.target.checked)}
                className="rounded"
              />
              Include attachment content in export
            </label>
          </div>
        </div>
      )}

      {/* Conversations List */}
      {isLoading && <ListLoadingState count={6} height="h-12" />}

      {!isLoading && sortedConversations.length === 0 && (
        <ListEmptyState
          title="No conversations found"
          description="Start a new conversation to see it here"
        />
      )}

      {!isLoading && sortedConversations.length > 0 && (
        <DataList
          items={sortedConversations}
          getItemKey={getConversationKey}
          columns={columns}
          selection={selection}
          sort={{
            field: sortField,
            direction: sortDirection,
            onSort: toggleSort,
          }}
          sortIcons={{ asc: CaretUpIcon, desc: CaretDownIcon }}
          onRowClick={conv => selection.toggleItem(conv)}
          mobileTitleRender={conversation => (
            <div className="flex items-start gap-2 min-w-0">
              {renderBadges(conversation)}
              <span className="text-sm font-medium line-clamp-2">
                {conversation.title}
              </span>
            </div>
          )}
          mobileMetadataRender={conversation => (
            <div className="text-xs text-muted-foreground">
              {formatDate(conversation.createdAt)}
            </div>
          )}
          mobileActionsRender={conversation => (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  handleGoToConversation(conversation._id);
                }}
                className="h-9 w-9 p-0"
                title="Go to conversation"
              >
                <LinkIcon className="h-5 w-5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  handleTogglePin(conversation._id, !!conversation.isPinned);
                }}
                className={`h-9 w-9 p-0 ${conversation.isPinned ? "text-blue-500" : ""}`}
                title={conversation.isPinned ? "Unpin" : "Pin"}
              >
                <PushPinIcon className="h-5 w-5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  handleToggleArchive(
                    conversation._id,
                    !!conversation.isArchived
                  );
                }}
                className={`h-9 w-9 p-0 ${conversation.isArchived ? "text-muted-foreground" : ""}`}
                title={conversation.isArchived ? "Unarchive" : "Archive"}
              >
                {conversation.isArchived ? (
                  <ArrowCounterClockwiseIcon className="h-5 w-5" />
                ) : (
                  <ArchiveIcon className="h-5 w-5" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={e => {
                  e.stopPropagation();
                  handleDeleteConversation(conversation._id);
                }}
                className="h-9 w-9 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Delete conversation"
              >
                <TrashIcon className="h-5 w-5" />
              </Button>
            </>
          )}
        />
      )}

      {/* Load More Button */}
      {status === "CanLoadMore" && (
        <div className="flex justify-center py-4">
          <Button onClick={() => loadMore(50)} variant="outline">
            Load More
          </Button>
        </div>
      )}

      {status === "LoadingMore" && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Loading more conversations...</span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Conversations"
        description={
          selection.selectedCount > 10
            ? `Are you sure you want to delete ${selection.selectedCount} conversations? Large deletions will be processed in the background. You'll be notified when complete. This action cannot be undone.`
            : `Are you sure you want to delete ${selection.selectedCount} conversation${selection.selectedCount === 1 ? "" : "s"}? This action cannot be undone.`
        }
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        onConfirm={handleBulkDelete}
        variant="destructive"
        disabled={isDeleting}
      />
    </>
  );
}
