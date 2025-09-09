import { describe, expect, it } from "vitest";
import {
  CAPABILITY_REGISTRY,
  generateCapabilityCounts,
  getAllCapabilities,
  getModelCapabilities,
  matchesCapabilityFilters,
} from "./model-capabilities";

describe("model-capabilities", () => {
  const base = { provider: "test", modelId: "m" };

  it("exposes capability registry and all capabilities", () => {
    const all = getAllCapabilities();
    // Should include at least reasoning and images
    expect(all.find(c => c.key === "supportsReasoning")).toBeTruthy();
    expect(CAPABILITY_REGISTRY.supportsImages).toBeDefined();
  });

  it("getModelCapabilities maps enabled flags to descriptors", () => {
    const model = { ...base, supportsReasoning: true, supportsImages: true };
    const caps = getModelCapabilities(model);
    expect(caps.map(c => c.label)).toEqual(
      expect.arrayContaining(["Advanced Reasoning", "Vision"])
    );
  });

  it("matchesCapabilityFilters respects selected filters", () => {
    const model = { ...base, supportsTools: true };
    expect(matchesCapabilityFilters(model, [])).toBe(true);
    expect(matchesCapabilityFilters(model, ["supportsTools"])).toBe(true);
    expect(matchesCapabilityFilters(model, ["supportsFiles"])).toBe(false);
  });

  it("generateCapabilityCounts tallies across models", () => {
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
