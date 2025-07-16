import { api } from "@convex/_generated/api";
import { ArchiveIcon, ArrowsClockwise, EyeIcon } from "@phosphor-icons/react";
import type { PaginatedQueryReference } from "convex/react";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { SettingsHeader } from "@/components/settings/settings-header";
import {
  SettingsPageLayout,
  SettingsZeroState,
} from "@/components/settings/ui";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { VirtualizedPaginatedList } from "@/components/virtualized-paginated-list";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { ROUTES } from "@/lib/routes";
import type { ConversationId } from "@/types";

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
  const [isUnarchiving, setIsUnarchiving] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const unarchiveMutation = useMutation(api.conversations.unarchive);
  const deleteConversationMutation = useMutation(api.conversations.remove);

  const handleView = useCallback(
    (conversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    },
    [navigate]
  );

  const handleRestore = useCallback(
    async (conversationId: ConversationId) => {
      setIsUnarchiving(conversationId);
      try {
        await unarchiveMutation({ id: conversationId });
        toast.success("Conversation restored", {
          description: "Conversation has been restored to your conversations.",
        });
      } catch (error) {
        console.error("Failed to restore conversation:", error);
        toast.error("Failed to restore conversation", {
          description: "Unable to restore conversation. Please try again.",
        });
      } finally {
        setIsUnarchiving(null);
      }
    },
    [unarchiveMutation]
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
          setIsDeleting(conversationId);
          try {
            await deleteConversationMutation({ id: conversationId });
            toast.success("Conversation deleted", {
              description: "The conversation has been permanently removed.",
            });
          } catch (error) {
            console.error("Failed to delete conversation:", error);
            toast.error("Failed to delete conversation", {
              description: "Unable to delete conversation. Please try again.",
            });
          } finally {
            setIsDeleting(null);
          }
        }
      );
    },
    [confirmationDialog, deleteConversationMutation]
  );

  // Render function for each archived conversation
  const renderArchivedConversation = useCallback(
    (conversation: ArchivedConversation) => {
      const isRestoring = isUnarchiving === conversation._id;
      const isDeletingConversation = isDeleting === conversation._id;

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
                  <Spinner size="sm" className="mr-2 h-3.5 w-3.5" />
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
              disabled={isDeletingConversation}
            >
              {isDeletingConversation ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </Card>
      );
    },
    [
      handleView,
      handleRestore,
      handlePermanentDelete,
      isUnarchiving,
      isDeleting,
    ]
  );

  return (
    <SettingsPageLayout>
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
        zeroState={
          <SettingsZeroState
            icon={<ArchiveIcon className="h-12 w-12" />}
            title="No archived conversations"
            description="Conversations you archive will appear here"
          />
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
    </SettingsPageLayout>
  );
};

export default ArchivedConversationsPage;
