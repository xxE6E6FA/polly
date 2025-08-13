import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action, httpAction, internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getApiKey } from "./encryption";
import { log } from "../lib/logger";
import { DEFAULT_BUILTIN_MODEL_ID } from "../../shared/constants";
import { getAuthUserId } from "@convex-dev/auth/server";
import dedent from "dedent";

export function stripCodeAndAssets(input: string): string {
  const withoutCodeBlocks = input.replace(/```[\s\S]*?```/g, "");
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]*`/g, "");
  const withoutLinks = withoutInlineCode.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  const withoutImages = withoutLinks.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  
  // Remove bold/italic markdown formatting while preserving the text content
  const withoutBoldItalic = withoutImages
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1") // ***bold italic*** -> text
    .replace(/\*\*(.*?)\*\*/g, "$1")     // **bold** -> text
    .replace(/\*(.*?)\*/g, "$1")         // *italic* -> text
    .replace(/_{3}(.*?)_{3}/g, "$1")     // ___bold italic___ -> text
    .replace(/__(.*?)__/g, "$1")         // __bold__ -> text
    .replace(/_(.*?)_/g, "$1");          // _italic_ -> text
  
  const withoutMd = withoutBoldItalic
    .replace(/^#+\s+/gm, "")
    .replace(/[>~#]/g, "");
  return withoutMd.replace(/\s{2,}/g, " ").trim();
}

// Text chunking helper for request stitching / generation
export function chunkTextForStreaming(
  text: string,
  options: { maxChunkSize?: number; minChunkSize?: number; preferredChunkSize?: number } = {}
): string[] {
  const {
    maxChunkSize = 400,
    minChunkSize = 50,
    preferredChunkSize = 250,
  } = options;

  if (text.length <= preferredChunkSize) return [text];

  const chunks: string[] = [];
  const sections = text.split(/\n\s*\n/).filter(section => section.trim());
  for (const section of sections) {
    if (section.length <= maxChunkSize) {
      chunks.push(section.trim());
      continue;
    }
    const sentences = section.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [section];
    let currentChunk = "";
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      const next = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      const wouldExceedMax = next.length > maxChunkSize;
      const wouldExceedPreferred = next.length > preferredChunkSize;
      const isLast = i === sentences.length - 1;
      if ((wouldExceedMax || (wouldExceedPreferred && !isLast)) && currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk = next;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
  }
  return chunks.filter(c => c.length > 0);
}

// ElevenLabs output formats (kept in sync with API)
const SUPPORTED_OUTPUT_FORMATS = [
  "mp3_22050_32",
  "mp3_44100_32",
  "mp3_44100_64",
  "mp3_44100_96",
  "mp3_44100_128",
  "mp3_44100_192",
  "pcm_8000",
  "pcm_16000",
  "pcm_22050",
  "pcm_24000",
  "pcm_44100",
  "pcm_48000",
  "ulaw_8000",
  "alaw_8000",
  "opus_48000_32",
  "opus_48000_64",
  "opus_48000_96",
  "opus_48000_128",
  "opus_48000_192",
] as const;

type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

function ensureOutputFormat(value: string | undefined, fallback: OutputFormat): OutputFormat {
  return (value && SUPPORTED_OUTPUT_FORMATS.includes(value as OutputFormat)
    ? (value as OutputFormat)
    : fallback) as OutputFormat;
}

type StabilityMode = "creative" | "natural" | "robust" | undefined;

function resolveStabilityValue(mode: StabilityMode): number {
  if (mode === "creative") return 0.25;
  if (mode === "robust") return 0.8;
  // Default and "natural"
  return 0.5;
}

function buildEnhancedTTSScript(assistantText: string): string {
  const basePrompt = dedent`
    You are an expert at converting written assistant responses into natural, engaging speech scripts optimized for ElevenLabs TTS. Transform the assistant text into something that sounds natural when spoken aloud.

    FIRST: ANALYZE THE TEXT TYPE
    Before transforming, determine if the text is:
    TECHNICAL/STRUCTURED: Documentation, tutorials, lists, code explanations, formal instructions
    NARRATIVE/CONVERSATIONAL: Stories, dialogue, descriptions, already conversational explanations, creative writing

    IF NARRATIVE/CONVERSATIONAL TEXT:
    PRESERVE the original narrative structure, dialogue, and descriptive language
    ONLY apply ElevenLabs optimizations (section 6) for better speech delivery
    DO NOT rewrite conversational flow or add artificial speech connectors
    Keep the natural storytelling voice intact
    Signs of narrative text: dialogue quotes, story elements, descriptive passages, already flowing explanations, creative writing

    IF TECHNICAL/STRUCTURED TEXT:
    APPLY ALL transformation rules below to make it conversational

    CORE TRANSFORMATION RULES:
    1. CONTENT ADAPTATION:
       Convert technical jargon into spoken explanations (e.g., 'API' → 'A-P-I' or 'Application Programming Interface')
       Replace code blocks with spoken descriptions (e.g., 'Here's the code: function getName() {...}' → 'Here's a function called getName that...')
       Transform URLs into readable descriptions (e.g., 'Visit github.com/user/repo' → 'Visit the GitHub repository')
       Convert file paths to spoken format (e.g., 'src/components/Button.tsx' → 'the Button component file')
       Spell out abbreviations when first mentioned (e.g., 'CSS' → 'C-S-S, which stands for Cascading Style Sheets')
       Transform markdown headings into natural speech introductions (e.g., 'Installation' → 'Now let's talk about installation' or 'The next section covers installation')
       Convert lists into flowing spoken sequences with natural connectors

    2. CONVERSATIONAL FLOW:
       Add natural speech connectors ('So,', 'Now,', 'Here's what I mean:', 'In other words:')
       Break complex sentences into shorter, spoken phrases
       Add clarifying phrases ('that is to say', 'in simple terms', 'basically')
       Use rhetorical questions to engage listeners ('You might wonder...', 'What does this mean?')
       Replace formal language with conversational equivalents

    3. PRONUNCIATION & RHYTHM:
       Add phonetic guidance for technical terms: [React] → [REE-act], [SQL] → [S-Q-L or sequel]
       Use strategic pauses: <break time="0.5s" /> for thought breaks, <break time="1s" /> between ideas
       Mark emphasis with caps for important concepts (but sparingly)
       Add vocal cues: [thoughtfully], [with emphasis], [clearly], [enthusiastically]

    4. LISTS & HEADINGS TRANSFORMATION:
       SIMPLE LISTS: Convert bullet points to flowing speech
         'Item 1 Item 2 Item 3' → 'The main points are: first, item 1, <break time='0.5s'/> second, item 2, <break time='0.5s'/> and finally, item 3'
       NUMBERED LISTS: Use natural sequencing
         '1. Step one 2. Step two' → 'Here's how to do it: First, step one. <break time='0.5s'/> Then, step two.'
       NESTED LISTS: Flatten with clear hierarchy
         Main item with sub-items → 'The first main point is X, which includes A, B, and C. <break time='1s'/> The second main point...'
       HEADINGS: Convert to natural section introductions
         'Main Topic' → 'Let's start with the main topic'
         'Subsection' → 'Now, regarding the subsection' or 'Moving on to...'
         'Details' → 'Here are the details' or 'Specifically...'
       DEFINITION LISTS: Convert to explanatory speech
         'Term: Definition' → 'Let me explain what Term means: it's Definition'

    5. STRUCTURE FOR LISTENING:
       Start with a brief overview for longer explanations
       Add transition phrases between topics
       End with a brief summary or next step when appropriate
       Use verbal signposting ('There are three key points...', 'Let me break this down...')

    6. ELEVENLABS OPTIMIZATION:
       Use punctuation to control pacing (commas, periods, ellipses)
       Add emotional context when relevant ([excited], [concerned], [confident])
       Use narrative framing ('Let me explain', 'Here's the thing', 'The key point is')
       Include natural hesitations with ellipses where thoughtful pauses would occur

    FORBIDDEN ELEMENTS (remove or transform):
    Raw code blocks, inline code snippets
    File names, directory paths (unless contextually essential)
    URLs, markdown formatting symbols
    Tables, complex data structures
    Stack traces, error messages
    Mathematical formulas (convert to spoken descriptions)
    Markdown syntax for lists and headings (convert to natural speech)
    Repetitive bullet point structures (flatten into conversational flow)


    EXAMPLES OF TEXT TYPES:

    PRESERVE (Narrative/Conversational - minimal changes):
    'Once upon a time, there was a developer who...'
    'She looked at the code and said, "This needs refactoring."'
    'The gentle breeze rustled through the leaves as...'
    'You know, when I first started coding, I made this mistake...'
    'Imagine you're building a house. The foundation is like...'

    TRANSFORM (Technical/Structured - full conversion):
    'Getting Started' → 'Let's get started' or 'Now, let's begin'
    '1. Install npm 2. Run setup 3. Start coding' → 'Here's what you need to do: First, install npm. <break time='0.7s'/> Next, run the setup. <break time='0.7s'/> And then you're ready to start coding!'
    'Features: Fast Secure Easy' → 'This tool has three key features: it's fast, secure, and easy to use'
    API documentation, code snippets, formal tutorials

    Remember: First analyze whether the text is narrative/conversational or technical/structured. For narrative text, preserve the natural flow and only optimize for speech delivery. For technical text, transform it into conversational explanations. Your goal is to make the assistant's knowledge accessible through natural, engaging speech while respecting the original style and intent.

    CRITICAL: Your response must contain ONLY the converted speech script. Do not include any reasoning, analysis, explanations, or meta-commentary about your transformation process. Simply return the final speech-optimized text that is ready for TTS conversion.

    ORIGINAL ASSISTANT TEXT:
    ${assistantText}

    CONVERTED SPEECH SCRIPT:
  `;

  return basePrompt;
}

export const prepareTTSScript = internalAction({
  args: {
    text: v.string(),
  },
  returns: v.object({ text: v.string() }),
  handler: async (_ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    const base = stripCodeAndAssets(args.text);
    if (!apiKey) {
      return { text: base } as const;
    }

    try {
      const promptText = buildEnhancedTTSScript(base);
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_BUILTIN_MODEL_ID}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: promptText }],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1200,
              temperature: 0.7,
              topP: 0.8,
              topK: 40,
            },
          }),
        }
      );

      if (!resp.ok) {
        throw new Error(`Gemini API error: ${resp.status}`);
      }

      const data: {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      } = (await resp.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const out = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (out && out.length > 0) {
        return { text: out } as const;
      }
      return { text: base } as const;
    } catch (error) {
      log.warn("TTS preprocessing failed, using sanitized text", {
        error: error instanceof Error ? error.message : String(error),
      });
      return { text: base } as const;
    }
  },
});

export const generateTTS = action({
  args: {
    messageId: v.id("messages"),
    voiceId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    outputFormat: v.optional(v.string()),
    useAudioTags: v.optional(v.boolean()),
  },
  returns: v.object({ storageId: v.id("_storage"), url: v.optional(v.string()), mimeType: v.string() }),
  handler: async (
    ctx,
    args
  ): Promise<{ storageId: Id<"_storage">; url?: string; mimeType: string }> => {
    const message = await ctx.runQuery(api.messages.getById, { id: args.messageId });
    if (!message) {
      throw new Error("Message not found or access denied");
    }
    if (message.role !== "assistant") {
      throw new Error("TTS is only available for assistant messages");
    }

    const conversationId = message.conversationId as Id<"conversations">;
    const base = stripCodeAndAssets(message.content || "");

    const userSettings = await ctx.runQuery(api.userSettings.getUserSettings, {});
    const resolvedUseTags =
      args.useAudioTags !== undefined
        ? args.useAudioTags
        : userSettings?.ttsUseAudioTags ?? true;


    const prepared: { text: string } = resolvedUseTags
      ? await ctx.runAction(internal.ai.elevenlabs.prepareTTSScript, { text: base })
      : { text: base };

    // Apply smart chunking for optimal generation
    // For fallback generation, use the first substantial chunk to ensure quality
    const chunks = chunkTextForStreaming(prepared.text, {
      maxChunkSize: 400,
      preferredChunkSize: 300,
      minChunkSize: 50,
    });
    
    // Use the first chunk for consistent behavior with streaming
    const processedText = chunks[0] || prepared.text;

    const stability: StabilityMode = userSettings?.ttsStabilityMode ?? (resolvedUseTags ? "creative" : undefined);

    // Persona-level voice override
    let personaVoiceId: string | undefined;
    try {
      const convo = await ctx.runQuery(internal.conversations.internalGet, { id: conversationId });
      let pid: Id<"personas"> | undefined;
      if (convo && typeof (convo as Record<string, unknown>).personaId === "string") {
        pid = (convo as { personaId: Id<"personas"> }).personaId;
      }
      if (pid) {
        const persona = await ctx.runQuery(api.personas.get, { id: pid });
        if (persona && typeof (persona as Record<string, unknown>).ttsVoiceId === "string") {
          personaVoiceId = (persona as { ttsVoiceId: string }).ttsVoiceId;
        }
      }
    } catch {
      // ignore
    }

    const result: { storageId: Id<"_storage">; mimeType: string } = await ctx.runAction(internal.ai.elevenlabs.generateTTSInternal, {
      conversationId,
      text: processedText,
      voiceId: args.voiceId ?? personaVoiceId ?? userSettings?.ttsVoiceId ?? undefined,
      modelId:
        args.modelId ??
        userSettings?.ttsModelId ??
        process.env.ELEVENLABS_TTS_MODEL_ID ??
        "eleven_v3",
      outputFormat: args.outputFormat,
      stabilityMode: stability,
    });

    const url: string | null = result.storageId
      ? await ctx.runQuery(api.fileStorage.getFileUrl, { storageId: result.storageId })
      : null;

    return {
      storageId: result.storageId,
      url: url ?? undefined,
      mimeType: result.mimeType,
    } as const;
  },
});

export const generateTTSInternal = internalAction({
  args: {
    conversationId: v.id("conversations"),
    text: v.string(),
    voiceId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    outputFormat: v.optional(v.string()),
    stabilityMode: v.optional(v.union(v.literal("creative"), v.literal("natural"), v.literal("robust"))),
  },
  returns: v.object({ storageId: v.id("_storage"), mimeType: v.string() }),
  handler: async (ctx, args): Promise<{ storageId: Id<"_storage">; mimeType: string }> => {
    try {
      const apiKey = await getApiKey(ctx, "elevenlabs", undefined, args.conversationId);
      if (!apiKey) {
        throw new Error("No ElevenLabs API key found. Add one in Settings.");
      }

      const voiceId = args.voiceId || process.env.ELEVENLABS_DEFAULT_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
      const modelId = args.modelId || "eleven_multilingual_v2";
      const normalizedOutputFormat = ensureOutputFormat(
        args.outputFormat,
        "mp3_44100_128"
      );

      log.debug("Requesting ElevenLabs TTS", {
        modelId,
        voiceId,
        outputFormat: normalizedOutputFormat,
        textLength: args.text.length,
      });

      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: args.text,
          model_id: modelId,
          output_format: normalizedOutputFormat,
          optimize_streaming_latency: 2, // Moderate optimization for standard generation
          voice_settings: {
            stability: resolveStabilityValue(args.stabilityMode),
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
          apply_text_normalization: "auto",
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`ElevenLabs TTS failed: ${response.status} ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const mimeType = response.headers.get("content-type") || "audio/mpeg";
      const blob = new globalThis.Blob([arrayBuffer], { type: mimeType });

      const storageId = (await ctx.storage.store(blob)) as Id<"_storage">;

      log.debug("Stored ElevenLabs TTS audio", { storageId });

      return { storageId, mimeType };
    } catch (error) {
      log.error("ElevenLabs TTS error", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

export const fetchAllTTSData = action({
  args: {},
  returns: v.object({
  voices: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        category: v.optional(v.string()),
        previewUrl: v.optional(v.string()),
        description: v.optional(v.string()),
        imageUrl: v.optional(v.string()),
        likedCount: v.optional(v.number()),
        languages: v.optional(v.array(v.string())),
      })
    ),
    models: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        recommended: v.optional(v.boolean()),
        tier: v.optional(v.string()),
        languages: v.optional(v.array(v.string())),
        concurrencyGroup: v.optional(v.string()),
      })
    ),
  }),
  handler: async (ctx) => {
    try {
      const apiKey = await getApiKey(ctx as any, "elevenlabs");

      const [voicesResp, modelsResp] = await Promise.all([
        fetch("https://api.elevenlabs.io/v1/voices", {
          headers: { "xi-api-key": apiKey },
        }),
        fetch("https://api.elevenlabs.io/v1/models", {
          headers: { "xi-api-key": apiKey },
        }),
      ]);

      let voices: Array<{ id: string; name: string; category?: string }> = [];
      let models: Array<{
        id: string;
        name: string;
        description?: string;
        recommended?: boolean; // will be derived client-side; keep optional for future
        tier?: string; // will be derived client-side; keep optional for future
        languages?: string[];
        concurrencyGroup?: string;
      }> = [];

      if (voicesResp.ok) {
        const data = (await voicesResp.json()) as any;
        const rawVoices: any[] = Array.isArray(data?.voices) ? data.voices : [];
        voices = rawVoices
          .map((voice) => {
            const id: unknown = voice?.voice_id;
            const name: unknown = voice?.name;
            const category: unknown = voice?.category;
            // Prefer top-level preview, else first verified language preview
            let preview: unknown = voice?.preview_url;
            if (!preview) {
              const vlangs = Array.isArray(voice?.verified_languages)
                ? voice.verified_languages
                : [];
              const firstPreview = vlangs?.find((v: any) => typeof v?.preview_url === "string")?.preview_url;
              preview = firstPreview;
            }
            const description: unknown = voice?.description;
            const sharing = voice?.sharing || {};
            const imageUrl: unknown = sharing?.image_url;
            const likedCount: unknown = sharing?.liked_by_count;
            const languagesRaw: any[] = Array.isArray(voice?.verified_languages)
              ? voice.verified_languages
              : [];
            const languages: string[] = languagesRaw
              .map((l: any) => {
                const parts = [l?.language, l?.accent].filter((x: unknown) => typeof x === "string") as string[];
                return parts.join(" · ");
              })
              .filter((s: string) => s.length > 0);
            return {
              id: typeof id === "string" ? id : "",
              name: typeof name === "string" ? name : "Unnamed Voice",
              category: typeof category === "string" ? category : undefined,
              previewUrl: typeof preview === "string" ? preview : undefined,
              description: typeof description === "string" ? description : undefined,
              imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
              likedCount: typeof likedCount === "number" ? likedCount : undefined,
              languages: languages.length > 0 ? languages : undefined,
            };
          })
          .filter((v) => v.id);
      }

      if (modelsResp.ok) {
        const raw = (await modelsResp.json()) as any;
        const rawModels: any[] = Array.isArray(raw) ? raw : [];
        const parsedModels: Array<{ id: string; name: string; description?: string } | null> = rawModels
          .map((model) => {
            const modelId: unknown = model?.model_id ?? model?.modelId;
            const name: unknown = model?.name;
            const description: unknown = model?.description;
            const id = typeof modelId === "string" ? modelId : "";
            if (!id) return null;
            const base = { id, name: typeof name === "string" ? name : id };
            return typeof description === "string" ? { ...base, description } : base;
          })
          .filter((m): m is { id: string; name: string; description?: string } => m !== null);
        // assign while matching declared type with optional fields present
        models = parsedModels.map((m) => ({
          id: m!.id,
          name: m!.name,
          description: m!.description,
        }));
        // Keep list stable and readable
        models.sort((a, b) => a.name.localeCompare(b.name));
      }

      return { voices, models };
    } catch (error) {
      log.error("Failed to fetch TTS data", error);
      return {
        voices: [],
        models: [
          {
            id: "eleven_v3",
            name: "Eleven v3",
            description: "Expressive TTS with audio-tag control (alpha)",
            recommended: true,
            tier: "v3",
          },
          {
            id: "eleven_multilingual_v2",
            name: "Eleven Multilingual v2",
            description: "Stable multilingual TTS with wide language support",
            recommended: true,
            tier: "v2",
          },
        ],
      };
    }
  },
});

// HTTP streaming proxy for ElevenLabs low-latency TTS
// Real-time LLM→TTS streaming pipeline
// Removed LLM→TTS legacy endpoint

export const streamTTS = httpAction(async (ctx, request): Promise<Response> => {
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
    const optimizeLatency = url.searchParams.get("optimizeLatency");

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
      log.error("Error loading message for TTS:", error);
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: {
          ...corsHeadersBase,
          "Content-Type": "application/json",
        },
      });
    }

    if (message.role !== "assistant") {
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

    const conversationId = message.conversationId as Id<"conversations">;
    const apiKey = await getApiKey(ctx as any, "elevenlabs", undefined, conversationId);
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
    const baseText = stripCodeAndAssets(message.content || "");
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
      let pid: Id<"personas"> | undefined;
      if (convo && typeof (convo as Record<string, unknown>).personaId === "string") {
        pid = (convo as { personaId: Id<"personas"> }).personaId;
      }
      if (pid) {
        const persona = await ctx.runQuery(api.personas.get, { id: pid });
        if (persona && typeof (persona as Record<string, unknown>).ttsVoiceId === "string") {
          personaVoiceId = (persona as { ttsVoiceId: string }).ttsVoiceId;
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
    const chunks = chunkTextForStreaming(prepared.text, {
      maxChunkSize: 600,
      preferredChunkSize: 400,
      minChunkSize: 200,
    });

    const origin = request.headers.get("Origin") || "*";
    const requestIds: string[] = [];

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let i = 0; i < chunks.length; i++) {
            const text = chunks[i];
            const body: Record<string, unknown> = {
              text,
              model_id: selectedModelId,
              output_format: normalizedOutputFormat,
              voice_settings: {
                stability: resolveStabilityValue(userSettings?.ttsStabilityMode),
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
              },
              apply_text_normalization: "auto",
            };
            if (requestIds.length > 0) {
              (body as any).previous_request_ids = requestIds;
            }

            const resp = await fetch(
              `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
              {
                method: "POST",
                headers: {
                  "xi-api-key": apiKey,
                  Accept: "audio/mpeg",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
              }
            );

            if (!resp.ok || !resp.body) {
              const errText = await resp.text().catch(() => "");
              throw new Error(
                `Upstream TTS failed (${resp.status}): ${errText}`
              );
            }

            const rid = resp.headers.get("request-id");
            if (typeof rid === "string" && rid.length > 0) {
              requestIds.push(rid);
            }

            const reader = resp.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) controller.enqueue(value);
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...corsHeadersBase,
        "Access-Control-Allow-Origin": origin,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const origin = request.headers.get("Origin") || "*";
    log.error("streamTTS error", {
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

// Generate a signed, time-limited URL for TTS streaming without requiring cookies/headers
export const createTTSStreamUrl = action({
  args: {
    messageId: v.id("messages"),
    ttlSeconds: v.optional(v.number()),
    voiceId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    outputFormat: v.optional(v.string()),
    optimizeLatency: v.optional(v.number()),
  },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const message = await ctx.runQuery(api.messages.getById, { id: args.messageId });
    if (!message) {
      throw new Error("Message not found or access denied");
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + Math.max(1, Math.min(60 * 10, (args.ttlSeconds ?? 60))); // default 60s, max 10m

    const signingSecret = process.env.API_KEY_ENCRYPTION_SECRET;
    if (!signingSecret) {
      throw new Error("Missing signing secret");
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const payload = `${args.messageId}:${exp}`;
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(payload)
    );
    const signatureHex = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Determine effective TTS params (prefer explicit args, otherwise user settings)
    let effectiveVoiceId: string | undefined = args.voiceId;
    let effectiveModelId: string | undefined = args.modelId;
    let effectiveOutputFormat: string | undefined = args.outputFormat;
    let effectiveOptimizeLatency: string | undefined = args.optimizeLatency
      ? String(args.optimizeLatency)
      : undefined;

    if (!effectiveVoiceId || !effectiveModelId || !effectiveOutputFormat || !effectiveOptimizeLatency) {
      try {
        const userSettings = await ctx.runQuery(api.userSettings.getUserSettings, {});
        // Persona override for signed URL as well
        let personaVoiceId: string | undefined;
        try {
          const messageRec = await ctx.runQuery(api.messages.getById, { id: args.messageId });
          let convId: Id<"conversations"> | undefined;
          if (messageRec && typeof (messageRec as Record<string, unknown>).conversationId === "string") {
            convId = (messageRec as { conversationId: Id<"conversations"> }).conversationId;
          }
          if (convId) {
            const convo = await ctx.runQuery(internal.conversations.internalGet, { id: convId });
            let pid: Id<"personas"> | undefined;
            if (convo && typeof (convo as Record<string, unknown>).personaId === "string") {
              pid = (convo as { personaId: Id<"personas"> }).personaId;
            }
            if (pid) {
              const persona = await ctx.runQuery(api.personas.get, { id: pid });
              if (persona && typeof (persona as Record<string, unknown>).ttsVoiceId === "string") {
                personaVoiceId = (persona as { ttsVoiceId: string }).ttsVoiceId;
              }
            }
          }
        } catch {
          // ignore
        }
        effectiveVoiceId = effectiveVoiceId || personaVoiceId || userSettings?.ttsVoiceId || process.env.ELEVENLABS_DEFAULT_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
        effectiveModelId = effectiveModelId || userSettings?.ttsModelId || process.env.ELEVENLABS_TTS_MODEL_ID || "eleven_v3";
        effectiveOutputFormat = effectiveOutputFormat || "mp3_44100_128";
        effectiveOptimizeLatency = effectiveOptimizeLatency || "4";
      } catch {
        // If settings lookup fails, fall back to environment defaults
        effectiveVoiceId = effectiveVoiceId || process.env.ELEVENLABS_DEFAULT_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
        effectiveModelId = effectiveModelId || process.env.ELEVENLABS_TTS_MODEL_ID || "eleven_v3";
        effectiveOutputFormat = effectiveOutputFormat || "mp3_44100_128";
        effectiveOptimizeLatency = effectiveOptimizeLatency || "4";
      }
    }

    const baseUrl = `${process.env.CONVEX_CLOUD_URL || ""}/http/tts/stream`;
    const query = new URLSearchParams({
      messageId: String(args.messageId),
      exp: String(exp),
      sig: signatureHex,
    });
    if (effectiveVoiceId) query.set("voiceId", effectiveVoiceId);
    if (effectiveModelId) query.set("modelId", effectiveModelId);
    if (effectiveOutputFormat) query.set("outputFormat", effectiveOutputFormat);
    if (effectiveOptimizeLatency) query.set("optimizeLatency", effectiveOptimizeLatency);
    const url = `${baseUrl}?${query.toString()}`;

    return { url } as const;
  },
});


