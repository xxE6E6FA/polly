import { getAuthUserId } from "@convex-dev/auth/server";
import { smoothStream, streamText } from "ai";
import { createBasicLanguageModel } from "../shared/ai-provider-factory";
import { MONTHLY_MESSAGE_LIMIT } from "../shared/constants";
import { getProviderReasoningConfig } from "../shared/reasoning-config";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { CONFIG } from "./ai/config";
import {
  incrementUserMessageStats,
  mergeSystemPrompts,
} from "./lib/conversation_utils";
import { log } from "./lib/logger";

export const chatStream = httpAction(
  async (ctx, request): Promise<Response> => {
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
      const {
        messages,
        modelId,
        provider,
        _temperature,
        _maxTokens,
        _topP,
        _frequencyPenalty,
        _presencePenalty,
        _reasoningConfig,
        personaId,
      } = body;

      if (!messages) {
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

      // Get API key using proper authentication
      let apiKey: string;
      try {
        // Try to get user API key first if authenticated
        let userApiKey: string | null = null;

        // Check if user is authenticated via JWT token in Authorization header
        const userId = await getAuthUserId(ctx);

        // Track message usage stats for authenticated users
        if (userId) {
          try {
            // Check if this is a built-in model by looking it up in the user's models
            const model = await ctx.runQuery(api.userModels.getModelByID, {
              modelId,
              provider,
            });

            // Check monthly limits for built-in models
            if (model?.free === true) {
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
            await incrementUserMessageStats(ctx, userId, modelId, provider);
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
            console.log(
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
          console.warn("[chatStream] Failed to load persona:", error);
        }
      }

      // Merge baseline instructions with persona prompt
      const mergedSystemPrompt = mergeSystemPrompts(modelId, personaPrompt);

      // Ensure messages have proper system prompt
      const processedMessages = [...messages];
      if (
        processedMessages.length > 0 &&
        processedMessages[0].role === "system"
      ) {
        // Override existing system message with merged prompt
        processedMessages[0].content = mergedSystemPrompt;
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
        _reasoningConfig
      );

      // Create language model
      try {
        const languageModel = createBasicLanguageModel(
          provider,
          modelId,
          apiKey
        );

        // Configure streaming options
        const baseOptions = {
          model: languageModel,
          messages: processedMessages,
          temperature: _temperature,
          topP: _topP,
          frequencyPenalty: _frequencyPenalty,
          presencePenalty: _presencePenalty,
          ...reasoningOptions,
        };

        // Add maxTokens conditionally
        const streamOptions =
          _maxTokens && _maxTokens > 0
            ? { ...baseOptions, maxTokens: _maxTokens }
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

        // Return the proper data stream for AI SDK useChat with CORS headers
        const response = result.toDataStreamResponse({
          sendReasoning: true,
        });

        // Add CORS headers to the streaming response
        Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
        });

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
