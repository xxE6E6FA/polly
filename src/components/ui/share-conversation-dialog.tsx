import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
  ShareNetworkIcon,
  CopyIcon,
  CheckIcon,
  ArrowSquareOutIcon,
  ArrowCounterClockwiseIcon,
  XIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ConversationId } from "@/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertIcon } from "./alert";

interface ShareConversationDialogProps {
  conversationId: ConversationId;
  children: React.ReactNode;
}

export function ShareConversationDialog({
  conversationId,
  children,
}: ShareConversationDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUnsharing, setIsUnsharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  // Get current sharing status
  const sharedStatus = useQuery(api.sharedConversations.getSharedStatus, {
    conversationId,
  });

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
    } catch (error) {
      toast.error("Failed to share conversation");
      console.error("Share error:", error);
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
    } catch (error) {
      toast.error("Failed to update shared conversation");
      console.error("Update error:", error);
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
    } catch (error) {
      toast.error("Failed to unshare conversation");
      console.error("Unshare error:", error);
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

  const isShared = !!sharedStatus?.shareId;
  const hasNewMessages = sharedStatus?.hasNewMessages ?? false;
  const newMessagesCount =
    hasNewMessages &&
    sharedStatus?.currentMessageCount &&
    sharedStatus?.sharedMessageCount
      ? sharedStatus.currentMessageCount - sharedStatus.sharedMessageCount
      : 0;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isShared ? "Conversation is shared" : "Share conversation"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {isShared
              ? `This conversation is publicly accessible. Shared ${formatDistanceToNow(new Date(sharedStatus.sharedAt), { addSuffix: true })}.`
              : "Share this conversation with others. They'll see the conversation as it appears when you share or update it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {isShared ? (
            <div className="space-y-6">
              {/* Share URL section */}
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    id="share-url"
                    value={shareUrl || generateShareUrl(sharedStatus.shareId)}
                    readOnly
                    className="pr-20 font-mono text-sm h-12 flex items-center"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex">
                    <TooltipProvider>
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyUrl}
                            className={cn(
                              "h-8 w-8 p-0 transition-colors",
                              isCopied && "text-[hsl(220_95%_55%)]"
                            )}
                            disabled={isCopied}
                          >
                            {isCopied ? (
                              <CheckIcon className="h-4 w-4" />
                            ) : (
                              <CopyIcon className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="px-2 py-1">
                          <p className="text-xs">
                            {isCopied ? "Copied!" : "Copy link"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip delayDuration={200}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleOpenInNewTab}
                            className="h-8 w-8 p-0"
                          >
                            <ArrowSquareOutIcon className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="px-2 py-1">
                          <p className="text-xs">Open in new tab</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              {/* New messages alert */}
              {newMessagesCount > 0 && newMessagesCount < 100 && (
                <Alert variant="warning" className="mb-4">
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
                  onClick={handleUpdate}
                  disabled={isUpdating || !hasNewMessages}
                  variant="outline"
                  className="flex-1 h-10"
                >
                  {isUpdating ? (
                    <ArrowCounterClockwiseIcon className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowCounterClockwiseIcon className="h-4 w-4 mr-2" />
                  )}
                  Update share
                </Button>
                <Button
                  onClick={handleUnshare}
                  disabled={isUnsharing}
                  variant="outline"
                  className="flex-1 h-10"
                >
                  {isUnsharing ? (
                    <ArrowCounterClockwiseIcon className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XIcon className="h-4 w-4 mr-2" />
                  )}
                  Stop sharing
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button
                onClick={handleShare}
                disabled={isSharing}
                className="w-full h-11 bg-gradient-to-r from-[hsl(220_95%_55%)] to-[hsl(260_85%_60%)] hover:from-[hsl(220_95%_50%)] hover:to-[hsl(260_85%_55%)]"
              >
                {isSharing ? (
                  <>
                    <ArrowCounterClockwiseIcon className="h-4 w-4 mr-2 animate-spin" />
                    Creating share link...
                  </>
                ) : (
                  <>
                    <ShareNetworkIcon className="h-4 w-4 mr-2" />
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
}
