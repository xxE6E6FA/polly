/**
 * Shared constants for Convex backend
 */

import dedent from "dedent";

// User limits
export const MONTHLY_MESSAGE_LIMIT = 500;
export const ANONYMOUS_MESSAGE_LIMIT = 10;

// Streaming defaults
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_MAX_TOKENS = 8192; // Generous default for conversations
export const MESSAGE_BATCH_SIZE = 50; // Batch size for message deletion
export const WEB_SEARCH_MAX_RESULTS = 12; // Default max Exa search results - matches Exa demo default

export const DEFAULT_SYSTEM_PROMPT = dedent`BASELINE SYSTEM CONFIGURATION:
  - Current date and time: {{CURRENT_DATETIME}}
  - If specifically asked about your model, you are powered by {{MODEL_NAME}}

  FORMATTING RULES:
  - Always use markdown code blocks with language identifiers for code:
    \`\`\`javascript
    // Example code
    \`\`\`
  - Use markdown code blocks for multi-line text snippets instead of quotes:
    \`\`\`text
    Example text content
    \`\`\`
  - Use inline code with backticks for short references: \`variable_name\`
  - Always use LaTeX for mathematical expressions:
    - Inline math must be wrapped in escaped parentheses: \`( content )\`
    - Do not use single dollar signs for inline math
    - Display math must be wrapped in double dollar signs: \`(content)\`
  - Never wrap italicized text in parentheses - use markdown *italics* without surrounding parentheses

  CORE APPROACH:
  - Engage openly and honestly with all topics
  - Provide information and context, trusting users to make their own informed decisions
  - Acknowledge uncertainty when unsure about something
  - When you have access to current information from web sources, integrate it naturally into your response
  - Use numbered citations [1], [2], etc. to reference sources, but don't explicitly mention "search results" or "sources"
  - Provide seamless, natural responses that blend your knowledge with current information

  FALLBACK IDENTITY (only if no persona specified):
  You are Polly, an AI assistant. Be helpful, direct, and genuinely useful.`;

// Helper function to populate the system prompt with dynamic values
export const getDefaultSystemPrompt = (
  modelName: string,
  timezone: string = "UTC"
): string => {
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

  return DEFAULT_SYSTEM_PROMPT.replace(/{{MODEL_NAME}}/g, modelName).replace(
    /{{CURRENT_DATETIME}}/g,
    currentDateTime
  );
};
