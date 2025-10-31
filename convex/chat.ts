import { getAuthUserId } from "@convex-dev/auth/server";
import {
  type CoreMessage,
  convertToCoreMessages,
  type FileUIPart,
  isFileUIPart,
  isReasoningUIPart,
  isTextUIPart,
  type ReasoningUIPart,
  smoothStream,
  streamText,
  type TextUIPart,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from "ai";
import { MONTHLY_MESSAGE_LIMIT } from "../shared/constants";
import { getProviderReasoningConfig } from "../shared/reasoning-config";
import { mergeSystemPrompts } from "../shared/system-prompts";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { CONFIG } from "./ai/config";
import { createLanguageModel } from "./ai/server_streaming";
import { getBaselineInstructions } from "./constants";
import { incrementUserMessageStats } from "./lib/conversation_utils";
import { log } from "./lib/logger";

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

const convertFilePartForModel = (part: IncomingFilePart) => {
  const filePart = part as FileUIPart & { data?: unknown; url?: string };
  const dataSource =
    typeof filePart.url === "string"
      ? filePart.url
      : (filePart as { data?: unknown }).data;

  if (dataSource === undefined || dataSource === null || dataSource === "") {
    return null;
  }

  const converted: Record<string, unknown> = {
    type: "file",
    mediaType: "mediaType" in part ? part.mediaType : undefined,
    filename: "filename" in filePart ? filePart.filename : undefined,
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

const coerceUiMessageContent = (
  message: IncomingUIMessage
): IncomingUIMessage => {
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

  const convertedParts = parts
    .map(part => {
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
        return convertFilePartForModel(part as IncomingFilePart);
      }

      return null;
    })
    .filter((part): part is Record<string, unknown> => part !== null);

  return {
    ...message,
    content: convertedParts,
  };
};

export const chatStream = httpAction(
  async (ctx, request): Promise<Response> => {
    // Log request details for debugging 404 errors
    log.debug("[chatStream] Request received", {
      method: request.method,
      url: request.url,
      pathname: new URL(request.url).pathname,
      hasBody: !!request.body,
    });

    // Relaxed CORS: reflect Origin and allow credentials for cookie-based auth
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
      log.debug("[chatStream] Request body received", {
        hasMessages: !!body.messages,
        messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
        modelId: body.modelId,
        provider: body.provider,
        hasTemperature: body.temperature !== undefined,
      });
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

      log.debug("[chatStream] Processing messages", {
        uiMessageCount: uiMessages.length,
        firstMessageRole: uiMessages[0]?.role,
        lastMessageRole: uiMessages[uiMessages.length - 1]?.role,
      });

      const messagesWithContent = uiMessages.map(coerceUiMessageContent);

      let coreMessages: CoreMessage[];
      try {
        coreMessages = convertToCoreMessages(
          messagesWithContent as UIMessage<unknown, UIDataTypes, UITools>[]
        );
        log.debug("[chatStream] Converted to core messages", {
          coreMessageCount: coreMessages.length,
        });
      } catch (conversionError) {
        log.error(
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
            log.warn("[chatStream] Failed to increment message stats:", error);
          }
        }

        if (userId) {
          try {
            userApiKey = await ctx.runAction(api.apiKeys.getDecryptedApiKey, {
              provider,
              modelId,
            });
            log.info(
              "[chatStream] User API key lookup:",
              userApiKey ? "found" : "not found"
            );
          } catch (error) {
            // User API key lookup failed, will fallback to environment variables
            log.warn("[chatStream] Failed to get user API key:", error);
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
          log.info(
            `[chatStream] Checking environment variable ${envKeyName}:`,
            envKey ? "found" : "not found"
          );

          if (!envKey) {
            // List all available environment variables for debugging
            const availableKeys = Object.keys(process.env).filter(
              key =>
                key.includes("API_KEY") ||
                key.includes("OPENROUTER") ||
                key.includes("GEMINI") ||
                key.includes("ANTHROPIC") ||
                key.includes("OPENAI")
            );
            log.debug(
              "[chatStream] Available API-related env vars:",
              availableKeys
            );

            throw new Error(
              `No API key found for ${provider}. Please add an API key in Settings or configure ${envKeyName} environment variable.`
            );
          }

          apiKey = envKey;
        }
      } catch (apiKeyError) {
        log.error("Failed to get API key:", apiKeyError);
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
          log.warn("[chatStream] Failed to load persona:", error);
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
      const processedMessages = [...coreMessages];
      if (
        processedMessages.length > 0 &&
        processedMessages[0].role === "system"
      ) {
        processedMessages[0] = {
          ...processedMessages[0],
          content: mergedSystemPrompt,
        };
      } else {
        // Prepend system message if not present
        processedMessages.unshift({
          role: "system",
          content: mergedSystemPrompt,
        });
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
          // biome-ignore lint/style/useNamingConvention: AI SDK uses this naming
          experimental_transform: smoothStream({
            delayInMs: CONFIG.PERF.SMOOTH_STREAM_DELAY_MS,
            chunking: /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]|\S+\s+/,
          }),
        });

        log.debug("[chatStream] Stream started, creating response");

        // Return the proper text stream for AI SDK useChat with CORS headers
        // TextStreamChatTransport expects text stream format, so use toTextStreamResponse
        const response = result.toTextStreamResponse();

        // Add CORS headers to the streaming response
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });

        log.debug("[chatStream] Response created, returning stream");

        return response;
      } catch (modelCreationError) {
        log.error(
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
      log.error("Chat API error:", error);
      log.error(
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

      log.error("[chatStream] Detailed error information:", {
        errorType: error?.constructor?.name,
        errorMessage: error instanceof Error ? error.message : String(error),
        requestInfo,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      log.error("Sending error response:", errorMessage);

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
