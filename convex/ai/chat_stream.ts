import { getAuthUserId } from "../lib/auth";
import {
  convertToModelMessages,
  type ModelMessage,
  stepCountIs,
  streamText,
  type UIDataTypes,
  type UIMessage,
  type UITools,
} from "ai";
import { getProviderReasoningConfig } from "../../shared/reasoning-config";
import { createSmoothStreamTransform } from "../../shared/streaming-utils";
import { mergeSystemPrompts } from "../../shared/system-prompts";
import { api } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { getBaselineInstructions } from "../constants";
import type { Id } from "../_generated/dataModel";
import type { ProviderType } from "../types";
import {
  type IncomingUIMessage,
  buildCorsHeaders,
  coerceUiMessageContent,
  jsonErrorResponse,
  maybeInjectSearchContext,
  resolveApiKey,
} from "./chat_helpers";
import { createLanguageModel } from "./server_streaming";
import { createWebSearchTool } from "./tools";

export const chatStream = httpAction(
  async (ctx, request): Promise<Response> => {
    const corsHeaders = buildCorsHeaders(request);

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
      const body = (await request.json()) as {
        messages?: unknown[];
        modelId?: string;
        provider?: string;
        temperature?: number;
        _temperature?: number;
        maxTokens?: number;
        _maxTokens?: number;
        topP?: number;
        _topP?: number;
        frequencyPenalty?: number;
        _frequencyPenalty?: number;
        presencePenalty?: number;
        _presencePenalty?: number;
        reasoningConfig?: Record<string, unknown>;
        _reasoningConfig?: Record<string, unknown>;
        personaId?: string;
      };
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
        return jsonErrorResponse(
          "Missing required field: messages",
          400,
          corsHeaders
        );
      }

      if (!modelId) {
        return jsonErrorResponse(
          "Missing required field: modelId",
          400,
          corsHeaders
        );
      }

      if (!provider) {
        return jsonErrorResponse(
          "Missing required field: provider",
          400,
          corsHeaders
        );
      }

      const uiMessages: IncomingUIMessage[] = Array.isArray(rawMessages)
        ? (rawMessages as IncomingUIMessage[])
        : [];

      // Get model capabilities to determine PDF extraction and tool support
      let modelSupportsFiles = false;
      let modelSupportsTools = false;
      try {
        const modelInfo = await ctx.runQuery(api.userModels.getModelByID, {
          modelId,
          provider,
        });
        modelSupportsFiles = modelInfo?.supportsFiles ?? false;
        modelSupportsTools = modelInfo?.supportsTools ?? false;
      } catch (error) {
        console.warn("[chatStream] Failed to get model capabilities:", error);
      }

      /**
       * Anonymous User Tool Call Restrictions
       *
       * Web search tools (Exa) are disabled for anonymous users to prevent
       * abuse and manage costs.
       *
       * See convex/chat.test.ts for comprehensive test coverage
       */
      const exaApiKey = process.env.EXA_API_KEY;
      const userId = await getAuthUserId(ctx);

      // Check if user is anonymous
      let isAnonymousUser = true;
      let cachedUser = null;
      if (userId) {
        try {
          cachedUser = await ctx.runQuery(api.users.getById, { id: userId });
          isAnonymousUser = cachedUser?.isAnonymous ?? true;
        } catch (error) {
          console.warn("[chatStream] Failed to get user info:", error);
        }
      }

      const webSearchEnabled =
        modelSupportsTools && !!exaApiKey && !isAnonymousUser;

      // Process messages with PDF extraction if needed
      const messagesWithContent = await Promise.all(
        uiMessages.map(msg =>
          coerceUiMessageContent(ctx, msg, provider, modelId, modelSupportsFiles)
        )
      );

      let coreMessages: ModelMessage[];
      try {
        coreMessages = await convertToModelMessages(
          messagesWithContent as UIMessage<unknown, UIDataTypes, UITools>[]
        );
      } catch (conversionError) {
        console.error(
          "[chatStream] Failed to convert UI messages:",
          conversionError
        );
        return jsonErrorResponse("Invalid message format", 400, corsHeaders);
      }

      // Resolve API key (also enforces rate limits & increments stats)
      const keyResult = await resolveApiKey(ctx, {
        userId,
        cachedUser,
        modelId,
        provider,
        corsHeaders,
      });
      if (!keyResult.ok) {
        return keyResult.response;
      }
      const apiKey = keyResult.apiKey;

      // Get persona prompt and merge with baseline instructions
      let personaPrompt: string | undefined;
      if (personaId) {
        try {
          const persona = await ctx.runQuery(api.personas.get, {
            id: personaId as Id<"personas">,
          });
          if (persona?.prompt) {
            personaPrompt = persona.prompt;
          }
        } catch (error) {
          console.warn("[chatStream] Failed to load persona:", error);
        }
      }

      const baselineInstructions = getBaselineInstructions(modelId, "UTC", {
        webSearchEnabled,
      });
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
      const processedMessages: ModelMessage[] = [...coreMessages];
      const systemMessage: ModelMessage = {
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
        processedMessages.unshift(systemMessage);
      }

      // Get reasoning configuration for this provider
      const reasoningOptions = getProviderReasoningConfig(
        {
          modelId,
          provider,
          supportsReasoning: true,
        },
        resolvedReasoningConfig
      );

      // Create language model and stream response
      try {
        const languageModel = await createLanguageModel(
          ctx,
          provider as ProviderType,
          modelId,
          apiKey,
          userId ?? undefined
        );

        const baseOptions = {
          model: languageModel,
          messages: processedMessages,
          temperature: resolvedTemperature,
          topP: resolvedTopP,
          frequencyPenalty: resolvedFrequencyPenalty,
          presencePenalty: resolvedPresencePenalty,
          ...reasoningOptions,
        };

        const streamOptionsBase =
          resolvedMaxTokens && resolvedMaxTokens > 0
            ? { ...baseOptions, maxOutputTokens: resolvedMaxTokens }
            : baseOptions;

        // For models without tool support, try search pre-check fallback
        let finalMessages = processedMessages;
        if (exaApiKey && !modelSupportsTools && !isAnonymousUser) {
          finalMessages = await maybeInjectSearchContext(
            languageModel,
            exaApiKey,
            processedMessages
          );
        }

        // Start streaming with appropriate configuration
        const MAX_TOOL_STEPS = 5;
        const result =
          modelSupportsTools && exaApiKey && !isAnonymousUser
            ? streamText({
                ...streamOptionsBase,
                messages: finalMessages,
                tools: {
                  webSearch: createWebSearchTool(exaApiKey),
                },
                toolChoice: "auto",
                prepareStep: ({ stepNumber }: { stepNumber: number }) => {
                  if (stepNumber >= MAX_TOOL_STEPS) {
                    return { toolChoice: "none" };
                  }
                  return {};
                },
                stopWhen: stepCountIs(MAX_TOOL_STEPS + 1),
              })
            : streamText({
                ...streamOptionsBase,
                messages: finalMessages,
                experimental_transform: createSmoothStreamTransform(),
              });

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
        const requestBody = (await request.json()) as Record<string, unknown>;
        requestInfo = {
          provider: requestBody.provider,
          modelId: requestBody.modelId,
          hasTemperature: requestBody._temperature !== undefined,
          hasMaxTokens: requestBody._maxTokens !== undefined,
          hasReasoningConfig: requestBody._reasoningConfig !== undefined,
          messageCount: Array.isArray(requestBody.messages) ? requestBody.messages.length : undefined,
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
