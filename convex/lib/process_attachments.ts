
import { type ActionCtx } from "../_generated/server";
import type { Attachment } from "@/types";
import { shouldExtractPdfText } from "../ai/pdf_extraction";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { getOrCreatePdfText } from "../ai/pdf_text_persistence";
import { updatePdfReadingStatus, clearPdfReadingStatus } from "../ai/pdf_status";

/**
 * Process attachments for LLM requests with PDF text extraction and progress updates
 */
export const processAttachmentsForLLM = async (
  ctx: ActionCtx,
  attachments: Attachment[] | undefined,
  provider: string,
  modelId: string,
  modelSupportsFiles: boolean,
  messageId?: Id<"messages">
): Promise<Attachment[] | undefined> => {
  if (!attachments) {
    return undefined;
  }



  // Check if we have any PDFs that need text extraction
  const pdfAttachments = attachments.filter(
    attachment => attachment.type === "pdf" && shouldExtractPdfText(provider, modelId, modelSupportsFiles)
  );



  // If we have PDFs to process and a messageId, show reading status
  if (pdfAttachments.length > 0 && messageId) {
    const pdfNames = pdfAttachments.map(pdf => pdf.name).join(", ");

    await updatePdfReadingStatus(ctx, messageId, pdfNames);
  }

  return await Promise.all(
    attachments.map(async (attachment) => {
      // For PDF attachments, decide whether to use native PDF or extracted text
      if (attachment.type === "pdf") {
        const shouldUseTextExtraction = shouldExtractPdfText(provider, modelId, modelSupportsFiles);
        
        if (shouldUseTextExtraction) {

          
          // Check if we already have extracted text
          if (attachment.extractedText) {

            return {
              ...attachment,
              type: "text" as const,
              content: attachment.extractedText,
              url: "",
              thumbnail: undefined,
            };
          }

          // If we have a storage ID, get or create persistent text file
          if (attachment.storageId && messageId) {
            try {
              await updatePdfReadingStatus(ctx, messageId, attachment.name);

              const result = await getOrCreatePdfText(
                ctx,
                attachment.storageId,
                attachment.name,
                attachment.textFileId,
                async (progress: number) => {
                  if (progress % 20 === 0) {
                    await updatePdfReadingStatus(ctx, messageId, attachment.name, progress);
                  }
                }
              );

              await clearPdfReadingStatus(ctx, messageId);

              if ("error" in result) {
                console.error("PDF text extraction failed:", result.error);
                return {
                  ...attachment,
                  type: "text" as const,
                  content: `[Error processing PDF "${attachment.name}": ${result.error}]`,
                  url: "",
                  thumbnail: undefined,
                  extractionError: result.error,
                };
              }



              return {
                ...attachment,
                type: "text" as const,
                content: result.extractedText,
                url: "",
                thumbnail: undefined,
                textFileId: result.textFileId,
                extractedText: undefined,
              };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : "Unknown error";
              console.error("PDF text extraction failed during processing:", errorMessage);
              
              return {
                ...attachment,
                type: "text" as const,
                content: `[Error processing PDF "${attachment.name}": ${errorMessage}]`,
                url: "",
                thumbnail: undefined,
                extractionError: errorMessage,
              };
            }
          }
          const textContent = attachment.extractionError ? 
            `[Error processing PDF "${attachment.name}": ${attachment.extractionError}]` :
            `[PDF "${attachment.name}" - unable to extract text]`;

          return {
            ...attachment,
            type: "text" as const,
            content: textContent,
            url: "",
            thumbnail: undefined,
          };
        }
        
        return attachment;
      }
      
      return attachment;
    })
  );
};
