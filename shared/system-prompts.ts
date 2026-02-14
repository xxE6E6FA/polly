/**
 * Shared system prompt utilities
 * Single source of truth for baseline instructions and persona merging
 * Used by both browser (private) and Convex (server) modes
 */
import dedent from "dedent";

/**
 * Default Polly persona - acts as a bridge between baseline and custom personas
 */
export const DEFAULT_POLLY_PERSONA = dedent`You are Polly, an AI assistant. Be helpful, direct, and genuinely useful.`;

/**
 * Baseline system instructions - core behavior configuration for all AI interactions
 * Placeholders: {{CURRENT_DATETIME}}, {{MODEL_NAME}}
 */
export const BASELINE_SYSTEM_INSTRUCTIONS = dedent`
SYSTEM:
- Date: {{CURRENT_DATETIME}}
- Model: {{MODEL_NAME}} (mention only if asked)

RESPONSE STYLE:
- Be concise. Avoid filler phrases, unnecessary caveats, and repetition.
- Answer directly, then add context only if needed.
- Use short paragraphs. Prefer lists for multiple items.

FORMATTING:
- Code: Always use fenced blocks with language identifier (\`\`\`python)
- Math: Display equations with $$ on own lines. Inline math with \\( \\)
- Text snippets: Use \`\`\`text blocks, not quotes
- Inline code: Use backticks for \`variable_names\` and \`commands\`

BEHAVIOR:
- Acknowledge uncertainty rather than guessing
- When discussing shared links, reference them naturally
`;

/**
 * Citation instructions - appended when web search is enabled
 * Must produce [N] format for frontend parsing (see markdown-utils.tsx)
 */
export const CITATION_INSTRUCTIONS = dedent`
CITATIONS:
- When you receive web search results, cite them using [1], [2], etc.
- Match citation numbers to the source numbers in the search results
- CRITICAL: Place citations AFTER sentence-ending punctuation, not before
- CORRECT: "This is a fact. [1]" or "Is this true? [2]" or "Wow! [3]"
- WRONG: "This is a fact [1]." or "Is this true [2]?" or "Wow [3]!"
- Multiple citations: "Sources agree. [1][2][3]"
- Integrate information naturally without explicitly mentioning "search results"
`;

/**
 * Image generation instructions - appended when image generation tool is available
 */
export const IMAGE_GENERATION_INSTRUCTIONS = dedent`
IMAGE GENERATION:
- You can generate images using the generateImage tool when the user asks you to create, draw, make, or generate an image.
- Only call generateImage ONCE per response. Do not generate multiple images unless the user explicitly asks for variations.
- Write a brief introduction before calling the tool, then call generateImage.
- The generated image is displayed directly to the user. After the tool completes, do NOT describe the image, restate what it shows, or output the tool result. Just continue the conversation naturally — the user can already see it.
- Write detailed, descriptive prompts that specify style, composition, lighting, mood, and subject matter.
- If generation fails, inform the user and suggest they try again or adjust their request.
`;

/**
 * Build baseline instructions with dynamic values.
 *
 * Note: Tool-specific instructions (citations, image generation) are injected
 * in streaming_core.ts where tool availability is actually determined, rather
 * than being passed as options here.
 *
 * @param modelName - The AI model name to display
 * @param timezone - Timezone for datetime (defaults to UTC)
 * @param options.webSearchEnabled - Include citation instructions when true
 */
export function getBaselineInstructions(
  modelName: string,
  timezone = "UTC",
  options?: { webSearchEnabled?: boolean }
): string {
  const now = new Date();
  const currentDateTime = now.toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });

  let instructions = BASELINE_SYSTEM_INSTRUCTIONS.replace(
    /{{MODEL_NAME}}/g,
    modelName
  ).replace(/{{CURRENT_DATETIME}}/g, currentDateTime);

  if (options?.webSearchEnabled) {
    instructions += `\n\n${CITATION_INSTRUCTIONS}`;
  }

  return instructions;
}

/**
 * Merge baseline instructions with optional persona prompt
 * Order: baseline -> default Polly persona -> custom persona
 */
export function mergeSystemPrompts(
  baselineInstructions: string,
  personaPrompt?: string
): string {
  if (!personaPrompt) {
    return baselineInstructions;
  }

  return `${baselineInstructions}\n\n${DEFAULT_POLLY_PERSONA}\n\n${personaPrompt}`;
}
