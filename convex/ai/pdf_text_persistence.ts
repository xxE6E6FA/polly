/**
 * PDF Text Persistence - Extract PDF text once and store as reusable Convex files
 */

import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { extractPdfTextFromArrayBuffer } from "./pdf_text_extraction_server";

/**
 * Extract PDF text and store it as a persistent text file in Convex storage
 * Returns the storage ID of the text file for future reuse
 */
export async function extractAndStorePdfText(
  ctx: ActionCtx,
  pdfStorageId: Id<"_storage">,
  filename: string,
  onProgress?: (progress: number) => Promise<void>
): Promise<{ textFileId: Id<"_storage">; extractedText: string } | { error: string }> {
  try {
    const pdfBlob = await ctx.storage.get(pdfStorageId);
    if (!pdfBlob) {
      return { error: "PDF file not found in storage" };
    }

    const arrayBuffer = await pdfBlob.arrayBuffer();
    const extractedText = await extractPdfTextFromArrayBuffer(arrayBuffer, filename, onProgress);

    const textBlob = new Blob([extractedText], { type: "text/plain" });
    const textFileId = await ctx.storage.store(textBlob);

    return { textFileId: textFileId as Id<"_storage">, extractedText };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to extract and store PDF text:", errorMessage);
    return { error: errorMessage };
  }
}

/**
 * Retrieve stored PDF text from a text file ID
 */
export async function getStoredPdfText(
  ctx: ActionCtx,
  textFileId: Id<"_storage">
): Promise<string | null> {
  try {
    const textBlob = await ctx.storage.get(textFileId);
    if (!textBlob) {
      return null;
    }

    return await textBlob.text();
  } catch (error) {
    console.error("Failed to retrieve stored text:", error);
    return null;
  }
}

/**
 * Get or create PDF text file - checks for existing text file first, creates if needed
 */
export async function getOrCreatePdfText(
  ctx: ActionCtx,
  pdfStorageId: Id<"_storage">,
  filename: string,
  existingTextFileId?: Id<"_storage">,
  onProgress?: (progress: number) => Promise<void>
): Promise<{ textFileId: Id<"_storage">; extractedText: string } | { error: string }> {
  if (existingTextFileId) {
    const existingText = await getStoredPdfText(ctx, existingTextFileId);
    if (existingText) {
      return { textFileId: existingTextFileId, extractedText: existingText };
    }
  }
  return await extractAndStorePdfText(ctx, pdfStorageId, filename, onProgress);
}