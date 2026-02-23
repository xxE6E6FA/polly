import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowSquareOutIcon,
  CopyIcon,
  EyeIcon,
  ShareNetworkIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { SHARED_CONVERSATION_EXPIRY_DAYS } from "@shared/constants";
import { useMutation } from "convex/react";
import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { MobileDrawerConfig } from "@/components/data-list/data-list-mobile-drawer";
import type { VirtualizedDataListColumn } from "@/components/data-list/virtualized-data-list";
import { VirtualizedDataList } from "@/components/data-list/virtualized-data-list";
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
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

type SharedConversation = {
  _id: Id<"sharedConversations">;
  shareId: string;
  title: string;
  sharedAt: number;
  lastUpdated: number;
  messageCount: number;
  originalConversationId: Id<"conversations">;
  _creationTime: number;
};

type SortField = "title" | "sharedAt" | "expiresAt";

function generateShareUrl(shareId: string) {
  return `${window.location.origin}/share/${shareId}`;
}

function getDaysUntilExpiry(lastUpdated: number): number {
  const expiryDate =
    lastUpdated + SHARED_CONVERSATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const daysLeft = Math.ceil((expiryDate - now) / (24 * 60 * 60 * 1000));
  return Math.max(0, daysLeft);
}

function formatDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) {
    return "Expiring soon";
  }
  if (daysLeft === 1) {
    return "1 day left";
  }
  return `${daysLeft} days left`;
}

export function SharedView() {
  const managedToast = useToast();
  const confirmDialog = useConfirmationDialog();
  const navigate = useNavigate();

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("sharedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const unshareConversation = useMutation(
    api.sharedConversations.unshareConversation
  );

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        // Default to ascending for expiry (soonest first), descending for others
        setSortDirection(field === "expiresAt" ? "asc" : "desc");
      }
    },
    [sortField]
  );

  const handleCopyUrl = useCallback(
    async (shareId: string) => {
      const url = generateShareUrl(shareId);
      await navigator.clipboard.writeText(url);
      setCopiedId(shareId);
      setTimeout(() => setCopiedId(null), 2000);
      managedToast.success("Link copied to clipboard");
    },
    [managedToast]
  );

  const handleUnshare = useCallback(
    (conversationId: Id<"conversations">, title?: string) => {
      confirmDialog.confirm(
        {
          title: "Stop sharing conversation?",
          description: `Are you sure you want to stop sharing "${
            title || "this conversation"
          }"? The share link will no longer work.`,
          confirmText: "Stop sharing",
          variant: "destructive",
        },
        async () => {
          setIsDeleting(conversationId);
          try {
            await unshareConversation({ conversationId });
            managedToast.success("Conversation unshared");
          } catch (_error) {
            managedToast.error("Failed to unshare conversation");
          } finally {
            setIsDeleting(null);
          }
        }
      );
    },
    [confirmDialog, unshareConversation, managedToast]
  );

  const handleRowClick = useCallback(
    (conversation: SharedConversation) => {
      navigate(ROUTES.CHAT_CONVERSATION(conversation.originalConversationId));
    },
    [navigate]
  );

  const columns: VirtualizedDataListColumn<SharedConversation, SortField>[] =
    useMemo(
      () => [
        {
          key: "title",
          label: "Title",
          sortable: true,
          sortField: "title" as SortField,
          render: conversation => (
            <div
              className="truncate font-medium"
              title={conversation.title || "Untitled Conversation"}
            >
              {conversation.title || "Untitled Conversation"}
            </div>
          ),
        },
        {
          key: "sharedAt",
          label: "Date Shared",
          width: "w-28",
          hideOnMobile: true,
          sortable: true,
          sortField: "sharedAt" as SortField,
          render: conversation => (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {new Date(conversation.sharedAt).toLocaleDateString()}
            </span>
          ),
        },
        {
          key: "expiresAt",
          label: "Expires",
          width: "w-28",
          hideOnMobile: true,
          sortable: true,
          sortField: "expiresAt" as SortField,
          render: conversation => {
            const daysLeft = getDaysUntilExpiry(conversation.lastUpdated);
            const isUrgent = daysLeft <= 7;
            const isWarning = daysLeft <= 30 && daysLeft > 7;

            return (
              <span
                className={cn(
                  "text-sm whitespace-nowrap",
                  isUrgent && "text-destructive font-medium",
                  isWarning && "text-warning",
                  !(isUrgent || isWarning) && "text-muted-foreground"
                )}
              >
                {formatDaysLeft(daysLeft)}
              </span>
            );
          },
        },
        {
          key: "actions",
          label: "",
          width: "w-36",
          className: "text-right",
          render: conversation => {
            const isCopied = copiedId === conversation.shareId;
            const isDeletingConversation =
              isDeleting === conversation.originalConversationId;

            return (
              <div
                className="flex items-center justify-end gap-1"
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.stopPropagation()}
              >
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => handleCopyUrl(conversation.shareId)}
                    >
                      <CopyIcon
                        className={`size-4 ${isCopied ? "text-primary" : ""}`}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isCopied ? "Copied!" : "Copy link"}</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <a
                      href={generateShareUrl(conversation.shareId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({
                        size: "sm",
                        variant: "ghost",
                        className: "h-8 px-2",
                      })}
                    >
                      <ArrowSquareOutIcon className="size-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Open shared view</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <Link
                      to={ROUTES.CHAT_CONVERSATION(
                        conversation.originalConversationId
                      )}
                      className={buttonVariants({
                        size: "sm",
                        variant: "ghost",
                        className: "h-8 px-2",
                      })}
                    >
                      <EyeIcon className="size-4" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View original</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        handleUnshare(
                          conversation.originalConversationId,
                          conversation.title
                        )
                      }
                      disabled={isDeletingConversation}
                    >
                      {isDeletingConversation ? (
                        <Spinner size="sm" className="size-4" />
                      ) : (
                        <TrashIcon className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isDeletingConversation ? "Removing..." : "Stop sharing"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          },
        },
      ],
      [copiedId, isDeleting, handleCopyUrl, handleUnshare]
    );

  const mobileDrawerConfig: MobileDrawerConfig<SharedConversation> = useMemo(
    () => ({
      title: conversation => conversation.title || "Untitled Conversation",
      subtitle: conversation => {
        const daysLeft = getDaysUntilExpiry(conversation.lastUpdated);
        return `Shared ${new Date(conversation.sharedAt).toLocaleDateString()} · ${formatDaysLeft(daysLeft)}`;
      },
      actions: [
        {
          key: "copy",
          label: conversation =>
            copiedId === conversation.shareId ? "Copied!" : "Copy link",
          icon: CopyIcon,
          onClick: conversation => handleCopyUrl(conversation.shareId),
        },
        {
          key: "open",
          label: "Open shared view",
          icon: ArrowSquareOutIcon,
          onClick: conversation => {
            window.open(
              generateShareUrl(conversation.shareId),
              "_blank",
              "noopener,noreferrer"
            );
          },
        },
        {
          key: "view",
          label: "View original",
          icon: EyeIcon,
          onClick: conversation =>
            navigate(
              ROUTES.CHAT_CONVERSATION(conversation.originalConversationId)
            ),
        },
        {
          key: "unshare",
          label: conversation =>
            isDeleting === conversation.originalConversationId
              ? "Removing..."
              : "Stop sharing",
          icon: TrashIcon,
          onClick: conversation =>
            handleUnshare(
              conversation.originalConversationId,
              conversation.title
            ),
          className:
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
          disabled: conversation =>
            isDeleting === conversation.originalConversationId,
        },
      ],
    }),
    [navigate, handleCopyUrl, handleUnshare, copiedId, isDeleting]
  );

  const emptyState = (
    <SettingsZeroState
      icon={<ShareNetworkIcon className="size-12" />}
      title="No shared conversations"
      description="Share a conversation to make it publicly accessible via a link"
      cta={
        <Link
          to={ROUTES.HOME}
          className={buttonVariants({ variant: "outline" })}
        >
          Go to conversations
        </Link>
      }
    />
  );

  return (
    <>
      <VirtualizedDataList<SharedConversation, SortField>
        query={api.sharedConversations.listUserSharedConversationsPaginated}
        queryArgs={{ sortField, sortDirection }}
        getItemKey={conversation => conversation._id}
        columns={columns}
        sort={{
          field: sortField,
          direction: sortDirection,
          onSort: handleSort,
        }}
        onRowClick={handleRowClick}
        mobileTitleRender={conversation =>
          conversation.title || "Untitled Conversation"
        }
        mobileMetadataRender={conversation => {
          const daysLeft = getDaysUntilExpiry(conversation.lastUpdated);
          return (
            <span className="text-xs text-muted-foreground">
              Shared {new Date(conversation.sharedAt).toLocaleDateString()} ·{" "}
              {formatDaysLeft(daysLeft)}
            </span>
          );
        }}
        mobileDrawerConfig={mobileDrawerConfig}
        emptyState={emptyState}
        initialNumItems={20}
        loadMoreCount={20}
      />

      <ConfirmationDialog
        open={confirmDialog.state.isOpen}
        onOpenChange={confirmDialog.handleOpenChange}
        title={confirmDialog.state.title}
        description={confirmDialog.state.description}
        confirmText={confirmDialog.state.confirmText}
        cancelText={confirmDialog.state.cancelText}
        onConfirm={confirmDialog.handleConfirm}
        onCancel={confirmDialog.handleCancel}
        variant={confirmDialog.state.variant}
      />
    </>
  );
}
