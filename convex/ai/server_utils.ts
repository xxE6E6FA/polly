/**
 * Server-side utilities for Convex backend
 * OpenRouter model sorting
 */

export const applyOpenRouterSorting = (
  modelId: string,
  sorting: "default" | "price" | "throughput" | "latency"
): string => {
  if (sorting === "default") {
    return modelId;
  }

  // Remove any existing shortcuts
  const cleanModelId = modelId.replace(/:nitro$|:floor$/g, "");

  // Apply new shortcut
  const sortingMap = {
    price: ":floor",
    throughput: ":nitro",
    latency: "",
  };

  return `${cleanModelId}${sortingMap[sorting] || ""}`;
};
