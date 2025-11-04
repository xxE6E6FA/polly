import { describe, expect, test } from "bun:test";
import {
  CAPABILITY_REGISTRY,
  generateCapabilityCounts,
  getAllCapabilities,
  getModelCapabilities,
  matchesCapabilityFilters,
} from "./model-capabilities";

describe("model-capabilities", () => {
  const base = { provider: "test", modelId: "m" };

  test("exposes capability registry and all capabilities", () => {
    const all = getAllCapabilities();
    // Should include at least reasoning and images
    expect(all.find(c => c.key === "supportsReasoning")).toBeTruthy();
    expect(CAPABILITY_REGISTRY.supportsImages).toBeDefined();
  });

  test("getModelCapabilities maps enabled flags to descriptors", () => {
    const model = { ...base, supportsReasoning: true, supportsImages: true };
    const caps = getModelCapabilities(model);
    expect(caps.map(c => c.label)).toEqual(
      expect.arrayContaining(["Advanced Reasoning", "Vision"])
    );
  });

  test("matchesCapabilityFilters respects selected filters", () => {
    const model = { ...base, supportsTools: true };
    expect(matchesCapabilityFilters(model, [])).toBe(true);
    expect(matchesCapabilityFilters(model, ["supportsTools"])).toBe(true);
    expect(matchesCapabilityFilters(model, ["supportsFiles"])).toBe(false);
  });

  test("generateCapabilityCounts tallies across models", () => {
    const models = [
      { ...base, modelId: "a", supportsImages: true },
      { ...base, modelId: "b", supportsImages: false, supportsFiles: true },
    ];
    const counts = generateCapabilityCounts(
      models as unknown as Array<{
        provider: string;
        modelId: string;
        supportsImages?: boolean;
        supportsFiles?: boolean;
      }>
    );
    expect(counts.supportsImages).toBe(1);
    expect(counts.supportsFiles).toBe(1);
  });
});
