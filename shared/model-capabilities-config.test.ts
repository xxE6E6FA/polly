import { describe, expect, test } from "bun:test";
import {
  checkModelCapability,
  isAudioType,
  isFileTypeSupported,
  isImageType,
  isTextType,
  isVideoType,
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

  test("returns false for octet-stream without filename", () => {
    expect(isTextType("application/octet-stream")).toBe(false);
  });

  test("returns true for octet-stream with text extension", () => {
    expect(isTextType("application/octet-stream", "script.py")).toBe(true);
    expect(isTextType("application/octet-stream", "data.json")).toBe(true);
  });

  test("returns false for octet-stream with non-text extension", () => {
    expect(isTextType("application/octet-stream", "app.exe")).toBe(false);
  });

  test("returns false for empty string without filename", () => {
    expect(isTextType("")).toBe(false);
  });

  test("returns true for empty string with text extension", () => {
    expect(isTextType("", "readme.md")).toBe(true);
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

  test("does not support video without video modality", () => {
    const result = isFileTypeSupported("video/mp4");
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });

  test("does not support images without model", () => {
    const result = isFileTypeSupported("image/png");
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });

  test("supports audio when model has audio modality", () => {
    const model: ModelForCapabilityCheck = {
      provider: "google",
      modelId: "gemini-2.0-flash",
      inputModalities: ["text", "image", "audio"],
    };

    const result = isFileTypeSupported("audio/mpeg", model);
    expect(result.supported).toBe(true);
    expect(result.category).toBe("audio");
  });

  test("does not support audio without audio modality", () => {
    const model: ModelForCapabilityCheck = {
      provider: "openai",
      modelId: "gpt-4o",
      inputModalities: ["text", "image"],
    };

    const result = isFileTypeSupported("audio/mpeg", model);
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });

  test("supports video when model has video modality", () => {
    const model: ModelForCapabilityCheck = {
      provider: "google",
      modelId: "gemini-2.0-flash",
      inputModalities: ["text", "image", "audio", "video"],
    };

    const result = isFileTypeSupported("video/mp4", model);
    expect(result.supported).toBe(true);
    expect(result.category).toBe("video");
  });

  test("supports text files with octet-stream MIME and code extension", () => {
    const result = isFileTypeSupported(
      "application/octet-stream",
      undefined,
      "script.py"
    );
    expect(result.supported).toBe(true);
    expect(result.category).toBe("text");
  });

  test("rejects unknown binary files", () => {
    const result = isFileTypeSupported(
      "application/octet-stream",
      undefined,
      "app.exe"
    );
    expect(result.supported).toBe(false);
    expect(result.category).toBe("unsupported");
  });
});

describe("isAudioType", () => {
  test("returns true for audio MIME types", () => {
    expect(isAudioType("audio/mpeg")).toBe(true);
    expect(isAudioType("audio/wav")).toBe(true);
    expect(isAudioType("audio/ogg")).toBe(true);
  });

  test("returns true for audio file extensions", () => {
    expect(isAudioType("", "song.mp3")).toBe(true);
    expect(isAudioType("", "voice.m4a")).toBe(true);
  });

  test("returns false for non-audio types", () => {
    expect(isAudioType("video/mp4")).toBe(false);
    expect(isAudioType("image/png")).toBe(false);
  });
});

describe("isVideoType", () => {
  test("returns true for video MIME types", () => {
    expect(isVideoType("video/mp4")).toBe(true);
    expect(isVideoType("video/webm")).toBe(true);
    expect(isVideoType("video/quicktime")).toBe(true);
  });

  test("returns true for video file extensions", () => {
    expect(isVideoType("", "clip.mov")).toBe(true);
    expect(isVideoType("", "video.mp4")).toBe(true);
  });

  test("returns false for non-video types", () => {
    expect(isVideoType("audio/mpeg")).toBe(false);
    expect(isVideoType("image/png")).toBe(false);
  });
});
