import { getAuthUserId } from "@convex-dev/auth/server";
import {
  type CoreMessage,
  convertToCoreMessages,
  type FileUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  type ReasoningUIPart,
  streamText,
  type TextUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from "ai";
import { MONTHLY_MESSAGE_LIMIT } from "../shared/constants";
import { getProviderReasoningConfig } from "../shared/reasoning-config";
import { createSmoothStreamTransform } from "../shared/streaming-utils";
import { mergeSystemPrompts } from "../shared/system-prompts";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { CONFIG } from "./ai/config";
import { modelSupportsPdfNatively, shouldExtractPdfText } from "./ai/pdf";
import { createLanguageModel } from "./ai/server_streaming";
import { getBaselineInstructions } from "./constants";
import { incrementUserMessageStats } from "./lib/conversation_utils";

type IncomingUIMessage = UIMessage<unknown, UIDataTypes, UITools> & {
  content?: unknown;
};

type IncomingFilePart =
  | (FileUIPart & { data?: unknown; url?: string })
  | (UIMessagePart<UIDataTypes, UITools> & { mediaType?: string });

const normalizeMessageParts = (
  message: IncomingUIMessage
): UIMessagePart<UIDataTypes, UITools>[] => {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts as UIMessagePart<UIDataTypes, UITools>[];
  }

  if (Array.isArray(message.content)) {
    return message.content as UIMessagePart<UIDataTypes, UITools>[];
  }

  return [];
};

const extractSystemText = (
  parts: UIMessagePart<UIDataTypes, UITools>[]
): string => {
  return parts
    .filter(part => isTextUIPart(part))
    .map(part => (part as TextUIPart).text)
    .join("");
};

const convertFilePartForModel = async (
  ctx: ActionCtx,
  part: IncomingFilePart,
  provider: string,
  modelId: string,
  modelSupportsFiles: boolean
): Promise<Record<string, unknown> | null> => {
  const filePart = part as FileUIPart & { data?: unknown; url?: string };
  const dataSource =
    typeof filePart.url === "string"
      ? filePart.url
      : (filePart as { data?: unknown }).data;

  if (dataSource === undefined || dataSource === null || dataSource === "") {
    return null;
  }

  const mediaType = "mediaType" in part ? part.mediaType : undefined;
  const filename = "filename" in filePart ? filePart.filename : undefined;

  // Handle PDF extraction for models that don't support PDF natively
  if (mediaType === "application/pdf" && typeof dataSource === "string") {
    const needsExtraction = shouldExtractPdfText(
      provider,
      modelId,
      modelSupportsFiles
    );

    if (needsExtraction) {
      try {
        // Extract the storage ID from data URL if present
        // Data URLs for PDFs stored in Convex have format: "convex://storageId"
        let storageId: string | null = null;

        if (dataSource.startsWith("convex://")) {
          storageId = dataSource.replace("convex://", "");
        }

        if (storageId) {
          // Extract PDF text using the server-side action
          const extractionResult = await ctx.runAction(
            api.ai.pdf.extractPdfText,
            {
              storageId: storageId as Id<"_storage">,
              filename: filename || "document.pdf",
            }
          );

          // Return as text part instead of file part
          return {
            type: "text",
            text: extractionResult.text,
          };
        }
      } catch (error) {
        console.error("[chatStream] PDF extraction failed:", error);
        // Fall through to return the file as-is or an error message
        return {
          type: "text",
          text: `[PDF extraction failed for ${filename || "document.pdf"}: ${error instanceof Error ? error.message : "Unknown error"}]`,
        };
      }
    }
  }

  const converted: Record<string, unknown> = {
    type: "file",
    mediaType,
    filename,
  };

  if (
    typeof dataSource === "string" ||
    dataSource instanceof Uint8Array ||
    dataSource instanceof ArrayBuffer
  ) {
    converted.data = dataSource;
  }

  return converted;
};

const coerceUiMessageContent = async (
  ctx: ActionCtx,
  message: IncomingUIMessage,
  provider: string,
  modelId: string,
  modelSupportsFiles: boolean
): Promise<IncomingUIMessage> => {
  if (message.content !== undefined) {
    return message;
  }

  const parts = normalizeMessageParts(message);

  if (message.role === "system") {
    return {
      ...message,
      content: extractSystemText(parts),
    };
  }

  const convertedParts = await Promise.all(
    parts.map(async part => {
      if (isTextUIPart(part)) {
        return {
          type: "text",
          text: (part as TextUIPart).text,
        };
      }

      if (isReasoningUIPart(part)) {
        return {
          type: "reasoning",
          text: (part as ReasoningUIPart).text,
        };
      }

      if (isFileUIPart(part)) {
        return await convertFilePartForModel(
          ctx,
          part as IncomingFilePart,
          provider,
          modelId,
          modelSupportsFiles
        );
      }

      return null;
    })
  );

  const filteredParts = convertedParts.filter(
    (part): part is Record<string, unknown> => part !== null
  );

  return {
    ...message,
    content: filteredParts,
  };
};

export const chatStream = httpAction(
  async (ctx, request): Promise<Response> => {
    const origin = request.headers.get("origin") || "*";
    const reqAllowed =
      request.headers.get("access-control-request-headers") ||
      "Content-Type, Authorization";
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": reqAllowed,
      "Access-Control-Allow-Credentials": "true",
    };
    corsHeaders["Vary"] = "Origin";

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const body = await request.json();
      const {
        messages: rawMessages,
        modelId,
        provider,
        temperature,
        _temperature,
        maxTokens,
        _maxTokens,
        topP,
        _topP,
        frequencyPenalty,
        _frequencyPenalty,
        presencePenalty,
        _presencePenalty,
        reasoningConfig,
        _reasoningConfig,
        personaId,
      } = body;

      if (!rawMessages) {
        return new Response(
          JSON.stringify({ error: "Missing required field: messages" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      if (!modelId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: modelId" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      if (!provider) {
        return new Response(
          JSON.stringify({ error: "Missing required field: provider" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      const uiMessages: IncomingUIMessage[] = Array.isArray(rawMessages)
        ? (rawMessages as IncomingUIMessage[])
        : [];

      // Get model capabilities to determine if we need PDF extraction
      let modelSupportsFiles = false;
      try {
        const modelInfo = await ctx.runQuery(api.userModels.getModelByID, {
          modelId,
          provider,
        });
        modelSupportsFiles = modelInfo?.supportsFiles ?? false;
      } catch (error) {
        console.warn("[chatStream] Failed to get model capabilities:", error);
        // Default to false if we can't get model info
      }

      // Process messages with PDF extraction if needed
      const messagesWithContent = await Promise.all(
        uiMessages.map(msg =>
          coerceUiMessageContent(
            ctx,
            msg,
            provider,
            modelId,
            modelSupportsFiles
          )
        )
      );

      let coreMessages: CoreMessage[];
      try {
        coreMessages = convertToCoreMessages(
          messagesWithContent as UIMessage<unknown, UIDataTypes, UITools>[]
        );
      } catch (conversionError) {
        console.error(
          "[chatStream] Failed to convert UI messages:",
          conversionError
        );
        return new Response(
          JSON.stringify({
            error: "Invalid message format",
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      // Get API key using proper authentication
      let apiKey: string;
      // Check if user is authenticated via JWT token in Authorization header
      const userId = await getAuthUserId(ctx);
      try {
        // Try to get user API key first if authenticated
        let userApiKey: string | null = null;

        // Track message usage stats for authenticated users
        if (userId) {
          try {
            // Check if this is a built-in model by looking it up in the user's models
            const model = await ctx.runQuery(api.userModels.getModelByID, {
              modelId,
              provider,
            });

            const isFreePollyModel = model?.free === true;

            // Check monthly limits for built-in models
            if (isFreePollyModel) {
              const user = await ctx.runQuery(api.users.getById, {
                id: userId,
              });
              if (user && !user.hasUnlimitedCalls) {
                const monthlyLimit = user.monthlyLimit ?? MONTHLY_MESSAGE_LIMIT;
                const monthlyMessagesSent = user.monthlyMessagesSent ?? 0;
                if (monthlyMessagesSent >= monthlyLimit) {
                  return new Response(
                    JSON.stringify({
                      error: "Monthly built-in model message limit reached.",
                    }),
                    {
                      status: 429,
                      headers: {
                        "Content-Type": "application/json",
                        ...corsHeaders,
                      },
                    }
                  );
                }
              }
            }

            // Increment user message stats - model is built-in if it has the 'free' field set to true
            await incrementUserMessageStats(
              ctx,
              userId,
              modelId,
              provider,
              undefined,
              {
                countTowardsMonthly: isFreePollyModel,
              }
            );
          } catch (error) {
            // Don't fail the entire request if stats tracking fails
            console.warn(
              "[chatStream] Failed to increment message stats:",
              error
            );
          }
        }

        if (userId) {
          try {
            userApiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
              provider,
              modelId,
            });
          } catch (error) {
            // User API key lookup failed, will fallback to environment variables
            console.warn("[chatStream] Failed to get user API key:", error);
          }
        } else {
          // User not authenticated, will use environment variables
        }

        if (userApiKey) {
          apiKey = userApiKey;
        } else {
          // Fallback to environment variables
          let envKeyName: string | null = null;
          switch (provider) {
            case "openai":
              envKeyName = "OPENAI_API_KEY";
              break;
            case "anthropic":
              envKeyName = "ANTHROPIC_API_KEY";
              break;
            case "google":
              envKeyName = "GEMINI_API_KEY";
              break;
            case "openrouter":
              envKeyName = "OPENROUTER_API_KEY";
              break;
            default:
              envKeyName = null;
              break;
          }

          if (!envKeyName) {
            throw new Error(`Unsupported provider: ${provider}`);
          }

          const envKey = process.env[envKeyName];

          if (!envKey) {
            // List all available environment variables for debugging
            const _availableKeys = Object.keys(process.env).filter(
              key =>
                key.includes("API_KEY") ||
                key.includes("OPENROUTER") ||
                key.includes("GEMINI") ||
                key.includes("ANTHROPIC") ||
                key.includes("OPENAI")
            );

            throw new Error(
              `No API key found for ${provider}. Please add an API key in Settings or configure ${envKeyName} environment variable.`
            );
          }

          apiKey = envKey;
        }
      } catch (apiKeyError) {
        console.error("Failed to get API key:", apiKeyError);
        return new Response(
          JSON.stringify({
            error:
              apiKeyError instanceof Error
                ? apiKeyError.message
                : `No API key found for provider: ${provider}`,
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            },
          }
        );
      }

      // Get persona prompt and merge with baseline instructions
      let personaPrompt: string | undefined;
      if (personaId) {
        try {
          const persona = await ctx.runQuery(api.personas.get, {
            id: personaId,
          });
          if (persona?.prompt) {
            personaPrompt = persona.prompt;
          }
        } catch (error) {
          console.warn("[chatStream] Failed to load persona:", error);
        }
      }

      // Merge baseline instructions with persona prompt
      const baselineInstructions = getBaselineInstructions(modelId);
      const mergedSystemPrompt = mergeSystemPrompts(
        baselineInstructions,
        personaPrompt
      );

      const resolvedTemperature = temperature ?? _temperature;
      const resolvedTopP = topP ?? _topP;
      const resolvedFrequencyPenalty = frequencyPenalty ?? _frequencyPenalty;
      const resolvedPresencePenalty = presencePenalty ?? _presencePenalty;
      const resolvedMaxTokens = maxTokens ?? _maxTokens;
      const resolvedReasoningConfig = reasoningConfig ?? _reasoningConfig;

      // Ensure messages have proper system prompt
      const processedMessages: CoreMessage[] = [...coreMessages];
      const systemMessage: CoreMessage = {
        role: "system",
        content: mergedSystemPrompt,
      };
      const firstMessage = processedMessages[0];
      if (firstMessage?.role === "system") {
        processedMessages[0] = {
          ...firstMessage,
          content: mergedSystemPrompt,
        };
      } else {
        // Prepend system message if not present
        processedMessages.unshift(systemMessage);
      }

      // Get reasoning configuration for this provider
      const reasoningOptions = getProviderReasoningConfig(
        {
          modelId,
          provider,
          supportsReasoning: true, // We'll assume true for now
        },
        resolvedReasoningConfig
      );

      // Create language model
      try {
        // Use createLanguageModel which handles type compatibility properly
        const languageModel = await createLanguageModel(
          ctx,
          provider,
          modelId,
          apiKey,
          userId ?? undefined
        );

        // Configure streaming options
        const baseOptions = {
          model: languageModel,
          messages: processedMessages,
          temperature: resolvedTemperature,
          topP: resolvedTopP,
          frequencyPenalty: resolvedFrequencyPenalty,
          presencePenalty: resolvedPresencePenalty,
          ...reasoningOptions,
        };

        // Add maxOutputTokens conditionally
        const streamOptions =
          resolvedMaxTokens && resolvedMaxTokens > 0
            ? { ...baseOptions, maxOutputTokens: resolvedMaxTokens }
            : baseOptions;

        // Start streaming
        const result = streamText({
          ...streamOptions,
          experimental_transform: createSmoothStreamTransform(),
        });

        // Return the proper text stream for AI SDK useChat with CORS headers
        // TextStreamChatTransport expects text stream format, so use toTextStreamResponse
        const response = result.toTextStreamResponse();

        // Add CORS headers to the streaming response
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });

        return response;
      } catch (modelCreationError) {
        console.error(
          "[chatStream] Error creating language model or starting stream:",
          {
            error: modelCreationError,
            provider,
            modelId,
            stack:
              modelCreationError instanceof Error
                ? modelCreationError.stack
                : undefined,
          }
        );
        throw modelCreationError;
      }
    } catch (error) {
      console.error("Chat API error:", error);
      console.error(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack trace"
      );

      // Enhanced error logging for debugging
      let requestInfo = {};
      try {
        const requestBody = await request.json();
        requestInfo = {
          provider: requestBody.provider,
          modelId: requestBody.modelId,
          hasTemperature: requestBody._temperature !== undefined,
          hasMaxTokens: requestBody._maxTokens !== undefined,
          hasReasoningConfig: requestBody._reasoningConfig !== undefined,
          messageCount: requestBody.messages?.length,
          personaId: requestBody.personaId,
        };
      } catch {
        // If we can't parse the request body again, just use what we can
      }

      console.error("[chatStream] Detailed error information:", {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : String(error),
        requestInfo,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      console.error("Sending error response:", errorMessage);

      return new Response(
        JSON.stringify({
          error: errorMessage,
          details:
            process.env.NODE_ENV === "development"
              ? {
                  errorType: error?.constructor?.name,
                  stack: error instanceof Error ? error.stack : undefined,
                  ...requestInfo,
                }
              : undefined,
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  }
);
