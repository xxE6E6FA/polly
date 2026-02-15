import type { Doc } from "../_generated/dataModel";

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
            const base64 = Buffer.from(buffer).toString("base64");
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
  const baseSize = 1024; // Standard size for most models (already divisible by 8)

  // Helper to round to nearest multiple of 8
  const roundToMultipleOf8 = (value: number): number => {
    return Math.round(value / 8) * 8;
  };

  switch (aspectRatio) {
    case "1:1":
      return { width: baseSize, height: baseSize }; // 1024x1024
    case "16:9":
      // 16:9 ratio from 1024 height = 1820x1024, round to 1824x1024
      return {
        width: roundToMultipleOf8(baseSize * (16 / 9)),
        height: baseSize,
      };
    case "9:16":
      // 9:16 ratio from 1024 width = 1024x1820, round to 1024x1824
      return {
        width: baseSize,
        height: roundToMultipleOf8(baseSize * (16 / 9)),
      };
    case "4:3":
      // 4:3 ratio from 1024 height = 1365x1024, round to 1368x1024
      return {
        width: roundToMultipleOf8(baseSize * (4 / 3)),
        height: baseSize,
      };
    case "3:4":
      // 3:4 ratio from 1024 width = 1024x1365, round to 1024x1368
      return {
        width: baseSize,
        height: roundToMultipleOf8(baseSize * (4 / 3)),
      };
    default: {
      // Parse custom ratio like "3:2"
      const [widthRatio, heightRatio] = aspectRatio.split(":").map(Number);
      if (widthRatio && heightRatio) {
        const ratio = widthRatio / heightRatio;
        if (ratio > 1) {
          // Landscape: fix height, calculate width
          return {
            width: roundToMultipleOf8(baseSize * ratio),
            height: baseSize,
          };
        } else {
          // Portrait: fix width, calculate height
          return {
            width: baseSize,
            height: roundToMultipleOf8(baseSize / ratio),
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
