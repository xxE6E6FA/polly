import { describe, expect, test } from "bun:test";
import { removeDuplicateSourceSections } from "./text-utils";

describe("removeDuplicateSourceSections", () => {
  test("removes trailing sources sections with URLs", () => {
    const text =
      "Main body content.\n\nSources:\nhttps://example.com\nhttps://example.org";
    expect(removeDuplicateSourceSections(text)).toBe("Main body content.");
  });

  test("keeps text without a sources section", () => {
    const text = "Main body content without sources.";
    expect(removeDuplicateSourceSections(text)).toBe(text);
  });
});
