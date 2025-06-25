import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Spinner } from "@/components/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  TrashIcon,
  PencilSimpleIcon,
  DotsThreeVerticalIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";
import { ConversationId, Conversation } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { conversationErrorHandlers } from "@/hooks/use-conversations";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  updateCachedConversation,
  removeCachedConversation,
} from "@/lib/conversation-cache";

import { Link } from "react-router";
import { api } from "../../../convex/_generated/api";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router";

interface ConversationItemProps {
  conversation: Conversation;
  currentConversationId?: ConversationId;
}

export function ConversationItem({
  conversation,
  currentConversationId,
}: ConversationItemProps) {
  const [editingId, setEditingId] = useState<ConversationId | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [originalTitle, setOriginalTitle] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const confirmationDialog = useConfirmationDialog();
  const deleteConversation = useMutation(api.conversations.remove);
  const updateConversationTitle = useMutation(api.conversations.update);
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
      if (e) e.stopPropagation();
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

          await conversationErrorHandlers.handleDelete(async () => {
            await deleteConversation({ id: conversation._id });
            removeCachedConversation(conversation._id);
          });

          if (isCurrentConversation) {
            navigate(ROUTES.HOME);
          }
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
                onChange={e => setEditingTitle(e.target.value)}
                onKeyDown={e => handleKeyDown(e, conversation._id)}
                onBlur={handleBlur}
                onMouseDown={e => {
                  e.stopPropagation();
                }}
                className={cn(
                  "h-auto border-0 bg-transparent p-0 font-medium shadow-none outline-none ring-0 focus-visible:ring-0",
                  isMobile ? "text-xs" : "text-xs"
                )}
                onClick={e => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
              />
            ) : (
              <div
                className={cn(
                  "truncate font-medium",
                  isMobile ? "text-xs" : "text-xs"
                )}
              >
                {conversation.title}
              </div>
            )}
          </div>

          {conversation.isStreaming && (!isHovered || isMobile) && (
            <div className="flex items-center mr-1">
              <Spinner size="sm" className="text-foreground/60" />
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
                      variant="ghost"
                      size="icon-sm"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-foreground/70 hover:text-foreground"
                    >
                      <DotsThreeVerticalIcon
                        weight="bold"
                        className="h-4 w-4"
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-40 p-1"
                    align="end"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex flex-col gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start h-8 px-2 gap-2 text-xs"
                        onClick={() =>
                          handleEditStart(conversation._id, conversation.title)
                        }
                      >
                        <PencilSimpleIcon className="h-3.5 w-3.5" />
                        Edit title
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start h-8 px-2 gap-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20"
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
                <div className="flex items-center gap-0.5 flex-shrink-0 pr-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 hover:bg-accent text-foreground/70 hover:text-foreground"
                        onClick={e => {
                          e.preventDefault();
                          handleEditStart(
                            conversation._id,
                            conversation.title,
                            e
                          );
                        }}
                      >
                        <PencilSimpleIcon className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit title</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 transition-colors"
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
    </>
  );
}
