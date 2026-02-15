import type { ReplicateSearchModel } from "./types";

// Helper function to determine if a model supports aspect_ratio parameter
export function determineAspectRatioSupport(
  model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): string[] {
  const modelId = `${model.owner}/${model.name}`;

  // Check if the model schema has aspect_ratio in input schema
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  const aspectRatioProperty = inputProperties?.aspect_ratio as
    | Record<string, unknown>
    | undefined;
  if (aspectRatioProperty) {
    // Model supports aspect_ratio parameter
    const aspectRatioEnum = aspectRatioProperty.enum as unknown;
    if (Array.isArray(aspectRatioEnum)) {
      return aspectRatioEnum.filter(
        (item): item is string => typeof item === "string"
      );
    }
    // Default supported ratios for models that have aspect_ratio but no enum
    return ["1:1", "16:9", "9:16", "4:3", "3:4"];
  }

  // Check if model has width/height parameters instead
  if (inputProperties?.width || inputProperties?.height) {
    // Model uses width/height, mark it as needing dimension conversion
    return ["use_dimensions"];
  }

  // For models we know support aspect ratio (common Flux and SDXL models)
  const aspectRatioSupportedModels = [
    "black-forest-labs/flux-schnell",
    "black-forest-labs/flux-dev",
    "black-forest-labs/flux-pro",
    "stability-ai/sdxl",
    "stability-ai/stable-diffusion-xl-base-1.0",
    "lucataco/sdxl",
  ];

  if (
    aspectRatioSupportedModels.some(supported => modelId.includes(supported))
  ) {
    return ["1:1", "16:9", "9:16", "4:3", "3:4"];
  }

  // Default to using dimensions for unknown models
  return ["use_dimensions"];
}

// Helper function to determine if a model supports negative prompts
// Based on Replicate's OpenAPI schema documentation: https://replicate.com/docs/reference/openapi#model-schemas
// Models support negative prompts if they have a "negative_prompt" parameter of type "string"
export function determineNegativePromptSupport(
  _model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): boolean {
  // Check if the model schema has negative_prompt parameter in input schema
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  const negativePromptProperty = inputProperties?.negative_prompt as
    | Record<string, unknown>
    | undefined;

  // Check if negative_prompt parameter exists and is of type string
  if (negativePromptProperty) {
    const paramType = negativePromptProperty.type;
    return paramType === "string";
  }

  return false;
}

// Helper function to determine if a model accepts image input (for image-to-image / editing)
// Based on Replicate's OpenAPI schema documentation: https://replicate.com/docs/reference/openapi#model-schemas
export function determineImageInputSupport(
  _model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): boolean {
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  if (!inputProperties || typeof inputProperties !== "object") {
    return false;
  }

  // Look for common image input parameter names
  const imageParamNames = [
    "image_input",
    "image_inputs",
    "image",
    "input_image",
    "init_image",
    "reference_image",
    "conditioning_image",
  ];

  // Check for messages parameter (common in VLMs)
  if (inputProperties.messages) {
    const messagesParam = inputProperties.messages as Record<string, unknown>;
    if (messagesParam.type === "array") {
      return true;
    }
  }

  for (const paramName of imageParamNames) {
    const param = inputProperties[paramName] as
      | Record<string, unknown>
      | undefined;
    if (!param) {
      continue;
    }

    const paramType = param.type;

    // Check for string/uri parameters (single image)
    if (paramType === "string" || param.format === "uri") {
      return true;
    }

    // Check for array of strings/uris (multiple images)
    // We are more permissive here: if it's an array and the name looks like an image input,
    // we assume it accepts images even if the items schema is complex or missing.
    if (paramType === "array") {
      return true;
    }
  }

  // Also check any parameter with "image" in name or description
  for (const [key, raw] of Object.entries(inputProperties)) {
    const param = raw as Record<string, unknown>;
    const k = key.toLowerCase();
    const desc = String(param.description || "").toLowerCase();

    const looksImagey =
      k.includes("image") ||
      desc.includes("image") ||
      desc.includes("img") ||
      desc.includes("photo");

    if (!looksImagey) {
      continue;
    }

    const paramType = param.type;

    if (
      paramType === "string" ||
      param.format === "uri" ||
      paramType === "array"
    ) {
      return true;
    }
  }

  return false;
}

// Helper function to determine if a model supports generating multiple images
// Based on Replicate's OpenAPI schema documentation: https://replicate.com/docs/reference/openapi#model-schemas
// Models support multiple images if they have a "num_outputs" or "batch_size" parameter of type "integer" with maximum > 1
export function determineMultipleImageSupport(
  _model: ReplicateSearchModel,
  latestVersion?: Record<string, unknown>
): boolean {
  // Check if the model schema has num_outputs or batch_size parameter in input schema
  const openAPISchema = latestVersion?.openapi_schema as
    | Record<string, unknown>
    | undefined;
  const components = openAPISchema?.components as
    | Record<string, unknown>
    | undefined;
  const schemas = components?.schemas as Record<string, unknown> | undefined;
  const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
  const inputProperties = inputSchema?.properties as
    | Record<string, unknown>
    | undefined;

  // Look for either num_outputs or batch_size parameter
  const numOutputsProperty = inputProperties?.num_outputs as
    | Record<string, unknown>
    | undefined;
  const batchSizeProperty = inputProperties?.batch_size as
    | Record<string, unknown>
    | undefined;

  // Check num_outputs parameter
  if (numOutputsProperty) {
    const paramType = numOutputsProperty.type;
    const maximum = numOutputsProperty.maximum as number | undefined;

    // Verify it's an integer parameter with maximum > 1 or no maximum limit
    if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
      return true;
    }
  }

  // Check batch_size parameter (some models use this instead)
  if (batchSizeProperty) {
    const paramType = batchSizeProperty.type;
    const maximum = batchSizeProperty.maximum as number | undefined;

    // Verify it's an integer parameter with maximum > 1 or no maximum limit
    if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
      return true;
    }
  }

  // If we can't determine from schema, return false to be conservative
  // Users can still manually enable models and the schema will be populated correctly
  return false;
}
