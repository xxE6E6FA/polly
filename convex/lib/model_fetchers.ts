/**
 * Model fetcher utilities for auto-discovering model capabilities.
 *
 * For Replicate: Fetches individual image models with capability data from OpenAPI schema.
 */

import Replicate from "replicate";

// ============================================================================
// TYPES
// ============================================================================

export type ImageModelCapabilities = {
	modelId: string;
	name: string;
	provider: string;
	description: string;
	supportedAspectRatios: string[];
	supportsUpscaling: boolean;
	supportsInpainting: boolean;
	supportsOutpainting: boolean;
	supportsImageToImage: boolean;
	supportsMultipleImages: boolean;
	supportsNegativePrompt: boolean;
	modelVersion: string;
	owner: string;
	tags: string[];
};

// ============================================================================
// REPLICATE - INDIVIDUAL IMAGE MODEL FETCH
// ============================================================================

type ReplicateModel = {
	owner: string;
	name: string;
	description: string | null;
	latest_version?: {
		id: string;
		openapi_schema?: Record<string, unknown>;
	};
	tags?: string[];
	cover_image_url?: string | null;
};

/**
 * Fetch a single Replicate image model by ID.
 * Returns full capability data from OpenAPI schema.
 */
export async function fetchReplicateImageModel(
	modelId: string,
	apiKey: string,
): Promise<ImageModelCapabilities | null> {
	try {
		const replicate = new Replicate({ auth: apiKey });

		const [owner, name] = modelId.split("/");
		if (!(owner && name)) {
			console.error(`Invalid Replicate model ID format: ${modelId}`);
			return null;
		}

		const model = await replicate.models.get(owner, name);

		if (!model) {
			console.error(`Replicate model not found: ${modelId}`);
			return null;
		}

		const rawModel = model as unknown as ReplicateModel;
		const latestVersion = rawModel.latest_version;

		// Determine capabilities from OpenAPI schema
		const supportedAspectRatios = determineAspectRatioSupport(latestVersion);
		const supportsMultipleImages = determineMultipleImageSupport(latestVersion);
		const supportsNegativePrompt = determineNegativePromptSupport(latestVersion);
		const supportsImageToImage = determineImageInputSupport(latestVersion);

		return {
			modelId,
			name: rawModel.name,
			provider: "replicate",
			description: rawModel.description || "",
			supportedAspectRatios,
			supportsUpscaling: false,
			supportsInpainting: false,
			supportsOutpainting: false,
			supportsImageToImage,
			supportsMultipleImages,
			supportsNegativePrompt,
			modelVersion: String(latestVersion?.id || ""),
			owner: rawModel.owner,
			tags: rawModel.tags || [],
		};
	} catch (error) {
		console.error(`Failed to fetch Replicate model ${modelId}:`, error);
		return null;
	}
}

// Helper functions for Replicate capability detection

function determineAspectRatioSupport(
	latestVersion?: ReplicateModel["latest_version"],
): string[] {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return ["use_dimensions"];
	}

	const aspectRatioProperty = inputProperties.aspect_ratio as
		| Record<string, unknown>
		| undefined;
	if (aspectRatioProperty) {
		const aspectRatioEnum = aspectRatioProperty.enum as unknown;
		if (Array.isArray(aspectRatioEnum)) {
			return aspectRatioEnum.filter((item): item is string => typeof item === "string");
		}
		return ["1:1", "16:9", "9:16", "4:3", "3:4"];
	}

	if (inputProperties.width || inputProperties.height) {
		return ["use_dimensions"];
	}

	return ["use_dimensions"];
}

function determineMultipleImageSupport(
	latestVersion?: ReplicateModel["latest_version"],
): boolean {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return false;
	}

	const numOutputsProperty = inputProperties.num_outputs as
		| Record<string, unknown>
		| undefined;
	if (numOutputsProperty) {
		const paramType = numOutputsProperty.type;
		const maximum = numOutputsProperty.maximum as number | undefined;
		if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
			return true;
		}
	}

	const batchSizeProperty = inputProperties.batch_size as
		| Record<string, unknown>
		| undefined;
	if (batchSizeProperty) {
		const paramType = batchSizeProperty.type;
		const maximum = batchSizeProperty.maximum as number | undefined;
		if (paramType === "integer" && (maximum === undefined || maximum > 1)) {
			return true;
		}
	}

	return false;
}

function determineNegativePromptSupport(
	latestVersion?: ReplicateModel["latest_version"],
): boolean {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return false;
	}

	const negativePromptProperty = inputProperties.negative_prompt as
		| Record<string, unknown>
		| undefined;

	if (negativePromptProperty) {
		return negativePromptProperty.type === "string";
	}

	return false;
}

function determineImageInputSupport(
	latestVersion?: ReplicateModel["latest_version"],
): boolean {
	const inputProperties = getInputProperties(latestVersion);
	if (!inputProperties) {
		return false;
	}

	const imageParamNames = [
		"image_input",
		"image_inputs",
		"image",
		"input_image",
		"init_image",
		"reference_image",
		"conditioning_image",
	];

	for (const paramName of imageParamNames) {
		const param = inputProperties[paramName] as Record<string, unknown> | undefined;
		if (param) {
			const paramType = param.type;
			if (paramType === "string" || param.format === "uri" || paramType === "array") {
				return true;
			}
		}
	}

	return false;
}

function getInputProperties(
	latestVersion?: ReplicateModel["latest_version"],
): Record<string, unknown> | undefined {
	const openAPISchema = latestVersion?.openapi_schema;
	const components = openAPISchema?.components as Record<string, unknown> | undefined;
	const schemas = components?.schemas as Record<string, unknown> | undefined;
	const inputSchema = schemas?.Input as Record<string, unknown> | undefined;
	return inputSchema?.properties as Record<string, unknown> | undefined;
}
