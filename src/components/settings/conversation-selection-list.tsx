import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import {
  CheckIcon,
  MagnifyingGlassIcon,
  PushPinIcon,
  ArchiveIcon,
} from "@phosphor-icons/react";

import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";

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
  onBulkSelect: (conversationIds: Id<"conversations">[]) => void;
  clearSelection: () => void;
  includeArchived?: boolean;
  includePinned?: boolean;
  recentlyImportedIds?: Set<Id<"conversations">>;
}

export function ConversationSelectionList({
  selectedConversations,
  onConversationSelect,
  onSelectAll,
  onBulkSelect,
  clearSelection,
  includeArchived = true,
  includePinned = true,
  recentlyImportedIds,
}: ConversationSelectionListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const bulkRemove = useMutation(api.conversations.bulkRemove);
  const backgroundJobs = useBackgroundJobs();

  const conversationData = useQuery(
    api.conversations.getConversationsSummaryForExport,
    {
      includeArchived,
      includePinned,
      limit: 1000,
    }
  );

  const conversations = useMemo(() => {
    return conversationData?.conversations || [];
  }, [conversationData?.conversations]);

  const isLoading = conversationData === undefined;

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) {
      return conversations;
    }

    const query = searchQuery.toLowerCase();
    return conversations.filter((conversation: ConversationSummary) =>
      conversation.title.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

  const handleConversationSelect = useCallback(
    (
      conversationId: Id<"conversations">,
      index: number,
      isShiftKey: boolean
    ) => {
      onConversationSelect(conversationId, index, isShiftKey);
    },
    [onConversationSelect]
  );

  const allSelected = useMemo(() => {
    return (
      filteredConversations.length > 0 &&
      filteredConversations.every((conv: ConversationSummary) =>
        selectedConversations.has(conv._id)
      )
    );
  }, [filteredConversations, selectedConversations]);

  const someSelected = useMemo(() => {
    return filteredConversations.some((conv: ConversationSummary) =>
      selectedConversations.has(conv._id)
    );
  }, [filteredConversations, selectedConversations]);

  const handleSelectAllFiltered = useCallback(() => {
    const conversationIds = filteredConversations.map(conv => conv._id);
    onBulkSelect(conversationIds);
  }, [filteredConversations, onBulkSelect]);

  const handleItemClick = useCallback(
    (conversationId: Id<"conversations">, index: number, shiftKey: boolean) => {
      handleConversationSelect(conversationId, index, shiftKey);
    },
    [handleConversationSelect]
  );

  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedConversations) as Id<"conversations">[];
      const BACKGROUND_THRESHOLD = 10; // Use background jobs for more than 10 conversations

      if (ids.length > BACKGROUND_THRESHOLD) {
        // Use background job for large deletions
        await backgroundJobs.startBulkDelete(ids);
        toast.success(
          `Started deleting ${ids.length} conversations in background. You'll be notified when complete.`
        );
      } else {
        // Use synchronous deletion for small batches
        const result = await bulkRemove({ ids });
        toast.success(
          `Deleted ${result.filter(r => r.status === "deleted").length} conversations`
        );
      }

      setShowDeleteDialog(false);
      clearSelection();
      setIsDeleting(false);
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete conversations");
      setIsDeleting(false);
    }
  }, [selectedConversations, bulkRemove, backgroundJobs, clearSelection]);

  const renderItem = useCallback(
    (conversation: ConversationSummary, index: number) => {
      const isSelected = selectedConversations.has(conversation._id);
      const isRecentlyImported =
        recentlyImportedIds?.has(conversation._id) || false;
      const isEven = index % 2 === 0;

      const fullDate = new Date(conversation.updatedAt).toLocaleDateString(
        undefined,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }
      );

      return (
        <div
          key={conversation._id}
          className={cn(
            "flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors duration-150",
            isEven ? "bg-background" : "bg-muted/30",
            isSelected && "!bg-primary/10 border-l-2 border-l-primary",
            isRecentlyImported &&
              "!bg-green-50 border-l-2 border-l-green-500 dark:!bg-green-950/30 dark:border-l-green-400",
            "hover:bg-muted/50"
          )}
          onClick={e => handleItemClick(conversation._id, index, e.shiftKey)}
        >
          {/* Selection indicator */}
          <div
            className={cn(
              "w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 transition-colors",
              isSelected
                ? "bg-primary border-primary"
                : "border-muted-foreground/40 bg-background hover:border-muted-foreground/60"
            )}
          >
            {isSelected && (
              <CheckIcon className="w-2 h-2 text-primary-foreground" />
            )}
          </div>

          {/* Content - single line */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Status badges before title */}
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
                <Badge
                  variant="secondary"
                  className="h-5 px-2 text-xs flex items-center gap-1"
                >
                  <PushPinIcon className="w-3 h-3" />
                  Pinned
                </Badge>
              )}
              {conversation.isArchived && (
                <Badge
                  variant="secondary"
                  className="h-5 px-2 text-xs flex items-center gap-1"
                >
                  <ArchiveIcon className="w-3 h-3" />
                  Archived
                </Badge>
              )}
            </div>

            {/* Title */}
            <span className="text-sm font-medium min-w-0 flex-1 truncate">
              {conversation.title}
            </span>

            {/* Right side info */}
            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
              <span className="hidden sm:block">{fullDate}</span>
            </div>
          </div>
        </div>
      );
    },
    [selectedConversations, handleItemClick, recentlyImportedIds]
  );

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Conversations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3 space-y-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Select Conversations</span>
            <div className="flex items-center gap-2">
              {someSelected && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  Delete
                </Button>
              )}
              <Button
                onClick={searchQuery ? handleSelectAllFiltered : onSelectAll}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
              >
                {allSelected ? "Deselect All" : "Select All"}
                {searchQuery && " (Filtered)"}
              </Button>
              {someSelected && (
                <Badge variant="secondary" className="h-5 text-xs px-2">
                  {selectedConversations.size}
                </Badge>
              )}
            </div>
          </CardTitle>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {/* Compact status */}
          {searchQuery && filteredConversations.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {filteredConversations.length} of {conversations.length}{" "}
              conversations
            </div>
          )}
        </CardHeader>

        <CardContent className="flex-1 min-h-0 p-0 border-t border-border/50">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">
                {searchQuery
                  ? "No conversations match your search"
                  : "No conversations found"}
              </p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {filteredConversations.map((conversation, index) =>
                renderItem(conversation, index)
              )}
            </div>
          )}
        </CardContent>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogTitle>Delete selected conversations?</DialogTitle>
            <div className="py-2 text-sm text-muted-foreground">
              This will permanently delete {selectedConversations.size}{" "}
              conversation{selectedConversations.size !== 1 ? "s" : ""}. This
              action cannot be undone.
              {selectedConversations.size > 10 && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                  <p className="text-blue-800 dark:text-blue-200 text-sm">
                    Large deletions will be processed in the background. You'll
                    be notified when complete.
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
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
                Delete
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </TooltipProvider>
  );
}
