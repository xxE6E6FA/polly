import type { Doc } from "../_generated/dataModel";
import { arrayBufferToBase64 } from "../lib/encoding";

export function toMessageDoc(message: unknown): Doc<"messages"> | null {
  return message ? (message as Doc<"messages">) : null;
}

/**
 * Resolve image attachment URLs for use as Replicate model inputs.
 * When a storageId is available, converts to a data URI so format info
 * is preserved — Convex storage URLs lack file extensions, which causes
 * Replicate to reject them with "Invalid image format".
 */
export async function resolveImageUrlsFromAttachments(
  attachments: any[] | undefined,
  storageGetUrl: (storageId: any) => Promise<string | null>,
): Promise<string[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const resolved: string[] = [];
  for (const att of attachments) {
    if (!att || att.type !== "image") {
      continue;
    }

    // When we have a storageId, convert to data URI to ensure format info
    // is preserved. Convex storage URLs lack file extensions, which causes
    // Replicate to fail with "Invalid image format" when validating inputs.
    if (att.storageId) {
      const storageUrl = await storageGetUrl(att.storageId);
      if (storageUrl) {
        try {
          const response = await fetch(storageUrl);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const base64 = arrayBufferToBase64(buffer);
            const mimeType =
              att.mimeType ||
              response.headers.get("content-type") ||
              "image/jpeg";
            resolved.push(`data:${mimeType};base64,${base64}`);
            continue;
          }
        } catch {
          // Fall through to URL-based approach
        }
      }
    }

    if (typeof att.url === "string" && att.url.trim()) {
      resolved.push(att.url);
    }
  }

  return resolved;
}

// Helper function to detect image editing models
export function isImageEditingModel(modelName: string): boolean {
  // Known image editing models from Replicate's image editing collection
  const editingModels = [
    "google/nano-banana",
    "qwen/qwen2-vl",
    "ideogram/ideogram",
    "ideogram/ideogram-v2",
    "ideogram/ideogram-v3",
    "black-forest-labs/flux-depth-pro",
    "black-forest-labs/flux-canny-pro",
    "black-forest-labs/flux-kontext-pro",
    "black-forest-labs/flux-kontext-max",
    "xinntao/gpt-image-1",
    "lucataco/flux-schnell-t2i-adapter",
    "ostris/flux-dev-lora-trainer",
    "lucataco/sd3-medium",
    "cjwbw/controlnet",
    "rossjillian/controlnet",
  ];

  return editingModels.some((editModel) => modelName.includes(editModel));
}

// Try to detect an image input parameter from the model's OpenAPI input schema
export function detectImageInputFromSchema(
  modelData: any,
): { paramName: string; isArray: boolean; isMessage?: boolean } | null {
  try {
    const inputProps =
      modelData?.latest_version?.openapi_schema?.components?.schemas?.Input
        ?.properties;
    if (!inputProps || typeof inputProps !== "object") return null;

    type Candidate = {
      key: string;
      isArray: boolean;
      isMessage: boolean;
      score: number;
    };
    const candidates: Candidate[] = [];

    const prioritize = (key: string): number => {
      const order = [
        "image_input",
        "image_inputs",
        "image",
        "input_image",
        "init_image",
        "reference_image",
        "conditioning_image",
        "messages",
      ];
      const idx = order.findIndex((k) => key.includes(k));
      return idx === -1 ? 999 : idx;
    };

    for (const [key, raw] of Object.entries<any>(inputProps)) {
      const k = key.toLowerCase();
      const desc = String(raw?.description || "").toLowerCase();
      const type = raw?.type;

      // Special handling for "messages" parameter (common in VLMs like Qwen)
      if (k === "messages" && type === "array") {
        candidates.push({
          key,
          isArray: false,
          isMessage: true,
          score: prioritize(k),
        });
        continue;
      }

      // Skip known text-only parameters whose descriptions may mention "image"
      if (k === "prompt" || k === "negative_prompt" || k === "neg_prompt") continue;

      const looksImagey =
        k.includes("image") ||
        desc.includes("image") ||
        desc.includes("img") ||
        desc.includes("photo");
      if (!looksImagey) continue;

      if (type === "array") {
        candidates.push({
          key,
          isArray: true,
          isMessage: false,
          score: prioritize(k),
        });
      } else if (
        type === "string" ||
        raw?.format === "uri" ||
        raw?.format === "binary"
      ) {
        candidates.push({
          key,
          isArray: false,
          isMessage: false,
          score: prioritize(k),
        });
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.score - b.score);
    const bestCandidate = candidates[0];
    if (!bestCandidate) return null;
    return {
      paramName: bestCandidate.key,
      isArray: bestCandidate.isArray,
      isMessage: bestCandidate.isMessage,
    };
  } catch {
    return null;
  }
}

// Helper function to get the appropriate image input parameter name and format for editing models
export function getImageInputConfig(modelName: string): {
  paramName: string;
  isArray: boolean;
  isMessage: boolean;
} {
  // Different models use different parameter names and formats for input images
  if (modelName.includes("nano-banana"))
    return { paramName: "image_input", isArray: true, isMessage: false };
  if (modelName.includes("qwen"))
    return { paramName: "image", isArray: false, isMessage: false };
  if (modelName.includes("ideogram"))
    return { paramName: "image", isArray: false, isMessage: false };
  if (modelName.includes("flux"))
    return { paramName: "image", isArray: false, isMessage: false };
  if (modelName.includes("gpt-image"))
    return { paramName: "image", isArray: false, isMessage: false };
  if (modelName.toLowerCase().includes("seedream"))
    return { paramName: "image_input", isArray: true, isMessage: false };

  // Default fallback
  return { paramName: "image", isArray: false, isMessage: false };
}

// Helper function to convert aspect ratio to width/height dimensions
// Ensures all dimensions are divisible by 8 (required by most AI models)
export function convertAspectRatioToDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  const baseSize = 1024; // Standard size for most models (already divisible by 16)

  // Helper to round to nearest multiple of 16 (some edit models require this)
  const roundToMultipleOf16 = (value: number): number => {
    return Math.round(value / 16) * 16;
  };

  switch (aspectRatio) {
    case "1:1":
      return { width: baseSize, height: baseSize }; // 1024x1024
    case "16:9":
      // 16:9 ratio from 1024 height = 1820x1024, round to 1824x1024 (divisible by 16)
      return {
        width: roundToMultipleOf16(baseSize * (16 / 9)),
        height: baseSize,
      };
    case "9:16":
      // 9:16 ratio from 1024 width = 1024x1820, round to 1024x1824
      return {
        width: baseSize,
        height: roundToMultipleOf16(baseSize * (16 / 9)),
      };
    case "4:3":
      // 4:3 ratio from 1024 height = 1365x1024, round to 1360x1024
      return {
        width: roundToMultipleOf16(baseSize * (4 / 3)),
        height: baseSize,
      };
    case "3:4":
      // 3:4 ratio from 1024 width = 1024x1365, round to 1024x1360
      return {
        width: baseSize,
        height: roundToMultipleOf16(baseSize * (4 / 3)),
      };
    default: {
      // Parse custom ratio like "3:2"
      const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
      if (widthRatio && heightRatio) {
        const ratio = widthRatio / heightRatio;
        if (ratio > 1) {
          // Landscape: fix height, calculate width
          return {
            width: roundToMultipleOf16(baseSize * ratio),
            height: baseSize,
          };
        } else {
          // Portrait: fix width, calculate height
          return {
            width: baseSize,
            height: roundToMultipleOf16(baseSize / ratio),
          };
        }
      }
      // Fallback to square
      return { width: baseSize, height: baseSize };
    }
  }
}

// Helper function to detect aspect ratio support from OpenAPI schema
export function detectAspectRatioSupportFromSchema(
  modelData: any,
): "aspect_ratio" | "dimensions" | "none" {
  try {
    const inputProps =
      modelData?.latest_version?.openapi_schema?.components?.schemas?.Input
        ?.properties;
    if (!inputProps || typeof inputProps !== "object") return "none";

    // Check if model has aspect_ratio parameter
    if (inputProps.aspect_ratio) {
      return "aspect_ratio";
    }

    // Check if model has width/height parameters
    if (inputProps.width || inputProps.height) {
      return "dimensions";
    }

    return "none";
  } catch {
    return "none";
  }
}

/**
 * Get the allowed aspect_ratio enum values from a model's OpenAPI schema.
 * Returns null if there's no enum constraint (any value accepted).
 */
export function getAllowedAspectRatios(modelData: any): string[] | null {
  try {
    const arProp =
      modelData?.latest_version?.openapi_schema?.components?.schemas?.Input
        ?.properties?.aspect_ratio;
    if (!arProp) {
      return null;
    }

    // Search for enum values in all common OpenAPI schema patterns
    const findEnum = (obj: any): string[] | null => {
      if (!obj || typeof obj !== "object") return null;

      // Direct enum
      if (Array.isArray(obj.enum) && obj.enum.length > 0) {
        return obj.enum;
      }

      // allOf / oneOf / anyOf wrappers
      for (const key of ["allOf", "oneOf", "anyOf"] as const) {
        if (Array.isArray(obj[key])) {
          for (const item of obj[key]) {
            const found = findEnum(item);
            if (found) return found;
          }
        }
      }

      return null;
    };

    // Also check the description for patterns like 'must be one of: "1:1", "3:2"'
    const fromSchema = findEnum(arProp);
    if (fromSchema) {
      return fromSchema;
    }

    // Fallback: parse from description string
    if (typeof arProp.description === "string") {
      const matches = arProp.description.match(/["'](\d+:\d+)["']/g);
      if (matches && matches.length > 0) {
        return matches.map((m: string) => m.replace(/["']/g, ""));
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Find the closest allowed aspect ratio to the requested one.
 * Compares numeric ratios (w/h) to find the best match.
 */
export function findClosestAspectRatio(
  requested: string,
  allowed: string[]
): string {
  const toNumeric = (ratio: string): number => {
    const [w, h] = ratio.split(":").map(Number);
    if (w && h) {
      return w / h;
    }
    return 1;
  };

  const target = toNumeric(requested);
  let bestMatch = allowed[0]!;
  let bestDiff = Math.abs(toNumeric(bestMatch) - target);

  for (let i = 1; i < allowed.length; i++) {
    const diff = Math.abs(toNumeric(allowed[i]!) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestMatch = allowed[i]!;
    }
  }

  return bestMatch;
}
