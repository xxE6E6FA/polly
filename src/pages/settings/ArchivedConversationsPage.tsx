import { useCallback, useState } from "react";

import { useNavigate } from "react-router";

import { ArchiveIcon, ArrowsClockwise, EyeIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { conversationErrorHandlers } from "@/hooks/use-conversations";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { updateCachedConversation } from "@/lib/conversation-cache";
import { ROUTES } from "@/lib/routes";
import { type ConversationId } from "@/types";

import { api } from "../../../convex/_generated/api";

export const ArchivedConversationsPage = () => {
  const navigate = useNavigate();
  const confirmationDialog = useConfirmationDialog();
  const queryUserId = useQueryUserId();
  const [restoringIds, setRestoringIds] = useState<Set<ConversationId>>(
    new Set()
  );

  const archivedConversations = useQuery(
    api.conversations.listArchived,
    queryUserId ? { userId: queryUserId } : "skip"
  );

  const unarchive = useMutation(api.conversations.unarchive);
  const deleteConversation = useMutation(api.conversations.remove);

  const handleView = useCallback(
    (conversationId: ConversationId) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversationId));
    },
    [navigate]
  );

  const handleRestore = useCallback(
    async (conversationId: ConversationId, title: string) => {
      setRestoringIds(prev => new Set(prev).add(conversationId));
      try {
        await unarchive({ id: conversationId });
        const { toast } = await import("sonner");
        toast.success("Conversation restored", {
          description: `"${title}" has been restored to your conversations.`,
        });
        // Update cache to reflect unarchived state
        const conversation = archivedConversations?.find(
          c => c._id === conversationId
        );
        if (conversation) {
          updateCachedConversation({
            ...conversation,
            isArchived: false,
            updatedAt: Date.now(),
          });
        }
      } catch (_error) {
        const { toast } = await import("sonner");
        toast.error("Failed to restore conversation", {
          description: "Unable to restore conversation. Please try again.",
        });
      } finally {
        setRestoringIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(conversationId);
          return newSet;
        });
      }
    },
    [unarchive, archivedConversations]
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
          await conversationErrorHandlers.handleDelete(async () => {
            await deleteConversation({ id: conversationId });
          });
        }
      );
    },
    [confirmationDialog, deleteConversation]
  );

  if (archivedConversations === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <ArchiveIcon className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Archived Conversations</h1>
      </div>

      {archivedConversations.length === 0 ? (
        <Card className="p-12 text-center">
          <ArchiveIcon className="mx-auto mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">No archived conversations</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Conversations you archive will appear here
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {archivedConversations.map(conversation => {
            const isRestoring = restoringIds.has(conversation._id);
            return (
              <Card
                key={conversation._id}
                className="flex items-center justify-between p-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{conversation.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    Archived{" "}
                    {new Date(conversation.updatedAt).toLocaleDateString()}
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
                    onClick={() =>
                      handleRestore(conversation._id, conversation.title)
                    }
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
                      handlePermanentDelete(
                        conversation._id,
                        conversation.title
                      )
                    }
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
