import {
  BrainIcon,
  EyeIcon,
  Image as ImageIcon,
  UploadIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { ModelCapability, ModelForCapabilities } from "@/types";
import {
  checkModelCapability,
  type ModelForCapabilityCheck,
} from "../../shared/model-capabilities-config";

export type CapabilityKey =
  | "supportsReasoning"
  | "supportsImages"
  | "supportsTools"
  | "supportsFiles"
  | "supportsImageGeneration";

export interface CapabilityDefinition {
  key: CapabilityKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  checkCapability: (model?: ModelForCapabilities) => boolean;
}

function createCapabilityChecker(capability: CapabilityKey) {
  return (model?: ModelForCapabilities): boolean => {
    return checkModelCapability(capability, model as ModelForCapabilityCheck);
  };
}

export const CAPABILITY_REGISTRY: Record<CapabilityKey, CapabilityDefinition> =
  {
    supportsReasoning: {
      key: "supportsReasoning",
      label: "Advanced Reasoning",
      description: "Chain-of-thought and complex reasoning",
      icon: BrainIcon,
      checkCapability: createCapabilityChecker("supportsReasoning"),
    },
    supportsImages: {
      key: "supportsImages",
      label: "Vision",
      description: "Can analyze images and visual content",
      icon: EyeIcon,
      checkCapability: createCapabilityChecker("supportsImages"),
    },
    supportsTools: {
      key: "supportsTools",
      label: "Tools",
      description: "Can call functions and use external tools",
      icon: WrenchIcon,
      checkCapability: createCapabilityChecker("supportsTools"),
    },
    supportsFiles: {
      key: "supportsFiles",
      label: "File Upload",
      description: "Can process file uploads",
      icon: UploadIcon,
      checkCapability: createCapabilityChecker("supportsFiles"),
    },
    supportsImageGeneration: {
      key: "supportsImageGeneration",
      label: "Image Generation",
      description: "Can generate images from text prompts",
      icon: ImageIcon,
      checkCapability: createCapabilityChecker("supportsImageGeneration"),
    },
  };

export function getAllCapabilities(): CapabilityDefinition[] {
  return Object.values(CAPABILITY_REGISTRY);
}

export function getModelCapabilities(
  model: ModelForCapabilities
): ModelCapability[] {
  return getAllCapabilities()
    .filter(capability => capability.checkCapability(model))
    .map(capability => ({
      icon: capability.icon,
      label: capability.label,
      description: capability.description,
    }));
}

export function matchesCapabilityFilters(
  model: ModelForCapabilities,
  selectedCapabilities: string[]
): boolean {
  if (selectedCapabilities.length === 0) {
    return true;
  }

  return selectedCapabilities.every(capabilityKey => {
    const capability = CAPABILITY_REGISTRY[capabilityKey as CapabilityKey];
    return capability?.checkCapability(model) ?? false;
  });
}

export function generateCapabilityCounts(
  models: ModelForCapabilities[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  getAllCapabilities().forEach(capability => {
    counts[capability.key] = models.filter(model =>
      capability.checkCapability(model)
    ).length;
  });

  return counts;
}
