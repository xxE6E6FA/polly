import { getAuthUserId } from "@convex-dev/auth/server";
import { createBasicLanguageModel } from "@shared/ai-provider-factory";
import { MONTHLY_MESSAGE_LIMIT } from "@shared/constants";
import { getProviderReasoningConfig } from "@shared/reasoning-config";
import { streamText } from "ai";
import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  incrementUserMessageStats,
  mergeSystemPrompts,
} from "./lib/conversation_utils";
import { log } from "./lib/logger";

export const chatStream = httpAction(
  async (ctx, request): Promise<Response> => {
    // Common CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

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
        temperature,
        maxTokens,
        topP,
        frequencyPenalty,
        presencePenalty,
        reasoningConfig,
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
            await incrementUserMessageStats(ctx, model?.free === true);
            console.log("[chatStream] Message stats incremented:", {
              modelId,
              provider,
              isBuiltInModel: model?.free === true,
            });
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
            console.log(
              "[chatStream] User API key lookup:",
              userApiKey ? "found" : "not found"
            );
          } catch (error) {
            console.log("[chatStream] User API key lookup failed:", error);
          }
        } else {
          console.log("[chatStream] No authenticated user found");
        }

        if (userApiKey) {
          apiKey = userApiKey;
          console.log("[chatStream] Using user API key");
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
          console.log(
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
          console.log(`[chatStream] Using environment API key for ${provider}`);
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
            console.log(`[chatStream] Using persona: ${persona.name}`);
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
        reasoningConfig
      );

      // Create language model
      const languageModel = createBasicLanguageModel(provider, modelId, apiKey);

      // Configure streaming options
      const baseOptions = {
        model: languageModel,
        messages: processedMessages,
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
        ...reasoningOptions,
      };

      // Add maxTokens conditionally
      const streamOptions =
        maxTokens && maxTokens > 0
          ? { ...baseOptions, maxTokens }
          : baseOptions;

      // Start streaming
      const result = streamText(streamOptions);

      // Return the proper data stream for AI SDK useChat with CORS headers
      const response = result.toDataStreamResponse({
        sendReasoning: true,
      });

      // Add CORS headers to the streaming response
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });

      return response;
    } catch (error) {
      log.error("Chat API error:", error);
      log.error(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack trace"
      );

      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      log.error("Sending error response:", errorMessage);

      return new Response(
        JSON.stringify({
          error: errorMessage,
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
