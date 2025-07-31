/**
 * Server-side PDF text extraction using a simple text extraction approach
 * This is a lightweight alternative to PDF.js for server-side use
 */

/**
 * Check if text contains binary/non-printable data that should be filtered out
 */
function hasBinaryData(text: string): boolean {
  // Check for control characters (except common whitespace)
  const controlCharPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
  
  // Check for high percentage of non-ASCII characters
  const nonAsciiCount = (text.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
  const nonAsciiRatio = nonAsciiCount / text.length;
  
  return controlCharPattern.test(text) || nonAsciiRatio > 0.3;
}

/**
 * Clean and limit text content for AI processing
 */
function cleanTextForAI(text: string): string {
  // Remove binary data and control characters
  const cleaned = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ') // Remove control chars
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Replace non-printable chars with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Limit length to prevent overwhelming AI models (500KB max)
  const maxLength = 500 * 1024;
  if (cleaned.length > maxLength) {
    return cleaned.substring(0, maxLength) + '\n\n[Content truncated due to length]';
  }
  
  return cleaned;
}

/**
 * Extract text from PDF ArrayBuffer
 * This is a simplified implementation for server-side use
 */
export async function extractPdfTextFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  filename?: string,
  onProgress?: (progress: number) => Promise<void>
): Promise<string> {

  
  try {
    // Report initial progress
    if (onProgress) {
      await onProgress(0);
    }

    // Convert ArrayBuffer to string and look for text content
    // This is a very basic PDF text extraction approach
    const uint8Array = new Uint8Array(arrayBuffer);
    let text = '';
    

    
    // Report progress at 25%
    if (onProgress) {
      await onProgress(25);
    }

    // Simple text extraction by looking for readable text in the PDF
    // This won't work for all PDFs but provides a fallback
    let textFound = false;
    const decoder = new TextDecoder('utf-8', { fatal: false });
    
    // Try to decode as UTF-8 and look for readable text
    try {
      const decoded = decoder.decode(uint8Array);
      
      // Report progress at 50%
      if (onProgress) {
        await onProgress(50);
      }

      // Extract text between common PDF text markers
      const textMatches = decoded.match(/\(([^)]+)\)/g) || [];
      const streamMatches = decoded.match(/stream\s*(.*?)\s*endstream/gs) || [];
      
      // Report progress at 75%
      if (onProgress) {
        await onProgress(75);
      }

      // Process text found in parentheses (common PDF text format)
      for (const match of textMatches) {
        const cleanText = match.slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .replace(/\\[0-9]{3}/g, ' ') // Replace octal sequences with spaces
          .trim();
        
        // Only include text that contains readable characters and isn't binary data
        if (cleanText.length > 2 && /[a-zA-Z]/.test(cleanText) && !hasBinaryData(cleanText)) {
          text += cleanText + ' ';
          textFound = true;
        }
      }

      // If no text found in parentheses, try stream content
      if (!textFound) {
        for (const streamMatch of streamMatches) {
          const streamContent = streamMatch.replace(/^stream\s*/, '').replace(/\s*endstream$/, '');
          const lines = streamContent.split(/[\n\r]+/);
          
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.length > 3 && /[a-zA-Z]/.test(cleanLine) && 
                !cleanLine.includes('<<') && !cleanLine.includes('>>') && 
                !hasBinaryData(cleanLine)) {
              text += cleanLine + ' ';
              textFound = true;
            }
          }
        }
      }

    } catch (decodeError) {
      console.warn('Failed to decode PDF as UTF-8:', decodeError);
    }

    // Report completion
    if (onProgress) {
      await onProgress(100);
    }

    // Clean up and format the extracted text
    const cleanedText = cleanTextForAI(text);



    if (!cleanedText || cleanedText.length < 10) {

      return `[PDF: ${filename || "document"}]\n\nThis PDF requires advanced text extraction. The document was uploaded successfully but text content could not be extracted. You can still ask questions about the PDF and I'll do my best to help based on the filename and context.`;
    }


    return `[PDF: ${filename || "document"}]\n\n${cleanedText}`;

  } catch (error) {
    console.error('PDF text extraction failed:', error);
    return `[PDF: ${filename || "document"}]\n\nUnable to extract text from this PDF document. Error: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}