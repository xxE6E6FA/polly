import { FILE_LIMITS } from "@shared/file-constants";
import { isFileTypeSupported } from "@shared/model-capabilities-config";
import {
  convertImageToWebP,
  readFileAsBase64,
  readFileAsText,
} from "@/lib/file-utils";
import { isUserModel } from "@/lib/type-guards";
import type { Attachment } from "@/types";

export type Notifier = (args: {
  title: string;
  description?: string;
  type?: "error" | "success" | "info";
}) => void;

export async function processFilesForAttachments(
  files: FileList,
  selectedModel: unknown,
  notify?: Notifier
): Promise<Attachment[]> {
  const newAttachments: Attachment[] = [];

  const validModel =
    isUserModel(selectedModel) &&
    selectedModel.provider &&
    selectedModel.modelId
      ? selectedModel
      : null;

  for (const file of Array.from(files)) {
    const maxSize =
      file.type === "application/pdf"
        ? FILE_LIMITS.PDF_MAX_SIZE_BYTES
        : FILE_LIMITS.MAX_SIZE_BYTES;

    if (file.size > maxSize) {
      notify?.({
        title: "File Too Large",
        description: `File ${file.name} exceeds the ${Math.round(maxSize / (1024 * 1024))}MB limit.`,
        type: "error",
      });
      continue;
    }

    if (!validModel) {
      notify?.({
        title: "No Model Selected",
        description: "Please select a model to upload files.",
        type: "error",
      });
      continue;
    }

    const fileSupport = isFileTypeSupported(file.type, validModel);
    if (!fileSupport.supported) {
      notify?.({
        title: "Unsupported File Type",
        description: `File ${file.name} is not supported by the current model.`,
        type: "error",
      });
      continue;
    }

    try {
      if (fileSupport.category === "text") {
        const textContent = await readFileAsText(file);
        newAttachments.push({
          type: "text",
          url: "",
          name: file.name,
          size: file.size,
          content: textContent,
        });
      } else if (fileSupport.category === "pdf") {
        const base64Content = await readFileAsBase64(file);
        newAttachments.push({
          type: "pdf",
          url: "",
          name: file.name,
          size: file.size,
          content: base64Content,
          mimeType: file.type,
        });
      } else {
        let base64Content: string;
        let mimeType = file.type;

        if (fileSupport.category === "image") {
          try {
            const converted = await convertImageToWebP(file);
            base64Content = converted.base64;
            mimeType = converted.mimeType;
          } catch {
            base64Content = await readFileAsBase64(file);
          }
        } else {
          base64Content = await readFileAsBase64(file);
        }

        newAttachments.push({
          type: fileSupport.category as "image" | "pdf" | "text",
          url: "",
          name: file.name,
          size: file.size,
          content: base64Content,
          mimeType,
        });
      }
    } catch {
      notify?.({
        title: "File Upload Failed",
        description: `Failed to process ${file.name}`,
        type: "error",
      });
    }
  }

  return newAttachments;
}
