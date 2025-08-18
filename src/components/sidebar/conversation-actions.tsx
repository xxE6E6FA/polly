import {
  ArchiveIcon,
  DotsThreeVerticalIcon,
  FileCodeIcon,
  FileTextIcon,
  PencilSimpleIcon,
  PushPinIcon,
  ShareNetworkIcon,
  TrashIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { cn } from "@/lib/utils";
import { useBatchSelection } from "@/providers/batch-selection-context";
import type { Conversation } from "@/types";

type ConversationActionsProps = {
  conversation: Conversation;
  isEditing: boolean;
  isHovered: boolean;
  isMobile: boolean;
  isMobilePopoverOpen: boolean;
  isDesktopPopoverOpen: boolean;
  exportingFormat: "json" | "md" | null;
  isDeleteJobInProgress: boolean;
  isBulkMode: boolean;
  onMobilePopoverChange: (open: boolean) => void;
  onDesktopPopoverChange: (open: boolean) => void;
  onStartEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onPinToggle: () => void;
  onExport: (format: "json" | "md") => void;
  onShare: () => void;
};

export const ConversationActions = ({
  conversation,
  isEditing,
  isHovered,
  isMobile,
  isMobilePopoverOpen,
  isDesktopPopoverOpen,
  exportingFormat: _exportingFormat,
  isDeleteJobInProgress: _isDeleteJobInProgress,
  isBulkMode,
  onMobilePopoverChange,
  onDesktopPopoverChange,
  onStartEdit,
  onArchive,
  onDelete,
  onPinToggle,
  onExport: _onExport,
  onShare: _onShare,
}: ConversationActionsProps) => {
  const popoverStopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleInteractOutside = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest('[role="button"]')) {
      e.preventDefault();
    }
  };

  if (conversation.isStreaming || isEditing || isBulkMode) {
    return null;
  }

  return (
    <>
      {isMobile ? (
        <div className="flex-shrink-0">
          <Drawer
            open={isMobilePopoverOpen}
            onOpenChange={onMobilePopoverChange}
          >
            <DrawerTrigger asChild>
              <Button
                className={cn(
                  "h-8 w-8 text-foreground/70 transition-opacity hover:text-foreground",
                  isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                size="icon-sm"
                variant="ghost"
              >
                <DotsThreeVerticalIcon className="h-4 w-4" weight="bold" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Conversation actions</DrawerTitle>
              </DrawerHeader>
              <DrawerBody>
                <div className="flex flex-col">
                  <Button
                    className="h-10 justify-start gap-2 px-3 text-sm"
                    size="sm"
                    variant="ghost"
                    onClick={() => onPinToggle()}
                  >
                    <PushPinIcon
                      className="h-4 w-4"
                      weight={conversation.isPinned ? "fill" : "regular"}
                    />
                    {conversation.isPinned ? "Unpin" : "Pin"}
                  </Button>
                  <Button
                    className="h-10 justify-start gap-2 px-3 text-sm"
                    size="sm"
                    variant="ghost"
                    onClick={onStartEdit}
                  >
                    <PencilSimpleIcon className="h-4 w-4" />
                    Edit title
                  </Button>
                  <Button
                    className="h-10 justify-start gap-2 px-3 text-sm"
                    size="sm"
                    variant="ghost"
                    onClick={() => onArchive()}
                  >
                    <ArchiveIcon className="h-4 w-4" />
                    Archive
                  </Button>
                  <Button
                    className="h-10 justify-start gap-2 px-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete()}
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </DrawerBody>
            </DrawerContent>
          </Drawer>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-shrink-0 items-center gap-0.5 transition-all duration-200 ease-in-out",
            isHovered || isDesktopPopoverOpen
              ? "opacity-100 translate-x-0"
              : "opacity-0 translate-x-2 pointer-events-none"
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-7 w-7 text-foreground/70 hover:bg-accent hover:text-foreground"
                size="icon-sm"
                variant="ghost"
                onClick={onPinToggle}
              >
                <PushPinIcon
                  className="h-3.5 w-3.5"
                  weight={conversation.isPinned ? "fill" : "regular"}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{conversation.isPinned ? "Unpin" : "Pin"} conversation</p>
            </TooltipContent>
          </Tooltip>

          <Popover
            open={isDesktopPopoverOpen}
            onOpenChange={onDesktopPopoverChange}
          >
            <PopoverTrigger asChild>
              <Button
                className="h-7 w-7 text-foreground/70 transition-opacity hover:text-foreground"
                size="icon-sm"
                variant="ghost"
                onClick={popoverStopPropagation}
              >
                <DotsThreeVerticalIcon className="h-3.5 w-3.5" weight="bold" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={5}
              className="w-40 p-1"
              onClick={popoverStopPropagation}
              onInteractOutside={handleInteractOutside}
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  className="h-8 justify-start gap-2 px-2 text-xs"
                  size="sm"
                  variant="ghost"
                  onClick={() => onArchive()}
                >
                  <ArchiveIcon className="h-3.5 w-3.5" />
                  Archive
                </Button>
                <Button
                  className="h-8 justify-start gap-2 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete()}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </>
  );
};

export const ConversationContextMenu = ({
  conversation,
  exportingFormat,
  isDeleteJobInProgress,
  onPinToggle,
  onStartEdit,
  onShare,
  onExport,
  onArchive,
  onDelete,
}: {
  conversation: Conversation;
  exportingFormat: "json" | "md" | null;
  isDeleteJobInProgress: boolean;
  onPinToggle: () => void;
  onStartEdit: () => void;
  onShare: () => void;
  onExport: (format: "json" | "md") => void;
  onArchive: () => void;
  onDelete: () => void;
}) => {
  const { hasSelection, selectionCount, isSelected, selectConversation } =
    useBatchSelection();
  const { performBulkAction } = useBulkActions();
  const isCurrentSelected = isSelected(conversation._id);
  const showBatchActions = hasSelection && selectionCount > 1;

  const handleBulkAction = (actionKey: string) => {
    if (!isCurrentSelected) {
      selectConversation(conversation._id);
    }
    performBulkAction(actionKey);
  };

  return (
    <ContextMenuContent className="w-48">
      {showBatchActions ? (
        <>
          {/* Batch actions */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {selectionCount} conversations selected
          </div>
          <ContextMenuSeparator />

          <ContextMenuItem onSelect={() => handleBulkAction("export-json")}>
            <FileCodeIcon className="h-4 w-4" />
            Export selected as JSON
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={() => handleBulkAction("archive")}>
            <ArchiveIcon className="h-4 w-4" />
            Archive selected
          </ContextMenuItem>

          <ContextMenuItem
            onSelect={() => handleBulkAction("delete")}
            className="text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Delete selected
          </ContextMenuItem>
        </>
      ) : (
        <>
          {/* Single conversation actions */}
          <ContextMenuItem onSelect={onPinToggle}>
            <PushPinIcon
              className="h-4 w-4"
              weight={conversation.isPinned ? "fill" : "regular"}
            />
            {conversation.isPinned ? "Unpin" : "Pin"}
          </ContextMenuItem>

          <ContextMenuItem onSelect={onStartEdit}>
            <PencilSimpleIcon className="h-4 w-4" />
            Edit title
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={onShare}>
            <ShareNetworkIcon className="h-4 w-4" />
            Share
          </ContextMenuItem>

          <ContextMenuItem
            onSelect={() => onExport("md")}
            disabled={exportingFormat === "md" || isDeleteJobInProgress}
          >
            <FileTextIcon className="h-4 w-4" />
            {exportingFormat === "md" ? "Exporting..." : "Export as Markdown"}
          </ContextMenuItem>

          <ContextMenuItem
            onSelect={() => onExport("json")}
            disabled={exportingFormat === "json" || isDeleteJobInProgress}
          >
            <FileCodeIcon className="h-4 w-4" />
            {exportingFormat === "json" ? "Exporting..." : "Export as JSON"}
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={onArchive}>
            <ArchiveIcon className="h-4 w-4" />
            Archive
          </ContextMenuItem>

          <ContextMenuItem
            onSelect={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <TrashIcon className="h-4 w-4" />
            Delete
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
};
