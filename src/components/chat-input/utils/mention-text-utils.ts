export function stripMentionText(
  text: string,
  cursorPosition: number
): { newText: string; newCursorPos: number } {
  // Find the @ mention to delete based on cursor position
  const upto = text.slice(0, cursorPosition);
  const atIndex = Math.max(upto.lastIndexOf(" @"), upto.lastIndexOf("@"));

  let newText = text;
  let newCursorPos = cursorPosition;

  if (atIndex !== -1) {
    // Check if this looks like an email (has @ followed by domain-like pattern)
    const potentialEmail = text.slice(atIndex);
    const emailRegex = /^@\w+\.\w+/; // @domain.com pattern
    const isEmail = emailRegex.test(potentialEmail);

    if (!isEmail) {
      // Find the end of the mention (whitespace, newline, or end of text)
      let mentionEnd = cursorPosition;
      const remainingText = text.slice(cursorPosition);
      const spaceIndex = remainingText.search(/\s|\n/);
      if (spaceIndex !== -1) {
        mentionEnd = cursorPosition + spaceIndex;
      } else {
        mentionEnd = text.length;
      }

      // Delete the @ mention text
      const before = text.slice(0, atIndex);
      const after = text.slice(mentionEnd);
      newText = (before + after).trim();
      newCursorPos = atIndex;
    }
  }

  return { newText, newCursorPos };
}
