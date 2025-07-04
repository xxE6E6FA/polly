import { useCallback, useRef, useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { DownloadIcon, UploadIcon } from "@phosphor-icons/react";

import { api } from "convex/_generated/api";
import type { Id } from "convex/_generated/dataModel";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/spinner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { detectAndParseImportData } from "@/lib/import-parsers";

interface ImportExportActionsProps {
  selectedConversations: Set<string>;
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

  const bulkImport = useMutation(api.conversations.bulkImport);
  const validateImportData = useMutation(
    api.importOptimized.validateImportData
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
        console.log("No file selected");
        return;
      }

      console.log(
        "Starting import process for file:",
        file.name,
        file.size,
        "bytes"
      );

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
          console.log(
            "File content loaded, size:",
            content.length,
            "characters"
          );

          if (!content || content.trim() === "") {
            console.error("File content is empty");
            toast.error("The selected file is empty");
            setIsValidating(false);
            return;
          }

          console.log("Parsing import data...");
          const importResult = detectAndParseImportData(content);
          console.log("Import result:", {
            source: importResult.source,
            conversationCount: importResult.conversations.length,
            errorCount: importResult.errors.length,
            errors: importResult.errors,
          });

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
          console.log("Validating conversation data...");
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

            console.log("Validation stats:", validationResult.stats);
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
          const useOptimized = conversationCount > 50;
          const useBackground = conversationCount > 10;

          console.log(
            `Processing ${conversationCount} conversations${sourceInfo}`,
            { useOptimized, useBackground }
          );

          if (useBackground) {
            console.log("Using background jobs for import");
            confirmDialog.confirm(
              {
                title: "Import Conversations",
                description: `This will import ${conversationCount} conversation(s)${sourceInfo} in the background${useOptimized ? " using optimized processing" : ""}. You'll be notified when it's complete. Continue?`,
                confirmText: "Import",
                cancelText: "Cancel",
                variant: "default",
              },
              async () => {
                console.log("Background import confirmed");
                try {
                  await backgroundJobs.startImport(importResult.conversations, {
                    skipDuplicates: true,
                    useOptimized,
                  });
                  toast.success(
                    `Started importing ${conversationCount} conversations${sourceInfo}${useOptimized ? " (optimized)" : ""}`
                  );
                } catch (error) {
                  console.error("Background import failed:", error);
                  toast.error("Failed to start import");
                }
              }
            );
          } else {
            console.log("Using direct import for small batch");
            confirmDialog.confirm(
              {
                title: "Import Conversations",
                description: `This will import ${conversationCount} conversation(s)${sourceInfo}. This action cannot be undone. Continue?`,
                confirmText: "Import",
                cancelText: "Cancel",
                variant: "default",
              },
              () => {
                console.log("Direct import confirmed, starting import...");
                setIsImporting(true);

                const importPromise = bulkImport({
                  conversations: importResult.conversations,
                  skipDuplicates: true,
                });

                console.log("BulkImport mutation called");

                importPromise
                  .then(result => {
                    console.log("Import completed successfully:", result);
                    toast.success(
                      `Successfully imported ${result.importedCount} conversations${sourceInfo}`
                    );
                    if (result.skippedCount > 0) {
                      toast.info(
                        `Skipped ${result.skippedCount} duplicate conversations`
                      );
                    }
                  })
                  .catch(error => {
                    console.error("Import failed:", error);
                    toast.error("Failed to import conversations", {
                      description:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                    });
                  })
                  .finally(() => {
                    console.log(
                      "Import process finished, clearing loading state"
                    );
                    setIsImporting(false);
                  });
              }
            );
          }
        } catch (error) {
          console.error("Failed to read or parse file:", error);
          toast.error("Failed to read or parse the file", {
            description:
              error instanceof Error ? error.message : "Unknown parsing error",
          });
          setIsValidating(false);
        }
      };

      console.log("Starting file read...");
      reader.readAsText(file);

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [bulkImport, confirmDialog, backgroundJobs, validateImportData]
  );

  const triggerFileInput = useCallback(() => {
    console.log("File input triggered");
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
