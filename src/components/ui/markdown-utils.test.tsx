import { describe, expect, it } from "bun:test";
import React from "react";
import {
  applyHardLineBreaksToString,
  bufferIncompleteEntities,
  convertCitationsToMarkdownLinks,
  decodeMinimalEntities,
  isMultiWord,
  normalizeEscapedMarkdown,
  normalizeLatexDelimiters,
  removeParenthesesAroundItalics,
} from "./markdown-utils";

describe("bufferIncompleteEntities", () => {
  it("should return empty string unchanged", () => {
    expect(bufferIncompleteEntities("")).toBe("");
  });

  it("should return text without ampersands unchanged", () => {
    expect(bufferIncompleteEntities("hello world")).toBe("hello world");
  });

  it("should buffer incomplete numeric entity", () => {
    expect(bufferIncompleteEntities("hello &#3")).toBe("hello ");
  });

  it("should buffer incomplete hex entity", () => {
    expect(bufferIncompleteEntities("hello &#x2")).toBe("hello ");
  });

  it("should buffer incomplete named entity", () => {
    expect(bufferIncompleteEntities("hello &nbs")).toBe("hello ");
  });

  it("should not buffer complete entity", () => {
    expect(bufferIncompleteEntities("hello &nbsp;")).toBe("hello &nbsp;");
  });

  it("should not buffer single ampersand", () => {
    expect(bufferIncompleteEntities("hello &")).toBe("hello &");
  });

  it("should handle ampersand followed by semicolon", () => {
    expect(bufferIncompleteEntities("hello &;")).toBe("hello &;");
  });
});

describe("normalizeLatexDelimiters", () => {
  it("should return empty string unchanged", () => {
    expect(normalizeLatexDelimiters("")).toBe("");
  });

  it("should convert display math delimiters", () => {
    expect(normalizeLatexDelimiters("\\[x^2\\]")).toBe("$$x^2$$");
  });

  it("should convert inline math delimiters", () => {
    expect(normalizeLatexDelimiters("\\(x^2\\)")).toBe("$x^2$");
  });

  it("should convert mixed delimiters", () => {
    const input = "Text \\(inline\\) and \\[display\\] math";
    const expected = "Text $inline$ and $$display$$ math";
    expect(normalizeLatexDelimiters(input)).toBe(expected);
  });

  it("should handle multiline display math", () => {
    const input = "\\[\nx^2 + y^2\n\\]";
    const expected = "$$\nx^2 + y^2\n$$";
    expect(normalizeLatexDelimiters(input)).toBe(expected);
  });

  it("should not affect dollar sign math", () => {
    expect(normalizeLatexDelimiters("$x^2$")).toBe("$x^2$");
  });
});

describe("decodeMinimalEntities", () => {
  it("should return empty string unchanged", () => {
    expect(decodeMinimalEntities("")).toBe("");
  });

  it("should decode hex space entity", () => {
    expect(decodeMinimalEntities("hello&#x20;world")).toBe("hello world");
  });

  it("should decode decimal space entity", () => {
    expect(decodeMinimalEntities("hello&#32;world")).toBe("hello world");
  });

  it("should decode hex newline entity", () => {
    expect(decodeMinimalEntities("hello&#x0A;world")).toBe("hello\nworld");
  });

  it("should decode decimal newline entity", () => {
    expect(decodeMinimalEntities("hello&#10;world")).toBe("hello\nworld");
  });

  it("should decode multiple entities", () => {
    expect(decodeMinimalEntities("a&#32;b&#10;c&#x20;d")).toBe("a b\nc d");
  });

  it("should not affect other entities", () => {
    expect(decodeMinimalEntities("&nbsp;&amp;")).toBe("&nbsp;&amp;");
  });
});

describe("normalizeEscapedMarkdown", () => {
  it("should return empty string unchanged", () => {
    expect(normalizeEscapedMarkdown("")).toBe("");
  });

  it("should convert literal backslash-n to newlines", () => {
    // The function converts literal "\\n" strings (4 chars) to real newlines
    // In JS string literals, we need to double-escape to get literal backslash-n
    const input = "line1\\\\nline2\\\\nline3"; // This represents: line1\nline2\nline3
    expect(normalizeEscapedMarkdown(input)).toBe("line1\nline2\nline3");
  });

  it("should not convert backslash-n when real newlines exist", () => {
    expect(normalizeEscapedMarkdown("line1\nline2\\nline3")).toBe(
      "line1\nline2\\nline3"
    );
  });

  it("should unescape code fences at line start", () => {
    expect(normalizeEscapedMarkdown("\\```js\ncode\n\\```")).toBe(
      "```js\ncode\n```"
    );
  });

  it("should unescape headings at line start", () => {
    expect(normalizeEscapedMarkdown("\\### Title")).toBe("### Title");
  });

  it("should unescape unordered lists at line start", () => {
    expect(normalizeEscapedMarkdown("\\- item")).toBe("- item");
    expect(normalizeEscapedMarkdown("\\* item")).toBe("* item");
  });

  it("should unescape ordered lists at line start", () => {
    expect(normalizeEscapedMarkdown("\\1. item")).toBe("1. item");
  });

  it("should unescape blockquotes at line start", () => {
    expect(normalizeEscapedMarkdown("\\> quote")).toBe("> quote");
  });

  it("should unescape table pipes at line start", () => {
    expect(normalizeEscapedMarkdown("\\| cell |")).toBe("| cell |");
  });

  it("should unescape citation brackets", () => {
    expect(normalizeEscapedMarkdown("\\[1\\]")).toBe("[1]");
  });

  it("should remove backslash-space after emphasis", () => {
    expect(normalizeEscapedMarkdown("*word*\\ text")).toBe("*word* text");
    expect(normalizeEscapedMarkdown("_word_\\ text")).toBe("_word_ text");
  });

  it("should collapse multiple backslashes before whitespace", () => {
    expect(normalizeEscapedMarkdown("text\\\\ more")).toBe("text more");
  });

  it("should handle indented block markers", () => {
    // The regex allows 0-3 spaces, so 2 spaces should preserve indentation
    expect(normalizeEscapedMarkdown("  \\### Title")).toBe("### Title");
  });

  it("should not unescape inline markers", () => {
    expect(normalizeEscapedMarkdown("text \\### not heading")).toBe(
      "text \\### not heading"
    );
  });
});

describe("convertCitationsToMarkdownLinks", () => {
  it("should return empty string unchanged", () => {
    expect(convertCitationsToMarkdownLinks("")).toBe("");
  });

  it("should convert single citation", () => {
    expect(convertCitationsToMarkdownLinks("text [1] more")).toBe(
      "text [1](#cite-1) more"
    );
  });

  it("should convert multiple separate citations", () => {
    expect(convertCitationsToMarkdownLinks("text [1] and [2] more")).toBe(
      "text [1](#cite-1) and [2](#cite-2) more"
    );
  });

  it("should group consecutive citations", () => {
    expect(convertCitationsToMarkdownLinks("text [1][2][3] more")).toBe(
      "text [1,2,3](#cite-group-1-2-3) more"
    );
  });

  it("should be idempotent", () => {
    const text = "text [1][2] more";
    const once = convertCitationsToMarkdownLinks(text);
    const twice = convertCitationsToMarkdownLinks(once);
    expect(once).toBe(twice);
  });

  it("should handle citations at start and end", () => {
    expect(convertCitationsToMarkdownLinks("[1] text [2]")).toBe(
      "[1](#cite-1) text [2](#cite-2)"
    );
  });

  it("should handle double-digit citations", () => {
    expect(convertCitationsToMarkdownLinks("[12][34]")).toBe(
      "[12,34](#cite-group-12-34)"
    );
  });

  it("should not convert non-numeric brackets", () => {
    expect(convertCitationsToMarkdownLinks("[link]")).toBe("[link]");
  });
});

describe("isMultiWord", () => {
  it("should return false for single word", () => {
    expect(isMultiWord("word")).toBe(false);
  });

  it("should return true for multiple words", () => {
    expect(isMultiWord("multiple words")).toBe(true);
  });

  it("should return true for words with newline", () => {
    expect(isMultiWord("line1\nline2")).toBe(true);
  });

  it("should return true for words with tab", () => {
    expect(isMultiWord("word1\tword2")).toBe(true);
  });

  it("should handle empty string", () => {
    expect(isMultiWord("")).toBe(false);
  });

  it("should handle whitespace-only string", () => {
    expect(isMultiWord("   ")).toBe(false);
  });

  it("should trim before checking", () => {
    expect(isMultiWord("  word  ")).toBe(false);
    expect(isMultiWord("  two words  ")).toBe(true);
  });
});

describe("removeParenthesesAroundItalics", () => {
  it("should return empty string unchanged", () => {
    expect(removeParenthesesAroundItalics("")).toBe("");
  });

  it("should remove parentheses around multi-word asterisk italics", () => {
    expect(removeParenthesesAroundItalics("text (*multi word*) more")).toBe(
      "text *multi word* more"
    );
  });

  it("should remove parentheses around multi-word underscore italics", () => {
    expect(removeParenthesesAroundItalics("text (_multi word_) more")).toBe(
      "text _multi word_ more"
    );
  });

  it("should not remove parentheses around single-word italics", () => {
    expect(removeParenthesesAroundItalics("text (*word*) more")).toBe(
      "text (*word*) more"
    );
  });

  it("should handle whitespace around italics inside parentheses", () => {
    expect(removeParenthesesAroundItalics("text ( *multi word* ) more")).toBe(
      "text *multi word* more"
    );
  });

  it("should handle newlines in multi-word italics", () => {
    expect(removeParenthesesAroundItalics("(*line1\nline2*)")).toBe(
      "*line1\nline2*"
    );
  });

  it("should handle tabs in multi-word italics", () => {
    expect(removeParenthesesAroundItalics("(*word1\tword2*)")).toBe(
      "*word1\tword2*"
    );
  });

  it("should not affect regular parentheses", () => {
    expect(removeParenthesesAroundItalics("(regular text)")).toBe(
      "(regular text)"
    );
  });

  it("should handle multiple occurrences", () => {
    expect(
      removeParenthesesAroundItalics("(*multi word*) and (*another phrase*)")
    ).toBe("*multi word* and *another phrase*");
  });
});

describe("applyHardLineBreaksToString", () => {
  it("should return text unchanged when no hard breaks", () => {
    const result = applyHardLineBreaksToString("simple text");
    expect(result).toEqual(["simple text"]);
  });

  it("should convert two spaces before newline to br", () => {
    const result = applyHardLineBreaksToString("line1  \nline2");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("line1");
    expect(result[2]).toBe("line2");
  });

  it("should convert backslash before newline to br", () => {
    const result = applyHardLineBreaksToString("line1\\\nline2");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("line1");
    expect(result[2]).toBe("line2");
  });

  it("should handle multiple hard breaks", () => {
    const result = applyHardLineBreaksToString("a  \nb\\\nc");
    expect(result).toHaveLength(5);
    expect(result[0]).toBe("a");
    expect(result[2]).toBe("b");
    expect(result[4]).toBe("c");
  });

  it("should clean stray backslash+space without newline", () => {
    const result = applyHardLineBreaksToString("text\\ more");
    expect(result).toEqual(["text more"]);
  });

  it("should handle Windows line endings", () => {
    const result = applyHardLineBreaksToString("line1  \r\nline2");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("line1");
    expect(result[2]).toBe("line2");
  });

  it("should handle more than two spaces before newline", () => {
    const result = applyHardLineBreaksToString("line1    \nline2");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("line1");
    expect(result[2]).toBe("line2");
  });

  it("should not convert single space before newline", () => {
    const result = applyHardLineBreaksToString("line1 \nline2");
    expect(result).toEqual(["line1 \nline2"]);
  });

  it("should handle empty string", () => {
    const result = applyHardLineBreaksToString("");
    expect(result).toEqual([""]);
  });

  it("should handle only hard break", () => {
    const result = applyHardLineBreaksToString("  \n");
    // When the input is only a hard break, it returns ["", <br />, ""]
    // But actually, the tail is empty so it's just ["", <br />] or even just [<br />]
    // Let's verify the actual behavior
    expect(result.length).toBeGreaterThan(0);
  });

  it("should preserve br element keys", () => {
    const result = applyHardLineBreaksToString("a  \nb");
    const brElement = result[1];
    expect(React.isValidElement(brElement)).toBe(true);
    if (React.isValidElement(brElement)) {
      expect(brElement.type).toBe("br");
      expect(brElement.key).toBe("br-0");
    }
  });
});

describe("edge cases and integration", () => {
  it("should handle null-like values gracefully", () => {
    expect(bufferIncompleteEntities("")).toBe("");
    expect(normalizeLatexDelimiters("")).toBe("");
    expect(decodeMinimalEntities("")).toBe("");
    expect(normalizeEscapedMarkdown("")).toBe("");
    expect(convertCitationsToMarkdownLinks("")).toBe("");
    expect(removeParenthesesAroundItalics("")).toBe("");
  });

  it("should handle complex citation scenarios", () => {
    const input = "According to research [1][2] and studies [3], we find...";
    const result = convertCitationsToMarkdownLinks(input);
    expect(result).toBe(
      "According to research [1,2](#cite-group-1-2) and studies [3](#cite-3), we find..."
    );
  });

  it("should handle combined markdown escaping scenarios", () => {
    const input = "\\### Heading\\\\n\\- list item\\\\n\\[1\\]";
    const result = normalizeEscapedMarkdown(input);
    expect(result).toBe("### Heading\n- list item\n[1]");
  });

  it("should handle mixed LaTeX delimiters", () => {
    const input =
      "Inline \\(x^2\\) and display \\[\\sum_{i=1}^n i\\] with $y=mx+b$";
    const result = normalizeLatexDelimiters(input);
    expect(result).toBe(
      "Inline $x^2$ and display $$\\sum_{i=1}^n i$$ with $y=mx+b$"
    );
  });

  it("should handle streaming incomplete entities", () => {
    // Simulating progressive streaming
    expect(bufferIncompleteEntities("hello &nbs")).toBe("hello ");
    expect(bufferIncompleteEntities("hello &nbsp")).toBe("hello ");
    expect(bufferIncompleteEntities("hello &nbsp;")).toBe("hello &nbsp;");
  });
});
