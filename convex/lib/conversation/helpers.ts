import type { ImageModelInfo } from "../../ai/tools";

/**
 * Map raw DB image model records to the slim shape needed by streaming actions.
 * Returns undefined when the array is empty (no models configured).
 */
export function toImageModelInfos(
  models: Array<{
    modelId: string;
    name: string;
    description?: string;
    supportedAspectRatios?: string[];
    modelVersion?: string;
  }>
): ImageModelInfo[] | undefined {
  if (models.length === 0) {
    return undefined;
  }
  return models.map(m => ({
    modelId: m.modelId,
    name: m.name,
    description: m.description,
    supportedAspectRatios: m.supportedAspectRatios,
    modelVersion: m.modelVersion,
  }));
}
