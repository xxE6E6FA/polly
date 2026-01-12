import { api } from "@convex/_generated/api";
import {
  ArchiveIcon,
  ArrowsClockwiseIcon,
  EyeIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MobileDrawerConfig } from "@/components/data-list/data-list-mobile-drawer";
import type { VirtualizedDataListColumn } from "@/components/data-list/virtualized-data-list";
import { VirtualizedDataList } from "@/components/data-list/virtualized-data-list";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/settings-page-layout";
import { SettingsZeroState } from "@/components/settings/ui/settings-zero-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import type { SortDirection } from "@/hooks/use-list-sort";
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

type SortField = "archivedAt";

export const ArchivedConversationsPage = () => {
  const confirmationDialog = useConfirmationDialog();
  const managedToast = useToast();
  const navigate = useNavigate();

  const [isUnarchiving, setIsUnarchiving] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = useCallback(() => {
    setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
  }, []);

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

  const handleRowClick = useCallback(
    (conversation: ArchivedConversation) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversation._id));
    },
    [navigate]
  );

  const columns: VirtualizedDataListColumn<ArchivedConversation, SortField>[] =
    useMemo(
      () => [
        {
          key: "title",
          label: "Conversation",
          render: conversation => (
            <div className="truncate font-medium" title={conversation.title}>
              {conversation.title}
            </div>
          ),
        },
        {
          key: "archivedAt",
          label: "Archived",
          width: "w-32",
          hideOnMobile: true,
          sortable: true,
          sortField: "archivedAt" as SortField,
          render: conversation => (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {new Date(conversation.updatedAt).toLocaleDateString()}
            </span>
          ),
        },
        {
          key: "actions",
          label: "",
          width: "w-40",
          className: "text-right",
          render: conversation => {
            const isRestoring = isUnarchiving === conversation._id;
            const isDeletingConversation = isDeleting === conversation._id;

            return (
              <div
                className="flex items-center justify-end gap-1"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
                <Tooltip>
                  <TooltipTrigger delayDuration={200}>
                    <Link
                      to={ROUTES.CHAT_CONVERSATION(conversation._id)}
                      className={buttonVariants({
                        size: "sm",
                        variant: "ghost",
                        className: "h-8 px-2",
                      })}
                    >
                      <EyeIcon className="h-4 w-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View conversation</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger delayDuration={200}>
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
                    <p>
                      {isRestoring ? "Restoring..." : "Restore conversation"}
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger delayDuration={200}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        handlePermanentDelete(
                          conversation._id,
                          conversation.title
                        )
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
            );
          },
        },
      ],
      [handleRestore, handlePermanentDelete, isUnarchiving, isDeleting]
    );

  const mobileDrawerConfig: MobileDrawerConfig<ArchivedConversation> = useMemo(
    () => ({
      title: conversation => conversation.title,
      subtitle: conversation =>
        `Archived ${new Date(conversation.updatedAt).toLocaleDateString()}`,
      actions: [
        {
          key: "view",
          label: "View conversation",
          icon: EyeIcon,
          onClick: conversation =>
            navigate(ROUTES.CHAT_CONVERSATION(conversation._id)),
        },
        {
          key: "restore",
          label: conversation =>
            isUnarchiving === conversation._id
              ? "Restoring..."
              : "Restore conversation",
          icon: ArrowsClockwiseIcon,
          onClick: conversation => handleRestore(conversation._id),
          disabled: conversation => isUnarchiving === conversation._id,
        },
        {
          key: "delete",
          label: conversation =>
            isDeleting === conversation._id
              ? "Deleting..."
              : "Delete permanently",
          icon: TrashIcon,
          onClick: conversation =>
            handlePermanentDelete(conversation._id, conversation.title),
          className:
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
          disabled: conversation => isDeleting === conversation._id,
        },
      ],
    }),
    [navigate, handleRestore, handlePermanentDelete, isUnarchiving, isDeleting]
  );

  const emptyState = (
    <SettingsZeroState
      icon={<ArchiveIcon className="h-12 w-12" />}
      title="No archived conversations"
      description="Conversations you archive will appear here"
    />
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Archived Conversations"
        description="Manage your archived conversations"
      />

      <VirtualizedDataList<ArchivedConversation, SortField>
        query={api.conversations.list}
        queryArgs={{ archivedOnly: true, sortDirection }}
        getItemKey={conversation => conversation._id}
        columns={columns}
        sort={{
          field: "archivedAt",
          direction: sortDirection,
          onSort: handleSort,
        }}
        onRowClick={handleRowClick}
        mobileTitleRender={conversation => conversation.title}
        mobileMetadataRender={conversation => (
          <span className="text-xs text-muted-foreground">
            Archived {new Date(conversation.updatedAt).toLocaleDateString()}
          </span>
        )}
        mobileDrawerConfig={mobileDrawerConfig}
        emptyState={emptyState}
        initialNumItems={20}
        loadMoreCount={20}
      />

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
