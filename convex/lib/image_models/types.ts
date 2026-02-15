export interface ReplicateSearchModel {
  owner: string;
  name: string;
  description?: string;
  tags?: string[];
  latestVersion?: {
    id: string;
  };
}

export interface ImageModelResult {
  modelId: string;
  name: string;
  provider: string;
  description: string;
  modelVersion: string;
  owner: string;
  tags: string[];
  supportedAspectRatios: string[];
  supportsUpscaling: boolean;
  supportsInpainting: boolean;
  supportsOutpainting: boolean;
  supportsImageToImage: boolean;
  supportsMultipleImages: boolean;
  supportsNegativePrompt: boolean;
  coverImageUrl?: string;
  exampleImages?: string[];
}
