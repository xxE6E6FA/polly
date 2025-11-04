import { describe, expect, test } from "bun:test";
import { getUserFriendlyErrorMessage } from "./browser-errors";

describe("browser-errors", () => {
  test("maps API key errors to user-friendly messages", () => {
    const apiKeyError1 = getUserFriendlyErrorMessage(
      new Error("API key missing")
    );
    const apiKeyError2 = getUserFriendlyErrorMessage(
      new Error("Unauthorized 401")
    );

    expect(apiKeyError1).toBeTruthy();
    expect(apiKeyError2).toBeTruthy();
    expect(apiKeyError1).toBe(apiKeyError2);
    expect(apiKeyError1.length).toBeLessThan(100);
    expect(apiKeyError1.toLowerCase()).not.toContain("unauthorized");
    expect(apiKeyError1.toLowerCase()).not.toContain("401");
  });

  test("maps rate limit errors to user-friendly messages", () => {
    const rateLimitError1 = getUserFriendlyErrorMessage(
      new Error("rate limit exceeded")
    );
    const rateLimitError2 = getUserFriendlyErrorMessage(new Error("HTTP 429"));

    expect(rateLimitError1).toBeTruthy();
    expect(rateLimitError2).toBeTruthy();
    expect(rateLimitError1).toBe(rateLimitError2);
    expect(rateLimitError1.length).toBeLessThan(100);
    expect(rateLimitError1.toLowerCase()).not.toContain("429");
  });

  test("maps network errors to user-friendly messages", () => {
    const networkError1 = getUserFriendlyErrorMessage(
      new Error("fetch failed")
    );
    const networkError2 = getUserFriendlyErrorMessage(
      new Error("network unreachable")
    );

    expect(networkError1).toBeTruthy();
    expect(networkError2).toBeTruthy();
    expect(networkError1).toBe(networkError2);
    expect(networkError1.length).toBeLessThan(100);
  });

  test("maps model errors to user-friendly messages", () => {
    const modelError = getUserFriendlyErrorMessage(
      new Error("model not found")
    );

    expect(modelError).toBeTruthy();
    expect(modelError.length).toBeLessThan(200);
    expect(modelError.toLowerCase()).toContain("model");
  });

  test("maps AbortError to cancellation message", () => {
    const err = new Error("any");
    err.name = "AbortError";
    const result = getUserFriendlyErrorMessage(err);

    expect(result).toBeTruthy();
    expect(result.length).toBeLessThan(50);
    expect(result.toLowerCase()).toContain("cancel");
  });

  test("passes through short user-friendly messages", () => {
    const shortMessage = "Simple message";
    const result = getUserFriendlyErrorMessage(new Error(shortMessage));

    expect(result).toBe(shortMessage);
  });

  test("returns generic message for unknown inputs", () => {
    const result = getUserFriendlyErrorMessage("oops");

    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(100);
  });
});
