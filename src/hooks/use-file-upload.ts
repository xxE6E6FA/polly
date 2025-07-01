import { useCallback, useState } from "react";

import {
  type FileUploadProgress,
  useConvexFileUpload,
} from "@/hooks/use-convex-file-upload";
import { useNotificationDialog } from "@/hooks/use-notification-dialog";
import { isFileTypeSupported } from "@/lib/model-capabilities";
import { type AIModel, type Attachment } from "@/types";

function convertImageToWebP(
  file: File,
  maxDimension = 1920,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP
        canvas.toBlob(
          blob => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = () => {
                const base64 = (reader.result as string).split(",")[1];
                resolve({ base64, mimeType: "image/webp" });
              };
              reader.onerror = () =>
                reject(new Error("Failed to read converted image"));
              reader.readAsDataURL(blob);
            } else {
              reject(new Error("Failed to convert image"));
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// Map file extensions to programming languages for syntax highlighting
const FILE_EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mjs: "javascript",
  cjs: "javascript",

  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",

  // Languages
  py: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  go: "go",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  r: "r",
  lua: "lua",
  perl: "perl",
  pl: "perl",

  // Shell/Config
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",

  // Data/Config
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",

  // Database
  sql: "sql",

  // Documentation
  md: "markdown",
  mdx: "markdown",
  rst: "restructuredtext",
  tex: "latex",

  // Other
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmake: "cmake",
  gradle: "gradle",

  // Default
  txt: "text",
  log: "text",
};

function getFileLanguage(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return FILE_EXTENSION_TO_LANGUAGE[extension] || "text";
}

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
              language: getFileLanguage(file.name),
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
            let base64Content: string;
            let mimeType = file.type;

            // Convert all images to WebP for smaller payloads
            if (fileSupport.category === "image") {
              try {
                const converted = await convertImageToWebP(file);
                base64Content = converted.base64;
                mimeType = converted.mimeType;
              } catch (error) {
                console.warn(
                  "Failed to convert image to WebP, using original:",
                  error
                );
                // Fallback to original file if conversion fails
                base64Content = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result = reader.result as string;
                    // Remove the data URL prefix (e.g., "data:image/png;base64,")
                    const base64 = result.split(",")[1];
                    resolve(base64);
                  };
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
              }
            } else {
              // For non-image files (PDFs, etc.), use original
              base64Content = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  // Remove the data URL prefix (e.g., "data:image/png;base64,")
                  const base64 = result.split(",")[1];
                  resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
              });
            }

            const attachment: Attachment = {
              type: fileSupport.category as "image" | "pdf" | "text",
              url: "", // No URL since it's stored locally initially
              name: file.name,
              size: file.size,
              content: base64Content, // Store as base64 in content field
              mimeType,
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
        const imageAttachments = newAttachments.filter(
          att => att.type === "image"
        );

        toast.success(
          `File${newAttachments.length > 1 ? "s" : ""} added successfully`,
          {
            description:
              imageAttachments.length > 0
                ? `${newAttachments.length} file${newAttachments.length > 1 ? "s" : ""} ready to use. ${imageAttachments.length} image${imageAttachments.length > 1 ? "s" : ""} optimized to WebP format.`
                : privateMode
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

  const buildMessageContent = useCallback((input: string) => {
    // Only return the user's input text
    // Text files will be shown as attachment badges only
    return input.trim();
  }, []);

  const getBinaryAttachments = useCallback(() => {
    // Return all attachments since they're all shown as badges now
    return attachments;
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
            // Use the attachment's mimeType which may be WebP for converted images
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
