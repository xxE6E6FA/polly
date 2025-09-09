import { describe, expect, it } from "vitest";
import {
  extractFirstCodeBlock,
  findCompleteNestedCodeBlock,
  findPartialNestedCodeBlock,
  hasNestedCodeBlocks,
  nestedCodeBlockLookBack,
  parseNestedCodeBlocks,
} from "./nested-code-block-parser";

describe("nested-code-block-parser", () => {
  describe("parseNestedCodeBlocks", () => {
    it("parses simple code block", () => {
      const text = "```javascript\nconsole.log('hello');\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual({
        language: "javascript",
        code: "console.log('hello');",
        fullMatch: "```javascript\nconsole.log('hello');\n```",
        start: 0,
        end: 35,
      });
    });

    it("parses multiple code blocks", () => {
      const text = "```js\ncode1\n```\nsome text\n```python\ncode2\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].language).toBe("js");
      expect(blocks[0].code).toBe("code1");
      expect(blocks[1].language).toBe("python");
      expect(blocks[1].code).toBe("code2");
    });

    it("parses nested code blocks correctly", () => {
      const text =
        "```markdown\nHere's code:\n```js\ninner code\n```\nEnd\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("markdown");
      expect(blocks[0].code).toBe("Here's code:\n```js\ninner code\n```\nEnd");
    });

    it("handles deeply nested blocks", () => {
      const text = "```md\n```html\n```js\ndeep\n```\n```\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("md");
      expect(blocks[0].code).toBe("```html\n```js\ndeep\n```\n```");
    });

    it("handles unclosed blocks", () => {
      const text = "```javascript\nconsole.log('hello');";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("javascript");
      expect(blocks[0].code).toBe("console.log('hello');");
      expect(blocks[0].end).toBe(text.length);
    });

    it("handles empty language", () => {
      const text = "```\nplain code\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("");
      expect(blocks[0].code).toBe("plain code");
    });

    it("ignores ``` not at line start", () => {
      const text = "```js\nlet x = `backticks ```inside string```;\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe("let x = `backticks ```inside string```;");
    });

    it("handles whitespace before ``` correctly", () => {
      const text = "```js\ncode\n  ```\nmore text";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe("code\n  ```\nmore text");
    });

    it("returns only first block when firstOnly is true", () => {
      const text = "```js\ncode1\n```\n```python\ncode2\n```";
      const blocks = parseNestedCodeBlocks(text, true);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("js");
    });

    it("handles complex mixed content", () => {
      const text = `
Text before
\`\`\`markdown
# Title
\`\`\`js
const x = 1;
\`\`\`
More markdown
\`\`\`
Text after
`;
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe("markdown");
      expect(blocks[0].code).toContain("```js\nconst x = 1;\n```");
    });

    it("handles trailing content after code blocks", () => {
      const text =
        "```js\nconsole.log('test');\n```\n\nHere's some explanation.";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe("console.log('test');");
    });
  });

  describe("extractFirstCodeBlock", () => {
    it("extracts the first code block", () => {
      const text = "```js\nfirst\n```\n```py\nsecond\n```";
      const block = extractFirstCodeBlock(text);

      expect(block).toEqual({
        language: "js",
        code: "first",
        fullMatch: "```js\nfirst\n```",
        start: 0,
        end: 11,
      });
    });

    it("returns null when no code blocks found", () => {
      const text = "Just some regular text without code blocks";
      const block = extractFirstCodeBlock(text);

      expect(block).toBeNull();
    });

    it("extracts nested block correctly", () => {
      const text = "```md\nInner: ```js\ncode\n```\n```";
      const block = extractFirstCodeBlock(text);

      expect(block).not.toBeNull();
      expect(block?.language).toBe("md");
      expect(block?.code).toBe("Inner: ```js\ncode\n```");
    });
  });

  describe("hasNestedCodeBlocks", () => {
    it("detects nested code blocks", () => {
      const text = "```md\nHere: ```js\ncode\n```\n```";
      expect(hasNestedCodeBlocks(text)).toBe(true);
    });

    it("returns false for simple blocks", () => {
      const text = "```js\nconsole.log('hello');\n```";
      expect(hasNestedCodeBlocks(text)).toBe(false);
    });

    it("returns false when no code blocks", () => {
      const text = "Just regular text";
      expect(hasNestedCodeBlocks(text)).toBe(false);
    });

    it("detects nested blocks in multiple outer blocks", () => {
      const text = "```md\nRegular\n```\n```html\n```js\ninner\n```\n```";
      expect(hasNestedCodeBlocks(text)).toBe(true);
    });
  });

  describe("findCompleteNestedCodeBlock", () => {
    const matcher = findCompleteNestedCodeBlock();

    it("finds complete code block", () => {
      const text = "Some text\n```js\nconsole.log('hi');\n```\nMore text";
      const result = matcher(text);

      expect(result).toEqual({
        startIndex: 10,
        endIndex: 37,
        outputRaw: "```js\nconsole.log('hi');\n```",
      });
    });

    it("returns undefined for incomplete block", () => {
      const text = "Some text\n```js\nconsole.log('hi');";
      const result = matcher(text);

      expect(result).toBeUndefined();
    });

    it("returns undefined when no code blocks", () => {
      const text = "Just regular text";
      const result = matcher(text);

      expect(result).toBeUndefined();
    });

    it("finds first complete block only", () => {
      const text = "```js\nfirst\n```\n```py\nsecond\n```";
      const result = matcher(text);

      expect(result?.outputRaw).toBe("```js\nfirst\n```");
    });
  });

  describe("findPartialNestedCodeBlock", () => {
    const matcher = findPartialNestedCodeBlock();

    it("returns complete block when available", () => {
      const text = "```js\nconsole.log('test');\n```";
      const result = matcher(text);

      expect(result).toEqual({
        startIndex: 0,
        endIndex: 27,
        outputRaw: "```js\nconsole.log('test');\n```",
      });
    });

    it("returns partial block for incomplete code", () => {
      const text = "Some text\n```js\nconsole.log('incomplete";
      const result = matcher(text);

      expect(result).toEqual({
        startIndex: 10,
        endIndex: text.length,
        outputRaw: "```js\nconsole.log('incomplete",
      });
    });

    it("returns undefined when no opening ```", () => {
      const text = "Just regular text without code";
      const result = matcher(text);

      expect(result).toBeUndefined();
    });

    it("prioritizes complete blocks over partial ones", () => {
      const text = "```js\ncomplete\n```\n```py\nincomplete";
      const result = matcher(text);

      expect(result?.outputRaw).toBe("```js\ncomplete\n```");
    });
  });

  describe("nestedCodeBlockLookBack", () => {
    const lookBack = nestedCodeBlockLookBack();

    it("processes complete code block", () => {
      const result = lookBack({
        output: "```javascript\nconsole.log('hello');\nreturn true;\n```",
        isComplete: true,
        visibleTextLengthTarget: 10,
        isStreamFinished: true,
      });

      expect(result.output).toBe("```javascript\nconsole.lo\n```");
      expect(result.visibleText).toBe("console.lo");
    });

    it("handles text without code blocks", () => {
      const text = "Just regular text here";
      const result = lookBack({
        output: text,
        isComplete: true,
        visibleTextLengthTarget: 10,
        isStreamFinished: true,
      });

      expect(result.output).toBe("Just regul");
      expect(result.visibleText).toBe("Just regul");
    });

    it("handles empty language", () => {
      const result = lookBack({
        output: "```\nplain code\nmore lines\n```",
        isComplete: true,
        visibleTextLengthTarget: 8,
        isStreamFinished: true,
      });

      expect(result.output).toBe("```\nplain co\n```");
      expect(result.visibleText).toBe("plain co");
    });

    it("handles visibleTextLengthTarget longer than content", () => {
      const result = lookBack({
        output: "```js\nshort\n```",
        isComplete: true,
        visibleTextLengthTarget: 100,
        isStreamFinished: true,
      });

      expect(result.output).toBe("```js\nshort\n```");
      expect(result.visibleText).toBe("short");
    });

    it("preserves language in output format", () => {
      const result = lookBack({
        output: "```typescript\nconst x: number = 42;\n```",
        isComplete: true,
        visibleTextLengthTarget: 5,
        isStreamFinished: true,
      });

      expect(result.output).toBe("```typescript\nconst\n```");
      expect(result.visibleText).toBe("const");
    });
  });

  describe("edge cases", () => {
    it("handles empty string input", () => {
      expect(parseNestedCodeBlocks("")).toEqual([]);
      expect(extractFirstCodeBlock("")).toBeNull();
      expect(hasNestedCodeBlocks("")).toBe(false);
    });

    it("handles string with only backticks", () => {
      expect(parseNestedCodeBlocks("```")).toEqual([]);
      expect(parseNestedCodeBlocks("``````")).toEqual([]);
    });

    it("handles malformed blocks gracefully", () => {
      const text = "```js\ncode\n``"; // Missing final backtick
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe("code\n``");
      expect(blocks[0].end).toBe(text.length);
    });

    it("handles blocks with only newlines", () => {
      const text = "```\n\n\n```";
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe("\n");
    });

    it("handles very long code blocks efficiently", () => {
      const longCode = "x".repeat(10000);
      const text = `\`\`\`js\n${longCode}\n\`\`\``;
      const blocks = parseNestedCodeBlocks(text);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].code).toBe(longCode);
    });
  });
});
