import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArchiveIcon,
  CheckIcon,
  DownloadIcon,
  PushPinIcon,
} from "@phosphor-icons/react";
import type { PaginatedQueryReference } from "convex/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { VirtualizedPaginatedList } from "@/components/virtualized-paginated-list";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { CACHE_KEYS, del } from "@/lib/local-storage";

import { cn } from "@/lib/utils";

type ConversationSummary = {
  _id: Id<"conversations">;
  _creationTime: number;
  title: string;
  isArchived?: boolean;
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
};

interface ConversationSelectionListProps {
  selectedConversations: Set<Id<"conversations">>;
  onConversationSelect: (
    conversationId: Id<"conversations">,
    index: number,
    isShiftKey: boolean
  ) => void;
  onSelectAll: () => void;
  clearSelection: () => void;
  recentlyImportedIds?: Set<Id<"conversations">>;
  includeAttachments: boolean;
  onIncludeAttachmentsChange: (include: boolean) => void;
}

export function ConversationSelectionList({
  selectedConversations,
  onConversationSelect,
  onSelectAll,
  clearSelection,
  recentlyImportedIds,
  includeAttachments,
  onIncludeAttachmentsChange,
}: ConversationSelectionListProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const bulkRemove = useMutation(api.conversations.bulkRemove);
  const backgroundJobs = useBackgroundJobs();

  const handleItemClick = useCallback(
    (conversationId: Id<"conversations">, index: number, shiftKey: boolean) => {
      onConversationSelect(conversationId, index, shiftKey);
    },
    [onConversationSelect]
  );

  const handleExport = useCallback(async () => {
    if (selectedConversations.size === 0) {
      toast.error("Please select conversations to export");
      return;
    }

    try {
      const conversationIds = Array.from(
        selectedConversations
      ) as Id<"conversations">[];
      await backgroundJobs.startExport(conversationIds, {
        includeAttachmentContent: includeAttachments,
      });
      toast.success(
        `Started exporting ${conversationIds.length} conversation${conversationIds.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to start export", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }, [selectedConversations, includeAttachments, backgroundJobs]);

  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedConversations);
      const BackgroundThreshold = 10;

      if (ids.length > BackgroundThreshold) {
        await backgroundJobs.startBulkDelete(ids);
        toast.success(
          `Started deleting ${ids.length} conversations in background. You'll be notified when complete.`
        );
      } else {
        await bulkRemove({ ids });
        toast.success("Conversations Deleted", {
          description: `${ids.length} conversation${
            ids.length === 1 ? "" : "s"
          } deleted successfully.`,
        });
        // Invalidate conversations cache to reflect deleted conversations
        del(CACHE_KEYS.conversations);
      }

      clearSelection();
    } catch (error) {
      console.error("Failed to delete conversations:", error);
      toast.error("Delete Failed", {
        description: "Failed to delete conversations. Please try again.",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }, [selectedConversations, bulkRemove, backgroundJobs, clearSelection]);

  const renderItem = useCallback(
    (conversation: ConversationSummary, index: number) => {
      const isSelected = selectedConversations.has(conversation._id);
      const isRecentlyImported = recentlyImportedIds?.has(conversation._id);
      const isEven = index % 2 === 0;

      return (
        <button
          key={conversation._id}
          type="button"
          className={cn(
            "w-full flex items-center gap-3 px-6 py-3 text-left transition-colors duration-150",
            isEven ? "bg-background" : "bg-muted/30",
            isSelected && "!bg-primary/10 border-l-2 border-l-primary",
            isRecentlyImported &&
              "!bg-green-50 border-l-2 border-l-green-500 dark:!bg-green-950/30 dark:border-l-green-400",
            "hover:bg-muted/50"
          )}
          onClick={e => handleItemClick(conversation._id, index, e.shiftKey)}
        >
          <div
            className={cn(
              "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
              isSelected
                ? "bg-primary border-primary"
                : "border-muted-foreground/40 bg-background"
            )}
          >
            {isSelected && (
              <CheckIcon className="w-3 h-3 text-primary-foreground" />
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isRecentlyImported ||
            conversation.isPinned ||
            conversation.isArchived ? (
              <div className="flex items-center gap-1 shrink-0">
                {isRecentlyImported && (
                  <Badge
                    variant="default"
                    className="h-5 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                  >
                    New
                  </Badge>
                )}
                {conversation.isPinned && (
                  <PushPinIcon className="w-3 h-3 text-blue-500" />
                )}
                {conversation.isArchived && (
                  <ArchiveIcon className="w-3 h-3 text-muted-foreground" />
                )}
              </div>
            ) : null}

            <span className="text-sm font-medium min-w-0 flex-1 truncate">
              {conversation.title}
            </span>

            <div className="shrink-0 text-xs text-muted-foreground mr-2">
              {new Date(conversation.createdAt).toLocaleDateString()}
            </div>
          </div>
        </button>
      );
    },
    [selectedConversations, handleItemClick, recentlyImportedIds]
  );

  // Check if export is currently running
  const activeJobs = backgroundJobs.getActiveJobs();
  const isExporting = activeJobs.some(job => job.type === "export");

  const someSelected = selectedConversations.size > 0;

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Select Conversations</CardTitle>
            <div className="flex items-center gap-2">
              {someSelected ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleExport}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      "Exporting..."
                    ) : (
                      <>
                        <DownloadIcon className="mr-1 h-3 w-3" />
                        Export ({selectedConversations.size})
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    Delete ({selectedConversations.size})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={clearSelection}
                  >
                    Clear Selection
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={onSelectAll}
                >
                  Select All
                </Button>
              )}
            </div>
          </div>

          {someSelected && (
            <div className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                id="include-attachments"
                checked={includeAttachments}
                onChange={e => onIncludeAttachmentsChange(e.target.checked)}
                className="rounded border-gray-300"
              />
              <label
                htmlFor="include-attachments"
                className="text-muted-foreground text-xs"
              >
                Include attachment content in export
              </label>
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0 border-t border-border/50">
          <VirtualizedPaginatedList<ConversationSummary>
            query={api.conversations.list as PaginatedQueryReference}
            queryArgs={{
              includeArchived: true,
            }}
            renderItem={renderItem}
            getItemKey={item => item._id}
            zeroState={
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <p className="text-sm">No conversations found</p>
              </div>
            }
            className="h-96"
            itemHeight={36}
            initialNumItems={20}
          />
        </CardContent>
      </Card>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogTitle>Delete Conversations</DialogTitle>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete {selectedConversations.size}{" "}
              conversation{selectedConversations.size === 1 ? "" : "s"}? This
              action cannot be undone.
            </p>
            {selectedConversations.size > 10 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="text-blue-800 dark:text-blue-200 text-sm">
                  Large deletions will be processed in the background. You'll be
                  notified when complete.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
