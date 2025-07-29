import { api } from "@convex/_generated/api";
import {
  ArrowCounterClockwiseIcon,
  ArrowSquareOutIcon,
  CheckIcon,
  CopyIcon,
  ShareNetworkIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
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
        <DialogTrigger asChild>{children}</DialogTrigger>
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
      toast.success("Conversation shared successfully!");
    } catch (_error) {
      toast.error("Failed to share conversation");
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
      toast.success("Shared conversation updated!");
    } catch (_error) {
      toast.error("Failed to update shared conversation");
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
      toast.success("Conversation unshared");
    } catch (_error) {
      toast.error("Failed to unshare conversation");
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
    toast.success("Link copied to clipboard");
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

        <div className="space-y-6">
          {/* Cleanup policy notice */}
          <Alert>
            <AlertDescription>
              Shared conversations are automatically deleted after 90 days of
              inactivity.
            </AlertDescription>
          </Alert>

          {isShared ? (
            <div className="space-y-6">
              {/* Share URL section */}
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    readOnly
                    className="flex h-12 items-center pr-20 font-mono text-sm"
                    id="share-url"
                    value={
                      shareUrl || generateShareUrl(sharedStatus?.shareId || "")
                    }
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Button
                          disabled={isCopied}
                          size="sm"
                          variant="ghost"
                          className={cn(
                            "h-8 w-8 p-0 transition-colors",
                            isCopied && "text-[hsl(220_95%_55%)]"
                          )}
                          onClick={handleCopyUrl}
                        >
                          {isCopied ? (
                            <CheckIcon className="h-4 w-4" />
                          ) : (
                            <CopyIcon className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="px-2 py-1" side="bottom">
                        <p className="text-xs">
                          {isCopied ? "Copied!" : "Copy link"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <Button
                          className="h-8 w-8 p-0"
                          size="sm"
                          variant="ghost"
                          onClick={handleOpenInNewTab}
                        >
                          <ArrowSquareOutIcon className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="px-2 py-1" side="bottom">
                        <p className="text-xs">Open in new tab</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* New messages alert */}
              {newMessagesCount > 0 && newMessagesCount < 100 && (
                <Alert className="mb-4" variant="warning">
                  <AlertIcon variant="warning" />
                  <AlertDescription>
                    {newMessagesCount} new message
                    {newMessagesCount === 1 ? "" : "s"} since last share
                  </AlertDescription>
                </Alert>
              )}

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  className="h-10 flex-1"
                  disabled={isUpdating || !hasNewMessages}
                  variant="outline"
                  onClick={handleUpdate}
                >
                  {isUpdating ? (
                    <Spinner size="sm" className="mr-2 h-4 w-4" />
                  ) : (
                    <ArrowCounterClockwiseIcon className="mr-2 h-4 w-4" />
                  )}
                  Update share
                </Button>
                <Button
                  className="h-10 flex-1"
                  disabled={isUnsharing}
                  variant="outline"
                  onClick={handleUnshare}
                >
                  {isUnsharing ? (
                    <Spinner size="sm" className="mr-2 h-4 w-4" />
                  ) : (
                    <XIcon className="mr-2 h-4 w-4" />
                  )}
                  Stop sharing
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                className="h-11 w-full bg-gradient-to-r from-[hsl(220_95%_55%)] to-[hsl(260_85%_60%)] hover:from-[hsl(220_95%_50%)] hover:to-[hsl(260_85%_55%)]"
                disabled={isSharing}
                onClick={handleShare}
              >
                {isSharing ? (
                  <>
                    <Spinner size="sm" className="mr-2 h-4 w-4" />
                    Creating share link...
                  </>
                ) : (
                  <>
                    <ShareNetworkIcon className="mr-2 h-4 w-4" />
                    Create share link
                  </>
                )}
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
