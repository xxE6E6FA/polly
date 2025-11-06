import { describe, expect, mock, test } from "bun:test";
import {
  classifyStreamError,
  getUserFriendlyErrorMessage,
  handleStreamOperation,
  handleStreamOperationWithRetry,
  withRetry,
} from "./error_handlers";

describe("classifyStreamError", () => {
  test("classifies message deleted error", () => {
    const error = new Error("Document not found");
    const result = classifyStreamError(error);

    expect(result.type).toBe("MessageDeleted");
    expect(result.isRetryable).toBe(false);
    expect(result.shouldMarkDeleted).toBe(true);
  });

  test("classifies nonexistent document error", () => {
    const error = new Error("nonexistent document");
    const result = classifyStreamError(error);

    expect(result.type).toBe("MessageDeleted");
    expect(result.shouldMarkDeleted).toBe(true);
  });

  test("classifies write conflict error", () => {
    const error = new Error(
      "Documents read from or written to have changed"
    );
    const result = classifyStreamError(error);

    expect(result.type).toBe("WriteConflict");
    expect(result.isRetryable).toBe(true);
    expect(result.shouldMarkDeleted).toBe(false);
  });

  test("classifies abort error by name", () => {
    const error = new Error("Request aborted");
    error.name = "AbortError";
    const result = classifyStreamError(error);

    expect(result.type).toBe("AbortError");
    expect(result.isRetryable).toBe(false);
    expect(result.shouldMarkDeleted).toBe(false);
  });

  test("classifies abort error by message", () => {
    const error = new Error("AbortError: The operation was aborted");
    const result = classifyStreamError(error);

    expect(result.type).toBe("AbortError");
    expect(result.isRetryable).toBe(false);
  });

  test("classifies StoppedByUser error", () => {
    const error = new Error("StoppedByUser");
    const result = classifyStreamError(error);

    expect(result.type).toBe("AbortError");
    expect(result.isRetryable).toBe(false);
  });

  test("classifies unknown error", () => {
    const error = new Error("Some other error");
    const result = classifyStreamError(error);

    expect(result.type).toBe("Unknown");
    expect(result.isRetryable).toBe(false);
    expect(result.shouldMarkDeleted).toBe(false);
  });

  test("handles non-Error objects", () => {
    const result = classifyStreamError("string error");

    expect(result.type).toBe("Unknown");
    expect(result.isRetryable).toBe(false);
  });
});

describe("withRetry", () => {
  test("succeeds on first attempt", async () => {
    const operation = mock(() => Promise.resolve("success"));

    const result = await withRetry(operation);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test("retries on write conflict", async () => {
    let callCount = 0;
    const operation = mock(() => {
      if (callCount++ === 0) {
        return Promise.reject(new Error("Documents read from or written to have changed"));
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(operation, 3, 10);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test("does not retry non-retryable errors", async () => {
    const operation = mock(() =>
      Promise.reject(new Error("Document not found"))
    );

    await expect(withRetry(operation)).rejects.toThrow("Document not found");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  test("respects max attempts", async () => {
    const operation = mock(() =>
      Promise.reject(new Error("Documents read from or written to have changed"))
    );

    await expect(withRetry(operation, 3, 10)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test("applies exponential backoff", async () => {
    let callCount = 0;
    const operation = mock(() => {
      if (callCount++ < 2) {
        return Promise.reject(new Error("Documents read from or written to have changed"));
      }
      return Promise.resolve("success");
    });

    const startTime = Date.now();
    await withRetry(operation, 3, 10);
    const duration = Date.now() - startTime;

    expect(operation).toHaveBeenCalledTimes(3);
    expect(duration).toBeGreaterThanOrEqual(10 + 20);
  });
});

describe("handleStreamOperation", () => {
  test("returns result on success", async () => {
    const operation = mock(() => Promise.resolve("success"));

    const result = await handleStreamOperation(operation);

    expect(result).toBe("success");
  });

  test("calls onMessageDeleted when message is deleted", async () => {
    const operation = mock(() =>
      Promise.reject(new Error("Document not found"))
    );
    const onMessageDeleted = mock(() => {});

    const result = await handleStreamOperation(operation, onMessageDeleted);

    expect(result).toBeNull();
    expect(onMessageDeleted).toHaveBeenCalled();
  });

  test("returns null on write conflict without callback", async () => {
    const operation = mock(() =>
      Promise.reject(new Error("Documents read from or written to have changed"))
    );

    const result = await handleStreamOperation(operation);

    expect(result).toBeNull();
  });

  test("throws on unknown errors", async () => {
    const operation = mock(() => Promise.reject(new Error("Unknown error")));

    await expect(handleStreamOperation(operation)).rejects.toThrow(
      "Unknown error"
    );
  });
});

describe("handleStreamOperationWithRetry", () => {
  test("returns result on success", async () => {
    const operation = mock(() => Promise.resolve("success"));

    const result = await handleStreamOperationWithRetry(operation);

    expect(result).toBe("success");
  });

  test("throws when operation returns null", async () => {
    const operation = mock(() =>
      Promise.reject(new Error("Document not found"))
    );

    await expect(handleStreamOperationWithRetry(operation)).rejects.toThrow(
      "Operation failed due to message deletion or write conflict"
    );
  });
});

describe("getUserFriendlyErrorMessage", () => {
  test("handles 401 unauthorized errors", () => {
    const error = { statusCode: 401, message: "Unauthorized" };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("Authentication");
    expect(message).toContain("API key");
  });

  test("handles 403 forbidden errors with provider", () => {
    const error = {
      statusCode: 403,
      message: "Forbidden",
      url: "https://api.openai.com",
    };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("OpenAI");
    expect(message).toContain("not permitted");
  });

  test("handles model not found errors", () => {
    const error = new Error("Model gpt-5 not found");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("no longer available");
  });

  test("handles write conflict errors", () => {
    const error = new Error(
      "Documents read from or written to have changed"
    );
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("temporary issue");
    expect(message).toContain("try again");
  });

  test("handles rate limit errors", () => {
    const error = new Error("Rate limit exceeded");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("busy");
    expect(message).toContain("wait");
  });

  test("handles timeout errors", () => {
    const error = new Error("Request timed out");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("took too long");
  });

  test("handles network errors", () => {
    const error = new Error("Network error: ECONNREFUSED");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("trouble connecting");
  });

  test("handles context length errors", () => {
    const error = new Error("Context length exceeded");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("too long");
    expect(message).toContain("new conversation");
  });

  test("includes model hint when model is provided", () => {
    const error = {
      statusCode: 404,
      message: "Model not found",
      requestBodyValues: { model: "gpt-4o" },
    };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("gpt-4o");
  });

  test("detects OpenRouter provider", () => {
    const error = {
      message: "Model not available",
      url: "https://openrouter.ai/api/v1",
    };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("OpenRouter");
  });

  test("detects Anthropic provider", () => {
    const error = {
      message: "Unauthorized",
      requestBodyValues: { provider: "anthropic" },
    };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("Anthropic");
  });

  test("detects Google provider", () => {
    const error = {
      message: "Service unavailable",
      url: "https://generativelanguage.googleapis.com",
    };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("Google");
  });

  test("provides generic fallback for unknown errors", () => {
    const error = new Error("Something went wrong");
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("unexpected error");
    expect(message).toContain("try again");
  });

  test("handles non-Error objects", () => {
    const error = "String error";
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("unexpected error");
  });

  test("includes status code in generic errors when available", () => {
    const error = {
      statusCode: 500,
      message: "Internal server error",
    };
    const message = getUserFriendlyErrorMessage(error);

    expect(message).toContain("500");
  });
});
