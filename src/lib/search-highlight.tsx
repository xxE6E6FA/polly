/** Minimum word length to highlight individually in multi-word queries. */
const MIN_WORD_LENGTH = 3;

/**
 * Split text into highlighted/non-highlighted segments based on a search query.
 *
 * - Single-word queries: exact substring match.
 * - Multi-word queries: each word is matched independently, but short words
 *   (< 3 chars) are skipped to avoid noisy highlights on "a", "is", etc.
 */
export function highlightMatches(
  text: string,
  query: string
): Array<{ text: string; isMatch: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [{ text, isMatch: false }];
  }

  // Build list of words to match.
  // For single-word queries keep as-is; for multi-word, drop short words
  // EXCEPT the last word (which may be a partial word still being typed).
  const words = trimmed.split(/\s+/);
  const needles =
    words.length === 1
      ? [trimmed.toLowerCase()]
      : words
          .filter(
            (w, i) => w.length >= MIN_WORD_LENGTH || i === words.length - 1
          )
          .map(w => w.toLowerCase());

  if (needles.length === 0) {
    return [{ text, isMatch: false }];
  }

  // Build a regex that matches any of the needles (longest first to prefer
  // longer matches when needles overlap).
  const sorted = [...needles].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const segments: Array<{ text: string; isMatch: boolean }> = [];
  let lastIndex = 0;

  for (const m of text.matchAll(pattern)) {
    const matchStart = m.index;
    if (matchStart === undefined) {
      continue;
    }
    if (matchStart > lastIndex) {
      segments.push({
        text: text.substring(lastIndex, matchStart),
        isMatch: false,
      });
    }
    segments.push({ text: m[0], isMatch: true });
    lastIndex = matchStart + m[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.substring(lastIndex), isMatch: false });
  }

  return segments.length > 0 ? segments : [{ text, isMatch: false }];
}
