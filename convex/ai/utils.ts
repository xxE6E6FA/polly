import { humanizeString } from "humanize-ai-lib";
import { CONFIG } from "./config";

export const humanizeText = (text: string): string => {
  const result = humanizeString(text, {
    transformHidden: true,
    transformTrailingWhitespace: true,
    transformNbs: true,
    transformDashes: true,
    transformQuotes: true,
    transformOther: true,
    keyboardOnly: false,
  });
  return result.count > 0 ? result.text : text;
};

export const extractReasoning = (text: string): string => {
  for (const pattern of CONFIG.REASONING_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return "";
};

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
