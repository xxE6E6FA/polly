import { api } from "@convex/_generated/api";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CheckIcon,
  CopyIcon,
  ShareNetworkIcon,
  XIcon,
} from "@phosphor-icons/react";
import { SHARED_CONVERSATION_EXPIRY_DAYS } from "@shared/constants";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";
import type { ConversationId } from "@/types";
import { Alert, AlertDescription, AlertIcon } from "./alert";

type ShareConversationDialogProps = {
  conversationId: ConversationId;
  children: React.ReactNode;
};

type ControlledShareConversationDialogProps = {
  conversationId: ConversationId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export const ShareConversationDialog = ({
  conversationId,
  children,
}: ShareConversationDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger>{children}</DialogTrigger>
      </Dialog>
      <ControlledShareConversationDialog
        conversationId={conversationId}
        open={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
};

export const ControlledShareConversationDialog = ({
  conversationId,
  open,
  onOpenChange,
}: ControlledShareConversationDialogProps) => {
  const [isSharing, setIsSharing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const managedToast = useToast();

  // Get current sharing status (only when dialog is open)
  const sharedStatus = useQuery(
    api.sharedConversations.getSharedStatus,
    open ? { conversationId } : "skip"
  );

  // Mutations
  const shareConversation = useMutation(
    api.sharedConversations.shareConversation
  );
  const updateSharedConversation = useMutation(
    api.sharedConversations.updateSharedConversation
  );
  const unshareConversation = useMutation(
    api.sharedConversations.unshareConversation
  );

  // Generate share URL
  const generateShareUrl = (shareId: string) => {
    return `${window.location.origin}/share/${shareId}`;
  };

  // Handle share conversation
  const handleShare = async () => {
    setIsSharing(true);
    try {
      const shareId = await shareConversation({ conversationId });
      const url = generateShareUrl(shareId);
      setShareUrl(url);
      managedToast.success("Conversation shared successfully!");
    } catch (_error) {
      managedToast.error("Failed to share conversation");
    } finally {
      setIsSharing(false);
    }
  };

  // Handle update shared conversation
  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      const shareId = await updateSharedConversation({ conversationId });
      const url = generateShareUrl(shareId);
      setShareUrl(url);
      managedToast.success("Shared conversation updated!");
    } catch (_error) {
      managedToast.error("Failed to update shared conversation");
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle unshare conversation
  const handleUnshare = async () => {
    setIsUnsharing(true);
    try {
      await unshareConversation({ conversationId });
      setShareUrl("");
      managedToast.success("Conversation unshared");
    } catch (_error) {
      managedToast.error("Failed to unshare conversation");
    } finally {
      setIsUnsharing(false);
    }
  };

  // Handle copy URL
  const handleCopyUrl = async () => {
    if (!shareUrl && sharedStatus?.shareId) {
      const url = generateShareUrl(sharedStatus.shareId);
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
    } else {
      await navigator.clipboard.writeText(shareUrl);
    }

    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    managedToast.success("Link copied to clipboard");
  };

  // Handle open in new tab
  const handleOpenInNewTab = () => {
    const url =
      shareUrl ||
      (sharedStatus?.shareId ? generateShareUrl(sharedStatus.shareId) : "");
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const isShared = Boolean(sharedStatus?.shareId);
  const hasNewMessages = sharedStatus?.hasNewMessages ?? false;
  const newMessagesCount =
    hasNewMessages &&
    sharedStatus?.currentMessageCount &&
    sharedStatus?.sharedMessageCount
      ? sharedStatus.currentMessageCount - sharedStatus.sharedMessageCount
      : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isShared ? "Conversation is shared" : "Share conversation"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {isShared
              ? `This conversation is publicly accessible. Shared ${formatDistanceToNow(
                  new Date(sharedStatus?.sharedAt || Date.now()),
                  { addSuffix: true }
                )}.`
              : "Share this conversation with others. They'll see the conversation as it appears when you share or update it."}
          </DialogDescription>
        </DialogHeader>

        <div className="stack-xl">
          <Alert variant="warning">
            <AlertDescription>
              Shared conversations are automatically deleted after{" "}
              {SHARED_CONVERSATION_EXPIRY_DAYS} days of inactivity.
            </AlertDescription>
          </Alert>

          {isShared ? (
            <div className="stack-xl">
              {/* Share URL section */}
              <div className="stack-md">
                <div className="relative">
                  <Input
                    readOnly
                    className="h-12 pr-20 font-mono text-sm"
                    id="share-url"
                    value={
                      shareUrl || generateShareUrl(sharedStatus?.shareId || "")
                    }
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2">
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          disabled={isCopied}
                          size="icon-sm"
                          variant="ghost"
                          className={cn(isCopied && "text-info")}
                          onClick={handleCopyUrl}
                        >
                          {isCopied ? (
                            <CheckIcon className="size-4" />
                          ) : (
                            <CopyIcon className="size-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {isCopied ? "Copied!" : "Copy link"}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={handleOpenInNewTab}
                        >
                          <ArrowSquareOutIcon className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        Open in new tab
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* New messages alert */}
              {newMessagesCount > 0 && newMessagesCount < 100 && (
                <Alert variant="warning">
                  <AlertIcon variant="warning" />
                  <AlertDescription>
                    {newMessagesCount} new message
                    {newMessagesCount === 1 ? "" : "s"} since last share
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  size="lg"
                  disabled={!hasNewMessages}
                  loading={isUpdating}
                  variant="secondary"
                  onClick={handleUpdate}
                >
                  <ArrowCounterClockwiseIcon className="mr-2 size-4" />
                  Update share
                </Button>
                <Button
                  className="flex-1"
                  size="lg"
                  loading={isUnsharing}
                  variant="secondary"
                  onClick={handleUnshare}
                >
                  <XIcon className="mr-2 size-4" />
                  Stop sharing
                </Button>
              </div>
            </div>
          ) : (
            <div className="stack-lg">
              <Button size="full-lg" loading={isSharing} onClick={handleShare}>
                <ShareNetworkIcon className="mr-2 size-4" />
                Create share link
              </Button>

              <div className="text-center">
                <p className="text-xs text-muted-foreground">
                  Anyone with the link will be able to view this conversation
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
