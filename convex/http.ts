import { httpRouter } from "convex/server";
import type { Prediction } from "replicate";
import { internal } from "./_generated/api.js";
import { httpAction } from "./_generated/server";
import { auth } from "./auth.js";
import { chatStream } from "./chat.js";
import { log } from "./lib/logger.js";

const http = httpRouter();

auth.addHttpRoutes(http);

// Add chat streaming endpoint for AI SDK
http.route({
  path: "/chat",
  method: "POST",
  handler: chatStream,
});

// Add OPTIONS support for CORS preflight
http.route({
  path: "/chat",
  method: "OPTIONS",
  handler: chatStream,
});

// Replicate webhook handler following API specification
const replicateWebhook = httpAction(async (ctx, request): Promise<Response> => {
  try {
    const rawBody = await request.text();

    // Validate request has a body
    if (!rawBody) {
      log.warn("Received empty webhook body");
      return new Response("Bad Request", { status: 400 });
    }

    let body: Partial<Prediction> & {
      id?: string;
      status?: string;
    };
    try {
      body = JSON.parse(rawBody);
    } catch (parseError) {
      log.warn("Invalid JSON in webhook body", { parseError });
      return new Response("Bad Request", { status: 400 });
    }

    // Validate required fields per API spec
    if (!body.id) {
      log.warn("Webhook missing prediction ID");
      return new Response("Bad Request", { status: 400 });
    }

    if (!body.status) {
      log.warn("Webhook missing status", { predictionId: body.id });
      return new Response("Bad Request", { status: 400 });
    }

    // Verify webhook signature for security (recommended in production)
    const signature = request.headers.get("replicate-signature");
    if (signature) {
      log.debug("Received signed webhook", {
        predictionId: body.id,
        hasSecret: !!process.env.REPLICATE_WEBHOOK_SECRET,
      });
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
      log.warn("Unknown webhook status", {
        predictionId: body.id,
        status: body.status,
      });
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

    log.info("Successfully processed webhook", {
      predictionId: body.id,
      status: body.status,
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    log.error("Webhook processing error", {
      error: error instanceof Error ? error.message : String(error),
    });
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
