import { useCallback, useState } from "react";

import { Link } from "react-router";

import { Spinner } from "@/components/spinner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ControlledShareConversationDialog } from "@/components/ui/share-conversation-dialog";
import { useSidebar } from "@/hooks/use-sidebar";
import { useConversationActions } from "@/hooks/use-conversation-actions";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type Conversation, type ConversationId } from "@/types";

import { EditableConversationTitle } from "./editable-conversation-title";
import {
  ConversationActions,
  ConversationContextMenu,
} from "./conversation-actions";

type ConversationItemProps = {
  conversation: Conversation;
  currentConversationId?: ConversationId;
};

export const ConversationItem = ({
  conversation,
  currentConversationId,
}: ConversationItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobilePopoverOpen, setIsMobilePopoverOpen] = useState(false);
  const [isDesktopPopoverOpen, setIsDesktopPopoverOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const { isMobile, setSidebarVisible } = useSidebar();

  const isCurrentConversation = currentConversationId === conversation._id;

  const actions = useConversationActions(conversation, isCurrentConversation);

  const handleStartEdit = useCallback(() => {
    setIsEditing(true);
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
  }, []);

  const handleSaveEdit = useCallback(
    async (newTitle: string) => {
      await actions.handleTitleUpdate(newTitle);
      setIsEditing(false);
    },
    [actions]
  );

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleArchiveClick = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
    actions.handleArchive();
  }, [actions]);

  const handleDeleteClick = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
    actions.handleDelete();
  }, [actions]);

  const handlePinToggle = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
    actions.handlePinToggle();
  }, [actions]);

  const handleShareClick = useCallback(() => {
    setIsMobilePopoverOpen(false);
    setIsDesktopPopoverOpen(false);
    setIsShareDialogOpen(true);
  }, []);

  const handleConversationClick = useCallback(() => {
    if (isMobile) {
      setSidebarVisible(false);
    }
  }, [isMobile, setSidebarVisible]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "group relative flex items-center rounded-lg transition-all duration-200",
              isCurrentConversation || isEditing
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
              onClick={
                isEditing ? e => e.preventDefault() : handleConversationClick
              }
            >
              <div className={cn("flex-1 min-w-0", isMobile ? "pr-3" : "pr-2")}>
                <EditableConversationTitle
                  title={conversation.title}
                  isEditing={isEditing}
                  isCurrentConversation={isCurrentConversation}
                  isMobile={isMobile}
                  onStartEdit={handleStartEdit}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                />
              </div>

              {conversation.isStreaming && (!isHovered || isMobile) && (
                <div className="mr-1 flex items-center">
                  <Spinner className="text-foreground/60" size="sm" />
                </div>
              )}
            </Link>

            <ConversationActions
              conversation={conversation}
              isEditing={isEditing}
              isHovered={isHovered}
              isMobile={isMobile}
              isMobilePopoverOpen={isMobilePopoverOpen}
              isDesktopPopoverOpen={isDesktopPopoverOpen}
              exportingFormat={actions.exportingFormat}
              isDeleteJobInProgress={actions.isDeleteJobInProgress}
              onMobilePopoverChange={setIsMobilePopoverOpen}
              onDesktopPopoverChange={setIsDesktopPopoverOpen}
              onStartEdit={handleStartEdit}
              onArchive={handleArchiveClick}
              onDelete={handleDeleteClick}
              onPinToggle={handlePinToggle}
              onExport={actions.handleExport}
              onShare={handleShareClick}
            />
          </div>
        </ContextMenuTrigger>

        <ConversationContextMenu
          conversation={conversation}
          exportingFormat={actions.exportingFormat}
          isDeleteJobInProgress={actions.isDeleteJobInProgress}
          onPinToggle={handlePinToggle}
          onStartEdit={handleStartEdit}
          onShare={handleShareClick}
          onExport={actions.handleExport}
          onArchive={handleArchiveClick}
          onDelete={handleDeleteClick}
        />
      </ContextMenu>

      <ConfirmationDialog
        cancelText={actions.confirmationDialog.options.cancelText}
        confirmText={actions.confirmationDialog.options.confirmText}
        description={actions.confirmationDialog.options.description}
        open={actions.confirmationDialog.isOpen}
        title={actions.confirmationDialog.options.title}
        variant={actions.confirmationDialog.options.variant}
        onCancel={actions.confirmationDialog.handleCancel}
        onConfirm={actions.confirmationDialog.handleConfirm}
        onOpenChange={actions.confirmationDialog.handleOpenChange}
      />

      <ControlledShareConversationDialog
        conversationId={conversation._id}
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
      />
    </>
  );
};
