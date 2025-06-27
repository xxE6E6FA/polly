import { useState } from "react";
import { Link } from "react-router";

import {
  ArrowSquareOutIcon,
  CopyIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { SettingsHeader } from "@/components/settings/settings-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";
import { type Id } from "../../../convex/_generated/dataModel";

export default function SharedConversationsPage() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const confirmDialog = useConfirmationDialog();

  // Fetch shared conversations with current message counts
  const sharedConversations = useQuery(
    api.sharedConversations.listUserSharedConversations
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
    toast.success("Link copied to clipboard");
  };

  const handleUnshare = (
    conversationId: Id<"conversations">,
    title?: string
  ) => {
    confirmDialog.confirm(
      {
        title: "Stop sharing conversation?",
        description: `Are you sure you want to stop sharing "${title || "this conversation"}"? The share link will no longer work.`,
        confirmText: "Stop sharing",
        variant: "destructive",
      },
      async () => {
        try {
          await unshareConversation({ conversationId });
          toast.success("Conversation unshared");
        } catch (error) {
          toast.error("Failed to unshare conversation");
          console.error("Unshare error:", error);
        }
      }
    );
  };

  const sharedCount = sharedConversations?.length || 0;

  return (
    <div className="space-y-6">
      <SettingsHeader
        title="Shared Conversations"
        description="Manage your publicly shared conversations"
      />

      {sharedConversations === undefined ? (
        // Loading state
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-6">
              <div className="space-y-3">
                <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            </Card>
          ))}
        </div>
      ) : sharedCount === 0 ? (
        // Empty state
        <Card className="p-12">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 rounded-full bg-muted p-3">
              <ShareNetworkIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium">
              No shared conversations
            </h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Share a conversation to make it publicly accessible via a link
            </p>
            <Button asChild variant="outline">
              <Link to={ROUTES.HOME}>Go to conversations</Link>
            </Button>
          </div>
        </Card>
      ) : (
        // Shared conversations list
        <div className="space-y-3">
          {sharedConversations.map(shared => {
            const shareUrl = generateShareUrl(shared.shareId);
            const isCopied = copiedId === shared.shareId;

            return (
              <Card key={shared._id} className="overflow-hidden">
                <CardContent className="p-4 sm:p-6">
                  <div className="space-y-4">
                    {/* Title and metadata */}
                    <div>
                      <h3 className="font-medium text-foreground">
                        {shared.title || "Untitled Conversation"}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span>
                          Shared{" "}
                          {formatDistanceToNow(new Date(shared.sharedAt), {
                            addSuffix: true,
                          })}
                        </span>
                        {shared.lastUpdated > shared.sharedAt && (
                          <span>
                            • Updated{" "}
                            {formatDistanceToNow(new Date(shared.lastUpdated), {
                              addSuffix: true,
                            })}
                          </span>
                        )}
                        <span>• {shared.messageCount} messages</span>
                      </div>
                    </div>

                    {/* URL field with copy and view buttons */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="relative flex-1 sm:flex-initial sm:w-96">
                        <input
                          readOnly
                          className="w-full rounded-lg border bg-muted/30 px-3 py-2 pr-20 font-mono text-xs sm:text-sm"
                          value={shareUrl}
                        />
                        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  className={cn(
                                    "h-7 w-7 p-0",
                                    isCopied && "text-primary"
                                  )}
                                  variant="ghost"
                                  onClick={() => handleCopyUrl(shared.shareId)}
                                >
                                  <CopyIcon className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{isCopied ? "Copied!" : "Copy link"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  asChild
                                  className="h-7 w-7 p-0"
                                  variant="ghost"
                                >
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
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 sm:ml-4">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to={ROUTES.CHAT_CONVERSATION(
                              shared.originalConversationId
                            )}
                          >
                            Go to conversation
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleUnshare(
                              shared.originalConversationId,
                              shared.title
                            )
                          }
                        >
                          Unshare
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmationDialog
        open={confirmDialog.isOpen}
        onOpenChange={confirmDialog.handleOpenChange}
        title={confirmDialog.options.title}
        description={confirmDialog.options.description}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        onConfirm={confirmDialog.handleConfirm}
        onCancel={confirmDialog.handleCancel}
        variant={confirmDialog.options.variant}
      />
    </div>
  );
}
