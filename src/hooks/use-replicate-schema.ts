import { api } from "@convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import {
  detectAspectRatioSupport,
  detectImageInput,
  getGuidanceParameter,
  getMaxOutputs,
  getStepsParameter,
  getSupportedAspectRatios,
  type ReplicateModelSchema,
  supportsImageInput,
  supportsMultipleOutputs,
  supportsNegativePrompt,
} from "@/lib/replicate-schema";

type ModelSchemaCache = {
  schema: ReplicateModelSchema;
  timestamp: number;
};

// Cache schemas for 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;
const schemaCache = new Map<string, ModelSchemaCache>();

export type ModelCapabilities = {
  supportsAspectRatio: boolean;
  supportsDimensions: boolean;
  supportsMultipleImages: boolean;
  supportsNegativePrompt: boolean;
  supportsSteps: boolean;
  supportsGuidance: boolean;
  supportsSeed: boolean;
  supportsImageInput: boolean;
  imageInputConfig: {
    paramName: string;
    isArray: boolean;
  } | null;
  maxOutputs: number;
  supportedAspectRatios: string[] | null;
  stepsConfig: {
    name: string;
    min: number;
    max: number;
    default: number;
    step: number;
  } | null;
  guidanceConfig: {
    name: string;
    min: number;
    max: number;
    default: number;
    step: number;
  } | null;
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsAspectRatio: true,
  supportsDimensions: false,
  supportsMultipleImages: false,
  supportsNegativePrompt: false,
  supportsSteps: true,
  supportsGuidance: true,
  supportsSeed: true,
  supportsImageInput: false,
  imageInputConfig: null,
  maxOutputs: 1,
  supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
  stepsConfig: {
    name: "num_inference_steps",
    min: 1,
    max: 50,
    default: 28,
    step: 1,
  },
  guidanceConfig: {
    name: "guidance_scale",
    min: 1,
    max: 20,
    default: 7.5,
    step: 0.5,
  },
};

/**
 * Hook to fetch and parse Replicate model schemas
 * Provides model capabilities derived from the OpenAPI schema
 */
export function useReplicateSchema(modelId: string | undefined) {
  const [schema, setSchema] = useState<ReplicateModelSchema | null>(null);
  const [capabilities, setCapabilities] =
    useState<ModelCapabilities>(DEFAULT_CAPABILITIES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get the user's Replicate API key status
  const apiKeys = useQuery(api.apiKeys.getUserApiKeys);
  const replicateKey = apiKeys?.find(
    key => key.provider === "replicate" && key.hasKey
  );

  // Use the Convex action to fetch schemas (handles API key decryption)
  const fetchSchemaAction = useAction(api.imageModels.fetchModelSchema);

  const fetchSchema = useCallback(
    async (modelId: string) => {
      // Check cache first
      const cached = schemaCache.get(modelId);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setSchema(cached.schema);
        return cached.schema;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchSchemaAction({ modelId });

        if (result.success && result.schema) {
          const fetchedSchema = {
            openapi_schema: result.schema,
          } as ReplicateModelSchema;

          // Cache the schema
          schemaCache.set(modelId, {
            schema: fetchedSchema,
            timestamp: Date.now(),
          });
          setSchema(fetchedSchema);
          return fetchedSchema;
        }

        setError(result.error || "Failed to fetch model schema");
        return null;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [fetchSchemaAction]
  );

  // Fetch schema when model changes and API key is available
  useEffect(() => {
    if (!(modelId && replicateKey?.hasKey)) {
      setSchema(null);
      setCapabilities(DEFAULT_CAPABILITIES);
      return;
    }

    // Check if we have a cached schema first
    const cached = schemaCache.get(modelId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setSchema(cached.schema);
      return;
    }

    // Auto-fetch schema for the selected model
    fetchSchema(modelId).catch(err => {
      console.error("Failed to auto-fetch schema:", err);
    });
  }, [modelId, replicateKey, fetchSchema]);

  // Parse capabilities from schema
  useEffect(() => {
    if (!schema) {
      setCapabilities(DEFAULT_CAPABILITIES);
      return;
    }

    const aspectRatioMode = detectAspectRatioSupport(schema);
    const stepsConfig = getStepsParameter(schema);
    const guidanceConfig = getGuidanceParameter(schema);
    const aspectRatios = getSupportedAspectRatios(schema);
    const imageInputConfig = detectImageInput(schema);

    setCapabilities({
      supportsAspectRatio: aspectRatioMode === "aspect_ratio",
      supportsDimensions: aspectRatioMode === "dimensions",
      supportsMultipleImages: supportsMultipleOutputs(schema),
      supportsNegativePrompt: supportsNegativePrompt(schema),
      supportsSteps: stepsConfig !== null,
      supportsGuidance: guidanceConfig !== null,
      supportsSeed: true, // Most models support seed
      supportsImageInput: supportsImageInput(schema),
      imageInputConfig,
      maxOutputs: getMaxOutputs(schema),
      supportedAspectRatios: aspectRatios,
      stepsConfig,
      guidanceConfig,
    });
  }, [schema]);

  return {
    schema,
    capabilities,
    isLoading,
    error,
    hasApiKey: !!replicateKey?.hasKey,
    fetchSchema,
  };
}

/**
 * Get cached schema without fetching (synchronous)
 */
export function getCachedSchema(modelId: string): ReplicateModelSchema | null {
  const cached = schemaCache.get(modelId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.schema;
  }
  return null;
}

/**
 * Clear schema cache for a specific model or all models
 */
export function clearSchemaCache(modelId?: string) {
  if (modelId) {
    schemaCache.delete(modelId);
  } else {
    schemaCache.clear();
  }
}
