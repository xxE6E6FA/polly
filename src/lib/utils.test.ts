import { describe, expect, test } from "bun:test";
import {
  formatDate,
  generateHeadingId,
  resizeGoogleImageUrl,
  stripCitations,
} from "./utils";

describe("utils: formatDate", () => {
  test("today", () => {
    const now = new Date();
    expect(formatDate(now)).toBe("Today");
  });

  test("yesterday", () => {
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(formatDate(d)).toBe("Yesterday");
  });

  test("n days ago (< 7)", () => {
    const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    expect(formatDate(d)).toBe("3 days ago");
  });
});

describe("utils: resizeGoogleImageUrl", () => {
  test("non-google url unchanged", () => {
    const url = "https://example.com/image.png";
    expect(resizeGoogleImageUrl(url, 96)).toBe(url);
  });

  test("adds size when missing", () => {
    const url = "https://lh3.googleusercontent.com/abc";
    expect(resizeGoogleImageUrl(url, 96)).toBe(`${url}=s96-c`);
  });

  test("replaces existing size", () => {
    const url = "https://lh3.googleusercontent.com/abc=s300-c";
    expect(resizeGoogleImageUrl(url, 96)).toBe(
      "https://lh3.googleusercontent.com/abc=s96-c"
    );
  });
});

describe("utils: stripCitations", () => {
  test("removes single and grouped citations and squashes spaces", () => {
    const text = "This is a test [1] with groups [2][3] and more [4].";
    expect(stripCitations(text)).toBe("This is a test with groups and more.");
  });
});

describe("utils: generateHeadingId", () => {
  test("generates stable kebab id", () => {
    expect(generateHeadingId("Hello, World!", "msg123")).toBe(
      "msg123-heading-hello-world"
    );
  });
});
