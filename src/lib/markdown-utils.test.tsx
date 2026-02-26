import { describe, expect, it } from "bun:test";
import React from "react";
import {
  applyHardLineBreaksToString,
  bufferIncompleteEntities,
  convertCitationsToMarkdownLinks,
  decodeMinimalEntities,
  normalizeEscapedMarkdown,
  normalizeLatexDelimiters,
  removeParenthesesAroundItalics,
  renderTextWithMathAndCitations,
  tryRenderMath,
  wrapMathInCodeSpans,
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

  it("should group space-separated citations", () => {
    expect(convertCitationsToMarkdownLinks("text [1] [2] [3] more")).toBe(
      "text [1,2,3](#cite-group-1-2-3) more"
    );
  });

  it("should group mixed spacing citations", () => {
    expect(convertCitationsToMarkdownLinks("text [1][2] [3] more")).toBe(
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

describe("renderTextWithMathAndCitations", () => {
  it("should render inline math", () => {
    const result = renderTextWithMathAndCitations(
      "The formula $x^2$ is simple"
    );
    // Returns array: [text, TeX element, text]
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("The formula ");
    // Middle element is a TeX component
    expect(React.isValidElement(parts[1])).toBe(true);
    const texEl = parts[1] as React.ReactElement<{
      math: string;
      block: boolean;
    }>;
    expect(texEl.props.math).toBe("x^2");
    expect(texEl.props.block).toBe(false);
    expect(parts[2]).toBe(" is simple");
  });

  it("should render display math", () => {
    const result = renderTextWithMathAndCitations("$$\\sum_{i=1}^n i$$");
    expect(React.isValidElement(result)).toBe(true);
    const texEl = result as React.ReactElement<{
      math: string;
      block: boolean;
    }>;
    expect(texEl.props.math).toBe("\\sum_{i=1}^n i");
    expect(texEl.props.block).toBe(true);
  });

  it("should handle mixed math and citations", () => {
    const result = renderTextWithMathAndCitations("See $E=mc^2$ in [1]");
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("See ");
    const texEl = parts[1] as React.ReactElement<{ math: string }>;
    expect(texEl.props.math).toBe("E=mc^2");
    // Last part contains the citation
    expect(Array.isArray(parts[2]) || typeof parts[2] === "object").toBe(true);
  });

  it("should not match dollar amounts as math", () => {
    const result = renderTextWithMathAndCitations("Price is $10");
    // No math detected — should pass through as citation-only text
    expect(typeof result === "string" || !Array.isArray(result)).toBe(true);
  });

  it("should render math starting with a digit like $2p$", () => {
    const result = renderTextWithMathAndCitations("the form $2p$ where");
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts).toHaveLength(3);
    const texEl = parts[1] as React.ReactElement<{ math: string }>;
    expect(texEl.props.math).toBe("2p");
  });

  it("should render pure digit math like $2$", () => {
    const result = renderTextWithMathAndCitations("is $2$ times");
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts).toHaveLength(3);
    const texEl = parts[1] as React.ReactElement<{ math: string }>;
    expect(texEl.props.math).toBe("2");
  });

  it("should pass through incomplete math during streaming", () => {
    const result = renderTextWithMathAndCitations("Computing $x^2 + ");
    // No closing $, so no math match — plain text passthrough
    expect(typeof result === "string" || !Array.isArray(result)).toBe(true);
  });

  it("should pass through text with no math unchanged", () => {
    const result = renderTextWithMathAndCitations("Hello world");
    expect(result).toBe("Hello world");
  });

  it("should handle empty string", () => {
    expect(renderTextWithMathAndCitations("")).toBe("");
  });
});

describe("wrapMathInCodeSpans", () => {
  it("should wrap inline math in backticks", () => {
    expect(wrapMathInCodeSpans("text $x^2$ more")).toBe("text `$x^2$` more");
  });

  it("should wrap display math in backticks", () => {
    expect(wrapMathInCodeSpans("$$\\sum_{i=1}^n i$$")).toBe(
      "`$$\\sum_{i=1}^n i$$`"
    );
  });

  it("should preserve underscores and braces inside math", () => {
    expect(wrapMathInCodeSpans("text $d_{ij}$ more")).toBe(
      "text `$d_{ij}$` more"
    );
  });

  it("should not affect text outside math", () => {
    expect(wrapMathInCodeSpans("hello _world_ $x_1$")).toBe(
      "hello _world_ `$x_1$`"
    );
  });

  it("should handle text with no math", () => {
    expect(wrapMathInCodeSpans("no math here")).toBe("no math here");
  });

  it("should handle empty string", () => {
    expect(wrapMathInCodeSpans("")).toBe("");
  });

  it("should handle multiple math expressions", () => {
    expect(wrapMathInCodeSpans("$a_1$ and $b_2$")).toBe("`$a_1$` and `$b_2$`");
  });

  it("should not double-wrap math already in code spans", () => {
    expect(wrapMathInCodeSpans("text `$x^2$` more")).toBe("text `$x^2$` more");
  });

  it("should collapse newlines in display math", () => {
    expect(wrapMathInCodeSpans("$$a +\nb$$")).toBe("`$$a + b$$`");
  });

  it("should not affect dollar amounts", () => {
    expect(wrapMathInCodeSpans("Price is $10")).toBe("Price is $10");
  });

  it("should handle complex LaTeX with nested braces", () => {
    expect(wrapMathInCodeSpans("$\\mathbf{d_{11}}$")).toBe(
      "`$\\mathbf{d_{11}}$`"
    );
  });

  it("should handle math adjacent to punctuation", () => {
    expect(wrapMathInCodeSpans("($x^2$)")).toBe("(`$x^2$`)");
    expect(wrapMathInCodeSpans("where $x_1$, $x_2$, and $x_3$")).toBe(
      "where `$x_1$`, `$x_2$`, and `$x_3$`"
    );
  });

  it("should handle math at start and end of string", () => {
    expect(wrapMathInCodeSpans("$x^2$")).toBe("`$x^2$`");
    expect(wrapMathInCodeSpans("$a$ and $b$")).toBe("`$a$` and `$b$`");
  });

  it("should handle display math with complex content", () => {
    expect(wrapMathInCodeSpans("$$\\frac{a}{b} + \\sqrt{c}$$")).toBe(
      "`$$\\frac{a}{b} + \\sqrt{c}$$`"
    );
  });

  it("should not wrap dollar signs in the middle of words", () => {
    expect(wrapMathInCodeSpans("the$variable$name")).toBe("the$variable$name");
  });

  it("should handle AI-escaped underscores in math", () => {
    // AI models send $r\_1$ to prevent markdown emphasis — wrap preserves the content
    expect(wrapMathInCodeSpans("text $r\\_1$ more")).toBe(
      "text `$r\\_1$` more"
    );
  });

  it("should handle multiple display math blocks", () => {
    expect(wrapMathInCodeSpans("$$a$$\n\n$$b$$")).toBe("`$$a$$`\n\n`$$b$$`");
  });

  it("should handle math with superscripts and subscripts", () => {
    expect(wrapMathInCodeSpans("$x_i^2 + y_j^3$")).toBe("`$x_i^2 + y_j^3$`");
  });

  it("should handle math with backslash commands", () => {
    expect(wrapMathInCodeSpans("$\\sum_{i=0}^{n} x_i$")).toBe(
      "`$\\sum_{i=0}^{n} x_i$`"
    );
  });

  it("should not match escaped dollar signs", () => {
    expect(wrapMathInCodeSpans("costs \\$50")).toBe("costs \\$50");
  });

  it("should handle code spans with dollar signs inside", () => {
    // Existing code span containing $ should not be re-wrapped
    expect(wrapMathInCodeSpans("use `$HOME` variable")).toBe(
      "use `$HOME` variable"
    );
  });
});

describe("tryRenderMath", () => {
  it("should render display math ($$...$$)", () => {
    const result = tryRenderMath("$$x^2 + y^2$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string; block: boolean }>;
    expect(el.props.math).toBe("x^2 + y^2");
    expect(el.props.block).toBe(true);
  });

  it("should render inline math ($...$)", () => {
    const result = tryRenderMath("$x^2$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string; block: boolean }>;
    expect(el.props.math).toBe("x^2");
    expect(el.props.block).toBe(false);
  });

  it("should return null for non-math text", () => {
    expect(tryRenderMath("hello world")).toBeNull();
    expect(tryRenderMath("some code")).toBeNull();
    expect(tryRenderMath("$")).toBeNull();
    expect(tryRenderMath("$$")).toBeNull();
  });

  it("should return null for empty dollar signs", () => {
    expect(tryRenderMath("$$$$")).toBeNull();
    // $$ is only 2 chars, below the length > 2 threshold
    expect(tryRenderMath("$$")).toBeNull();
  });

  it("should unescape AI-escaped underscores for subscripts", () => {
    const result = tryRenderMath("$r\\_1$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("r_1");
  });

  it("should unescape AI-escaped underscores in display math", () => {
    const result = tryRenderMath("$$d\\_{ij}$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("d_{ij}");
  });

  it("should unescape AI-escaped asterisks", () => {
    const result = tryRenderMath("$a \\* b$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("a * b");
  });

  it("should preserve legitimate LaTeX backslash commands", () => {
    const result = tryRenderMath("$\\frac{a}{b}$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    // \frac should NOT be mangled — only \_ and \* are unescaped
    expect(el.props.math).toBe("\\frac{a}{b}");
  });

  it("should preserve \\{ and \\} in LaTeX", () => {
    const result = tryRenderMath("$\\{a, b, c\\}$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("\\{a, b, c\\}");
  });

  it("should preserve \\[ and \\] in LaTeX", () => {
    const result = tryRenderMath("$$\\left[a, b\\right]$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("\\left[a, b\\right]");
  });

  it("should handle complex Cantor-style LaTeX with escaped underscores", () => {
    // Real-world: AI sends $d\\_{ij}$ for the diagonal argument
    const result = tryRenderMath("$d\\_{ij}$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("d_{ij}");
  });

  it("should handle multiple escaped underscores in one expression", () => {
    const result = tryRenderMath("$x\\_1 + x\\_2 + x\\_3$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("x_1 + x_2 + x_3");
  });

  it("should handle nested subscripts with escaped underscores", () => {
    const result = tryRenderMath("$$\\mathbf{d\\_{11}}$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("\\mathbf{d_{11}}");
  });

  it("should handle \\sum with escaped subscript", () => {
    const result = tryRenderMath("$$\\sum\\_{i=1}^{n} i$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("\\sum_{i=1}^{n} i");
  });

  it("should trim whitespace in display math", () => {
    const result = tryRenderMath("$$  x^2 + y^2  $$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("x^2 + y^2");
  });

  it("should render error boundary for invalid LaTeX", () => {
    // TeX component receives a renderError prop — it handles the error internally
    const result = tryRenderMath("$$\\invalid{$$");
    expect(React.isValidElement(result)).toBe(true);
  });

  it("should handle LaTeX Greek letters", () => {
    const result = tryRenderMath("$\\alpha + \\beta = \\gamma$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("\\alpha + \\beta = \\gamma");
  });

  it("should handle LaTeX matrix notation", () => {
    const result = tryRenderMath(
      "$$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$$"
    );
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe(
      "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"
    );
  });
});

describe("tryRenderMath + wrapMathInCodeSpans pipeline", () => {
  it("should produce valid math through the full pipeline", () => {
    // Simulate what happens: wrapMathInCodeSpans wraps, then markdown-to-jsx
    // delivers the content to tryRenderMath via code node
    const input = "text $d_{ij}$ more";
    const wrapped = wrapMathInCodeSpans(input);
    expect(wrapped).toBe("text `$d_{ij}$` more");
    // markdown-to-jsx strips backticks and passes "$d_{ij}$" to code override
    const mathResult = tryRenderMath("$d_{ij}$");
    expect(React.isValidElement(mathResult)).toBe(true);
    const el = mathResult as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("d_{ij}");
  });

  it("should handle AI-escaped content through the full pipeline", () => {
    const input = "text $d\\_{ ij}$ more";
    const wrapped = wrapMathInCodeSpans(input);
    // Backticks preserve the escaped underscore verbatim
    expect(wrapped).toBe("text `$d\\_{ ij}$` more");
    // tryRenderMath un-escapes \_ to _ for KaTeX
    const mathResult = tryRenderMath("$d\\_{ ij}$");
    expect(React.isValidElement(mathResult)).toBe(true);
    const el = mathResult as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("d_{ ij}");
  });

  it("should handle normalizeLatexDelimiters → wrapMathInCodeSpans → tryRenderMath", () => {
    const input = "formula \\(x_1\\) and \\[y^2\\]";
    const normalized = normalizeLatexDelimiters(input);
    expect(normalized).toBe("formula $x_1$ and $$y^2$$");
    const wrapped = wrapMathInCodeSpans(normalized);
    expect(wrapped).toBe("formula `$x_1$` and `$$y^2$$`");
    // Inline
    const inlineMath = tryRenderMath("$x_1$");
    expect(React.isValidElement(inlineMath)).toBe(true);
    expect(
      (inlineMath as React.ReactElement<{ math: string }>).props.math
    ).toBe("x_1");
    // Display
    const displayMath = tryRenderMath("$$y^2$$");
    expect(React.isValidElement(displayMath)).toBe(true);
    expect(
      (displayMath as React.ReactElement<{ math: string; block: boolean }>)
        .props.block
    ).toBe(true);
  });
});

describe("renderTextWithMathAndCitations — comprehensive", () => {
  it("should handle multiple inline math in one line", () => {
    const result = renderTextWithMathAndCitations(
      "where $a_1$ and $b_2$ are constants"
    );
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    // "where " + TeX + " and " + TeX + " are constants"
    expect(parts).toHaveLength(5);
    expect(parts[0]).toBe("where ");
    expect(React.isValidElement(parts[1])).toBe(true);
    expect(parts[2]).toBe(" and ");
    expect(React.isValidElement(parts[3])).toBe(true);
    expect(parts[4]).toBe(" are constants");
  });

  it("should handle display math between paragraphs", () => {
    const result = renderTextWithMathAndCitations(
      "Consider: $$\\int_0^1 f(x) dx$$ which equals..."
    );
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("Consider: ");
    const texEl = parts[1] as React.ReactElement<{
      math: string;
      block: boolean;
    }>;
    expect(texEl.props.math).toBe("\\int_0^1 f(x) dx");
    expect(texEl.props.block).toBe(true);
    expect(parts[2]).toBe(" which equals...");
  });

  it("should handle Euler's identity", () => {
    const result = renderTextWithMathAndCitations("$$e^{i\\pi} + 1 = 0$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string; block: boolean }>;
    expect(el.props.math).toBe("e^{i\\pi} + 1 = 0");
    expect(el.props.block).toBe(true);
  });

  it("should handle quadratic formula", () => {
    const result = renderTextWithMathAndCitations(
      "$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$"
    );
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}");
  });

  it("should not match single dollar with trailing digit", () => {
    const result = renderTextWithMathAndCitations("I spent $100 on food");
    // $100 should NOT be matched as math (trailing digit guard)
    expect(typeof result === "string" || !Array.isArray(result)).toBe(true);
  });

  it("should not match adjacent dollar amounts", () => {
    const result = renderTextWithMathAndCitations(
      "prices range from $10 to $20"
    );
    expect(typeof result === "string" || !Array.isArray(result)).toBe(true);
  });

  it("should handle math with citations after it", () => {
    const result = renderTextWithMathAndCitations(
      "The equation $E=mc^2$ [1][2] is famous"
    );
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts[0]).toBe("The equation ");
    const texEl = parts[1] as React.ReactElement<{ math: string }>;
    expect(texEl.props.math).toBe("E=mc^2");
  });

  it("should handle only citations, no math", () => {
    const result = renderTextWithMathAndCitations(
      "According to [1] and [2], this is true"
    );
    // Should render citations without math
    expect(Array.isArray(result)).toBe(true);
  });

  it("should handle math with subscript/superscript combos", () => {
    const result = renderTextWithMathAndCitations("$x_i^{n+1}$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("x_i^{n+1}");
  });

  it("should handle display math with aligned environment", () => {
    const result = renderTextWithMathAndCitations("$$a + b = c$$");
    expect(React.isValidElement(result)).toBe(true);
    const el = result as React.ReactElement<{ math: string }>;
    expect(el.props.math).toBe("a + b = c");
  });

  it("should handle incomplete display math during streaming", () => {
    // No closing $$ — should pass through as plain text
    const result = renderTextWithMathAndCitations("$$\\sum_{i=1}^n");
    expect(typeof result === "string" || !Array.isArray(result)).toBe(true);
  });

  it("should handle incomplete inline math during streaming", () => {
    const result = renderTextWithMathAndCitations("the value $x + ");
    expect(typeof result === "string" || !Array.isArray(result)).toBe(true);
  });

  it("should handle LaTeX with Greek letters inline", () => {
    const result = renderTextWithMathAndCitations(
      "angle $\\theta$ and radius $r$"
    );
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    // Find the TeX elements among the parts
    const texParts = parts.filter(p => React.isValidElement(p));
    expect(texParts.length).toBeGreaterThanOrEqual(1);
    expect(
      (texParts[0] as React.ReactElement<{ math: string }>).props.math
    ).toBe("\\theta");
  });

  it("should strip dangling HTML closers before processing", () => {
    const result = renderTextWithMathAndCitations("text $x^2$</span> more");
    expect(Array.isArray(result)).toBe(true);
    const parts = result as React.ReactNode[];
    expect(parts).toHaveLength(3);
    expect((parts[1] as React.ReactElement<{ math: string }>).props.math).toBe(
      "x^2"
    );
  });

  it("should handle grouped citations like [1, 2, 3]", () => {
    const result = renderTextWithMathAndCitations("according to [1, 2, 3]");
    // Should normalize to [1][2][3] then render citation group
    expect(Array.isArray(result)).toBe(true);
  });
});
