import { UploadIcon } from "@phosphor-icons/react";
import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { detectAndParseImportData } from "@/lib/import-parsers";
import { useToast } from "@/providers/toast-context";

export function ImportExportActions() {
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmDialog = useConfirmationDialog();
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();

  const validateImportData = useMutation(
    api.conversationImport.validateImportData
  );

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      // Check file size (warn if > 10MB)
      if (file.size > 10 * 1024 * 1024) {
        managedToast.error(
          "Large file detected. Import may take longer than usual."
        );
      }

      if (!file.name.endsWith(".json")) {
        managedToast.error("Please select a JSON file");
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => {
        managedToast.error("Failed to read the file");
        setIsValidating(false);
      };

      reader.onload = async e => {
        try {
          setIsValidating(true);
          const content = e.target?.result as string;

          if (!content || content.trim() === "") {
            managedToast.error("The selected file is empty");
            setIsValidating(false);
            return;
          }

          const importResult = detectAndParseImportData(content);

          if (importResult.errors.length > 0) {
            managedToast.error(`Import failed: ${importResult.errors[0]}`);
            setIsValidating(false);
            return;
          }

          if (importResult.conversations.length === 0) {
            console.warn("No conversations found in import result");
            managedToast.error("No valid conversations found in the file");
            setIsValidating(false);
            return;
          }

          // Validate a sample of conversations for better error reporting
          try {
            const validationResult = await validateImportData({
              sampleConversations: importResult.conversations,
              maxSampleSize: 20,
            });

            if (!validationResult.isValid) {
              managedToast.error(
                `Validation failed: ${validationResult.errors[0]}`
              );
              setIsValidating(false);
              return;
            }

            if (validationResult.warnings.length > 0) {
              console.warn("Validation warnings:", validationResult.warnings);
              managedToast.error(
                `${validationResult.warnings.length} warnings found in data`
              );
            }
          } catch (validationError) {
            console.warn(
              "Validation failed, proceeding anyway:",
              validationError
            );
          }

          setIsValidating(false);

          const sourceInfo =
            importResult.source !== "Unknown"
              ? ` from ${importResult.source}`
              : "";

          const conversationCount = importResult.conversations.length;

          // Always use background jobs for consistency and proper tracking
          confirmDialog.confirm(
            {
              title: "Import Conversations",
              description: `This will import ${conversationCount} conversation(s)${sourceInfo} in the background. You'll be notified when it's complete. Continue?`,
              confirmText: "Import",
              cancelText: "Cancel",
              variant: "default",
            },
            async () => {
              try {
                await backgroundJobs.startImport(importResult.conversations);
                managedToast.success(
                  `Started importing ${conversationCount} conversations${sourceInfo}`
                );
              } catch (_error) {
                managedToast.error("Failed to start import");
              }
            }
          );
        } catch (error) {
          managedToast.error("Failed to read or parse the file", {
            description:
              error instanceof Error ? error.message : "Unknown parsing error",
          });
          setIsValidating(false);
        }
      };

      reader.readAsText(file);

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [
      confirmDialog,
      backgroundJobs,
      validateImportData,
      managedToast.success,
      managedToast.error,
    ]
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold">Import Conversations</h3>
        <p className="text-sm text-muted-foreground">
          Import conversations from a JSON file. Supported formats include
          exports from Polly and other AI chat applications.
        </p>

        <Button
          onClick={triggerFileInput}
          disabled={isValidating}
          variant="outline"
          className="w-fit"
        >
          {isValidating ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Validating...
            </>
          ) : (
            <>
              <UploadIcon className="mr-2 h-4 w-4" />
              Import JSON
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
        accept=".json"
        onChange={handleImport}
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
