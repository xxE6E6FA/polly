import { describe, expect, it } from "vitest";
import {
  cleanAttachmentsForConvex,
  cn,
  formatDate,
  generateHeadingId,
  resizeGoogleImageUrl,
  stripCitations,
} from "./utils";

describe("utils", () => {
  it("cn merges class names with tailwind-merge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("formatDate handles today/yesterday/relative dates", () => {
    const now = Date.now();
    expect(formatDate(now)).toBe("Today");
    const yesterday = now - 24 * 60 * 60 * 1000;
    expect(formatDate(yesterday)).toBe("Yesterday");
    const threeDays = now - 3 * 24 * 60 * 60 * 1000;
    expect(formatDate(threeDays)).toBe("3 days ago");
  });

  it("resizeGoogleImageUrl returns original for non-google urls", () => {
    const url = "https://example.com/avatar";
    expect(resizeGoogleImageUrl(url, 96)).toBe(url);
  });

  it("resizeGoogleImageUrl updates size param patterns", () => {
    expect(
      resizeGoogleImageUrl("https://lh3.googleusercontent.com/a/ABC=s300-c", 96)
    ).toBe("https://lh3.googleusercontent.com/a/ABC=s96-c");

    expect(
      resizeGoogleImageUrl("https://lh3.googleusercontent.com/a/ABC=foo", 72)
    ).toBe("https://lh3.googleusercontent.com/a/ABC=s72-c");

    expect(
      resizeGoogleImageUrl("https://lh3.googleusercontent.com/a/ABC", 48)
    ).toBe("https://lh3.googleusercontent.com/a/ABC=s48-c");
  });

  it("generateHeadingId lowercases and strips punctuation", () => {
    expect(generateHeadingId("Hello, World!", "m1")).toBe(
      "m1-heading-hello-world"
    );
  });

  it("stripCitations removes single and grouped citations", () => {
    expect(stripCitations("Text [1]")).toBe("Text");
    expect(stripCitations("A [1][2][3] B")).toBe("A B");
    expect(stripCitations("A [1], [2], [3] B")).toBe("A B");
  });

  it("cleanAttachmentsForConvex returns undefined when empty and echoes attachments", () => {
    expect(cleanAttachmentsForConvex(undefined)).toBeUndefined();
    const atts = [{ type: "text" as const, name: "n", size: 1, url: "u" }];
    expect(cleanAttachmentsForConvex(atts)).toEqual(atts);
  });
});
