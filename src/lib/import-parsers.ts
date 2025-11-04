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
      type: "image" | "pdf" | "text";
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

// Simplified detection - focus on Polly format only
export function detectAndParseImportData(jsonContent: string): ImportResult {
  try {
    const data = JSON.parse(jsonContent);

    // Check if it has the basic polly structure (even if corrupted)
    if (hasPollyStructure(data)) {
      return parsePollyFormat(data);
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

// Note: This function is available for future format validation if needed
// Currently not used, but kept for potential format checking enhancements
function _isPollyFormat(data: unknown): boolean {
  return (
    hasPollyStructure(data) &&
    Array.isArray((data as Record<string, unknown>).conversations)
  );
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
        messages: ((convData.messages as unknown[]) || []).map(
          (msg: unknown) => {
            const msgData = msg as Record<string, unknown>;
            return {
              role: ["user", "assistant", "system"].includes(
                msgData.role as string
              )
                ? (msgData.role as "user" | "assistant" | "system")
                : "user",
              content:
                msgData.content === null
                  ? "null"
                  : String(msgData.content || ""),
              createdAt:
                typeof msgData.createdAt === "number"
                  ? msgData.createdAt
                  : undefined,
              model:
                typeof msgData.model === "string" ? msgData.model : undefined,
              provider:
                typeof msgData.provider === "string"
                  ? msgData.provider
                  : undefined,
              reasoning:
                typeof msgData.reasoning === "string"
                  ? msgData.reasoning
                  : undefined,
              attachments:
                msgData.attachments as ParsedConversation["messages"][0]["attachments"],
            };
          }
        ),
        createdAt:
          typeof convData.createdAt === "number"
            ? convData.createdAt
            : undefined,
        updatedAt:
          typeof convData.updatedAt === "number"
            ? convData.updatedAt
            : undefined,
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
