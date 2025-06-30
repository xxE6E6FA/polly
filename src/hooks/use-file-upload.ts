import { useCallback, useState } from "react";

import {
  type FileUploadProgress,
  useConvexFileUpload,
} from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-notification-dialog";
import { isFileTypeSupported } from "@/lib/model-capabilities";
import { type AIModel, type Attachment } from "@/types";

type UseFileUploadProps = {
  currentModel?: AIModel;
  privateMode?: boolean;
};

export function useFileUpload({
  currentModel,
  privateMode,
}: UseFileUploadProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    Map<string, FileUploadProgress>
  >(new Map());

  const { uploadFile } = useConvexFileUpload();
  const notificationDialog = useNotificationDialog();

  const processTextFiles = useCallback((textFiles: Attachment[]) => {
    if (textFiles.length === 0) {
      return "";
    }

    const textFileContents = textFiles
      .map(file => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const language =
          extension &&
          [
            "js",
            "ts",
            "jsx",
            "tsx",
            "py",
            "java",
            "c",
            "cpp",
            "cs",
            "go",
            "rs",
            "php",
            "rb",
            "swift",
            "kt",
            "scala",
            "sh",
            "sql",
            "html",
            "css",
            "scss",
            "sass",
            "less",
            "vue",
            "svelte",
            "json",
            "xml",
            "yaml",
            "yml",
          ].includes(extension)
            ? extension === "tsx"
              ? "typescript"
              : extension === "jsx"
                ? "javascript"
                : extension === "py"
                  ? "python"
                  : extension === "cs"
                    ? "csharp"
                    : extension === "rs"
                      ? "rust"
                      : extension === "rb"
                        ? "ruby"
                        : extension === "kt"
                          ? "kotlin"
                          : extension === "sh"
                            ? "bash"
                            : extension
            : "";

        return `**${file.name}:**\n\`\`\`${language}\n${file.content}\n\`\`\``;
      })
      .join("\n\n");

    return textFileContents;
  }, []);

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files) {
        return;
      }

      const newAttachments: Attachment[] = [];

      for (const file of [...files]) {
        const maxSize = 20 * 1024 * 1024; // 20MB limit

        if (file.size > maxSize) {
          notificationDialog.notify({
            title: "File Too Large",
            description: `File ${file.name} is too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
            type: "error",
          });
          continue;
        }

        const fileSupport = isFileTypeSupported(file.type, currentModel);

        if (!fileSupport.supported) {
          notificationDialog.notify({
            title: "Unsupported File Type",
            description: `File ${file.name} is not supported by the current model. ${
              !currentModel
                ? "Please select a model first."
                : "Try selecting a different model that supports this file type."
            }`,
            type: "error",
          });
          continue;
        }

        try {
          const fileKey = file.name + file.size;

          setUploadProgress(
            prev =>
              new Map(
                prev.set(fileKey, {
                  file,
                  progress: 0,
                  status: "pending",
                })
              )
          );

          if (fileSupport.category === "text") {
            const textContent = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsText(file);
            });

            const attachment: Attachment = {
              type: "text",
              url: "",
              name: file.name,
              size: file.size,
              content: textContent,
            };

            newAttachments.push(attachment);
            setUploadProgress(prev => {
              const newMap = new Map(prev);
              newMap.delete(fileKey);
              return newMap;
            });
          } else {
            // For all binary files (images, PDFs), store locally as Base64 initially
            // They will be uploaded to Convex later when message is sent (if not in private mode)
            const base64Content = await new Promise<string>(
              (resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  // Remove the data URL prefix (e.g., "data:image/png;base64,")
                  const base64 = result.split(",")[1];
                  resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
              }
            );

            const attachment: Attachment = {
              type: fileSupport.category as "image" | "pdf" | "text",
              url: "", // No URL since it's stored locally initially
              name: file.name,
              size: file.size,
              content: base64Content, // Store as base64 in content field
              mimeType: file.type,
              // Mark if this should be uploaded to Convex when message is sent
              storageId: undefined, // Will be set when uploaded to Convex
            };

            newAttachments.push(attachment);
            setUploadProgress(prev => {
              const newMap = new Map(prev);
              newMap.delete(fileKey);
              return newMap;
            });
          }
        } catch (error) {
          notificationDialog.notify({
            title: "File Upload Failed",
            description: `Failed to upload file ${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
            type: "error",
          });

          const fileKey = file.name + file.size;
          setUploadProgress(prev => {
            const newMap = new Map(prev);
            newMap.delete(fileKey);
            return newMap;
          });
        }
      }

      setAttachments(prev => [...prev, ...newAttachments]);

      // Show success toast for added files
      if (newAttachments.length > 0) {
        const { toast } = await import("sonner");
        toast.success(
          `File${newAttachments.length > 1 ? "s" : ""} added successfully`,
          {
            description: privateMode
              ? `${newAttachments.length} file${newAttachments.length > 1 ? "s" : ""} ready to use in your private conversation.`
              : `${newAttachments.length} file${newAttachments.length > 1 ? "s" : ""} ready to use. Will be uploaded when message is sent.`,
          }
        );
      }
    },
    [notificationDialog, currentModel, privateMode]
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const buildMessageContent = useCallback(
    (input: string) => {
      const textFiles = attachments.filter(att => att.type === "text");
      const textFileContents = processTextFiles(textFiles);

      return input.trim()
        ? textFileContents
          ? `${input.trim()}\n\n${textFileContents}`
          : input.trim()
        : textFileContents;
    },
    [attachments, processTextFiles]
  );

  const getBinaryAttachments = useCallback(() => {
    return attachments.filter(att => att.type !== "text");
  }, [attachments]);

  const uploadAttachmentsToConvex = useCallback(
    async (attachmentsToUpload: Attachment[]): Promise<Attachment[]> => {
      if (privateMode) {
        // In private mode, don't upload to Convex - just return as-is
        return attachmentsToUpload;
      }

      const uploadedAttachments: Attachment[] = [];

      for (const attachment of attachmentsToUpload) {
        if (attachment.type === "text" || attachment.storageId) {
          // Text files or already uploaded files - use as-is
          uploadedAttachments.push(attachment);
        } else if (attachment.content && attachment.mimeType) {
          // Binary file stored as Base64 - upload to Convex
          try {
            // Convert Base64 back to File object for upload
            const byteCharacters = atob(attachment.content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const file = new File([byteArray], attachment.name, {
              type: attachment.mimeType,
            });

            const uploadedAttachment = await uploadFile(file);
            uploadedAttachments.push(uploadedAttachment);
          } catch (_error) {
            // Fallback: keep the Base64 version
            uploadedAttachments.push(attachment);
          }
        } else {
          // Fallback for any other cases
          uploadedAttachments.push(attachment);
        }
      }

      return uploadedAttachments;
    },
    [privateMode, uploadFile]
  );

  return {
    attachments,
    uploadProgress,
    handleFileUpload,
    removeAttachment,
    clearAttachments,
    buildMessageContent,
    getBinaryAttachments,
    uploadAttachmentsToConvex,
    notificationDialog,
  };
}
