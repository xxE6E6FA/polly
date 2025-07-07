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
