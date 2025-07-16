// Removed unused imports - Doc and Id types are not used in this file

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

    // Polly format
    if (isPollyFormat(data)) {
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

function isPollyFormat(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "conversations" in data &&
    Array.isArray((data as Record<string, unknown>).conversations)
  );
}

function parsePollyFormat(data: Record<string, unknown>): ImportResult {
  try {
    const conversations = (data.conversations as unknown[]) || [];
    const parsed: ParsedConversation[] = conversations.map((conv: unknown) => {
      const convData = conv as Record<string, unknown>;
      return {
        title: String(convData.title || "Untitled Conversation"),
        messages: ((convData.messages as unknown[]) || []).map(
          (msg: unknown) => {
            const msgData = msg as Record<string, unknown>;
            return {
              role: (msgData.role as "user" | "assistant" | "system") || "user",
              content: String(msgData.content || ""),
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
