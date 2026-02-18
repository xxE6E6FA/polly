import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { httpAction } from "../_generated/server";
import { getApiKey } from "./encryption";
import { getAuthUserId } from "../lib/auth";
import {
  stripCodeAndAssets,
  chunkTextForStreaming,
  normalizeElevenLabsScript,
  ensureOutputFormat,
  arrayBufferToHex,
  blobToStream,
  resolveStabilityValue,
  MAX_TTS_CACHE_ENTRIES,
} from "./elevenlabs_utils";

// HTTP streaming proxy for ElevenLabs low-latency TTS
// Real-time LLM->TTS streaming pipeline
export const streamTTS = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin") || "*";
  const corsHeadersBase: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Cache-Control": "no-store",
  };

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeadersBase,
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeadersBase,
    });
  }

  try {
    const url = new URL(request.url);
    const messageId = url.searchParams.get("messageId");
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    if (!messageId) {
      return new Response(JSON.stringify({ error: "Missing messageId" }), {
        status: 400,
        headers: {
          ...corsHeadersBase,
          "Content-Type": "application/json",
        },
      });
    }

    const voiceIdParam = url.searchParams.get("voiceId") || undefined;
    const modelIdParam = url.searchParams.get("modelId") || undefined;
    const outputFormatParam = url.searchParams.get("outputFormat") || undefined;
    const optimizeLatencyParam = url.searchParams.get("optimizeLatency") || undefined;

    // Determine auth mode: either cookie auth or signed URL
    let hasValidSignature = false;
    if (exp && sig) {
      const signingSecret = process.env.API_KEY_ENCRYPTION_SECRET;
      if (!signingSecret) {
        const origin = request.headers.get("Origin") || "*";
        return new Response(JSON.stringify({ error: "Signing not configured" }), {
          status: 500,
          headers: {
            ...corsHeadersBase,
            "Access-Control-Allow-Origin": origin,
            "Content-Type": "application/json",
          },
        });
      }
      const now = Math.floor(Date.now() / 1000);
      const expNum = Number(exp);
      if (!Number.isFinite(expNum) || expNum < now) {
        const origin = request.headers.get("Origin") || "*";
        return new Response(JSON.stringify({ error: "URL expired" }), {
          status: 401,
          headers: {
            ...corsHeadersBase,
            "Access-Control-Allow-Origin": origin,
            "Content-Type": "application/json",
          },
        });
      }
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(signingSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
      );
      const payload = `${messageId}:${expNum}`;
      const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const expectedHex = Array.from(new Uint8Array(signatureBuffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      if (expectedHex !== sig) {
        const origin = request.headers.get("Origin") || "*";
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: {
            ...corsHeadersBase,
            "Access-Control-Allow-Origin": origin,
            "Content-Type": "application/json",
          },
        });
      }
      hasValidSignature = true;
    }

    // Get authenticated user from request headers
    const userId = await getAuthUserId(ctx);

    // Load message - use privileged internal read when signature is valid
    let message;
    try {
      if (hasValidSignature) {
        message = await ctx.runQuery(internal.messages.getByIdInternal, {
          id: messageId as Id<"messages">,
        });
      } else {
        // This query includes access checks
        message = await ctx.runQuery(api.messages.getById, {
          id: messageId as Id<"messages">,
        });
      }

      if (!message) {
        const errorMessage = userId ? "Message not found or access denied" : "Authentication required";
        const statusCode = hasValidSignature ? 404 : (userId ? 404 : 401);
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: statusCode,
          headers: {
            ...corsHeadersBase,
            "Content-Type": "application/json",
          },
        });
      }
    } catch (error) {
      console.error("Error loading message for TTS:", error);
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: {
          ...corsHeadersBase,
          "Content-Type": "application/json",
        },
      });
    }

    const messageDoc = message as Doc<"messages">;
    if (messageDoc.role !== "assistant") {
      const origin = request.headers.get("Origin") || "*";
      return new Response(JSON.stringify({ error: "TTS only for assistant messages" }), {
        status: 400,
        headers: {
          ...corsHeadersBase,
          "Access-Control-Allow-Origin": origin,
          "Content-Type": "application/json",
        },
      });
    }

    const messageDocId = messageDoc._id as Id<"messages">;
    let cacheEntries = Array.isArray(messageDoc.ttsAudioCache)
      ? [...messageDoc.ttsAudioCache]
      : [];

    const conversationId = messageDoc.conversationId as Id<"conversations">;
    const apiKey = await getApiKey(ctx, "elevenlabs", undefined, conversationId);
    if (!apiKey) {
      const origin = request.headers.get("Origin") || "*";
      return new Response(JSON.stringify({ error: "No ElevenLabs API key configured" }), {
        status: 401,
        headers: {
          ...corsHeadersBase,
          "Access-Control-Allow-Origin": origin,
          "Content-Type": "application/json",
        },
      });
    }

    // Prepare text (sanitize + optional enhancement if user settings request audio tags)
    const userSettings = await ctx.runQuery(api.userSettings.getUserSettings, {});
    const useAudioTags = userSettings?.ttsUseAudioTags ?? true;
    const baseText = stripCodeAndAssets(messageDoc.content || "");
    const prepared = useAudioTags
      ? await ctx.runAction(internal.ai.elevenlabs.prepareTTSScript, { text: baseText })
      : { text: baseText };

    // Honor the selected voice and model exactly
    // Persona-level override (if conversation has a persona with ttsVoiceId)
    let personaVoiceId: string | undefined;
    try {
      const convo = await ctx.runQuery(internal.conversations.internalGet, {
        id: conversationId,
      });
      const pid = convo?.personaId ?? undefined;
      if (pid) {
        const persona = await ctx.runQuery(api.personas.get, { id: pid });
        const maybeVoiceId = persona?.ttsVoiceId;
        if (typeof maybeVoiceId === "string" && maybeVoiceId.length > 0) {
          personaVoiceId = maybeVoiceId;
        }
      }
    } catch {
      // ignore
    }

    const selectedVoiceId =
      voiceIdParam ||
      personaVoiceId ||
      userSettings?.ttsVoiceId ||
      process.env.ELEVENLABS_DEFAULT_VOICE_ID ||
      "JBFqnCBsd6RMkjVDRZzb";
    const selectedModelId = modelIdParam || userSettings?.ttsModelId || process.env.ELEVENLABS_TTS_MODEL_ID || "eleven_v3";
    const normalizedOutputFormat = ensureOutputFormat(outputFormatParam || undefined, "mp3_44100_128");

    // Request Stitching: split text and sequentially stream stitched requests
    const origin2 = request.headers.get("Origin") || "*";

    // Join chunked text back together to keep payload within API limits while preserving pacing
    const scriptSegments = chunkTextForStreaming(prepared.text, {
      maxChunkSize: 600,
      preferredChunkSize: 400,
      minChunkSize: 200,
    });
    const joinedScript = scriptSegments.join("\n\n");
    let streamingScript = normalizeElevenLabsScript(joinedScript);
    if (!streamingScript) {
      streamingScript = normalizeElevenLabsScript(baseText) || stripCodeAndAssets(baseText);
    }

    const shouldEnableSSML = /<\s*(?:break|phoneme)\b/i.test(streamingScript);
    const optimizeStreamingLatency =
      typeof optimizeLatencyParam === "string" && /^(?:[0-4])$/.test(optimizeLatencyParam)
        ? optimizeLatencyParam
        : undefined;

    if (!streamingScript.trim()) {
      return new Response(JSON.stringify({ error: "No speakable content" }), {
        status: 400,
        headers: {
          ...corsHeadersBase,
          "Access-Control-Allow-Origin": origin2,
          "Content-Type": "application/json",
        },
      });
    }

    const textEncoder = new TextEncoder();
    const scriptHash = arrayBufferToHex(
      await crypto.subtle.digest("SHA-256", textEncoder.encode(streamingScript))
    );
    const targetVoiceId = selectedVoiceId;
    const targetModelId = selectedModelId;
    const targetOutputFormat = normalizedOutputFormat;
    const targetOptimizeLatency = optimizeStreamingLatency ?? undefined;

    const matchingCache = cacheEntries.find(entry => {
      const entryOptimizeLatency = entry.optimizeLatency ?? undefined;
      return (
        entry.textHash === scriptHash &&
        (entry.voiceId ?? targetVoiceId) === targetVoiceId &&
        (entry.modelId ?? targetModelId) === targetModelId &&
        (entry.outputFormat ?? targetOutputFormat) === targetOutputFormat &&
        entryOptimizeLatency === targetOptimizeLatency
      );
    });

    if (matchingCache) {
      try {
        const cachedBlob = await ctx.storage.get(matchingCache.storageId);
        if (cachedBlob) {
          const cachedStream = blobToStream(cachedBlob);
          return new Response(cachedStream, {
            status: 200,
            headers: {
              ...corsHeadersBase,
              "Access-Control-Allow-Origin": origin2,
              "Content-Type":
                matchingCache.mimeType || (cachedBlob as any).type || "audio/mpeg",
              "Cache-Control": "public, max-age=86400, stale-while-revalidate=86400",
            },
          });
        }
        const filtered = cacheEntries.filter(
          entry => entry.storageId !== matchingCache.storageId
        );
        await ctx.runMutation(internal.messages.setTtsAudioCache, {
          messageId: messageDocId,
          entries: filtered,
        });
        cacheEntries = filtered;
      } catch (error) {
        console.warn("Failed to serve cached TTS audio", {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const upstreamAbortController = new AbortController();
    let upstreamResponse: Response;
    try {
      const streamingQuery = new URLSearchParams();
      if (optimizeStreamingLatency) {
        streamingQuery.set("optimize_streaming_latency", optimizeStreamingLatency);
      }
      if (shouldEnableSSML) {
        streamingQuery.set("enable_ssml_parsing", "true");
      }
      const streamingEndpoint = streamingQuery.size
        ? `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/stream?${streamingQuery.toString()}`
        : `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/stream`;

      upstreamResponse = await fetch(streamingEndpoint, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: streamingScript,
          model_id: selectedModelId,
          output_format: normalizedOutputFormat,
          voice_settings: {
            stability: resolveStabilityValue(userSettings?.ttsStabilityMode),
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
          apply_text_normalization: "auto",
        }),
        signal: upstreamAbortController.signal,
      });
    } catch (error) {
      upstreamAbortController.abort();
      const err = error instanceof Error ? error.message : String(error);
      console.error("Failed to contact ElevenLabs streaming endpoint", { error: err });
      return new Response(JSON.stringify({ error: "Upstream TTS request failed" }), {
        status: 502,
        headers: {
          ...corsHeadersBase,
          "Access-Control-Allow-Origin": origin2,
          "Content-Type": "application/json",
        },
      });
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const errText = await upstreamResponse.text().catch(() => "");
      upstreamAbortController.abort();
      return new Response(JSON.stringify({ error: "ElevenLabs TTS failed", details: errText }), {
        status: upstreamResponse.status || 502,
        headers: {
          ...corsHeadersBase,
          "Access-Control-Allow-Origin": origin2,
          "Content-Type": "application/json",
        },
      });
    }

    if (typeof request.signal?.addEventListener === "function") {
      if (request.signal.aborted) {
        upstreamAbortController.abort();
      } else {
        request.signal.addEventListener("abort", () => upstreamAbortController.abort(), {
          once: true,
        });
      }
    }

    const upstreamMimeType = upstreamResponse.headers.get("content-type") || "audio/mpeg";
    let audioArrayBuffer: ArrayBuffer;
    try {
      audioArrayBuffer = await upstreamResponse.arrayBuffer();
    } catch (error) {
      upstreamAbortController.abort();
      const err = error instanceof Error ? error.message : String(error);
      console.error("Failed to read ElevenLabs audio stream", { error: err });
      return new Response(JSON.stringify({ error: "Upstream TTS read failed" }), {
        status: 502,
        headers: {
          ...corsHeadersBase,
          "Access-Control-Allow-Origin": origin2,
          "Content-Type": "application/json",
        },
      });
    }

    const audioBlob = new Blob([audioArrayBuffer], { type: upstreamMimeType });

    try {
      const storedId = await ctx.storage.store(audioBlob);
      const cacheEntry = {
        storageId: storedId,
        voiceId: targetVoiceId,
        modelId: targetModelId,
        outputFormat: targetOutputFormat,
        ...(targetOptimizeLatency ? { optimizeLatency: targetOptimizeLatency } : {}),
        textHash: scriptHash,
        createdAt: Date.now(),
        mimeType: upstreamMimeType,
        sizeBytes: audioArrayBuffer.byteLength,
      } as const;

      const filtered = cacheEntries.filter(entry => {
        const entryOptimizeLatency = entry.optimizeLatency ?? undefined;
        return !(
          entry.textHash === scriptHash &&
          (entry.voiceId ?? targetVoiceId) === targetVoiceId &&
          (entry.modelId ?? targetModelId) === targetModelId &&
          (entry.outputFormat ?? targetOutputFormat) === targetOutputFormat &&
          entryOptimizeLatency === targetOptimizeLatency
        );
      });

      const nextCache = [...filtered, cacheEntry];
      nextCache.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      const overflow = nextCache.length > MAX_TTS_CACHE_ENTRIES
        ? nextCache.slice(0, nextCache.length - MAX_TTS_CACHE_ENTRIES)
        : [];
      const cappedCache = nextCache.slice(-MAX_TTS_CACHE_ENTRIES);

      await ctx.runMutation(internal.messages.setTtsAudioCache, {
        messageId: messageDocId,
        entries: cappedCache,
      });
      cacheEntries = cappedCache;

      if (overflow.length > 0) {
        await Promise.all(
          overflow.map(entry =>
            ctx.storage.delete(entry.storageId).catch(() => undefined)
          )
        );
      }
    } catch (error) {
      console.warn("Failed to cache generated TTS audio", {
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return new Response(audioBlob.stream(), {
      status: 200,
      headers: {
        ...corsHeadersBase,
        "Access-Control-Allow-Origin": origin2,
        "Content-Type": upstreamMimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const origin = request.headers.get("Origin") || "*";
    console.error("streamTTS error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        ...corsHeadersBase,
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "application/json",
      },
    });
  }
});
