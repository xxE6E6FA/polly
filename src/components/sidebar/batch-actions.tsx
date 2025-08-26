import {
  ArchiveIcon,
  CheckIcon,
  FileCodeIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { useBatchSelection } from "@/providers/batch-selection-context";

export const BatchActions = () => {
  const { isSelectionMode, hasSelection, selectionCount, clearSelection } =
    useBatchSelection();
  const { performBulkAction, confirmationDialog } = useBulkActions();

  const shouldShow = isSelectionMode || hasSelection;
  if (!shouldShow) {
    return null;
  }

  return (
    <>
      <div className="h-9 w-full rounded-md border-0 bg-muted/50 dark:bg-background/80 flex items-center justify-between px-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-6 items-center gap-1 rounded-full bg-primary/10 px-2">
            <CheckIcon className="h-3.5 w-3.5 text-primary" weight="bold" />
            <span className="text-xs font-semibold text-primary">
              {selectionCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => performBulkAction("export-json")}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                disabled={selectionCount === 0}
              >
                <FileCodeIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Export JSON</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => performBulkAction("archive")}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                disabled={selectionCount === 0}
              >
                <ArchiveIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Archive</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => performBulkAction("delete")}
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={selectionCount === 0}
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete</p>
            </TooltipContent>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-border/60" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={clearSelection}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ConfirmationDialog
        cancelText={confirmationDialog.state.cancelText}
        confirmText={confirmationDialog.state.confirmText}
        description={confirmationDialog.state.description}
        open={confirmationDialog.state.isOpen}
        title={confirmationDialog.state.title}
        variant={confirmationDialog.state.variant}
        onCancel={confirmationDialog.handleCancel}
        onConfirm={confirmationDialog.handleConfirm}
        onOpenChange={confirmationDialog.handleOpenChange}
      />
    </>
  );
};
