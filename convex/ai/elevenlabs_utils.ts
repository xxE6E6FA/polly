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
    const sentences = section.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [section];
    let currentChunk = "";
    for (let i = 0; i < sentences.length; i++) {
      const rawSentence = sentences[i];
      if (!rawSentence) {
        continue;
      }
      const sentence = rawSentence.trim();
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
export const SUPPORTED_OUTPUT_FORMATS = [
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

export type OutputFormat = (typeof SUPPORTED_OUTPUT_FORMATS)[number];

export const MAX_TTS_CACHE_ENTRIES = 5;

export function ensureOutputFormat(value: string | undefined, fallback: OutputFormat): OutputFormat {
  return (value && SUPPORTED_OUTPUT_FORMATS.includes(value as OutputFormat)
    ? (value as OutputFormat)
    : fallback) as OutputFormat;
}

function clampBreakDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0.2;
  const normalized = Math.max(0.15, seconds);
  const MAX_SPOKEN_BREAK = 1.2;
  return normalized > MAX_SPOKEN_BREAK ? MAX_SPOKEN_BREAK : normalized;
}

function normalizeBreakTag(rawDuration: string): string {
  const trimmed = rawDuration.trim().toLowerCase();
  const msMatch = trimmed.match(/^(\d+(?:\.\d+)?)(ms|millisecond(?:s)?|s|sec(?:onds?)?)?$/);
  if (!msMatch) {
    return "";
  }
  const value = Number(msMatch[1]);
  if (!Number.isFinite(value)) {
    return "";
  }
  const unitRaw = msMatch[2] || "s";
  const unit = unitRaw.startsWith("ms") || unitRaw.startsWith("millisecond") ? "ms" : "s";
  const seconds = unit === "ms" ? value / 1000 : value;
  const clamped = clampBreakDuration(seconds);
  const formatted = clamped % 1 === 0 ? `${clamped.toFixed(0)}s` : `${clamped.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}s`;
  return `<break time="${formatted}"/>`;
}

function stripUnsupportedTags(input: string): string {
  const allowedTags = new Set(["break", "phoneme"]);
  return input.replace(/<([^>]+)>/g, (_full, inner) => {
    const tagNameMatch = inner.trim().match(/^\/?([a-z0-9_-]+)/i);
    if (!tagNameMatch) return "";
    const tag = tagNameMatch[1].toLowerCase();
    if (!allowedTags.has(tag)) {
      if (inner.includes(" phoneme=")) {
        // fall through, phoneme covered above
      } else {
        return "";
      }
    }
    if (tag === "break") {
      const durationMatch = inner.match(/time\s*=\s*["']?([^"'>\s]+)["']?/i);
      const normalized = durationMatch ? normalizeBreakTag(durationMatch[1]) : "";
      return normalized || "";
    }
    return `<${inner.trim()}>`;
  });
}

export function normalizeElevenLabsScript(input: string): string {
  if (!input) return "";
  let result = input.replace(/\r\n?/g, "\n");
  // Convert stray break tokens like "5s'/>" or "250ms" into SSML breaks before stripping tags
  result = result.replace(
    /(\d+(?:\.\d+)?)\s*(ms|millisecond(?:s)?|s|sec(?:onds?)?)['"]?\s*\/?\s*>/gi,
    (_match, value, unit) => normalizeBreakTag(`${value}${unit}`)
  );
  result = result.replace(/\[(?:[^[\]]{1,80})\]/g, "");
  result = result.replace(/<break\s+time\s*=\s*["']?([^"'>\s]+)["']?\s*><\/break>/gi, (_match, duration) => normalizeBreakTag(duration));
  result = result.replace(/<break\s+time\s*=\s*([^"'>\s/]+)\s*\/?\s*>/gi, (_match, duration) => normalizeBreakTag(duration));
  result = result.replace(/<pause(?:[^>]*)>/gi, "");
  result = stripUnsupportedTags(result);
  result = result.replace(/\s{3,}/g, "  ");
  const stageDirectionPattern = /^(?:pause|beat|break|section break|silence|hold)(?:\b|[:\-\s])/i;
  result = result
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(line => !(line.length <= 80 && stageDirectionPattern.test(line)))
    .join("\n\n");
  return result.trim();
}

export function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function blobToStream(blob: Blob): ReadableStream<Uint8Array> {
  if (typeof blob.stream === "function") {
    return blob.stream() as ReadableStream<Uint8Array>;
  }
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const arrayBuffer = await blob.arrayBuffer();
      controller.enqueue(new Uint8Array(arrayBuffer));
      controller.close();
    },
  });
}

export type StabilityMode = "creative" | "natural" | "robust" | undefined;

export function resolveStabilityValue(mode: StabilityMode): number {
  if (mode === "creative") return 0.25;
  if (mode === "robust") return 0.8;
  // Default and "natural"
  return 0.5;
}

export function buildEnhancedTTSScript(assistantText: string): string {
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
       Use strategic pauses sparingly: default to <break time="0.4s" /> for short transitions, at most <break time="0.8s" /> when shifting topics
       Never generate pauses longer than 0.8 seconds and avoid repeating consecutive breaks
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
