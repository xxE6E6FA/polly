import { DownloadIcon, UploadIcon } from "@phosphor-icons/react";
import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { detectAndParseImportData } from "@/lib/import-parsers";

interface ImportExportActionsProps {
  selectedConversations: Set<Id<"conversations">>;
  includeAttachments: boolean;
  onIncludeAttachmentsChange: (value: boolean) => void;
}

export function ImportExportActions({
  selectedConversations,
  includeAttachments,
  onIncludeAttachmentsChange,
}: ImportExportActionsProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const confirmDialog = useConfirmationDialog();
  const backgroundJobs = useBackgroundJobs();
  const importTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const validateImportData = useMutation(
    api.conversationImport.validateImportData
  );

  // Safety timeout management
  const clearImportTimeout = useCallback(() => {
    if (importTimeoutRef.current) {
      clearTimeout(importTimeoutRef.current);
      importTimeoutRef.current = null;
    }
  }, []);

  const setImportTimeout = useCallback(() => {
    clearImportTimeout();
    importTimeoutRef.current = setTimeout(() => {
      console.error("Import timeout reached - forcing reset");
      setIsImporting(false);
      toast.error("Import timed out. Please try again.");
    }, 30000); // 30 second timeout
  }, [clearImportTimeout]);

  // Safety timeout to prevent infinite loading
  useEffect(() => {
    if (isImporting) {
      setImportTimeout();
    } else {
      clearImportTimeout();
    }

    return clearImportTimeout;
  }, [isImporting, setImportTimeout, clearImportTimeout]);

  const handleExport = useCallback(async () => {
    if (selectedConversations.size === 0) {
      toast.error("Please select conversations to export");
      return;
    }

    try {
      const conversationIds = Array.from(
        selectedConversations
      ) as Id<"conversations">[];
      await backgroundJobs.startExport(conversationIds, {
        includeAttachmentContent: includeAttachments,
      });
      toast.success(
        `Started exporting ${conversationIds.length} conversation${conversationIds.length === 1 ? "" : "s"}`
      );
    } catch (error) {
      console.error("Export failed:", error);
      toast.error("Failed to start export", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  }, [selectedConversations, includeAttachments, backgroundJobs]);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      // Check file size (warn if > 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.warning(
          "Large file detected. Import may take longer than usual."
        );
      }

      if (!file.name.endsWith(".json")) {
        console.error("File is not JSON:", file.name);
        toast.error("Please select a JSON file");
        return;
      }

      const reader = new FileReader();

      reader.onerror = () => {
        console.error("FileReader error");
        toast.error("Failed to read the file");
        setIsValidating(false);
      };

      reader.onload = async e => {
        try {
          setIsValidating(true);
          const content = e.target?.result as string;

          if (!content || content.trim() === "") {
            console.error("File content is empty");
            toast.error("The selected file is empty");
            setIsValidating(false);
            return;
          }

          const importResult = detectAndParseImportData(content);

          if (importResult.errors.length > 0) {
            console.error("Import parsing errors:", importResult.errors);
            toast.error(`Import failed: ${importResult.errors[0]}`);
            setIsValidating(false);
            return;
          }

          if (importResult.conversations.length === 0) {
            console.warn("No conversations found in import result");
            toast.error("No valid conversations found in the file");
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
              console.error("Validation failed:", validationResult.errors);
              toast.error(`Validation failed: ${validationResult.errors[0]}`);
              setIsValidating(false);
              return;
            }

            if (validationResult.warnings.length > 0) {
              console.warn("Validation warnings:", validationResult.warnings);
              toast.warning(
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
                toast.success(
                  `Started importing ${conversationCount} conversations${sourceInfo}`
                );
              } catch (error) {
                console.error("Background import failed:", error);
                toast.error("Failed to start import");
              }
            }
          );
        } catch (error) {
          console.error("Failed to read or parse file:", error);
          toast.error("Failed to read or parse the file", {
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
    [confirmDialog, backgroundJobs, validateImportData]
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const activeJobs = backgroundJobs.getActiveJobs();
  const isExporting = activeJobs.some(job => job.type === "export");
  const isImportingBackground = activeJobs.some(job => job.type === "import");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Import Section */}
        <div className="space-y-3">
          <Button
            onClick={triggerFileInput}
            disabled={isImporting || isValidating || isImportingBackground}
            variant="outline"
            className="w-full"
          >
            {isValidating ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Validating...
              </>
            ) : isImporting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Importing...
              </>
            ) : isImportingBackground ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Import in progress...
              </>
            ) : (
              <>
                <UploadIcon className="mr-2 h-4 w-4" />
                Import JSON
              </>
            )}
          </Button>
          {(isImporting || isValidating || isImportingBackground) && (
            <p className="text-xs text-muted-foreground text-center">
              {isValidating
                ? "Validating file contents..."
                : isImporting
                  ? "Importing conversations... This may take a moment."
                  : "Import running in background..."}
            </p>
          )}
        </div>

        {/* Export Section */}
        <div className="space-y-3">
          <Button
            onClick={handleExport}
            disabled={selectedConversations.size === 0 || isExporting}
            variant="outline"
            className="w-full"
          >
            {isExporting ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Exporting...
              </>
            ) : (
              <>
                <DownloadIcon className="mr-2 h-4 w-4" />
                Export ({selectedConversations.size})
              </>
            )}
          </Button>

          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              id="include-attachments"
              checked={includeAttachments}
              onChange={e => onIncludeAttachmentsChange(e.target.checked)}
              className="rounded border-gray-300"
            />
            <label htmlFor="include-attachments">
              Include attachment content
            </label>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        className="hidden"
      />

      <ConfirmationDialog
        open={confirmDialog.isOpen}
        onOpenChange={confirmDialog.handleOpenChange}
        title={confirmDialog.options.title}
        description={confirmDialog.options.description}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
        onConfirm={confirmDialog.handleConfirm}
        onCancel={confirmDialog.handleCancel}
      />
    </div>
  );
}
