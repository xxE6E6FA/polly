import { useCallback, useEffect, useRef, useState } from "react";

import { Link, useNavigate } from "react-router";

import {
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  PushPinIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation } from "convex/react";

import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { conversationErrorHandlers } from "@/hooks/use-conversations";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  removeCachedConversation,
  updateCachedConversation,
} from "@/lib/conversation-cache";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type Conversation, type ConversationId } from "@/types";

import { api } from "../../../convex/_generated/api";

type ConversationItemProps = {
  conversation: Conversation;
  currentConversationId?: ConversationId;
};

export const ConversationItem = ({
  conversation,
  currentConversationId,
}: ConversationItemProps) => {
  const [editingId, setEditingId] = useState<ConversationId | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const confirmationDialog = useConfirmationDialog();
  const deleteConversation = useMutation(api.conversations.remove);
  const updateConversationTitle = useMutation(api.conversations.update);
  const setPinned = useMutation(api.conversations.setPinned);
  const { isMobile, setSidebarVisible } = useSidebar();
  const navigate = useNavigate();

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleEditStart = useCallback(
    (id: ConversationId, currentTitle: string, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
      }
      setEditingId(id);
      setEditingTitle(currentTitle);
      setOriginalTitle(currentTitle);
      setIsPopoverOpen(false);
    },
    []
  );

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditingTitle("");
    setOriginalTitle("");
  }, []);

  const handleEditConfirm = useCallback(
    async (id: ConversationId) => {
      if (editingTitle.trim() && editingTitle !== originalTitle) {
        await updateConversationTitle({
          id,
          title: editingTitle.trim(),
        });
        updateCachedConversation({
          ...conversation,
          title: editingTitle.trim(),
          updatedAt: Date.now(),
        });
      }
      handleEditCancel();
    },
    [
      editingTitle,
      originalTitle,
      updateConversationTitle,
      handleEditCancel,
      conversation,
    ]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: ConversationId) => {
      if (e.key === "Enter") {
        handleEditConfirm(id);
      } else if (e.key === "Escape") {
        handleEditCancel();
      }
    },
    [handleEditConfirm, handleEditCancel]
  );

  const handleBlur = useCallback(() => {
    if (editingId && editingTitle !== originalTitle) {
      handleEditConfirm(editingId);
    } else {
      handleEditCancel();
    }
  }, [
    editingId,
    editingTitle,
    originalTitle,
    handleEditConfirm,
    handleEditCancel,
  ]);

  const handleDeleteClick = useCallback(
    (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      setIsPopoverOpen(false);
      confirmationDialog.confirm(
        {
          title: "Delete Conversation",
          description: `Are you sure you want to delete "${conversation.title}"? This action cannot be undone.`,
          confirmText: "Delete",
          cancelText: "Cancel",
          variant: "destructive",
        },
        async () => {
          const isCurrentConversation =
            currentConversationId === conversation._id;

          if (isCurrentConversation) {
            navigate(ROUTES.HOME);
          }

          if (isCurrentConversation) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          await conversationErrorHandlers.handleDelete(async () => {
            await deleteConversation({ id: conversation._id });
            removeCachedConversation(conversation._id);
          });
        }
      );
    },
    [
      confirmationDialog,
      conversation.title,
      conversation._id,
      deleteConversation,
      currentConversationId,
      navigate,
    ]
  );

  const handlePinToggle = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      setIsPopoverOpen(false);
      await setPinned({
        id: conversation._id,
        isPinned: !conversation.isPinned,
      });
      updateCachedConversation({
        ...conversation,
        isPinned: !conversation.isPinned,
        updatedAt: Date.now(),
      });
    },
    [conversation, setPinned]
  );

  const handleConversationClick = useCallback(() => {
    if (isMobile) {
      setSidebarVisible(false);
    }
  }, [isMobile, setSidebarVisible]);

  return (
    <>
      <div
        className={cn(
          "group relative flex items-center rounded-lg transition-all duration-200",
          currentConversationId === conversation._id
            ? "bg-accent text-foreground shadow-sm"
            : "text-foreground/80 hover:text-foreground hover:bg-accent/50",
          isMobile ? "mx-1 my-0.5" : "mx-1 my-0.5"
        )}
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
      >
        <Link
          to={ROUTES.CHAT_CONVERSATION(conversation._id)}
          className={cn(
            "flex-1 flex items-center min-w-0 no-underline text-inherit rounded-lg",
            isMobile ? "px-3 py-2.5" : "px-3 py-2"
          )}
          onClick={handleConversationClick}
        >
          <div className={cn("flex-1 min-w-0", isMobile ? "pr-3" : "pr-2")}>
            {editingId === conversation._id ? (
              <Input
                ref={editInputRef}
                value={editingTitle}
                className={cn(
                  "h-auto border-0 bg-transparent p-0 font-medium shadow-none outline-none ring-0 focus-visible:ring-0",
                  isMobile ? "text-xs" : "text-xs"
                )}
                onBlur={handleBlur}
                onChange={e => setEditingTitle(e.target.value)}
                onKeyDown={e => handleKeyDown(e, conversation._id)}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onMouseDown={e => {
                  e.stopPropagation();
                }}
              />
            ) : (
              <div
                className={cn(
                  "truncate font-medium",
                  isMobile ? "text-xs" : "text-xs",
                  !isMobile &&
                    currentConversationId === conversation._id &&
                    "cursor-text hover:opacity-80"
                )}
                onClick={e => {
                  if (!isMobile && currentConversationId === conversation._id) {
                    e.stopPropagation();
                    e.preventDefault();
                    handleEditStart(conversation._id, conversation.title);
                  }
                }}
              >
                {conversation.title}
              </div>
            )}
          </div>

          {conversation.isStreaming && (!isHovered || isMobile) && (
            <div className="mr-1 flex items-center">
              <Spinner className="text-foreground/60" size="sm" />
            </div>
          )}
        </Link>

        {!conversation.isStreaming && editingId !== conversation._id && (
          <>
            {isMobile ? (
              <div className="flex-shrink-0 pr-2">
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      className={cn(
                        "h-8 w-8 text-foreground/70 transition-opacity hover:text-foreground",
                        isMobile
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      )}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <DotsThreeVerticalIcon
                        className="h-4 w-4"
                        weight="bold"
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-40 p-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex flex-col gap-0.5">
                      <Button
                        className="h-8 justify-start gap-2 px-2 text-xs"
                        size="sm"
                        variant="ghost"
                        onClick={() => handlePinToggle()}
                      >
                        <PushPinIcon
                          className="h-3.5 w-3.5"
                          weight={conversation.isPinned ? "fill" : "regular"}
                        />
                        {conversation.isPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        className="h-8 justify-start gap-2 px-2 text-xs"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleEditStart(conversation._id, conversation.title)
                        }
                      >
                        <PencilSimpleIcon className="h-3.5 w-3.5" />
                        Edit title
                      </Button>
                      <Button
                        className="h-8 justify-start gap-2 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteClick()}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              isHovered && (
                <div className="flex flex-shrink-0 items-center gap-0.5 pr-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-7 w-7 text-foreground/70 hover:bg-accent hover:text-foreground"
                        size="icon-sm"
                        variant="ghost"
                        onClick={handlePinToggle}
                      >
                        <PushPinIcon
                          className="h-3.5 w-3.5"
                          weight={conversation.isPinned ? "fill" : "regular"}
                        />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {conversation.isPinned ? "Unpin" : "Pin"} conversation
                      </p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-7 w-7 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                        size="icon-sm"
                        variant="ghost"
                        onClick={handleDeleteClick}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete conversation</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              )
            )}
          </>
        )}
      </div>
      <ConfirmationDialog
        cancelText={confirmationDialog.options.cancelText}
        confirmText={confirmationDialog.options.confirmText}
        description={confirmationDialog.options.description}
        open={confirmationDialog.isOpen}
        title={confirmationDialog.options.title}
        variant={confirmationDialog.options.variant}
        onCancel={confirmationDialog.handleCancel}
        onConfirm={confirmationDialog.handleConfirm}
        onOpenChange={confirmationDialog.handleOpenChange}
      />
    </>
  );
};
