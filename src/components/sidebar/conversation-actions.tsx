import {
  ArchiveIcon,
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  PushPinIcon,
  TrashIcon,
  ShareNetworkIcon,
  FileTextIcon,
  FileCodeIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
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
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { type Conversation } from "@/types";

type ConversationActionsProps = {
  conversation: Conversation;
  isEditing: boolean;
  isHovered: boolean;
  isMobile: boolean;
  isMobilePopoverOpen: boolean;
  isDesktopPopoverOpen: boolean;
  exportingFormat: "json" | "md" | null;
  isDeleteJobInProgress: boolean;
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

  if (conversation.isStreaming || isEditing) {
    return null;
  }

  return (
    <>
      {isMobile ? (
        <div className="flex-shrink-0 pr-2">
          <Popover
            open={isMobilePopoverOpen}
            onOpenChange={onMobilePopoverChange}
          >
            <PopoverTrigger asChild>
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
                  onClick={() => onPinToggle()}
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
                  onClick={onStartEdit}
                >
                  <PencilSimpleIcon className="h-3.5 w-3.5" />
                  Edit title
                </Button>
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
      ) : (
        (isHovered || isDesktopPopoverOpen) && (
          <div className="flex flex-shrink-0 items-center gap-0.5 pr-2">
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
                  <DotsThreeVerticalIcon
                    className="h-3.5 w-3.5"
                    weight="bold"
                  />
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
        )
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
  return (
    <ContextMenuContent className="w-48">
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
    </ContextMenuContent>
  );
};
