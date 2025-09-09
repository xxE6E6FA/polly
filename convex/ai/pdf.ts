/**
 * PDF processing module - handles capability detection, text extraction, and persistence
 */

import { type ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { v } from "convex/values";
import { log } from "../lib/logger";


// ==================== Capability Detection ====================

/**
 * Check if a model supports PDF files natively
 * These providers can handle raw PDF binary data directly
 */
export function modelSupportsPdfNatively(provider: string, _modelId: string): boolean {
  // Based on provider capabilities for handling PDF binary data
  return provider === "anthropic" || provider === "google";
}

/**
 * Determine if we should use PDF text extraction for a given model
 * Returns true if we should convert PDF to text, false if we should send raw PDF
 * 
 * Note: Text extraction is done server-side using Gemini with OCR capabilities
 */
export function shouldExtractPdfText(provider: string, modelId: string, supportsFiles?: boolean): boolean {
  // If the model supports files AND the provider can handle PDF binaries natively, use native support
  if (supportsFiles && modelSupportsPdfNatively(provider, modelId)) {
    return false;
  }
  
  // For all other cases (no file support OR provider doesn't handle PDFs natively), use Gemini-based text extraction
  return true;
}

// ==================== Text Extraction ====================



/**
 * Clean text for AI consumption
 */
export function cleanTextForAI(text: string): string {
  let cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\t+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();

  const maxLength = 100000;
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength) + '\n\n[Content truncated due to length]';
  }

  return cleaned;
}

// ==================== Utility Functions ====================

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
    log.error("Failed to retrieve stored text:", error);
    return null;
  }
}

/**
 * Store PDF text in Convex storage (client-side action)
 */
export const storePdfText = action({
  args: {
    text: v.string(),
  },
  returns: v.id("_storage"),
  handler: async (ctx, { text }) => {
    const textBlob = new Blob([text], { type: "text/plain" });
    return await ctx.storage.store(textBlob);
  },
});

/**
 * Server-side PDF text extraction action
 * Used during message streaming to extract PDF text with proper loading states
 */
export const extractPdfText = action({
  args: {
    storageId: v.id("_storage"),
    filename: v.string(),
  },
  returns: v.object({
    text: v.string(),
    textFileId: v.id("_storage"),
  }),
  handler: async (ctx, { storageId, filename }): Promise<{ text: string; textFileId: Id<"_storage"> }> => {
    // Get the PDF file from storage
    const pdfBlob = await ctx.storage.get(storageId);
    if (!pdfBlob) {
      throw new Error(`PDF file not found in storage: ${filename}`);
    }

    // Convert blob to base64 - using a pure JavaScript implementation for Convex compatibility
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Base64 encoding lookup table
    const base64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let base64Result = '';
    let i;
    
    // Process bytes in groups of 3
    for (i = 0; i < bytes.length - 2; i += 3) {
      base64Result += base64chars[bytes[i] >> 2];
      base64Result += base64chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64Result += base64chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
      base64Result += base64chars[bytes[i + 2] & 63];
    }
    
    // Handle remaining bytes
    if (i < bytes.length) {
      base64Result += base64chars[bytes[i] >> 2];
      if (i === bytes.length - 1) {
        base64Result += base64chars[(bytes[i] & 3) << 4];
        base64Result += '==';
      } else {
        base64Result += base64chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
        base64Result += base64chars[(bytes[i + 1] & 15) << 2];
        base64Result += '=';
      }
    }
    
    // dataUrl format not needed for direct Gemini API call

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("Google API key not found. Please add your Gemini API key in settings to extract PDF text.");
    }

    // Call Gemini API directly from Convex
    const response: Response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: "Extract all text from this PDF document. Include OCR for scanned pages. Output the complete text content in plain text format."
              },
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: base64Result
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 50000,
          }
        }),
        signal: AbortSignal.timeout(120000), // 2 minute timeout
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `PDF extraction failed (HTTP ${response.status})`;
      throw new Error(errorMessage);
    }

    const geminiResponse = await response.json();
    
    if (!geminiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("No text could be extracted from this PDF. The document may be image-only or corrupted.");
    }
    
    const extractedText = geminiResponse.candidates[0].content.parts[0].text;

    // Store the extracted text
    const textBlob = new Blob([extractedText], { type: "text/plain" });
    const textFileId = await ctx.storage.store(textBlob) as Id<"_storage">;

    log.info(
      `[PDF Extraction] Server-side: Successfully extracted ${extractedText.length} characters from ${filename}`
    );

    return {
      text: extractedText,
      textFileId,
    };
  },
});
