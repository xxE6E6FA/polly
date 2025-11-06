import { describe, expect, test } from "bun:test";
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

describe("constants", () => {
  test("user limits are defined correctly", () => {
    expect(MONTHLY_MESSAGE_LIMIT).toBe(500);
    expect(ANONYMOUS_MESSAGE_LIMIT).toBe(10);
    expect(ANONYMOUS_MESSAGE_LIMIT).toBeLessThan(MONTHLY_MESSAGE_LIMIT);
  });

  test("default builtin model is set", () => {
    expect(DEFAULT_BUILTIN_MODEL_ID).toBe("gemini-2.5-flash-lite");
    expect(typeof DEFAULT_BUILTIN_MODEL_ID).toBe("string");
  });

  test("streaming defaults are valid", () => {
    expect(DEFAULT_TEMPERATURE).toBe(0.7);
    expect(DEFAULT_TEMPERATURE).toBeGreaterThan(0);
    expect(DEFAULT_TEMPERATURE).toBeLessThanOrEqual(2);

    expect(DEFAULT_MAX_TOKENS).toBe(-1);
  });

  test("batch processing sizes are positive", () => {
    expect(MESSAGE_BATCH_SIZE).toBe(50);
    expect(MESSAGE_BATCH_SIZE).toBeGreaterThan(0);

    expect(CHUNK_SIZE).toBe(10);
    expect(CHUNK_SIZE).toBeGreaterThan(0);

    expect(BATCH_SIZE).toBe(20);
    expect(BATCH_SIZE).toBeGreaterThan(0);
  });

  test("web search max results is set", () => {
    expect(WEB_SEARCH_MAX_RESULTS).toBe(12);
    expect(WEB_SEARCH_MAX_RESULTS).toBeGreaterThan(0);
  });

  test("image generation defaults are valid", () => {
    expect(IMAGE_GENERATION_DEFAULTS.MODEL).toBe("black-forest-labs/flux-dev");
    expect(IMAGE_GENERATION_DEFAULTS.ASPECT_RATIO).toBe("1:1");
    expect(IMAGE_GENERATION_DEFAULTS.STEPS).toBe(28);
    expect(IMAGE_GENERATION_DEFAULTS.STEPS).toBeGreaterThan(0);

    expect(IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE).toBe(7.5);
    expect(IMAGE_GENERATION_DEFAULTS.GUIDANCE_SCALE).toBeGreaterThan(0);

    expect(IMAGE_GENERATION_DEFAULTS.COUNT).toBe(1);
    expect(IMAGE_GENERATION_DEFAULTS.COUNT).toBeGreaterThan(0);

    expect(IMAGE_GENERATION_DEFAULTS.NEGATIVE_PROMPT).toBe("");
  });

  test("image generation defaults are immutable const", () => {
    expect(IMAGE_GENERATION_DEFAULTS).toBeDefined();
    expect(typeof IMAGE_GENERATION_DEFAULTS).toBe("object");
  });
});
