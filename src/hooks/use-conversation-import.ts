import { api } from "convex/_generated/api";
import { useMutation } from "convex/react";
import { useCallback, useRef, useState } from "react";
import { useBackgroundJobs } from "@/hooks/use-background-jobs";
import { useConfirmationDialog } from "@/hooks/use-dialog-management";
import { detectAndParseImportData } from "@/lib/import-parsers";
import { useToast } from "@/providers/toast-context";

type ConversationImportState = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  confirmDialog: ReturnType<typeof useConfirmationDialog>;
  isValidating: boolean;
  triggerFileInput: () => void;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function useConversationImport(): ConversationImportState {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isValidating, setIsValidating] = useState(false);
  const confirmDialog = useConfirmationDialog();
  const backgroundJobs = useBackgroundJobs();
  const managedToast = useToast();

  const validateImportData = useMutation(
    api.conversationImport.validateImportData
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
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

      const isJson = file.name.endsWith(".json");
      const isMarkdown =
        file.name.endsWith(".md") || file.name.endsWith(".markdown");

      if (!(isJson || isMarkdown)) {
        managedToast.error("Please select a JSON or Markdown file");
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

  return {
    fileInputRef,
    confirmDialog,
    isValidating,
    triggerFileInput,
    handleFileChange,
  };
}
