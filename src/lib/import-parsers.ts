export interface ParsedConversation {
  title: string;
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    createdAt?: number;
    model?: string;
    provider?: string;
    reasoning?: string;
    attachments?: Array<{
      type: "image" | "pdf" | "text" | "audio" | "video";
      name: string;
      size: number;
    }>;
  }>;
  createdAt?: number;
  updatedAt?: number;
  isArchived?: boolean;
  isPinned?: boolean;
}

export interface ImportResult {
  conversations: ParsedConversation[];
  source: string;
  count: number;
  errors: string[];
}

/**
 * Parse a timestamp that may be a number (epoch ms) or an ISO string.
 * Returns a numeric timestamp or undefined.
 */
function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function detectAndParseImportData(content: string): ImportResult {
  // Check if content looks like markdown (starts with #)
  const trimmed = content.trim();
  if (trimmed.startsWith("#")) {
    return parseMarkdownImport(trimmed);
  }

  try {
    const data = JSON.parse(content);

    // Standard Polly format: { conversations: [...] }
    if (hasPollyStructure(data)) {
      return parsePollyFormat(data);
    }

    // Legacy single-conversation format: { conversation: {...}, messages: [...] }
    if (hasLegacySingleConversationStructure(data)) {
      return parseLegacySingleConversation(data);
    }

    return {
      conversations: [],
      source: "unknown",
      count: 0,
      errors: ["Only Polly export format is supported"],
    };
  } catch {
    return {
      conversations: [],
      source: "unknown",
      count: 0,
      errors: ["Invalid JSON format"],
    };
  }
}

function hasPollyStructure(data: unknown): boolean {
  return typeof data === "object" && data !== null && "conversations" in data;
}

function hasLegacySingleConversationStructure(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "conversation" in data &&
    "messages" in data
  );
}

function parseMessage(msgData: Record<string, unknown>) {
  return {
    role: ["user", "assistant", "system"].includes(msgData.role as string)
      ? (msgData.role as "user" | "assistant" | "system")
      : "user",
    content: msgData.content === null ? "null" : String(msgData.content || ""),
    createdAt: parseTimestamp(msgData.createdAt),
    model: typeof msgData.model === "string" ? msgData.model : undefined,
    provider:
      typeof msgData.provider === "string" ? msgData.provider : undefined,
    reasoning:
      typeof msgData.reasoning === "string" ? msgData.reasoning : undefined,
    attachments:
      msgData.attachments as ParsedConversation["messages"][0]["attachments"],
  };
}

function parsePollyFormat(data: Record<string, unknown>): ImportResult {
  try {
    const conversations = data.conversations as unknown[];
    if (!Array.isArray(conversations)) {
      throw new Error("conversations is not an array");
    }
    const parsed: ParsedConversation[] = conversations.map((conv: unknown) => {
      const convData = conv as Record<string, unknown>;
      return {
        title: String(convData.title || "Untitled Conversation"),
        messages: ((convData.messages as unknown[]) || []).map((msg: unknown) =>
          parseMessage(msg as Record<string, unknown>)
        ),
        createdAt: parseTimestamp(convData.createdAt),
        updatedAt: parseTimestamp(convData.updatedAt),
        isArchived: Boolean(convData.isArchived),
        isPinned: Boolean(convData.isPinned),
      };
    });

    return {
      conversations: parsed,
      source: "polly",
      count: parsed.length,
      errors: [],
    };
  } catch {
    return {
      conversations: [],
      source: "polly",
      count: 0,
      errors: ["Failed to parse Polly format"],
    };
  }
}

function parseLegacySingleConversation(
  data: Record<string, unknown>
): ImportResult {
  try {
    const convData = data.conversation as Record<string, unknown>;
    const messages = data.messages as unknown[];

    if (!Array.isArray(messages)) {
      throw new Error("messages is not an array");
    }

    const parsed: ParsedConversation = {
      title: String(convData?.title || "Untitled Conversation"),
      messages: messages.map((msg: unknown) =>
        parseMessage(msg as Record<string, unknown>)
      ),
      createdAt: parseTimestamp(convData?.createdAt),
      updatedAt: parseTimestamp(convData?.updatedAt),
    };

    return {
      conversations: [parsed],
      source: "polly",
      count: 1,
      errors: [],
    };
  } catch {
    return {
      conversations: [],
      source: "polly",
      count: 0,
      errors: ["Failed to parse legacy Polly format"],
    };
  }
}

/**
 * Parse a markdown file exported by Polly's `exportAsMarkdown()`.
 *
 * Expected structure:
 * ```
 * # Title
 * **Created:** <date>
 * **Updated:** <date>
 * ---
 * ## 👤 User
 * *<timestamp>*
 * ...content...
 * ---
 * ## 🤖 Assistant
 * *<timestamp>*
 * **Model:** model-name (provider)
 * ### Reasoning
 * ...reasoning text...
 * ...content...
 * ---
 * ```
 */
function parseMarkdownImport(content: string): ImportResult {
  try {
    const lines = content.split("\n");

    // Parse title from first heading
    const titleMatch = lines[0]?.match(/^#\s+(.+)$/);
    if (!titleMatch) {
      return {
        conversations: [],
        source: "polly",
        count: 0,
        errors: ["Could not find conversation title in markdown"],
      };
    }
    const title = (titleMatch[1] ?? "").trim();

    // Parse Created/Updated dates
    let createdAt: number | undefined;
    let updatedAt: number | undefined;

    for (const line of lines.slice(1, 6)) {
      const createdMatch = line.match(/^\*\*Created:\*\*\s*(.+)$/);
      if (createdMatch) {
        createdAt = parseTimestamp(createdMatch[1]?.trim());
      }
      const updatedMatch = line.match(/^\*\*Updated:\*\*\s*(.+)$/);
      if (updatedMatch) {
        updatedAt = parseTimestamp(updatedMatch[1]?.trim());
      }
    }

    // Split into message sections by ## headings
    const messages: ParsedConversation["messages"] = [];
    const sectionRegex = /^##\s+(👤|🤖)\s+(User|Assistant)\s*$/;

    let currentRole: "user" | "assistant" | null = null;
    let currentTimestamp: number | undefined;
    let currentModel: string | undefined;
    let currentProvider: string | undefined;
    let currentReasoning: string[] = [];
    let currentContent: string[] = [];
    let inReasoning = false;
    let inAttachmentsOrSources = false;

    const flushMessage = () => {
      if (currentRole) {
        const contentText = currentContent.join("\n").trim();
        if (contentText) {
          messages.push({
            role: currentRole,
            content: contentText,
            createdAt: currentTimestamp,
            model: currentModel,
            provider: currentProvider,
            reasoning:
              currentReasoning.length > 0
                ? currentReasoning.join("\n").trim()
                : undefined,
          });
        }
      }
      currentRole = null;
      currentTimestamp = undefined;
      currentModel = undefined;
      currentProvider = undefined;
      currentReasoning = [];
      currentContent = [];
      inReasoning = false;
      inAttachmentsOrSources = false;
    };

    for (const line of lines) {
      const sectionMatch = line.match(sectionRegex);
      if (sectionMatch) {
        flushMessage();
        currentRole = sectionMatch[2] === "User" ? "user" : "assistant";
        continue;
      }

      if (currentRole === null) {
        continue;
      }

      // Parse timestamp line: *<timestamp>*
      if (!currentTimestamp) {
        const timestampMatch = line.match(/^\*(.+)\*$/);
        if (timestampMatch) {
          currentTimestamp = parseTimestamp(timestampMatch[1]?.trim());
          continue;
        }
      }

      // Parse model line: **Model:** model-name (provider)
      const modelMatch = line.match(
        /^\*\*Model:\*\*\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/
      );
      if (modelMatch) {
        currentModel = modelMatch[1]?.trim();
        if (modelMatch[2]) {
          currentProvider = modelMatch[2].trim();
        }
        continue;
      }

      // Detect reasoning section
      if (line.match(/^###\s+Reasoning\s*$/)) {
        inReasoning = true;
        continue;
      }

      // Section separator - skip if it's the trailing ---
      if (line === "---") {
        continue;
      }

      // Skip attachment and citation blocks for content
      if (
        line.match(/^\*\*Attachments:\*\*/) ||
        line.match(/^\*\*Sources:\*\*/)
      ) {
        inAttachmentsOrSources = true;
        continue;
      }

      // Skip content within attachments/sources blocks (list items, citations)
      if (inAttachmentsOrSources) {
        // Exit attachments/sources mode when we hit a blank line or new section
        if (line === "" || line.match(/^###/) || line.match(/^##/)) {
          inAttachmentsOrSources = false;
          // Don't continue here - process the line normally (could be end of reasoning, etc.)
        } else {
          // Skip all content within attachments/sources sections
          continue;
        }
      }

      if (inReasoning) {
        // End reasoning mode when we hit a new section (not just blank lines)
        // This allows multi-paragraph reasoning with blank lines between paragraphs
        if (line.match(/^###/) || line.match(/^##/)) {
          inReasoning = false;
          // Don't continue - let the line be processed (might be attachments/sources header)
        } else if (line === "") {
          // Preserve blank lines within reasoning (for paragraph separation)
          if (currentReasoning.length > 0) {
            currentReasoning.push(line);
          }
          continue;
        } else {
          // Accumulate reasoning content
          currentReasoning.push(line);
          continue;
        }
      }

      // If we reach here and the line isn't processed by any special logic, add to content
      if (!inAttachmentsOrSources && line !== "") {
        currentContent.push(line);
      }
    }

    // Flush last message
    flushMessage();

    if (messages.length === 0) {
      return {
        conversations: [],
        source: "polly",
        count: 0,
        errors: ["No messages found in markdown file"],
      };
    }

    return {
      conversations: [
        {
          title,
          messages,
          createdAt,
          updatedAt,
        },
      ],
      source: "polly",
      count: 1,
      errors: [],
    };
  } catch {
    return {
      conversations: [],
      source: "polly",
      count: 0,
      errors: ["Failed to parse markdown format"],
    };
  }
}
