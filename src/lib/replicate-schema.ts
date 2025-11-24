/**
 * Replicate Model Schema Utilities
 *
 * Provides utilities for fetching and parsing Replicate model OpenAPI schemas
 * to dynamically generate UI controls based on each model's actual parameters.
 *
 * Based on: https://replicate.com/docs/reference/openapi
 */

export type SchemaPropertyType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array";

export type SchemaProperty = {
  type: SchemaPropertyType;
  title?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  step?: number;
  enum?: string[];
  pattern?: string;
  items?: {
    type?: string;
    enum?: string[];
  };
  "x-order"?: number;
};

export type ModelInputSchema = {
  properties: Record<string, SchemaProperty>;
  required?: string[];
};

export type ReplicateModelSchema = {
  openapi_schema?: {
    components?: {
      schemas?: {
        Input?: ModelInputSchema;
        Output?: Record<string, unknown>;
      };
    };
  };
};

/**
 * Fetch the OpenAPI schema for a Replicate model
 */
export async function fetchReplicateModelSchema(
  modelId: string,
  apiKey: string
): Promise<ReplicateModelSchema | null> {
  try {
    const [owner, name] = modelId.split("/");
    if (!(owner && name)) {
      console.error("Invalid model ID format. Expected owner/name");
      return null;
    }

    const response = await fetch(
      `https://api.replicate.com/v1/models/${owner}/${name}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch model schema: ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as {
      latest_version?: ReplicateModelSchema;
    };
    return data.latest_version || null;
  } catch (error) {
    console.error("Error fetching Replicate model schema:", error);
    return null;
  }
}

/**
 * Get the input properties from a model schema
 */
export function getInputProperties(
  schema: ReplicateModelSchema | null
): Record<string, SchemaProperty> {
  return schema?.openapi_schema?.components?.schemas?.Input?.properties || {};
}

/**
 * Get required input fields from a model schema
 */
export function getRequiredFields(
  schema: ReplicateModelSchema | null
): string[] {
  return schema?.openapi_schema?.components?.schemas?.Input?.required || [];
}

/**
 * Check if a property exists in the schema
 */
export function hasProperty(
  schema: ReplicateModelSchema | null,
  propertyName: string
): boolean {
  const properties = getInputProperties(schema);
  return propertyName in properties;
}

/**
 * Get a specific property from the schema
 */
export function getProperty(
  schema: ReplicateModelSchema | null,
  propertyName: string
): SchemaProperty | null {
  const properties = getInputProperties(schema);
  return properties[propertyName] || null;
}

/**
 * Detect aspect ratio support in a model
 * Returns: "aspect_ratio" if model has aspect_ratio param,
 *          "dimensions" if model has width/height params,
 *          "none" otherwise
 */
export function detectAspectRatioSupport(
  schema: ReplicateModelSchema | null
): "aspect_ratio" | "dimensions" | "none" {
  const properties = getInputProperties(schema);

  if ("aspect_ratio" in properties) {
    return "aspect_ratio";
  }

  if ("width" in properties || "height" in properties) {
    return "dimensions";
  }

  return "none";
}

/**
 * Get supported aspect ratios from model schema
 */
export function getSupportedAspectRatios(
  schema: ReplicateModelSchema | null
): string[] | null {
  const aspectRatioProp = getProperty(schema, "aspect_ratio");

  if (!aspectRatioProp) {
    return null;
  }

  // If the property has an enum, return those values
  if (aspectRatioProp.enum && Array.isArray(aspectRatioProp.enum)) {
    return aspectRatioProp.enum;
  }

  // Default set of common aspect ratios
  return ["1:1", "16:9", "9:16", "4:3", "3:4"];
}

/**
 * Detect if model supports multiple image outputs
 */
export function supportsMultipleOutputs(
  schema: ReplicateModelSchema | null
): boolean {
  const properties = getInputProperties(schema);

  // Check for num_outputs parameter
  const numOutputs = properties.num_outputs;
  if (numOutputs && numOutputs.type === "integer") {
    const max = numOutputs.maximum;
    return max === undefined || max > 1;
  }

  // Check for batch_size parameter (alternative naming)
  const batchSize = properties.batch_size;
  if (batchSize && batchSize.type === "integer") {
    const max = batchSize.maximum;
    return max === undefined || max > 1;
  }

  return false;
}

/**
 * Get the maximum number of outputs supported by the model
 */
export function getMaxOutputs(schema: ReplicateModelSchema | null): number {
  const properties = getInputProperties(schema);

  // Check num_outputs first
  const numOutputs = properties.num_outputs;
  if (numOutputs && typeof numOutputs.maximum === "number") {
    return numOutputs.maximum;
  }

  // Check batch_size as fallback
  const batchSize = properties.batch_size;
  if (batchSize && typeof batchSize.maximum === "number") {
    return batchSize.maximum;
  }

  // Default to 4 if no maximum is specified but the parameter exists
  if (numOutputs || batchSize) {
    return 4;
  }

  return 1;
}

/**
 * Detect if model supports negative prompts
 */
export function supportsNegativePrompt(
  schema: ReplicateModelSchema | null
): boolean {
  const negativePromptProp = getProperty(schema, "negative_prompt");
  return negativePromptProp !== null && negativePromptProp.type === "string";
}

/**
 * Get parameter details for inference steps
 */
export function getStepsParameter(schema: ReplicateModelSchema | null): {
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
} | null {
  const properties = getInputProperties(schema);

  // Try common parameter names
  const paramNames = [
    "num_inference_steps",
    "steps",
    "num_steps",
    "inference_steps",
  ];

  for (const paramName of paramNames) {
    const param = properties[paramName];
    if (param && (param.type === "integer" || param.type === "number")) {
      return {
        name: paramName,
        min: typeof param.minimum === "number" ? param.minimum : 1,
        max: typeof param.maximum === "number" ? param.maximum : 50,
        default: typeof param.default === "number" ? param.default : 28,
        step: param.step || 1,
      };
    }
  }

  return null;
}

/**
 * Get parameter details for guidance scale
 */
export function getGuidanceParameter(schema: ReplicateModelSchema | null): {
  name: string;
  min: number;
  max: number;
  default: number;
  step: number;
} | null {
  const properties = getInputProperties(schema);

  // Try common parameter names
  const paramNames = [
    "guidance_scale",
    "guidance",
    "cfg_scale",
    "classifier_free_guidance",
  ];

  for (const paramName of paramNames) {
    const param = properties[paramName];
    if (param && (param.type === "number" || param.type === "integer")) {
      return {
        name: paramName,
        min: typeof param.minimum === "number" ? param.minimum : 1,
        max: typeof param.maximum === "number" ? param.maximum : 20,
        default: typeof param.default === "number" ? param.default : 7.5,
        step: param.step || 0.5,
      };
    }
  }

  return null;
}

/**
 * Get parameter details for seed
 */
export function getSeedParameter(schema: ReplicateModelSchema | null): {
  name: string;
  min?: number;
  max?: number;
  default?: number;
} | null {
  const properties = getInputProperties(schema);

  const param = properties.seed;
  if (!param || (param.type !== "integer" && param.type !== "number")) {
    return null;
  }

  return {
    name: "seed",
    min: typeof param.minimum === "number" ? param.minimum : undefined,
    max: typeof param.maximum === "number" ? param.maximum : undefined,
    default: typeof param.default === "number" ? param.default : undefined,
  };
}

/**
 * Sort properties by x-order for consistent UI display
 */
export function sortPropertiesByOrder(
  properties: Record<string, SchemaProperty>
): [string, SchemaProperty][] {
  return Object.entries(properties).sort((a, b) => {
    const orderA = a[1]["x-order"] ?? 999;
    const orderB = b[1]["x-order"] ?? 999;
    return orderA - orderB;
  });
}

/**
 * Map common parameter names to standardized names
 */
export function normalizeParameterName(paramName: string): string {
  const mapping: Record<string, string> = {
    num_inference_steps: "steps",
    inference_steps: "steps",
    num_steps: "steps",
    guidance_scale: "guidance",
    cfg_scale: "guidance",
    classifier_free_guidance: "guidance",
    num_outputs: "count",
    batch_size: "count",
  };

  return mapping[paramName] || paramName;
}

/**
 * Detect if model accepts image input (for image-to-image / editing)
 * Returns the parameter name and whether it expects an array
 */
export function detectImageInput(schema: ReplicateModelSchema | null): {
  paramName: string;
  isArray: boolean;
  isMessage?: boolean;
} | null {
  const properties = getInputProperties(schema);

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
      "messages", // Prioritize messages if it exists and looks like a chat input
    ];
    const idx = order.findIndex(k => key.includes(k));
    return idx === -1 ? 999 : idx;
  };

  for (const [key, prop] of Object.entries(properties)) {
    const k = key.toLowerCase();
    const desc = String(prop.description || "").toLowerCase();

    // Special handling for "messages" parameter (common in VLMs like Qwen)
    if (k === "messages" && prop.type === "array") {
      // Check if it looks like a chat input
      candidates.push({
        key,
        isArray: false, // It's a single "messages" param, not an array of images
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

    if (!looksImagey) {
      continue;
    }

    // Check for array of images
    // We are more permissive here: if it's an array and the name looks like an image input,
    // we assume it accepts images even if the items schema is complex or missing.
    if (prop.type === "array") {
      candidates.push({
        key,
        isArray: true,
        isMessage: false,
        score: prioritize(k),
      });
    } else if (
      prop.type === "string" ||
      (prop as unknown as Record<string, unknown>).format === "uri" ||
      (prop as unknown as Record<string, unknown>).format === "binary"
    ) {
      candidates.push({
        key,
        isArray: false,
        isMessage: false,
        score: prioritize(k),
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.score - b.score);
  const bestCandidate = candidates[0];

  if (!bestCandidate) {
    return null;
  }

  return {
    paramName: bestCandidate.key,
    isArray: bestCandidate.isArray,
    isMessage: bestCandidate.isMessage,
  };
}

/**
 * Check if model supports image-to-image / editing
 */
export function supportsImageInput(
  schema: ReplicateModelSchema | null
): boolean {
  return detectImageInput(schema) !== null;
}
