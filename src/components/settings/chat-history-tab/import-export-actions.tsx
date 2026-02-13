import { UploadIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Spinner } from "@/components/ui/spinner";
import { useConversationImport } from "@/hooks/use-conversation-import";

export function ImportExportActions() {
  const {
    fileInputRef,
    confirmDialog,
    isValidating,
    triggerFileInput,
    handleFileChange,
  } = useConversationImport();

  return (
    <div className="stack-lg">
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Import Conversations</h3>
        <p className="text-sm text-muted-foreground">
          Import conversations from a JSON or Markdown file. Supported formats
          include exports from Polly.
        </p>

        <Button
          onClick={triggerFileInput}
          disabled={isValidating}
          variant="outline"
          className="w-fit"
        >
          {isValidating ? (
            <>
              <Spinner className="mr-2 size-4" />
              Validating...
            </>
          ) : (
            <>
              <UploadIcon className="mr-2 size-4" />
              Import
            </>
          )}
        </Button>

        {isValidating && (
          <p className="text-xs text-muted-foreground">
            Validating file contents...
          </p>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.md,.markdown"
        onChange={handleFileChange}
        className="hidden"
      />

      <ConfirmationDialog
        open={confirmDialog.state.isOpen}
        onOpenChange={confirmDialog.handleOpenChange}
        title={confirmDialog.state.title}
        description={confirmDialog.state.description}
        confirmText={confirmDialog.state.confirmText}
        cancelText={confirmDialog.state.cancelText}
        variant={confirmDialog.state.variant}
        onConfirm={confirmDialog.handleConfirm}
        onCancel={confirmDialog.handleCancel}
      />
    </div>
  );
}
