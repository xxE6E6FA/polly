import {
  ArchiveIcon,
  FileCodeIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBulkActions } from "@/hooks/use-bulk-actions";
import { useBatchSelection } from "@/providers/batch-selection-context";

export const BatchActions = () => {
  const { hasSelection, selectionCount, clearSelection } = useBatchSelection();
  const { performBulkAction, confirmationDialog } = useBulkActions();

  if (!hasSelection) {
    return null;
  }

  return (
    <>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border/60 mb-2 rounded-lg">
        <div className="flex items-center justify-between p-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {selectionCount}
            </div>
            <p className="text-xs font-medium">selected</p>
          </div>

          <TooltipProvider>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => performBulkAction("export-json")}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <FileCodeIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Export selected conversations as JSON</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => performBulkAction("archive")}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <ArchiveIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Archive selected conversations</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => performBulkAction("delete")}
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Delete selected conversations permanently</p>
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
                  <p>Clear selection</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
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
