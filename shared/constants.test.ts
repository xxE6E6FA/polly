import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_MESSAGE_LIMIT,
  BATCH_SIZE,
  CHUNK_SIZE,
  DEFAULT_BUILTIN_MODEL_ID,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  IMAGE_GENERATION_DEFAULTS,
  MESSAGE_BATCH_SIZE,
  MONTHLY_MESSAGE_LIMIT,
  WEB_SEARCH_MAX_RESULTS,
} from "./constants";

describe("shared/constants", () => {
  describe("user limits", () => {
    it("has sensible message limits", () => {
      expect(MONTHLY_MESSAGE_LIMIT).toBe(500);
      expect(ANONYMOUS_MESSAGE_LIMIT).toBe(10);
      expect(ANONYMOUS_MESSAGE_LIMIT).toBeLessThan(MONTHLY_MESSAGE_LIMIT);
    });
  });

  describe("model defaults", () => {
    it("has default built-in model", () => {
      expect(DEFAULT_BUILTIN_MODEL_ID).toBe("gemini-2.5-flash-lite");
      expect(typeof DEFAULT_BUILTIN_MODEL_ID).toBe("string");
      expect(DEFAULT_BUILTIN_MODEL_ID.length).toBeGreaterThan(0);
    });

    it("has reasonable streaming defaults", () => {
      expect(DEFAULT_TEMPERATURE).toBe(0.7);
      expect(DEFAULT_TEMPERATURE).toBeGreaterThan(0);
      expect(DEFAULT_TEMPERATURE).toBeLessThanOrEqual(2);

      expect(DEFAULT_MAX_TOKENS).toBe(-1);
    });
  });

  describe("batch processing", () => {
    it("has reasonable batch sizes", () => {
      expect(MESSAGE_BATCH_SIZE).toBe(50);
      expect(CHUNK_SIZE).toBe(10);
      expect(BATCH_SIZE).toBe(20);

      // All should be positive integers
      expect(MESSAGE_BATCH_SIZE).toBeGreaterThan(0);
      expect(CHUNK_SIZE).toBeGreaterThan(0);
      expect(BATCH_SIZE).toBeGreaterThan(0);

      // Chunk size should typically be smaller than batch sizes for efficiency
      expect(CHUNK_SIZE).toBeLessThanOrEqual(BATCH_SIZE);
      expect(CHUNK_SIZE).toBeLessThanOrEqual(MESSAGE_BATCH_SIZE);
    });
  });

  describe("search configuration", () => {
    it("has reasonable search result limit", () => {
      expect(WEB_SEARCH_MAX_RESULTS).toBe(12);
      expect(WEB_SEARCH_MAX_RESULTS).toBeGreaterThan(0);
      expect(WEB_SEARCH_MAX_RESULTS).toBeLessThan(100); // Reasonable upper bound
    });
  });

  describe("image generation defaults", () => {
    it("has valid default model", () => {
      expect(IMAGE_GENERATION_DEFAULTS.MODEL).toBe(
        "black-forest-labs/flux-dev"
      );
      expect(typeof IMAGE_GENERATION_DEFAULTS.MODEL).toBe("string");
    });

    it("has valid aspect ratio", () => {
      expect(IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO).toBe("1:1");
      expect(IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO).toMatch(/^\d+:\d+$/);
    });

    it("has reasonable generation parameters", () => {
      expect(IMAGE_GENERATION_DEFAULTS.STEPS).toBe(28);
      expect(IMAGE_GENERATION_DEFAULTS.STEPS).toBeGreaterThan(0);
      expect(IMAGE_GENERATION_DEFAULTS.STEPS).toBeLessThan(100);

      expect(IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE).toBe(7.5);
      expect(IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE).toBeGreaterThan(0);
      expect(IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE).toBeLessThan(20);

      expect(IMAGE_GENERATION_DEFAULTS.COUNT).toBe(1);
      expect(IMAGE_GENERATION_DEFAULTS.COUNT).toBeGreaterThan(0);
      expect(IMAGE_GENERATION_DEFAULTS.COUNT).toBeLessThan(10);

      expect(IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT).toBe("");
      expect(typeof IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT).toBe("string");
    });

    it("has immutable defaults object", () => {
      // Test that the object is properly typed as const
      const defaults = IMAGE_GENERATION_DEFAULTS;
      expect(typeof defaults).toBe("object");
      expect(defaults).toBeDefined();

      // The const assertion should prevent runtime modification
      // This is more of a TypeScript compile-time feature, but we can test the values
      expect(defaults.MODEL).toBe("black-forest-labs/flux-dev");
      expect(defaults.ASPECT_RATIO).toBe("1:1");
    });
  });
});
