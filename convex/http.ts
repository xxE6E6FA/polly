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
import { chatStream } from "./chat.js";
import { getBaselineInstructions } from "./constants.js";
import {
  buildJwks,
  mintAnonymousToken,
  verifyAnonymousToken,
} from "./lib/anonymous_auth.js";
import { getAuthUserId } from "./lib/auth.js";
import { verifyClerkWebhook } from "./lib/clerk_webhook.js";
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

// Clerk webhook endpoint for user sync
const clerkWebhook = httpAction(async (ctx, request): Promise<Response> => {
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return new Response("Bad Request", { status: 400 });
    }

    // Verify webhook signature using svix
    let event;
    try {
      event = verifyClerkWebhook(rawBody, {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
      });
    } catch {
      console.error("[Clerk Webhook] Invalid signature");
      return new Response("Unauthorized", { status: 401 });
    }

    const { type, data } = event;

    if (type === "user.created") {
      await ctx.runMutation(internal.clerk.handleWebhookUserCreated, {
        clerkUserId: data.id,
        email: undefined,
        firstName: data.first_name ?? undefined,
        lastName: data.last_name ?? undefined,
        imageUrl: data.image_url ?? undefined,
        primaryEmailAddressId: data.primary_email_address_id ?? undefined,
        emailAddresses: data.email_addresses?.map(e => ({
          email_address: e.email_address,
          id: e.id,
        })),
      });
    } else if (type === "user.updated") {
      await ctx.runMutation(internal.clerk.handleWebhookUserUpdated, {
        clerkUserId: data.id,
        email: undefined,
        firstName: data.first_name ?? undefined,
        lastName: data.last_name ?? undefined,
        imageUrl: data.image_url ?? undefined,
        primaryEmailAddressId: data.primary_email_address_id ?? undefined,
        emailAddresses: data.email_addresses?.map(e => ({
          email_address: e.email_address,
          id: e.id,
        })),
      });
    } else if (type === "user.deleted") {
      await ctx.runMutation(internal.clerk.handleWebhookUserDeleted, {
        clerkUserId: data.id,
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Clerk Webhook] Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

http.route({
  path: "/clerk-users-webhook",
  method: "POST",
  handler: clerkWebhook,
});

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

/**
 * Verify Replicate webhook signature using HMAC-SHA256
 * @param body - Raw request body
 * @param signature - Signature from Replicate-Signature header (format: "sha256=<hash>")
 * @returns true if signature is valid, false otherwise
 */
async function verifyReplicateSignature(
  body: string,
  signature: string
): Promise<boolean> {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) {
    // Security: fail-closed when secret is not configured
    console.error(
      "[Replicate Webhook] REPLICATE_WEBHOOK_SECRET not configured - rejecting webhook"
    );
    return false;
  }

  // Parse signature header (format: "sha256=<hex_hash>")
  const parts = signature.split("=");
  const expectedHash = parts[1];
  if (parts.length !== 2 || parts[0] !== "sha256" || !expectedHash) {
    console.error("[Replicate Webhook] Invalid signature format");
    return false;
  }

  // Compute HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );
  const computedHash = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks
  if (computedHash.length !== expectedHash.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < computedHash.length; i++) {
    result |= computedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return result === 0;
}

// Replicate webhook handler following API specification
const replicateWebhook = httpAction(async (ctx, request): Promise<Response> => {
  try {
    const rawBody = await request.text();

    // Validate request has a body
    if (!rawBody) {
      return new Response("Bad Request", { status: 400 });
    }

    // Verify webhook signature for security
    const signature = request.headers.get("replicate-signature");
    if (signature) {
      const isValid = await verifyReplicateSignature(rawBody, signature);
      if (!isValid) {
        console.error("[Replicate Webhook] Invalid signature");
        return new Response("Unauthorized", { status: 401 });
      }
    } else if (process.env.REPLICATE_WEBHOOK_SECRET) {
      // If secret is configured but no signature provided, reject
      console.error(
        "[Replicate Webhook] Missing signature when secret is configured"
      );
      return new Response("Unauthorized", { status: 401 });
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

// ---------------------------------------------------------------------------
// Anonymous auth endpoints
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// JWKS endpoint — serves the public key so Convex can validate anonymous JWTs
const jwksEndpoint = httpAction(async () => {
  const publicKeyPem = process.env.ANON_AUTH_PUBLIC_KEY;
  if (!publicKeyPem) {
    return new Response("JWKS not configured", { status: 500 });
  }

  const jwks = await buildJwks(publicKeyPem);

  return new Response(JSON.stringify(jwks), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: jwksEndpoint,
});

http.route({
  path: "/.well-known/jwks.json",
  method: "OPTIONS",
  handler: httpAction(() =>
    Promise.resolve(new Response(null, { status: 200, headers: CORS_HEADERS }))
  ),
});

// POST /auth/anonymous — create anonymous user + mint JWT (or refresh)
const anonymousAuthEndpoint = httpAction(
  async (ctx, request): Promise<Response> => {
    const privateKeyPem = process.env.ANON_AUTH_PRIVATE_KEY;
    const issuer = process.env.ANON_AUTH_ISSUER;

    if (!(privateKeyPem && issuer)) {
      return new Response("Anonymous auth not configured", { status: 500 });
    }

    const publicKeyPem = process.env.ANON_AUTH_PUBLIC_KEY;
    let externalId: string | null = null;

    // Check for refresh: if a token is provided, verify its signature and
    // extract the subject. This prevents forged tokens from being used to
    // impersonate other users.
    try {
      const body = await request.text();
      if (body && publicKeyPem) {
        const parsed = JSON.parse(body);
        if (parsed.token) {
          externalId = await verifyAnonymousToken(
            parsed.token,
            publicKeyPem,
            issuer
          );
        }
      }
    } catch {
      // No valid body or token — create a new user
    }

    // If refreshing, verify the user still exists and is anonymous
    if (externalId) {
      const isValidAnon = await ctx.runQuery(
        internal.users.internalIsAnonymousUser,
        { externalId }
      );
      if (!isValidAnon) {
        // User was deleted, doesn't exist, or isn't anonymous — create a new one
        externalId = null;
      }
    }

    // Create new anonymous user if needed
    if (!externalId) {
      externalId = `anon_${crypto.randomUUID()}`;
      await ctx.runMutation(internal.users.createAnonymousUser, { externalId });
    }

    const token = await mintAnonymousToken(privateKeyPem, issuer, externalId);

    return new Response(JSON.stringify({ token, externalId }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
    });
  }
);

http.route({
  path: "/auth/anonymous",
  method: "POST",
  handler: anonymousAuthEndpoint,
});

http.route({
  path: "/auth/anonymous",
  method: "OPTIONS",
  handler: httpAction(() =>
    Promise.resolve(new Response(null, { status: 200, headers: CORS_HEADERS }))
  ),
});

export default http;
