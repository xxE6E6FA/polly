import { describe, expect, test } from "bun:test";
import {
  checkModelCapability,
  isFileTypeSupported,
  isImageType,
  isTextType,
  type ModelForCapabilityCheck,
} from "./model-capabilities-config";

describe("isImageType", () => {
  test("returns true for image MIME types", () => {
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("image/jpeg")).toBe(true);
    expect(isImageType("image/webp")).toBe(true);
  });

  test("returns false for non-image types", () => {
    expect(isImageType("text/plain")).toBe(false);
    expect(isImageType("application/pdf")).toBe(false);
    expect(isImageType("video/mp4")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isImageType("")).toBe(false);
  });
});

describe("isTextType", () => {
  test("returns true for text MIME types", () => {
    expect(isTextType("text/plain")).toBe(true);
    expect(isTextType("text/html")).toBe(true);
    expect(isTextType("text/csv")).toBe(true);
  });

  test("returns true for specific application types", () => {
    expect(isTextType("application/json")).toBe(true);
    expect(isTextType("application/xml")).toBe(true);
    expect(isTextType("application/javascript")).toBe(true);
    expect(isTextType("application/typescript")).toBe(true);
    expect(isTextType("application/yaml")).toBe(true);
    expect(isTextType("application/x-yaml")).toBe(true);
  });

  test("returns true for octet-stream (unknown)", () => {
    expect(isTextType("application/octet-stream")).toBe(true);
  });

  test("returns true for empty string", () => {
    expect(isTextType("")).toBe(true);
  });

  test("returns false for non-text types", () => {
    expect(isTextType("image/png")).toBe(false);
    expect(isTextType("application/pdf")).toBe(false);
    expect(isTextType("video/mp4")).toBe(false);
  });
});

describe("checkModelCapability", () => {
  test("returns false when no model provided", () => {
    expect(checkModelCapability("supportsImages")).toBe(false);
  });

  test("returns capability value from model", () => {
    const model: ModelForCapabilityCheck = {
      provider: "openai",
      modelId: "gpt-4o",
      supportsImages: true,
      supportsTools: false,
    };

    expect(checkModelCapability("supportsImages", model)).toBe(true);
    expect(checkModelCapability("supportsTools", model)).toBe(false);
  });

  test("returns false for undefined capability", () => {
    const model: ModelForCapabilityCheck = {
      provider: "openai",
      modelId: "gpt-4o",
    };

    expect(checkModelCapability("supportsImages", model)).toBe(false);
  });

  test("handles different capability types", () => {
    const model: ModelForCapabilityCheck = {
      provider: "anthropic",
      modelId: "claude-3",
      contextLength: 200000,
      supportsReasoning: true,
    };

    expect(checkModelCapability("contextLength", model)).toBe(200000);
    expect(checkModelCapability("supportsReasoning", model)).toBe(true);
  });
});

describe("isFileTypeSupported", () => {
  test("supports image types when model has image capability", () => {
    const model: ModelForCapabilityCheck = {
      provider: "openai",
      modelId: "gpt-4o",
      supportsImages: true,
    };

    const result = isFileTypeSupported("image/png", model);
    expect(result.supported).toBe(true);
    expect(result.category).toBe("image");
  });

  test("does not support image types when model lacks image capability", () => {
    const model: ModelForCapabilityCheck = {
      provider: "groq",
      modelId: "llama-3",
      supportsImages: false,
    };

    const result = isFileTypeSupported("image/png", model);
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });

  test("supports PDF for all models", () => {
    const model: ModelForCapabilityCheck = {
      provider: "groq",
      modelId: "llama-3",
    };

    const result = isFileTypeSupported("application/pdf", model);
    expect(result.supported).toBe(true);
    expect(result.category).toBe("pdf");
  });

  test("supports PDF without model", () => {
    const result = isFileTypeSupported("application/pdf");
    expect(result.supported).toBe(true);
    expect(result.category).toBe("pdf");
  });

  test("supports text types", () => {
    const result = isFileTypeSupported("text/plain");
    expect(result.supported).toBe(true);
    expect(result.category).toBe("text");
  });

  test("supports application/json", () => {
    const result = isFileTypeSupported("application/json");
    expect(result.supported).toBe(true);
    expect(result.category).toBe("text");
  });

  test("does not support unsupported types", () => {
    const result = isFileTypeSupported("video/mp4");
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });

  test("does not support images without model", () => {
    const result = isFileTypeSupported("image/png");
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });
});
