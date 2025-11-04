import { describe, expect, test } from "bun:test";

import { getUserFriendlyErrorMessage } from "./error_handlers";

describe("getUserFriendlyErrorMessage", () => {
  test("returns provider unavailability message for missing endpoints", () => {
    const message = getUserFriendlyErrorMessage(
      {
        message: "AI_APICallError: No endpoints found for x-ai/grok-4-fast:free.",
        url: "https://openrouter.ai/api/v1/chat/completions",
        requestBodyValues: { model: "x-ai/grok-4-fast:free" },
      }
    );
    expect(message).toMatch(/OpenRouter/i);
    expect(message).toMatch(/grok-4-fast:free/i);
  });

  test("returns connectivity guidance for network errors", () => {
    const message = getUserFriendlyErrorMessage(
      new Error("TypeError: fetch failed (ECONNREFUSED)")
    );
    expect(message).toMatch(/trouble connecting/i);
  });

  test("passes through authentication errors", () => {
    const original = "Authentication failed: invalid credentials";
    const message = getUserFriendlyErrorMessage(new Error(original));
    expect(message).toMatch(/invalid credentials/);
    expect(message).toMatch(/Authentication/);
  });

  test("returns authentication guidance when status code is 401", () => {
    const message = getUserFriendlyErrorMessage({
      message: "Unauthorized",
      statusCode: 401,
      url: "https://api.openai.com/v1/chat",
      requestBodyValues: { model: "gpt-4o" },
    });
    expect(message).toMatch(/OpenAI/i);
    expect(message).toMatch(/API key/i);
  });
});
