import { useCallback } from "react";

import { useNavigate } from "react-router";

import { ArchiveIcon, ArrowsClockwise, EyeIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { VirtualizedPaginatedList } from "@/components/virtualized-paginated-list";
import { SettingsHeader } from "@/components/settings/settings-header";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { useConvexMutationOptimized } from "@/hooks/use-convex-cache";
import { type PaginatedQueryReference } from "convex/react";

import { ROUTES } from "@/lib/routes";
import { type ConversationId } from "@/types";

import { api } from "../../../convex/_generated/api";

type ArchivedConversation = {
  _id: ConversationId;
  title: string;
  updatedAt: number;
  isArchived?: boolean;
};

export const ArchivedConversationsPage = () => {
  const navigate = useNavigate();
  const confirmationDialog = useConfirmationDialog();
  const queryUserId = useQueryUserId();

  // Use optimized mutations with optimistic updates
  const { mutateAsync: unarchive, isLoading: isUnarchiving } =
    useConvexMutationOptimized(api.conversations.unarchive, {
      queryKey: "archivedConversations",
      optimisticUpdate: (_variables: { id: ConversationId }, currentData) => {
        if (!Array.isArray(currentData)) return currentData;
        // Remove the conversation from archived list optimistically
        return currentData.filter(
          (conv: ArchivedConversation) => conv._id !== _variables.id
        );
      },
      onSuccess: () => {
        import("sonner").then(module => {
          module.toast.success("Conversation restored", {
            description:
              "Conversation has been restored to your conversations.",
          });
        });
      },
      onError: (error: Error) => {
        console.error("Failed to restore conversation:", error);
        import("sonner").then(module => {
          module.toast.error("Failed to restore conversation", {
            description: "Unable to restore conversation. Please try again.",
          });
        });
      },
      invalidateQueries: ["conversations", "archivedConversations"],
      dispatchEvents: ["conversation-unarchived"],
    });

  const {
    mutateAsync: deleteConversation,
    isLoading: _isDeletingConversation,
  } = useConvexMutationOptimized(api.conversations.remove, {
    queryKey: "archivedConversations",
    optimisticUpdate: (variables: { id: ConversationId }, currentData) => {
      if (!Array.isArray(currentData)) return currentData;
      // Remove the conversation from archived list optimistically
      return currentData.filter(
        (conv: ArchivedConversation) => conv._id !== variables.id
      );
    },
    onSuccess: () => {
      import("sonner").then(module => {
        module.toast.success("Conversation deleted", {
          description: "The conversation has been permanently removed.",
        });
      });
    },
    onError: (error: Error) => {
      console.error("Failed to delete conversation:", error);
      import("sonner").then(module => {
        module.toast.error("Failed to delete conversation", {
          description: "Unable to delete conversation. Please try again.",
        });
      });
    },
    invalidateQueries: ["conversations", "archivedConversations"],
    dispatchEvents: ["conversation-deleted"],
  });

  const handleView = useCallback(
    (conversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    },
    [navigate]
  );

  const handleRestore = useCallback(
    async (conversationId: ConversationId) => {
      try {
        await unarchive({ id: conversationId });
      } catch {
        // Error handling is done in the optimized hook
      }
    },
    [unarchive]
  );

  const handlePermanentDelete = useCallback(
    (conversationId: ConversationId, title: string) => {
      confirmationDialog.confirm(
        {
          title: "Delete Conversation Permanently",
          description: `Are you sure you want to permanently delete "${title}"? This action cannot be undone.`,
          confirmText: "Delete Permanently",
          cancelText: "Cancel",
          variant: "destructive",
        },
        async () => {
          try {
            await deleteConversation({ id: conversationId });
          } catch {
            // Error handling is done in the optimized hook
          }
        }
      );
    },
    [confirmationDialog, deleteConversation]
  );

  // Render function for each archived conversation
  const renderArchivedConversation = useCallback(
    (conversation: ArchivedConversation) => {
      const isRestoring = isUnarchiving;
      const isDeleting = false;

      return (
        <Card className="flex items-center justify-between p-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium">{conversation.title}</h3>
            <p className="text-sm text-muted-foreground">
              Archived {new Date(conversation.updatedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="ml-4 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleView(conversation._id)}
            >
              <EyeIcon className="mr-2 h-3.5 w-3.5" />
              View
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRestore(conversation._id)}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <>
                  <ArrowsClockwise className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <ArrowsClockwise className="mr-2 h-3.5 w-3.5" />
                  Restore
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
              onClick={() =>
                handlePermanentDelete(conversation._id, conversation.title)
              }
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </Card>
      );
    },
    [handleView, handleRestore, handlePermanentDelete, isUnarchiving]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <SettingsHeader
        title="Archived Conversations"
        description="Manage your archived conversations"
      />

      <VirtualizedPaginatedList
        query={
          api.conversations
            .listArchivedPaginated as unknown as PaginatedQueryReference
        }
        queryArgs={queryUserId ? { userId: queryUserId } : "skip"}
        renderItem={renderArchivedConversation}
        getItemKey={item => item._id}
        emptyState={
          <Card className="p-12 text-center">
            <ArchiveIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">No archived conversations</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Conversations you archive will appear here
            </p>
          </Card>
        }
        className="h-96"
        itemHeight={120}
        initialNumItems={20}
      />

      <ConfirmationDialog
        open={confirmationDialog.isOpen}
        onOpenChange={confirmationDialog.handleOpenChange}
        title={confirmationDialog.options.title}
        description={confirmationDialog.options.description}
        confirmText={confirmationDialog.options.confirmText}
        cancelText={confirmationDialog.options.cancelText}
        variant={confirmationDialog.options.variant}
        onConfirm={confirmationDialog.handleConfirm}
        onCancel={confirmationDialog.handleCancel}
      />
    </div>
  );
};

export default ArchivedConversationsPage;
