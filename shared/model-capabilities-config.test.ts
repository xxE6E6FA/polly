import { describe, expect, test } from "bun:test";
import {
  isFileTypeSupported,
  isImageType,
  isTextType,
} from "./model-capabilities-config";

describe("model-capabilities-config", () => {
  test("detects image types", () => {
    expect(isImageType("image/png")).toBe(true);
    expect(isImageType("text/plain")).toBe(false);
  });

  test("detects text-ish types", () => {
    expect(isTextType("text/plain")).toBe(true);
    expect(isTextType("application/json")).toBe(true);
    expect(isTextType("application/octet-stream")).toBe(true);
    expect(isTextType("application/pdf")).toBe(false);
  });

  test("file type support checks", () => {
    const model = { supportsImages: true, supportsFiles: true } as any;
    expect(isFileTypeSupported("image/jpeg", model)).toEqual({
      supported: true,
      category: "image",
    });
    expect(isFileTypeSupported("application/pdf", model)).toEqual({
      supported: true,
      category: "pdf",
    });
    expect(isFileTypeSupported("text/markdown", model)).toEqual({
      supported: true,
      category: "text",
    });
    expect(isFileTypeSupported("application/zip", model)).toEqual({
      supported: false,
      category: "unsupported",
    });
  });
});
