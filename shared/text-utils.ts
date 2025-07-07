
/**
 * Remove duplicate source/reference sections that some LLMs add at the end of their responses
 * This is especially common with models like R1 that are trained to include sources
 */
export function removeDuplicateSourceSections(text: string): string {
  // Patterns that indicate the start of a sources/references section
  // These patterns match variations like "Sources:", "References:", "Citations:", etc.
  // with optional numbering, markdown formatting, and whitespace
  const sourcePatterns = [
    // Match "Sources:", "References:", etc. at the end of text
    /\n\n(?:#+\s*)?(?:Sources?|References?|Citations?|Bibliography|Works?\s+Cited)\s*:?\s*\n[\s\S]*$/i,
    // Match numbered source lists like "[1] Source" or "1. Source"
    /\n\n(?:\[?\d+\]?\.?\s+.+(?:\n|$))+$/,
    // Match source sections with horizontal rules
    /\n\n---+\s*\n(?:Sources?|References?|Citations?)[\s\S]*$/i,
    // Match source sections starting with "Here are the sources"
    /\n\n(?:Here\s+are\s+(?:the\s+)?(?:sources?|references?|citations?)|Sources?\s+used)[\s\S]*$/i,
    // Match source sections with URLs listed after a blank line
    /\n\n(?:(?:https?:\/\/|www\.)[^\s]+(?:\s*[-–]\s*[^\n]+)?(?:\n|$))+$/,
    // Match footnote-style references at the end
    /\n\n(?:\[\d+\]\s*[^\n]+(?:\n|$))+$/,
    // Match sections that start with "Source links:" or similar
    /\n\n(?:Source\s+links?|Reference\s+links?|Links?)\s*:?\s*\n[\s\S]*$/i,
  ];

  let cleanedText = text;

  // Apply each pattern to remove source sections
  for (const pattern of sourcePatterns) {
    const match = cleanedText.match(pattern);
    if (match) {
      // Only remove if the source section appears to be at the very end
      // and contains URLs or numbered references
      const potentialSourceSection = match[0];
      const hasUrls = /https?:\/\/|www\./i.test(potentialSourceSection);
      const hasNumberedRefs = /\[?\d+\]?\.?\s+/g.test(potentialSourceSection);

      // Also check if it contains typical source indicators
      const hasSourceIndicators =
        /\b(?:retrieved|accessed|available|from|at)\b/i.test(
          potentialSourceSection
        );

      if (hasUrls || hasNumberedRefs || hasSourceIndicators) {
        cleanedText = cleanedText.substring(0, match.index);
      }
    }
  }

  return cleanedText.trim();
} 