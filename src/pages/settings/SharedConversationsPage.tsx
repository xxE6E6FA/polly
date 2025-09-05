import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  ArrowSquareOutIcon,
  CopyIcon,
  LinkIcon,
  ShareNetworkIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Link } from "react-router";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsPageLayout } from "@/components/settings/ui/SettingsPageLayout";
import { SettingsZeroState } from "@/components/settings/ui/SettingsZeroState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

type SharedConversation = {
  _id: string;
  shareId: string;
  title: string;
  sharedAt: number;
  lastUpdated: number;
  messageCount: number;
  originalConversationId: Id<"conversations">;
  _creationTime: number;
};

export default function SharedConversationsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const managedToast = useToast();
  const confirmDialog = useConfirmationDialog();

  // Query all shared conversations
  const sharedConversations = useQuery(
    api.sharedConversations.listUserSharedConversations,
    {}
  );

  // Mutations
  const unshareConversation = useMutation(
    api.sharedConversations.unshareConversation
  );

  const generateShareUrl = (shareId: string) => {
    return `${window.location.origin}/share/${shareId}`;
  };

  const handleCopyUrl = async (shareId: string) => {
    const url = generateShareUrl(shareId);
    await navigator.clipboard.writeText(url);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
    managedToast.success("Link copied to clipboard");
  };

  const handleUnshare = (
    conversationId: Id<"conversations">,
    title?: string
  ) => {
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
        try {
          await unshareConversation({ conversationId });
          managedToast.success("Conversation unshared");
        } catch (_error) {
          managedToast.error("Failed to unshare conversation");
        }
      }
    );
  };

  // Render function for each shared conversation item
  const renderSharedConversation = (conversation: SharedConversation) => {
    const shareUrl = generateShareUrl(conversation.shareId);
    const isCopied = copiedId === conversation.shareId;

    return (
      <div className="flex items-center p-3 hover:bg-muted/30 transition-all">
        {/* Title and metadata */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div
              className="truncate font-medium"
              title={conversation.title || "Untitled Conversation"}
            >
              {conversation.title || "Untitled Conversation"}
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span className="flex-shrink-0">
              Shared{" "}
              {formatDistanceToNow(new Date(conversation.sharedAt), {
                addSuffix: true,
              })}
            </span>
            {conversation.lastUpdated > conversation.sharedAt && (
              <>
                <span className="flex-shrink-0">•</span>
                <span className="flex-shrink-0">
                  Updated{" "}
                  {formatDistanceToNow(new Date(conversation.lastUpdated), {
                    addSuffix: true,
                  })}
                </span>
              </>
            )}
            <span className="flex-shrink-0">•</span>
            <span className="flex-shrink-0">
              {conversation.messageCount} messages
            </span>
          </div>
        </div>

        {/* URL field with copy and view buttons */}
        <div className="w-96 flex-shrink-0 ml-4">
          <div className="relative">
            <input
              readOnly
              className="w-full rounded-lg border bg-muted/30 px-3 py-2 pr-20 font-mono text-xs"
              value={shareUrl}
            />
            <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className={cn("h-7 w-7 p-0", isCopied && "text-primary")}
                    variant="ghost"
                    onClick={() => handleCopyUrl(conversation.shareId)}
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isCopied ? "Copied!" : "Copy link"}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild className="h-7 w-7 p-0" variant="ghost">
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Open shared view</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="w-24 flex-shrink-0 ml-4 flex items-center justify-end gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="sm" variant="ghost" className="h-8 px-2">
                <Link
                  to={ROUTES.CHAT_CONVERSATION(
                    conversation.originalConversationId
                  )}
                >
                  <LinkIcon className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Go to conversation</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
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
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Stop sharing</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  };

  if (!sharedConversations) {
    return (
      <SettingsPageLayout>
        <SettingsHeader
          title="Shared Conversations"
          description="Manage your publicly shared conversations"
        />
        <div className="stack-xl">
          <Alert>
            <AlertDescription>
              Shared conversations are automatically deleted after 90 days of
              inactivity to maintain system performance.
            </AlertDescription>
          </Alert>
          <div className="border rounded-lg overflow-hidden divide-y">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={`shared-skeleton-${Date.now()}-${i}`}
                className="flex items-center p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-muted/30 rounded animate-pulse mb-2" />
                  <div className="h-3 bg-muted/20 rounded animate-pulse" />
                </div>
                <div className="w-96 flex-shrink-0 ml-4">
                  <div className="h-8 bg-muted/30 rounded animate-pulse" />
                </div>
                <div className="w-24 flex-shrink-0 ml-4 flex gap-1">
                  <div className="h-8 w-8 bg-muted/30 rounded animate-pulse" />
                  <div className="h-8 w-8 bg-muted/30 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout>
      <SettingsHeader
        title="Shared Conversations"
        description="Manage your publicly shared conversations"
      />

      <Alert>
        <AlertDescription>
          Shared conversations are automatically deleted after 90 days of
          inactivity to maintain system performance.
        </AlertDescription>
      </Alert>

      {Array.isArray(sharedConversations) &&
      sharedConversations.length === 0 ? (
        <SettingsZeroState
          icon={<ShareNetworkIcon className="h-12 w-12" />}
          title="No shared conversations"
          description="Share a conversation to make it publicly accessible via a link"
          cta={
            <Button asChild variant="outline">
              <Link to={ROUTES.HOME}>Go to conversations</Link>
            </Button>
          }
        />
      ) : (
        <div className="border rounded-lg overflow-hidden divide-y">
          {Array.isArray(sharedConversations) &&
            sharedConversations.map(renderSharedConversation)}
        </div>
      )}

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
    </SettingsPageLayout>
  );
}
