import { ContextMenu } from "@base-ui/react/context-menu";
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
import type * as React from "react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { cn } from "@/lib/utils";
import { useBatchSelection } from "@/providers/batch-selection-context";
import type { Conversation, ConversationId } from "@/types";

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

export const ConversationActions = memo(
  ({
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
              <DrawerTrigger>
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
                  <DotsThreeVerticalIcon className="size-4" weight="bold" />
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
                        className="size-4"
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
                      <PencilSimpleIcon className="size-4" />
                      Edit title
                    </Button>
                    <Button
                      className="h-10 justify-start gap-2 px-3 text-sm"
                      size="sm"
                      variant="ghost"
                      onClick={() => onArchive()}
                    >
                      <ArchiveIcon className="size-4" />
                      Archive
                    </Button>
                    <Button
                      className="h-10 justify-start gap-2 px-3 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete()}
                    >
                      <TrashIcon className="size-4" />
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
              <TooltipTrigger>
                <Button
                  className="h-7 w-7 text-foreground/70 hover:text-foreground"
                  size="icon-sm"
                  variant="ghost"
                  onClick={onPinToggle}
                >
                  <PushPinIcon
                    className="size-3.5"
                    weight={conversation.isPinned ? "fill" : "regular"}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{conversation.isPinned ? "Unpin" : "Pin"} conversation</p>
              </TooltipContent>
            </Tooltip>

            <DropdownMenu
              open={isDesktopPopoverOpen}
              onOpenChange={onDesktopPopoverChange}
            >
              <DropdownMenuTrigger className="h-7 w-7 text-foreground/70 transition-opacity hover:text-foreground rounded-md hover:bg-accent hover:text-accent-foreground inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer">
                <DotsThreeVerticalIcon className="size-3.5" weight="bold" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={5} className="w-40">
                <DropdownMenuItem
                  className="h-8 gap-2 px-2 text-xs"
                  onClick={() => onArchive()}
                >
                  <ArchiveIcon className="size-3.5" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="h-8 gap-2 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
                  onClick={() => onDelete()}
                >
                  <TrashIcon className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </>
    );
  }
);

export const ConversationContextMenu = memo(
  ({
    conversation,
    currentConversationId,
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
    currentConversationId?: ConversationId;
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
    const { performBulkAction } = useBulkActions({ currentConversationId });
    const isCurrentSelected = isSelected(conversation._id);
    const showBatchActions = hasSelection && selectionCount > 1;

    const handleBulkAction = (actionKey: string) => {
      if (!isCurrentSelected) {
        selectConversation(conversation._id);
      }
      performBulkAction(actionKey);
    };

    return (
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-context-menu">
          <ContextMenu.Popup
            className={cn(
              "min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-foreground shadow-lg",
              "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
              "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
              "transition-[opacity,transform] duration-200"
            )}
          >
            {showBatchActions ? (
              <>
                {/* Batch actions */}
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {selectionCount} conversations selected
                </div>
                <ContextMenu.Separator className="-mx-1 my-1 h-px bg-border" />

                <ContextMenu.Item
                  onClick={() => handleBulkAction("export-json")}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <FileCodeIcon className="size-4" />
                  Export selected as JSON
                </ContextMenu.Item>

                <ContextMenu.Separator className="-mx-1 my-1 h-px bg-border" />

                <ContextMenu.Item
                  onClick={() => handleBulkAction("archive")}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <ArchiveIcon className="size-4" />
                  Archive selected
                </ContextMenu.Item>

                <ContextMenu.Item
                  onClick={() => handleBulkAction("delete")}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    "text-destructive focus:text-destructive"
                  )}
                >
                  <TrashIcon className="size-4" />
                  Delete selected
                </ContextMenu.Item>
              </>
            ) : (
              <>
                {/* Single conversation actions */}
                <ContextMenu.Item
                  onClick={onPinToggle}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <PushPinIcon
                    className="size-4"
                    weight={conversation.isPinned ? "fill" : "regular"}
                  />
                  {conversation.isPinned ? "Unpin" : "Pin"}
                </ContextMenu.Item>

                <ContextMenu.Item
                  onClick={onStartEdit}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <PencilSimpleIcon className="size-4" />
                  Edit title
                </ContextMenu.Item>

                <ContextMenu.Separator className="-mx-1 my-1 h-px bg-border" />

                <ContextMenu.Item
                  onClick={onShare}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <ShareNetworkIcon className="size-4" />
                  Share
                </ContextMenu.Item>

                <ContextMenu.Item
                  onClick={() => onExport("md")}
                  disabled={exportingFormat === "md" || isDeleteJobInProgress}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <FileTextIcon className="size-4" />
                  {exportingFormat === "md"
                    ? "Exporting..."
                    : "Export as Markdown"}
                </ContextMenu.Item>

                <ContextMenu.Item
                  onClick={() => onExport("json")}
                  disabled={exportingFormat === "json" || isDeleteJobInProgress}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <FileCodeIcon className="size-4" />
                  {exportingFormat === "json"
                    ? "Exporting..."
                    : "Export as JSON"}
                </ContextMenu.Item>

                <ContextMenu.Separator className="-mx-1 my-1 h-px bg-border" />

                <ContextMenu.Item
                  onClick={onArchive}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                  )}
                >
                  <ArchiveIcon className="size-4" />
                  Archive
                </ContextMenu.Item>

                <ContextMenu.Item
                  onClick={onDelete}
                  className={cn(
                    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    "text-destructive focus:text-destructive"
                  )}
                >
                  <TrashIcon className="size-4" />
                  Delete
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    );
  }
);
