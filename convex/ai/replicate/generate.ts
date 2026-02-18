import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { getApiKey } from "../encryption";
import Replicate from "replicate";
import type { Prediction } from "replicate";
import { getUserFriendlyErrorMessage } from "../error_handlers";
import { scheduleRunAfter } from "../../lib/scheduler";
import { validateFreeModelUsage } from "../../lib/shared_utils";
import {
  convertAspectRatioToDimensions,
  detectAspectRatioSupportFromSchema,
  detectImageInputFromSchema,
  getImageInputConfig,
  isImageEditingModel,
  resolveImageUrlsFromAttachments,
  toMessageDoc,
} from "../replicate_helpers";

type GenerateImageArgs = {
  conversationId: Id<"conversations">;
  messageId: Id<"messages">;
  prompt: string;
  model: string;
  params?: {
    width?: number;
    height?: number;
    aspectRatio?: string;
    steps?: number;
    guidanceScale?: number;
    seed?: number;
    negativePrompt?: string;
    count?: number;
  };
};

export async function generateImageHandler(
  ctx: ActionCtx,
  args: GenerateImageArgs,
) {
  try {
    // Generate random seed if not provided
    const seed = args.params?.seed ?? Math.floor(Math.random() * 2147483647);

    // Check if this is a retry by looking for existing image generation data
    const existingMessage = await ctx.runQuery(
      internal.messages.internalGetByIdQuery,
      {
        id: args.messageId,
      },
    );
    const existingMessageDoc = toMessageDoc(existingMessage);

    const isRetry = Boolean(
      existingMessageDoc?.imageGeneration?.replicateId ||
        existingMessageDoc?.imageGeneration?.status === "failed" ||
        existingMessageDoc?.imageGeneration?.status === "canceled",
    );

    if (isRetry) {
      // Clear previous image generation attachments
      await ctx.runMutation(
        internal.messages.clearImageGenerationAttachments,
        {
          messageId: args.messageId,
        },
      );

      // Reset image generation status
      await ctx.runMutation(internal.messages.updateImageGeneration, {
        messageId: args.messageId,
        status: "starting",
        output: undefined,
        error: undefined,
      });
    }

    // Check if this is a free built-in model
    const builtInModel = await ctx.runQuery(
      internal.imageModels.getBuiltInImageModelByModelId,
      { modelId: args.model },
    );
    const isFreeBuiltInModel = builtInModel?.free === true;

    // For free built-in models, validate user's message limit
    // This applies to both anonymous users and signed-in users using free models
    if (isFreeBuiltInModel) {
      const conversation = await ctx.runQuery(
        internal.conversations.internalGet,
        { id: args.conversationId },
      );
      if (conversation?.userId) {
        const user = await ctx.runQuery(internal.users.internalGetById, {
          id: conversation.userId,
        });
        if (user) {
          // validateFreeModelUsage throws ConvexError if limit reached
          validateFreeModelUsage(user);
        }
      }
    }

    // Get Replicate API key
    // For free built-in models, use server-side key; otherwise require user's key
    let apiKey: string | null = null;

    // First try user's API key (doesn't throw, just returns null if not found)
    try {
      apiKey = await getApiKey(
        ctx,
        "replicate",
        undefined,
        args.conversationId,
      );
    } catch {
      // User doesn't have a Replicate API key, will fall back to server key for free models
      apiKey = null;
    }

    // For free built-in models without user key, use server-side key
    if (!apiKey && isFreeBuiltInModel) {
      const envKey = process.env.REPLICATE_API_KEY;
      if (envKey) {
        apiKey = envKey;
      }
    }

    if (!apiKey) {
      throw new Error(
        isFreeBuiltInModel
          ? "Server Replicate API key not configured. Please contact support."
          : "No Replicate API key found. Please add one in Settings.",
      );
    }

    // Initialize Replicate client
    const replicate = new Replicate({
      auth: apiKey,
    });

    // Determine if the model accepts an image input and prepare input image(s)
    let inputImageUrls: string[] = [];
    let imageInputConfig: {
      paramName: string;
      isArray: boolean;
      isMessage?: boolean;
    } | null = null;
    let aspectRatioMode: "aspect_ratio" | "dimensions" | "none" = "none";
    let modelData: any = null;

    // Resolve model version and introspect schema to detect image input param and aspect ratio support
    try {
      const [owner, name] = args.model.split("/");
      if (!owner || !name) {
        throw new Error("Model must be specified as 'owner/name'");
      }
      modelData = await replicate.models.get(owner, name);

      // Detect image input parameter
      const schemaConfig = detectImageInputFromSchema(modelData);
      if (schemaConfig) {
        imageInputConfig = schemaConfig;
      } else if (isImageEditingModel(args.model)) {
        imageInputConfig = getImageInputConfig(args.model);
      }

      // Detect aspect ratio support from schema
      aspectRatioMode = detectAspectRatioSupportFromSchema(modelData);
    } catch {
      // Fall back to heuristics if version lookup fails
      if (isImageEditingModel(args.model)) {
        imageInputConfig = getImageInputConfig(args.model);
      }

      // Fallback: Check hardcoded list for known models
      const aspectRatioSupportedModels = [
        "black-forest-labs/flux-schnell",
        "black-forest-labs/flux-dev",
        "black-forest-labs/flux-pro",
        "stability-ai/sdxl",
        "stability-ai/stable-diffusion-xl-base-1.0",
        "lucataco/sdxl",
      ];
      if (
        aspectRatioSupportedModels.some((supported) =>
          args.model.includes(supported),
        )
      ) {
        aspectRatioMode = "aspect_ratio";
      } else {
        aspectRatioMode = "dimensions";
      }
    }

    const acceptsImageInput = !!imageInputConfig;

    const resolveUrls = (attachments: any[] | undefined) =>
      resolveImageUrlsFromAttachments(attachments, (id) =>
        ctx.storage.getUrl(id),
      );

    if (acceptsImageInput) {
      // Get conversation messages to find user-uploaded image(s) first,
      // otherwise fall back to the most recent assistant-generated image(s)
      const messages = await ctx.runQuery(
        internal.messages.getAllInConversationInternal,
        {
          conversationId: args.conversationId,
        },
      );

      const assistantMessageIndex = messages.findIndex(
        (msg: any) => msg._id === args.messageId,
      );

      // 1) Prefer the most recent user message (typically the one that triggered this generation)
      if (assistantMessageIndex !== -1) {
        for (let i = assistantMessageIndex - 1; i >= 0; i--) {
          const candidate: any = messages[i];
          if (candidate.role !== "user") {
            continue;
          }

          const urls = await resolveUrls(candidate.attachments);
          if (urls.length > 0) {
            inputImageUrls = urls;
            break;
          }

          // Stop scanning once we hit a user message even if it has no attachments,
          // because older user uploads should not override the latest request.
          break;
        }
      }

      // 2) Fallback: look for the most recent assistant message with generated image(s)
      if (inputImageUrls.length === 0) {
        const startIndex =
          assistantMessageIndex === -1
            ? messages.length - 1
            : assistantMessageIndex - 1;

        for (let i = startIndex; i >= 0; i--) {
          const message: any = messages[i];
          if (message.role !== "assistant" || !message.attachments) {
            continue;
          }

          const attachments = Array.isArray(message.attachments)
            ? message.attachments.filter((att: any) => att?.type === "image")
            : [];

          if (attachments.length === 0) {
            continue;
          }

          const generatedFirst = attachments.filter(
            (att: any) => att.generatedImage?.isGenerated,
          );
          const others = attachments.filter(
            (att: any) => !att.generatedImage?.isGenerated,
          );
          const prioritized = generatedFirst.concat(others);

          const urls = await resolveUrls(prioritized);
          if (urls.length > 0) {
            inputImageUrls = urls;
            break;
          }
        }
      }

      if (inputImageUrls.length === 0) {
        // Note: When no input image is found, editing models typically fall back to generation mode
      }
    }

    // Get the model's input schema to map parameter names correctly
    const inputProps =
      modelData?.latest_version?.openapi_schema?.components?.schemas?.Input
        ?.properties;
    const schemaHasParam = (paramNames: string[]): string | null => {
      if (!inputProps || typeof inputProps !== "object") {
        return null;
      }
      for (const name of paramNames) {
        if (name in inputProps) {
          return name;
        }
      }
      return null;
    };

    // Prepare input parameters - let each model define its own schema
    const input: Record<string, unknown> = {
      prompt: args.prompt,
    };

    // Add input image when the model accepts an image input
    if (imageInputConfig && inputImageUrls.length > 0) {
      if (imageInputConfig.isMessage) {
        // Handle message-based input (e.g. Qwen)
        // Construct a ChatML-style message list
        input[imageInputConfig.paramName] = [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: args.prompt,
              },
              ...inputImageUrls.map((url) => ({
                type: "image_url",
                image_url: {
                  url,
                },
              })),
            ],
          },
        ];
      } else {
        // Handle standard image input
        input[imageInputConfig.paramName] = imageInputConfig.isArray
          ? inputImageUrls
          : inputImageUrls[0];
      }
    }

    // Add optional parameters if provided
    if (args.params) {
      // Handle aspect ratio or dimensions based on model support
      if (args.params.aspectRatio) {
        if (aspectRatioMode === "aspect_ratio") {
          // Model supports aspect_ratio parameter directly
          input.aspect_ratio = args.params.aspectRatio;
        } else if (aspectRatioMode === "dimensions") {
          // Model uses width/height parameters, convert aspect ratio to dimensions
          const dimensions = convertAspectRatioToDimensions(
            args.params.aspectRatio,
          );
          input.width = dimensions.width;
          input.height = dimensions.height;
        } else {
          // Unknown model support, try aspect_ratio first as it's more common
          input.aspect_ratio = args.params.aspectRatio;
        }
      }

      if (args.params.width && !args.params.aspectRatio) {
        input.width = args.params.width;
      }
      if (args.params.height && !args.params.aspectRatio) {
        input.height = args.params.height;
      }

      // Map steps parameter to the actual schema parameter name
      if (args.params.steps) {
        const stepsParam = schemaHasParam([
          "num_inference_steps",
          "steps",
          "num_steps",
          "inference_steps",
          "sampling_steps",
        ]);
        if (stepsParam) {
          input[stepsParam] = args.params.steps;
        }
      }

      // Map guidance parameter to the actual schema parameter name
      if (args.params.guidanceScale) {
        const guidanceParam = schemaHasParam([
          "guidance_scale",
          "guidance",
          "cfg_scale",
          "classifier_free_guidance",
        ]);
        if (guidanceParam) {
          input[guidanceParam] = args.params.guidanceScale;
        }
      }

      // Always include the seed (either user-provided or generated)
      input.seed = seed;

      // Map negative prompt parameter to the actual schema parameter name
      if (args.params.negativePrompt && args.params.negativePrompt.trim()) {
        const negativePromptParam = schemaHasParam([
          "negative_prompt",
          "negative",
          "neg_prompt",
        ]);
        if (negativePromptParam) {
          input[negativePromptParam] = args.params.negativePrompt;
        }
      }

      // Map count parameter to the actual schema parameter name
      if (
        args.params.count &&
        args.params.count >= 1 &&
        args.params.count <= 4
      ) {
        const countParam = schemaHasParam([
          "num_outputs",
          "batch_size",
          "num_images",
        ]);
        if (countParam) {
          input[countParam] = args.params.count;
        }
      }
    }

    // Always disable safety checker for faster generation and to avoid false positives
    // Check if the model has this parameter before setting it
    if (inputProps && "disable_safety_checker" in inputProps) {
      input.disable_safety_checker = true;
    }

    // Prepare prediction body according to API spec
    const predictionBody: Partial<Prediction> = {
      input,
      webhook: process.env.CONVEX_SITE_URL
        ? `${process.env.CONVEX_SITE_URL}/webhooks/replicate`
        : undefined,
      webhook_events_filter: ["start", "completed"],
    };

    // Handle model vs version field according to API spec
    if (args.model.length === 64 && /^[a-f0-9]+$/.test(args.model)) {
      // This is a 64-character version ID
      predictionBody.version = args.model;
    } else {
      // For model names (owner/name format), resolve to latest version
      try {
        const [owner, name] = args.model.split("/");
        if (!owner || !name) {
          throw new Error(
            `Invalid model format: ${args.model}. Use 'owner/name' format.`,
          );
        }

        const resolvedModel = await replicate.models.get(owner, name);
        const latestVersion = resolvedModel.latest_version?.id;

        if (!latestVersion) {
          throw new Error(`No version available for model: ${args.model}`);
        }

        predictionBody.version = latestVersion;
      } catch (error) {
        console.error("Failed to resolve model version", {
          model: args.model,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error(
          `Failed to resolve model: ${args.model}. Please check the model name or provide a version ID.`,
        );
      }
    }

    if (!predictionBody.version) {
      throw new Error("Model version is required");
    }

    // Create prediction using Replicate client
    const prediction = await replicate.predictions.create({
      version: predictionBody.version!,
      input,
      webhook: predictionBody.webhook,
      webhook_events_filter: predictionBody.webhook_events_filter,
    });

    // Get existing metadata and update with the seed we're using
    const existingMessageAfterCreate = await ctx.runQuery(
      internal.messages.internalGetByIdQuery,
      {
        id: args.messageId,
      },
    );
    const existingMsgDoc = toMessageDoc(existingMessageAfterCreate);

    // Store prediction ID and update metadata with the seed
    await ctx.runMutation(internal.messages.updateImageGeneration, {
      messageId: args.messageId,
      replicateId: prediction.id,
      status: prediction.status,
      metadata: {
        ...existingMsgDoc?.imageGeneration?.metadata,
        params: {
          ...existingMsgDoc?.imageGeneration?.metadata?.params,
          seed,
        },
      },
    });

    // Track on conversation for OCC-free stop detection
    await ctx.runMutation(internal.conversations.internalPatch, {
      id: args.conversationId,
      updates: {
        activeImageGeneration: {
          replicateId: prediction.id,
          messageId: args.messageId,
        },
      },
    });

    // Start polling for completion (webhooks are preferred but polling is fallback)
    // Polling will automatically stop if webhook completes the prediction first
    await scheduleRunAfter(ctx, 2000, internal.ai.replicate.pollPrediction, {
      predictionId: prediction.id,
      messageId: args.messageId,
      maxAttempts: 60, // 5 minutes max (5s * 60 = 300s)
      attempt: 1,
    });

    // For free built-in models, increment user's message count towards their monthly limit
    if (isFreeBuiltInModel) {
      const conversation = await ctx.runQuery(
        internal.conversations.internalGet,
        { id: args.conversationId },
      );
      if (conversation?.userId) {
        await scheduleRunAfter(ctx, 50, internal.users.incrementMessage, {
          userId: conversation.userId,
          model: args.model,
          provider: "replicate",
          countTowardsMonthly: true,
        });
      }
    }

    return {
      replicateId: prediction.id,
      status: prediction.status,
    };
  } catch (error) {
    console.error("Image generation failed", { error });

    const friendlyError = getUserFriendlyErrorMessage(error);
    await ctx.runMutation(internal.messages.updateImageGeneration, {
      messageId: args.messageId,
      status: "failed",
      error: friendlyError,
    });

    throw error;
  }
}
