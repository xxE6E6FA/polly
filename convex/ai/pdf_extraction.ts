/**
 * PDF capability detection utilities
 * 
 * Note: PDF text extraction is now handled client-side using PDF.js
 * This file only contains logic for determining model capabilities
 */

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
 * Note: Text extraction is now done client-side during upload using PDF.js
 */
export function shouldExtractPdfText(provider: string, modelId: string, supportsFiles?: boolean): boolean {
  // If the model supports files AND the provider can handle PDF binaries natively, use native support
  if (supportsFiles && modelSupportsPdfNatively(provider, modelId)) {
    return false;
  }
  
  // For all other cases (no file support OR provider doesn't handle PDFs natively), use client-side extracted text
  return true;
}

