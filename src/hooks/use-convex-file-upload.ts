import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { generateThumbnail } from "@/lib/file-utils";

import type { Attachment, FileUploadProgress } from "@/types";

export function useConvexFileUpload() {
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);

  const uploadFile = useCallback(
    async (
      file: File,
      onProgress?: (progress: FileUploadProgress) => void
    ): Promise<Attachment> => {
      const fileProgress: FileUploadProgress = {
        file,
        progress: 0,
        status: "pending",
      };

      try {
        onProgress?.(fileProgress);

        // Step 1: Generate upload URL
        fileProgress.status = "uploading";
        fileProgress.progress = 10;
        onProgress?.(fileProgress);

        const postUrl = await generateUploadUrl();

        // Step 2: Upload file to the generated URL
        fileProgress.progress = 50;
        onProgress?.(fileProgress);

        const uploadResponse = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed: ${uploadResponse.statusText}`);
        }

        const { storageId } = await uploadResponse.json();

        // Step 3: Create attachment object with storage ID
        // URL will be resolved by FileDisplay component using the getFileUrl query
        fileProgress.status = "processing";
        fileProgress.progress = 80;
        onProgress?.(fileProgress);

        // Determine attachment type based on file type
        let attachmentType: "image" | "pdf" | "text";
        if (file.type.startsWith("image/")) {
          attachmentType = "image";
        } else if (file.type === "application/pdf") {
          attachmentType = "pdf";
        } else {
          attachmentType = "text";
        }

        // Create attachment object
        const attachment: Attachment = {
          type: attachmentType,
          url: "", // Will be resolved by display components using storageId
          name: file.name,
          size: file.size,
          storageId: storageId as Id<"_storage">,
          mimeType: file.type,
        };

        // Generate thumbnail for images
        if (attachmentType === "image") {
          try {
            attachment.thumbnail = await generateThumbnail(file);
          } catch (error) {
            console.warn("Failed to generate thumbnail:", error);
          }
        }

        // Read content for text files
        if (attachmentType === "text") {
          try {
            attachment.content = await readTextFile(file);
          } catch (error) {
            console.warn("Failed to read text content:", error);
          }
        }

        fileProgress.status = "complete";
        fileProgress.progress = 100;
        fileProgress.attachment = attachment;
        onProgress?.(fileProgress);

        return attachment;
      } catch (error) {
        fileProgress.status = "error";
        fileProgress.error =
          error instanceof Error ? error.message : "Upload failed";
        onProgress?.(fileProgress);
        throw error;
      }
    },
    [generateUploadUrl]
  );

  return { uploadFile };
}

// Utility function to read text file content

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
