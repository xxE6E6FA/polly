// Humanize text by fixing common formatting issues
export function humanizeText(text: string): string {
  return (
    text
      // Fix double spaces
      .replace(/\s{2,}/g, " ")
      // Fix spaces before punctuation
      .replace(/\s+([.,!?;:])/g, "$1")
      // Ensure space after punctuation
      .replace(/([.,!?;:])(?=[A-Za-z])/g, "$1 ")
      // Trim
      .trim()
  );
}

// Extract reasoning/thinking content from text
export function extractReasoning(text: string): string | null {
  // Look for common reasoning patterns
  const reasoningPatterns = [
    /<thinking>([\s\S]*?)<\/thinking>/i,
    /<reasoning>([\s\S]*?)<\/reasoning>/i,
    /\[thinking\]([\s\S]*?)\[\/thinking\]/i,
  ];

  for (const pattern of reasoningPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}
