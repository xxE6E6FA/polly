import { httpRouter } from "convex/server";

import { auth } from "./auth.js";
import { chatStream } from "./chat.js";

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

export default http;
