import { describe, expect, it } from "vitest";
import { getUserFriendlyErrorMessage } from "./browser-errors";

describe("browser-errors", () => {
  it("maps API key errors", () => {
    expect(getUserFriendlyErrorMessage(new Error("API key missing"))).toMatch(
      /API key/
    );
    expect(getUserFriendlyErrorMessage(new Error("Unauthorized 401"))).toMatch(
      /API key/
    );
  });

  it("maps rate limit errors", () => {
    expect(
      getUserFriendlyErrorMessage(new Error("rate limit exceeded"))
    ).toMatch(/Rate limit/);
    expect(getUserFriendlyErrorMessage(new Error("HTTP 429"))).toMatch(
      /Rate limit/
    );
  });

  it("maps network errors", () => {
    expect(getUserFriendlyErrorMessage(new Error("fetch failed"))).toMatch(
      /Network error/
    );
    expect(
      getUserFriendlyErrorMessage(new Error("network unreachable"))
    ).toMatch(/Network error/);
  });

  it("maps model errors", () => {
    expect(getUserFriendlyErrorMessage(new Error("model not found"))).toMatch(
      /no longer available/
    );
  });

  it("maps AbortError", () => {
    const err = new Error("any");
    err.name = "AbortError";
    expect(getUserFriendlyErrorMessage(err)).toBe("Request was cancelled.");
  });

  it("passes through short user-friendly messages", () => {
    expect(getUserFriendlyErrorMessage(new Error("Simple message"))).toBe(
      "Simple message"
    );
  });

  it("returns generic for unknown inputs", () => {
    expect(getUserFriendlyErrorMessage("oops")).toMatch(/unexpected error/);
  });
});
