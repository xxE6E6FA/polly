
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

// Define Attachment type based on attachmentSchema
type Attachment = {
  type: "image" | "pdf" | "text" | "audio" | "video";
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
  let touchedPdfStatus = false;

  for (const attachment of attachments) {
    if (attachment.type === "pdf") {
      // Check if this model needs text extraction
      const needsTextExtraction = shouldExtractPdfText(provider, modelId, modelSupportsFiles);
      
      if (needsTextExtraction) {
        // Show status update for PDF processing
        if (messageId) {
          await ctx.runMutation(internal.messages.updateMessageStatus, {
            messageId,
            status: "reading_pdf",
          });
          touchedPdfStatus = true;
        }

        let textContent = "";

        // Priority 1: Use existing textFileId (persistent storage)
        if (attachment.textFileId) {
          try {
            const textBlob = await ctx.storage.get(attachment.textFileId);
            if (textBlob) {
              textContent = await textBlob.text();
            }
          } catch (error) {
            console.warn("Failed to retrieve stored PDF text:", error);
          }
        }

        // Priority 2: Fallback to extractedText (in-memory)
        if (!textContent && attachment.extractedText) {
          textContent = attachment.extractedText;
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
            // Clear reading status since we completed processing for this PDF
            if (messageId && touchedPdfStatus) {
              try { await clearPdfReadingStatus(ctx, messageId); } catch {}
            }
            continue;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Failed to store PDF text: ${message}`);
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
            // Clear the PDF reading status
            if (messageId && touchedPdfStatus) {
              await clearPdfReadingStatus(ctx, messageId);
            }
            continue;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(
              `[PDF Processing] Server extraction failed for ${attachment.name}: ${message}`
            );
            
            // Clear the PDF reading status on error
            if (messageId && touchedPdfStatus) {
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
        processedAttachments.push(attachment);
      }
    } else {
      // Non-PDF attachments - pass through
      processedAttachments.push(attachment);
    }
  }
  // Ensure any temporary PDF status is cleared when we're done processing attachments
  if (messageId && touchedPdfStatus) {
    try { await clearPdfReadingStatus(ctx, messageId); } catch {}
  }
  return processedAttachments;
};
