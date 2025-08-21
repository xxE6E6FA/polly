
import { type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Define Attachment type based on attachmentSchema
type Attachment = {
  type: "image" | "pdf" | "text";
  url: string;
  name: string;
  size: number;
  content?: string;
  thumbnail?: string;
  storageId?: Id<"_storage">;
  mimeType?: string;
  textFileId?: Id<"_storage">;
  extractedText?: string;
  extractionError?: string;
  generatedImage?: {
    isGenerated: boolean;
    source: string;
    model?: string;
    prompt?: string;
  };
};
import { api, internal } from "../_generated/api";
import { shouldExtractPdfText } from "../ai/pdf";
import { updatePdfReadingStatus, clearPdfReadingStatus } from "../ai/pdf_status";

/**
 * Process attachments for LLM requests
 * Handles PDF text storage and retrieval optimization
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

  const processedAttachments: Attachment[] = [];

  for (const attachment of attachments) {
    if (attachment.type === "pdf") {
      // Check if this model needs text extraction
      const needsTextExtraction = shouldExtractPdfText(provider, modelId, modelSupportsFiles);
      console.log(`[PDF Processing] Model ${provider}/${modelId} (supportsFiles=${modelSupportsFiles}) needsTextExtraction=${needsTextExtraction} for ${attachment.name}`);
      
      if (needsTextExtraction) {
        // Show status update for PDF processing
        if (messageId) {
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "reading_pdf",
          });
        }

        let textContent = "";

        // Priority 1: Use existing textFileId (persistent storage)
        if (attachment.textFileId) {
          try {
            const textBlob = await ctx.storage.get(attachment.textFileId);
            if (textBlob) {
              textContent = await textBlob.text();
              console.log(`[PDF Processing] Retrieved cached text for ${attachment.name}: ${textContent.length} chars`);
            }
          } catch (error) {
            console.warn("Failed to retrieve stored PDF text:", error);
          }
        }

        // Priority 2: Fallback to extractedText (in-memory)
        if (!textContent && attachment.extractedText) {
          textContent = attachment.extractedText;
          console.log(`[PDF Processing] Using in-memory text for ${attachment.name}: ${textContent.length} chars`);
          
          // Store the extracted text for future use
          try {
            const textBlob = new Blob([attachment.extractedText], { type: "text/plain" });
            const textFileId = await ctx.storage.store(textBlob);
            
            // Update the attachment to include the stored text reference
            processedAttachments.push({
              ...attachment,
              textFileId,
              content: textContent, // Use for immediate processing
            });
            continue;
          } catch (error) {
            console.warn("Failed to store PDF text:", error);
            // Continue with in-memory text
          }
        }

        // Priority 3: Extract PDF server-side if no text available
        if (!textContent && attachment.storageId) {
          try {
            // Update status to show we're extracting
            if (messageId) {
              await updatePdfReadingStatus(ctx, messageId, attachment.name, 10);
            }

            console.log(`[PDF Processing] Extracting text server-side for ${attachment.name}`);
            
            // Extract PDF text using server-side action
            const extractionResult = await ctx.runAction(api.ai.pdf.extractPdfText, {
              storageId: attachment.storageId,
              filename: attachment.name,
            });

            textContent = extractionResult.text;
            
            // Update the attachment to include the extracted text
            processedAttachments.push({
              ...attachment,
              textFileId: extractionResult.textFileId,
              content: textContent,
            });

            console.log(`[PDF Processing] Server extraction complete for ${attachment.name}: ${textContent.length} chars`);
            
            // Clear the PDF reading status
            if (messageId) {
              await clearPdfReadingStatus(ctx, messageId);
            }
            continue;
          } catch (error) {
            console.error(`[PDF Processing] Server extraction failed for ${attachment.name}:`, error);
            
            // Clear the PDF reading status on error
            if (messageId) {
              await clearPdfReadingStatus(ctx, messageId);
            }
            
            // Return with extraction error
            processedAttachments.push({
              ...attachment,
              extractionError: error instanceof Error ? error.message : "PDF extraction failed",
            });
            continue;
          }
        }

        if (textContent) {
          processedAttachments.push({
            ...attachment,
            content: textContent,
          });
        } else {
          // No text available - return original attachment with error
          processedAttachments.push({
            ...attachment,
            extractionError: attachment.extractionError || "No text content available for this PDF",
          });
        }
      } else {
        // Model supports native PDF - use original attachment
        console.log(`[PDF Processing] Model ${provider}/${modelId} supports PDFs natively - passing through ${attachment.name} without extraction`);
        processedAttachments.push(attachment);
      }
    } else {
      // Non-PDF attachments - pass through
      processedAttachments.push(attachment);
    }
  }

  return processedAttachments;
};
