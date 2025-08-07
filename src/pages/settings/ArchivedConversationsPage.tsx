import { api } from "@convex/_generated/api";
import {
  ArchiveIcon,
  ArrowsClockwiseIcon,
  EyeIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useState } from "react";
import { Link } from "react-router";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { SettingsZeroState } from "@/components/settings/ui/SettingsZeroState";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { CACHE_KEYS, del } from "@/lib/local-storage";
import { ROUTES } from "@/lib/routes";
import { useToast } from "@/providers/toast-context";

import type { ConversationId } from "@/types";

type ArchivedConversation = {
  _id: ConversationId;
  title: string;
  updatedAt: number;
  isArchived?: boolean;
};

export const ArchivedConversationsPage = () => {
  const confirmationDialog = useConfirmationDialog();
  const managedToast = useToast();

  const [isUnarchiving, setIsUnarchiving] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Query all archived conversations
  const archivedConversations = useQuery(api.conversations.list, {
    archivedOnly: true,
  });

  const unarchiveMutation = useMutation(api.conversations.patch);
  const deleteConversationMutation = useMutation(api.conversations.remove);

  const handleRestore = useCallback(
    async (conversationId: ConversationId) => {
      setIsUnarchiving(conversationId);
      try {
        await unarchiveMutation({
          id: conversationId,
          updates: { isArchived: false },
          setUpdatedAt: true,
        });
        managedToast.success("Conversation restored", {
          description:
            "The conversation has been moved back to your main list.",
        });
        // Invalidate conversations cache to reflect unarchived conversation
        del(CACHE_KEYS.conversations);
      } catch (_error) {
        managedToast.error("Failed to restore conversation", {
          description: "Unable to restore conversation. Please try again.",
        });
      } finally {
        setIsUnarchiving(null);
      }
    },
    [unarchiveMutation, managedToast.success, managedToast.error]
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
            managedToast.success("Conversation deleted", {
              description: "The conversation has been permanently removed.",
            });
            // Invalidate conversations cache to reflect deleted conversation
            del(CACHE_KEYS.conversations);
          } catch (_error) {
            managedToast.error("Failed to delete conversation", {
              description: "Unable to delete conversation. Please try again.",
            });
          } finally {
            setIsDeleting(null);
          }
        }
      );
    },
    [
      confirmationDialog,
      deleteConversationMutation,
      managedToast.success,
      managedToast.error,
    ]
  );

  // Render function for each archived conversation
  const renderArchivedConversation = useCallback(
    (conversation: ArchivedConversation) => {
      const isRestoring = isUnarchiving === conversation._id;
      const isDeletingConversation = isDeleting === conversation._id;

      return (
        <div className="flex items-center p-3 hover:bg-muted/30 transition-all">
          {/* Title and metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <div className="truncate font-medium" title={conversation.title}>
                {conversation.title}
              </div>
            </div>

            {/* Metadata */}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="flex-shrink-0">
                Archived {new Date(conversation.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="w-32 flex-shrink-0 ml-4 flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                  <Link to={ROUTES.CHAT_CONVERSATION(conversation._id)}>
                    <EyeIcon className="h-4 w-4" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>View conversation</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => handleRestore(conversation._id)}
                  disabled={isRestoring}
                >
                  {isRestoring ? (
                    <Spinner size="sm" className="h-4 w-4" />
                  ) : (
                    <ArrowsClockwiseIcon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isRestoring ? "Restoring..." : "Restore conversation"}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() =>
                    handlePermanentDelete(conversation._id, conversation.title)
                  }
                  disabled={isDeletingConversation}
                >
                  {isDeletingConversation ? (
                    <Spinner size="sm" className="h-4 w-4" />
                  ) : (
                    <TrashIcon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {isDeletingConversation
                    ? "Deleting..."
                    : "Delete permanently"}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      );
    },
    [handleRestore, handlePermanentDelete, isUnarchiving, isDeleting]
  );

  if (!archivedConversations) {
    return (
      <SettingsPageLayout>
        <SettingsHeader
          title="Archived Conversations"
          description="Manage your archived conversations"
        />
        <div className="border rounded-lg overflow-hidden divide-y">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={`archived-skeleton-${Date.now()}-${i}`}
              className="flex items-center p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="h-4 bg-muted/30 rounded animate-pulse mb-2" />
                <div className="h-3 bg-muted/20 rounded animate-pulse" />
              </div>
              <div className="w-32 flex-shrink-0 ml-4 flex gap-1">
                <div className="h-8 w-8 bg-muted/30 rounded animate-pulse" />
                <div className="h-8 w-8 bg-muted/30 rounded animate-pulse" />
                <div className="h-8 w-8 bg-muted/30 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Archived Conversations"
        description="Manage your archived conversations"
      />

      {Array.isArray(archivedConversations) &&
      archivedConversations.length === 0 ? (
        <SettingsZeroState
          icon={<ArchiveIcon className="h-12 w-12" />}
          title="No archived conversations"
          description="Conversations you archive will appear here"
        />
      ) : (
        <div className="border rounded-lg overflow-hidden divide-y">
          {Array.isArray(archivedConversations) &&
            archivedConversations.map(renderArchivedConversation)}
        </div>
      )}

      <ConfirmationDialog
        open={confirmationDialog.state.isOpen}
        onOpenChange={confirmationDialog.handleOpenChange}
        title={confirmationDialog.state.title}
        description={confirmationDialog.state.description}
        confirmText={confirmationDialog.state.confirmText}
        cancelText={confirmationDialog.state.cancelText}
        variant={confirmationDialog.state.variant}
        onConfirm={confirmationDialog.handleConfirm}
        onCancel={confirmationDialog.handleCancel}
      />
    </SettingsPageLayout>
  );
};

export default ArchivedConversationsPage;
