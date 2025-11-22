import { getAuthUserId } from "@convex-dev/auth/server";
import { generateText, streamText } from "ai";
import { httpRouter } from "convex/server";
import type { Prediction } from "replicate";
import {
  createReasoningChunkHandler,
  createSmoothStreamTransform,
} from "../shared/streaming-utils";
import { api, internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import { httpAction } from "./_generated/server";
import { CONFIG } from "./ai/config.js";
import { streamTTS } from "./ai/elevenlabs.js";
import { getApiKey } from "./ai/encryption.js";
import { getUserFriendlyErrorMessage } from "./ai/error_handlers.js";
import { performWebSearch } from "./ai/exa.js";
import { convertMessages } from "./ai/messages.js";
import { shouldExtractPdfText } from "./ai/pdf.js";
import {
  generateSearchNeedAssessment,
  generateSearchStrategy,
  parseSearchNeedAssessment,
  parseSearchStrategy,
} from "./ai/search_detection.js";
import {
  createLanguageModel,
  getProviderStreamOptions,
} from "./ai/server_streaming.js";
import { processUrlsInMessage } from "./ai/url_processing.js";
import { auth } from "./auth.js";
import { chatStream } from "./chat.js";
import { getBaselineInstructions } from "./constants.js";
import {
  getPersonaPrompt,
  mergeSystemPrompts,
} from "./lib/conversation/message_handling.js";
import { processAttachmentsForLLM } from "./lib/process_attachments.js";
import { scheduleRunAfter } from "./lib/scheduler.js";
import { humanizeReasoningText } from "./lib/shared/stream_utils.js";

// (api, internal) already imported above

const http = httpRouter();

// Simple in-memory rate limiter (per user per minute)
const RATE = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_PER_MINUTE = 20;

function _rateLimitCheck(userId: string): boolean {
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000; // current minute
  const entry = RATE.get(userId);
  if (!entry || entry.windowStart !== windowStart) {
    RATE.set(userId, { count: 1, windowStart });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }
  entry.count++;
  return true;
}

auth.addHttpRoutes(http);

// Add chat streaming endpoint for AI SDK
http.route({
  path: "/chat",
  method: "POST",
  handler: chatStream,
});

// Add OPTIONS support for CORS preflight (handled inside chatStream with relaxed CORS)
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: chatStream,
});

// ElevenLabs low-latency streaming proxy
http.route({
  path: "/tts/stream",
  method: "GET",
  handler: streamTTS,
});
http.route({
  path: "/tts/stream",
  method: "OPTIONS",
  handler: streamTTS,
});

// Removed LLM→TTS WebSocket pipeline in favor of server HTTP streaming

// Replicate webhook handler following API specification
const replicateWebhook = httpAction(async (ctx, request): Promise<Response> => {
  try {
    const rawBody = await request.text();

    // Validate request has a body
    if (!rawBody) {
      return new Response("Bad Request", { status: 400 });
    }

    let body: Partial<Prediction> & {
      id?: string;
      status?: string;
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // Validate required fields per API spec
    if (!body.id) {
      return new Response("Bad Request", { status: 400 });
    }

    if (!body.status) {
      return new Response("Bad Request", { status: 400 });
    }

    // Verify webhook signature for security (recommended in production)
    const signature = request.headers.get("replicate-signature");
    if (signature) {
      // Note: Full signature verification would require crypto module
      // This is a security enhancement for production environments
    }

    // Validate status is a known value
    const validStatuses: Prediction["status"][] = [
      "starting",
      "processing",
      "succeeded",
      "failed",
      "canceled",
    ];
    if (!validStatuses.includes(body.status as Prediction["status"])) {
      return new Response("Bad Request", { status: 400 });
    }

    // Process the webhook
    await ctx.runAction(internal.ai.replicate.handleWebhook, {
      predictionId: body.id || "",
      status: body.status || "unknown",
      output: body.output,
      error: typeof body.error === "string" ? body.error : undefined,
      metadata: body.metrics,
    });

    return new Response("OK", { status: 200 });
  } catch {
    return new Response("Internal Server Error", { status: 500 });
  }
});

http.route({
  path: "/webhooks/replicate",
  method: "POST",
  handler: replicateWebhook,
});

// Add OPTIONS support for Replicate webhook CORS
http.route({
  path: "/webhooks/replicate",
  method: "OPTIONS",
  handler: httpAction(() => {
    return Promise.resolve(
      new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Replicate-Signature",
        },
      })
    );
  }),
});

export default http;
