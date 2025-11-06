import { describe, expect, test } from "bun:test";
import { removeDuplicateSourceSections } from "./text-utils";

describe("removeDuplicateSourceSections", () => {
  test("removes source section with header", () => {
    const text = `Here is my response.

## Sources:
1. https://example.com
2. https://test.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Here is my response.");
  });

  test("removes references section", () => {
    const text = `Content here.

References:
[1] First reference
[2] Second reference`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Content here.");
  });

  test("removes numbered source list at end", () => {
    const text = `Main content.

[1] Source one
[2] Source two`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Main content.");
  });

  test("removes URL list at end", () => {
    const text = `Response text.

https://example.com - Example
https://test.com - Test`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Response text.");
  });

  test("removes section with horizontal rule", () => {
    const text = `Answer here.

---
Sources
https://example.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Answer here.");
  });

  test("removes 'Here are the sources' section", () => {
    const text = `Main answer.

Here are the sources used:
- https://example.com
- https://test.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Main answer.");
  });

  test("removes source links section", () => {
    const text = `Content.

Source links:
https://example.com
https://test.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Content.");
  });

  test("preserves content without source sections", () => {
    const text = "Just regular content with no sources.";
    const result = removeDuplicateSourceSections(text);
    expect(result).toBe(text);
  });

  test("preserves URLs in main content", () => {
    const text =
      "Check out https://example.com for more info.\n\nThis is useful.";
    const result = removeDuplicateSourceSections(text);
    expect(result).toBe(text);
  });

  test("only removes source sections with indicators", () => {
    const text = `Content here.

Some random list:
1. First item
2. Second item`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe(text);
  });

  test("removes citations with accessed/retrieved indicators", () => {
    const text = `Main content.

References:
Retrieved from https://example.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Main content.");
  });

  test("handles multiple newlines before source section", () => {
    const text = `Content.


Sources:
https://example.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Content.");
  });

  test("preserves inline citations in main content", () => {
    const text =
      "According to [1], this is true.\n\nFurther evidence [2] supports this.";
    const result = removeDuplicateSourceSections(text);
    expect(result).toBe(text);
  });

  test("removes bibliography section", () => {
    const text = `Essay content.

Bibliography:
Smith, J. (2023). Title. Available at https://example.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Essay content.");
  });

  test("removes works cited section", () => {
    const text = `Paper text.

Works Cited:
Author. Title. https://example.com`;

    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Paper text.");
  });

  test("handles empty string", () => {
    expect(removeDuplicateSourceSections("")).toBe("");
  });

  test("trims whitespace from result", () => {
    const text = "Content\n\n\nSources:\nhttps://example.com";
    const result = removeDuplicateSourceSections(text);
    expect(result).toBe("Content");
  });
});
