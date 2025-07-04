// Import parsers for various AI platform conversation formats

// Type definitions for various import formats
interface UnknownJsonData {
  [key: string]: unknown;
}

interface OpenAIMessageNode {
  id: string;
  message?: {
    id: string;
    author?: { role: string };
    content?: {
      content_type: string;
      parts?: string[];
    };
    create_time?: number;
    metadata?: {
      model_slug?: string;
      is_user_system_message?: boolean;
    };
  };
  parent?: string;
  children?: string[];
}

interface OpenAIConversation {
  title?: string;
  create_time?: number;
  update_time?: number;
  current_node?: string;
  mapping?: Record<string, OpenAIMessageNode>;
}

interface ClaudeMessage {
  type?: string;
  content?: string;
  text?: string;
  timestamp?: string;
  model?: string;
  role?: string;
}

interface ClaudeChat {
  title?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  messages?: ClaudeMessage[];
}

interface ClaudeExport {
  meta?: {
    title?: string;
  };
  chats?: ClaudeChat[];
}

interface OpenRouterMessage {
  role: string;
  content: string;
  timestamp?: string;
  model?: string;
}

interface OpenRouterConversation {
  title?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  messages?: OpenRouterMessage[];
}

// OpenRouter Playground export format
interface OpenRouterPlaygroundMessage {
  characterId: string;
  content: string;
  id: string;
  updatedAt: string;
  metadata?: {
    variantSlug?: string;
    provider?: string;
    cost?: string;
    tokensCount?: number;
  };
  attachments?: unknown[];
  files?: unknown[];
}

interface OpenRouterPlaygroundCharacter {
  id: string;
  model: string;
  modelInfo?: {
    name?: string;
    short_name?: string;
    author?: string;
  };
}

interface OpenRouterPlaygroundExport {
  version: string;
  characters: Record<string, OpenRouterPlaygroundCharacter>;
  messages: Record<string, OpenRouterPlaygroundMessage>;
}

// T3 Chat export format
interface T3ChatThread {
  _creationTime: number;
  _id: string;
  createdAt: number;
  generationStatus: string;
  lastMessageAt: number;
  model: string;
  pinned: boolean;
  threadId: string;
  title: string;
  updatedAt: number;
  userId: string;
  userSetTitle: boolean;
  visibility: string;
  id: string;
  last_message_at: number;
  created_at: number;
  updated_at: number;
  status: string;
  user_edited_title: boolean;
  // Messages might be included in some formats
  messages?: T3ChatMessage[];
}

interface T3ChatMessage {
  role: string;
  content: string;
  createdAt?: number;
  model?: string;
}

interface T3ChatExport {
  threads: T3ChatThread[];
}

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

// Main detection and parsing function
export function detectAndParseImportData(jsonContent: string): ImportResult {
  try {
    const data: UnknownJsonData = JSON.parse(jsonContent);

    // Try parsers in order of specificity
    // Start with most specific formats first

    // 1. Try Polly format (most specific)
    if (data.source === "polly" || data.source === "Polly") {
      return parsePollyFormat(data);
    }

    // 2. Try OpenAI ChatGPT format (has distinctive structure)
    if (isOpenAIFormat(data)) {
      return parseOpenAIFormat(data);
    }

    // 3. Try Claude format (has meta and chats structure)
    if (isClaudeFormat(data)) {
      return parseClaudeFormat(data);
    }

    // 4. Try T3 Chat format (has threads structure)
    if (isT3ChatFormat(data)) {
      return parseT3ChatFormat(data);
    }

    // 5. Try OpenRouter format (standard API messages)
    if (isOpenRouterFormat(data)) {
      return parseOpenRouterFormat(data);
    }

    // 6. Try generic array format
    if (Array.isArray(data)) {
      return parseGenericArrayFormat(data);
    }

    // 7. Try generic object format (single conversation)
    if (typeof data === "object" && data !== null) {
      return parseGenericObjectFormat(data);
    }

    throw new Error("Unrecognized JSON format");
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Invalid JSON";
    return {
      conversations: [],
      source: "Unknown",
      count: 0,
      errors: [`Failed to parse JSON: ${errorMessage}`],
    };
  }
}

// Polly format parser (existing format)
function parsePollyFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];

  if (!data.conversations || !Array.isArray(data.conversations)) {
    return {
      conversations: [],
      source: "Polly",
      count: 0,
      errors: ["Invalid Polly format: missing conversations array"],
    };
  }

  const conversations = data.conversations
    .map((conv: unknown, index: number) => {
      try {
        const convData = conv as UnknownJsonData;
        return {
          title:
            typeof convData.title === "string"
              ? convData.title
              : `Conversation ${index + 1}`,
          messages: Array.isArray(convData.messages)
            ? convData.messages.filter((msg: unknown) => {
                const msgData = msg as UnknownJsonData;
                return (
                  msgData.content &&
                  typeof msgData.content === "string" &&
                  msgData.content.trim() !== ""
                );
              })
            : [],
          createdAt:
            typeof convData.createdAt === "number"
              ? convData.createdAt
              : Date.now(),
          updatedAt:
            typeof convData.updatedAt === "number"
              ? convData.updatedAt
              : Date.now(),
          isArchived: Boolean(convData.isArchived),
          isPinned: Boolean(convData.isPinned),
        } as ParsedConversation;
      } catch (error) {
        errors.push(`Error parsing Polly conversation ${index + 1}: ${error}`);
        return null;
      }
    })
    .filter(
      (conv): conv is ParsedConversation =>
        conv !== null &&
        Array.isArray(conv.messages) &&
        conv.messages.length > 0
    );

  return {
    conversations,
    source: "Polly",
    count: conversations.length,
    errors,
  };
}

// OpenAI ChatGPT format detection
function isOpenAIFormat(data: UnknownJsonData): boolean {
  // ChatGPT exports have a distinctive structure with mapping and current_node
  return (
    typeof data === "object" &&
    data !== null &&
    // Single conversation format
    (Boolean(data.mapping && data.current_node) ||
      // Array of conversations format
      (Array.isArray(data) &&
        data.length > 0 &&
        typeof data[0] === "object" &&
        data[0] !== null &&
        Boolean(
          (data[0] as UnknownJsonData).mapping &&
            (data[0] as UnknownJsonData).current_node
        )))
  );
}

// OpenAI ChatGPT format parser
function parseOpenAIFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];
  const conversations: ParsedConversation[] = [];

  try {
    // Handle both single conversation and array of conversations
    const conversationsData = Array.isArray(data) ? data : [data];

    for (const [index, conv] of conversationsData.entries()) {
      try {
        const convData = conv as OpenAIConversation;
        const messages = extractOpenAIMessages(convData);

        if (messages.length === 0) {
          errors.push(
            `OpenAI conversation ${index + 1}: No valid messages found`
          );
          continue;
        }

        conversations.push({
          title: convData.title || `ChatGPT Conversation ${index + 1}`,
          messages,
          createdAt: convData.create_time
            ? Math.floor(convData.create_time * 1000)
            : Date.now(),
          updatedAt: convData.update_time
            ? Math.floor(convData.update_time * 1000)
            : Date.now(),
          isArchived: false,
          isPinned: false,
        });
      } catch (error) {
        errors.push(`Error parsing OpenAI conversation ${index + 1}: ${error}`);
      }
    }
  } catch (error) {
    errors.push(`Error parsing OpenAI format: ${error}`);
  }

  return {
    conversations,
    source: "OpenAI ChatGPT",
    count: conversations.length,
    errors,
  };
}

// Extract messages from OpenAI's complex mapping structure
function extractOpenAIMessages(
  conversation: OpenAIConversation
): ParsedConversation["messages"] {
  const messages: ParsedConversation["messages"] = [];
  const mapping = conversation.mapping || {};

  // Start from current_node and trace back through parents to build message chain
  const messageChain: OpenAIMessageNode[] = [];
  let currentNodeId = conversation.current_node;

  // Traverse the message tree
  while (currentNodeId && mapping[currentNodeId]) {
    const node = mapping[currentNodeId];
    if (node.message) {
      messageChain.unshift(node); // Add to beginning to maintain chronological order
    }
    currentNodeId = node.parent;
  }

  // Convert nodes to messages
  for (const node of messageChain) {
    const message = node.message;
    if (!message || !message.content) continue;

    const content = message.content;
    const author = message.author;

    // Skip messages without proper content
    if (
      content.content_type !== "text" ||
      !content.parts ||
      content.parts.length === 0
    ) {
      continue;
    }

    const textContent = content.parts.join("\n").trim();
    if (!textContent) continue;

    // Map OpenAI roles to our format
    let role: "user" | "assistant" | "system" = "user";
    if (author?.role === "assistant") {
      role = "assistant";
    } else if (author?.role === "system") {
      role = "system";
    } else if (author?.role === "user") {
      role = "user";
    }

    // Skip system messages unless they're user-created
    if (role === "system" && !message.metadata?.is_user_system_message) {
      continue;
    }

    messages.push({
      role,
      content: textContent,
      createdAt: message.create_time
        ? Math.floor(message.create_time * 1000)
        : Date.now(),
      model: message.metadata?.model_slug,
      provider: "openai",
    });
  }

  return messages;
}

// Claude format detection
function isClaudeFormat(data: UnknownJsonData): boolean {
  // Claude exports may have different structures, look for common patterns
  return (
    typeof data === "object" &&
    data !== null &&
    // Official Claude export format
    ((Boolean(data.meta) && Boolean(data.chats)) ||
      // Alternative format with conversation arrays
      (Array.isArray(data) &&
        data.length > 0 &&
        data.some((item: unknown) => {
          const itemData = item as UnknownJsonData;
          return (
            itemData.type === "prompt" ||
            itemData.type === "response" ||
            (itemData.role &&
              (itemData.role === "user" || itemData.role === "assistant"))
          );
        })))
  );
}

// Claude format parser
function parseClaudeFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];
  const conversations: ParsedConversation[] = [];

  try {
    if (data.meta && data.chats) {
      // Official Claude export format
      const claudeData = data as ClaudeExport;
      const chats = Array.isArray(claudeData.chats)
        ? claudeData.chats
        : [claudeData.chats];

      for (const [index, chat] of chats.entries()) {
        if (!chat) continue;

        try {
          const messages: ParsedConversation["messages"] = [];

          // Claude format typically has prompt/response pairs
          if (Array.isArray(chat.messages)) {
            for (const msg of chat.messages) {
              if (msg.type === "prompt" && msg.content) {
                messages.push({
                  role: "user",
                  content: msg.content,
                  createdAt: msg.timestamp
                    ? new Date(msg.timestamp).getTime()
                    : Date.now(),
                  provider: "anthropic",
                });
              } else if (msg.type === "response" && msg.content) {
                messages.push({
                  role: "assistant",
                  content: msg.content,
                  createdAt: msg.timestamp
                    ? new Date(msg.timestamp).getTime()
                    : Date.now(),
                  model: msg.model,
                  provider: "anthropic",
                });
              }
            }
          }

          if (messages.length > 0) {
            conversations.push({
              title:
                chat.title || chat.name || `Claude Conversation ${index + 1}`,
              messages,
              createdAt: chat.created_at
                ? new Date(chat.created_at).getTime()
                : Date.now(),
              updatedAt: chat.updated_at
                ? new Date(chat.updated_at).getTime()
                : Date.now(),
            });
          }
        } catch (error) {
          errors.push(
            `Error parsing Claude conversation ${index + 1}: ${error}`
          );
        }
      }
    } else if (Array.isArray(data)) {
      // Alternative Claude format - single conversation with message array
      const messages: ParsedConversation["messages"] = [];

      for (const item of data) {
        try {
          const itemData = item as ClaudeMessage;
          if (itemData.type === "prompt" || itemData.role === "user") {
            messages.push({
              role: "user",
              content: itemData.content || itemData.text || "",
              createdAt: itemData.timestamp
                ? new Date(itemData.timestamp).getTime()
                : Date.now(),
              provider: "anthropic",
            });
          } else if (
            itemData.type === "response" ||
            itemData.role === "assistant"
          ) {
            messages.push({
              role: "assistant",
              content: itemData.content || itemData.text || "",
              createdAt: itemData.timestamp
                ? new Date(itemData.timestamp).getTime()
                : Date.now(),
              model: itemData.model,
              provider: "anthropic",
            });
          }
        } catch (error) {
          errors.push(`Error parsing Claude message: ${error}`);
        }
      }

      if (messages.length > 0) {
        conversations.push({
          title: "Claude Conversation",
          messages: messages.filter(msg => msg.content.trim() !== ""),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  } catch (error) {
    errors.push(`Error parsing Claude format: ${error}`);
  }

  return {
    conversations,
    source: "Claude",
    count: conversations.length,
    errors,
  };
}

// T3 Chat format detection
function isT3ChatFormat(data: UnknownJsonData): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    Boolean(data.threads) &&
    Array.isArray(data.threads) &&
    data.threads.length > 0 &&
    // Check for the characteristic redundant keys that uniquely identify T3 Chat format
    data.threads.some((thread: unknown) => {
      const threadData = thread as UnknownJsonData;
      return (
        typeof threadData === "object" &&
        threadData !== null &&
        // Check for both camelCase and snake_case versions of the same keys
        Boolean(threadData.createdAt && threadData.created_at) &&
        Boolean(threadData.lastMessageAt && threadData.last_message_at)
      );
    })
  );
}

// T3 Chat format parser
function parseT3ChatFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];
  const conversations: ParsedConversation[] = [];

  try {
    const t3Data = data as unknown as T3ChatExport;
    const threads = t3Data.threads || [];

    for (const [index, thread] of threads.entries()) {
      try {
        const messages: ParsedConversation["messages"] = [];

        // T3 Chat threads might have embedded messages
        if (Array.isArray(thread.messages)) {
          for (const msg of thread.messages) {
            if (msg.role && msg.content) {
              messages.push({
                role: msg.role as "user" | "assistant" | "system",
                content: msg.content,
                createdAt: msg.createdAt,
                model: msg.model,
                provider: "t3chat",
              });
            }
          }
        } else {
          // If no messages are found, create a placeholder conversation
          // This maintains the thread information even without message content
          messages.push({
            role: "user",
            content: `[T3 Chat Thread: ${thread.title || `Thread ${index + 1}`}]`,
            createdAt: thread.createdAt || thread.created_at,
            model: thread.model,
            provider: "t3chat",
          });
        }

        if (messages.length > 0) {
          conversations.push({
            title: thread.title || `T3 Chat Thread ${index + 1}`,
            messages,
            createdAt: thread.createdAt || thread.created_at,
            updatedAt: thread.updatedAt || thread.updated_at,
            isArchived: thread.visibility === "archived",
            isPinned: thread.pinned,
          });
        }
      } catch (error) {
        errors.push(`Error parsing T3 Chat thread ${index + 1}: ${error}`);
      }
    }
  } catch (error) {
    errors.push(`Error parsing T3 Chat format: ${error}`);
  }

  return {
    conversations,
    source: "T3 Chat",
    count: conversations.length,
    errors,
  };
}

// OpenRouter format detection
function isOpenRouterFormat(data: UnknownJsonData): boolean {
  // Check for OpenRouter Playground format first (orpg.x.x)
  if (
    typeof data === "object" &&
    data !== null &&
    typeof data.version === "string" &&
    data.version.startsWith("orpg.") &&
    typeof data.characters === "object" &&
    typeof data.messages === "object"
  ) {
    return true;
  }

  // OpenRouter uses standard API format with messages array
  return (
    typeof data === "object" &&
    data !== null &&
    // Single conversation with messages array
    ((Array.isArray(data.messages) &&
      data.messages.some((msg: unknown) => {
        const msgData = msg as UnknownJsonData;
        return (
          msgData.role &&
          msgData.content &&
          ["user", "assistant", "system"].includes(msgData.role as string)
        );
      })) ||
      // Array of conversations with messages
      (Array.isArray(data) &&
        data.length > 0 &&
        data.some((item: unknown) => {
          const itemData = item as UnknownJsonData;
          return (
            Array.isArray(itemData.messages) &&
            itemData.messages.some((msg: unknown) => {
              const msgData = msg as UnknownJsonData;
              return (
                msgData.role &&
                msgData.content &&
                ["user", "assistant", "system"].includes(msgData.role as string)
              );
            })
          );
        })))
  );
}

// OpenRouter format parser
function parseOpenRouterFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];
  const conversations: ParsedConversation[] = [];

  try {
    // Check for OpenRouter Playground format (orpg.x.x)
    if (
      typeof data.version === "string" &&
      data.version.startsWith("orpg.") &&
      typeof data.characters === "object" &&
      typeof data.messages === "object"
    ) {
      return parseOpenRouterPlaygroundFormat(data);
    }

    // Handle standard OpenRouter API format (both single conversation and array of conversations)
    const conversationsData = Array.isArray(data) ? data : [data];

    for (const [index, conv] of conversationsData.entries()) {
      try {
        const convData = conv as OpenRouterConversation;
        if (!Array.isArray(convData.messages)) {
          errors.push(
            `OpenRouter conversation ${index + 1}: No messages array found`
          );
          continue;
        }

        const messages: ParsedConversation["messages"] = convData.messages
          .filter(
            (msg: OpenRouterMessage) =>
              msg.role &&
              msg.content &&
              typeof msg.content === "string" &&
              msg.content.trim() !== "" &&
              ["user", "assistant", "system"].includes(msg.role)
          )
          .map((msg: OpenRouterMessage) => ({
            role: msg.role as "user" | "assistant" | "system",
            content: msg.content,
            createdAt: msg.timestamp
              ? new Date(msg.timestamp).getTime()
              : Date.now(),
            model: msg.model,
            provider: "openrouter",
          }));

        if (messages.length > 0) {
          conversations.push({
            title:
              convData.title ||
              convData.name ||
              `OpenRouter Conversation ${index + 1}`,
            messages,
            createdAt: convData.created_at
              ? new Date(convData.created_at).getTime()
              : Date.now(),
            updatedAt: convData.updated_at
              ? new Date(convData.updated_at).getTime()
              : Date.now(),
          });
        }
      } catch (error) {
        errors.push(
          `Error parsing OpenRouter conversation ${index + 1}: ${error}`
        );
      }
    }
  } catch (error) {
    errors.push(`Error parsing OpenRouter format: ${error}`);
  }

  return {
    conversations,
    source: "OpenRouter API",
    count: conversations.length,
    errors,
  };
}

// OpenRouter Playground format parser (orpg.x.x)
function parseOpenRouterPlaygroundFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];
  const conversations: ParsedConversation[] = [];

  try {
    const playgroundData = data as unknown as OpenRouterPlaygroundExport;
    const characters = playgroundData.characters || {};
    const messages = playgroundData.messages || {};

    // Convert messages object to array and sort by updatedAt
    const messageArray = Object.values(messages).sort((a, b) => {
      const timeA = new Date(a.updatedAt).getTime();
      const timeB = new Date(b.updatedAt).getTime();
      return timeA - timeB;
    });

    if (messageArray.length === 0) {
      return {
        conversations: [],
        source: "OpenRouter Playground",
        count: 0,
        errors: ["No messages found in playground export"],
      };
    }

    const conversationMessages: ParsedConversation["messages"] = [];

    for (const msg of messageArray) {
      if (!msg.content || msg.content.trim() === "") {
        continue;
      }

      // Determine role based on characterId
      let role: "user" | "assistant" | "system" = "user";
      let model: string | undefined;
      let provider: string | undefined;

      if (msg.characterId === "USER") {
        role = "user";
      } else if (characters[msg.characterId]) {
        role = "assistant";
        const character = characters[msg.characterId];
        model =
          character.modelInfo?.short_name ||
          character.modelInfo?.name ||
          character.model;
        provider = msg.metadata?.provider || "openrouter";
      } else {
        // Unknown character, treat as assistant
        role = "assistant";
        provider = "openrouter";
      }

      conversationMessages.push({
        role,
        content: msg.content,
        createdAt: new Date(msg.updatedAt).getTime(),
        model,
        provider,
      });
    }

    if (conversationMessages.length > 0) {
      // Get the primary character for the title
      const primaryCharacter = Object.values(characters)[0];
      const title =
        primaryCharacter?.modelInfo?.name ||
        primaryCharacter?.modelInfo?.short_name ||
        "OpenRouter Playground Conversation";

      conversations.push({
        title,
        messages: conversationMessages,
        createdAt: conversationMessages[0]?.createdAt || Date.now(),
        updatedAt:
          conversationMessages[conversationMessages.length - 1]?.createdAt ||
          Date.now(),
      });
    }
  } catch (error) {
    errors.push(`Error parsing OpenRouter Playground format: ${error}`);
  }

  return {
    conversations,
    source: "OpenRouter Playground",
    count: conversations.length,
    errors,
  };
}

// Generic array format parser (fallback for various formats)
function parseGenericArrayFormat(data: unknown[]): ImportResult {
  const errors: string[] = [];
  const conversations: ParsedConversation[] = [];

  for (const [index, item] of data.entries()) {
    try {
      if (typeof item !== "object" || item === null) {
        continue;
      }

      const itemData = item as UnknownJsonData;

      // Try to extract title and messages
      const title =
        typeof itemData.title === "string"
          ? itemData.title
          : typeof itemData.name === "string"
            ? itemData.name
            : typeof itemData.subject === "string"
              ? itemData.subject
              : `Conversation ${index + 1}`;
      let messages: ParsedConversation["messages"] = [];

      if (Array.isArray(itemData.messages)) {
        messages = itemData.messages
          .filter((msg: unknown) => {
            const msgData = msg as UnknownJsonData;
            return (
              msgData.content &&
              typeof msgData.content === "string" &&
              msgData.content.trim() !== ""
            );
          })
          .map((msg: unknown) => {
            const msgData = msg as UnknownJsonData;
            return {
              role:
                msgData.role === "assistant" || msgData.role === "system"
                  ? (msgData.role as "assistant" | "system")
                  : ("user" as const),
              content: msgData.content as string,
              createdAt:
                typeof msgData.createdAt === "number"
                  ? msgData.createdAt
                  : typeof msgData.timestamp === "number"
                    ? msgData.timestamp
                    : Date.now(),
              model:
                typeof msgData.model === "string" ? msgData.model : undefined,
              provider:
                typeof msgData.provider === "string"
                  ? msgData.provider
                  : undefined,
            };
          });
      } else if (itemData.content && typeof itemData.content === "string") {
        // Single message conversation
        messages = [
          {
            role: "user",
            content: itemData.content,
            createdAt:
              typeof itemData.createdAt === "number"
                ? itemData.createdAt
                : typeof itemData.timestamp === "number"
                  ? itemData.timestamp
                  : Date.now(),
          },
        ];
      }

      if (messages.length > 0) {
        conversations.push({
          title,
          messages,
          createdAt:
            typeof itemData.createdAt === "number"
              ? itemData.createdAt
              : typeof itemData.timestamp === "number"
                ? itemData.timestamp
                : Date.now(),
          updatedAt:
            typeof itemData.updatedAt === "number"
              ? itemData.updatedAt
              : typeof itemData.timestamp === "number"
                ? itemData.timestamp
                : Date.now(),
          isArchived: Boolean(itemData.isArchived),
          isPinned: Boolean(itemData.isPinned),
        });
      }
    } catch (error) {
      errors.push(`Error parsing generic array item ${index + 1}: ${error}`);
    }
  }

  return {
    conversations,
    source: "Generic Array",
    count: conversations.length,
    errors,
  };
}

// Generic object format parser (single conversation fallback)
function parseGenericObjectFormat(data: UnknownJsonData): ImportResult {
  const errors: string[] = [];

  try {
    const title =
      typeof data.title === "string"
        ? data.title
        : typeof data.name === "string"
          ? data.name
          : typeof data.subject === "string"
            ? data.subject
            : "Imported Conversation";
    let messages: ParsedConversation["messages"] = [];

    if (Array.isArray(data.messages)) {
      messages = data.messages
        .filter((msg: unknown) => {
          const msgData = msg as UnknownJsonData;
          return (
            msgData.content &&
            typeof msgData.content === "string" &&
            msgData.content.trim() !== ""
          );
        })
        .map((msg: unknown) => {
          const msgData = msg as UnknownJsonData;
          return {
            role:
              msgData.role === "assistant" || msgData.role === "system"
                ? (msgData.role as "assistant" | "system")
                : ("user" as const),
            content: msgData.content as string,
            createdAt:
              typeof msgData.createdAt === "number"
                ? msgData.createdAt
                : typeof msgData.timestamp === "number"
                  ? msgData.timestamp
                  : Date.now(),
            model:
              typeof msgData.model === "string" ? msgData.model : undefined,
            provider:
              typeof msgData.provider === "string"
                ? msgData.provider
                : undefined,
          };
        });
    } else if (data.content && typeof data.content === "string") {
      // Single message
      messages = [
        {
          role: "user",
          content: data.content,
          createdAt:
            typeof data.createdAt === "number"
              ? data.createdAt
              : typeof data.timestamp === "number"
                ? data.timestamp
                : Date.now(),
        },
      ];
    }

    if (messages.length === 0) {
      return {
        conversations: [],
        source: "Generic Object",
        count: 0,
        errors: ["No valid messages found in object"],
      };
    }

    return {
      conversations: [
        {
          title,
          messages,
          createdAt:
            typeof data.createdAt === "number"
              ? data.createdAt
              : typeof data.timestamp === "number"
                ? data.timestamp
                : Date.now(),
          updatedAt:
            typeof data.updatedAt === "number"
              ? data.updatedAt
              : typeof data.timestamp === "number"
                ? data.timestamp
                : Date.now(),
          isArchived: Boolean(data.isArchived),
          isPinned: Boolean(data.isPinned),
        },
      ],
      source: "Generic Object",
      count: 1,
      errors,
    };
  } catch (error) {
    errors.push(`Error parsing generic object: ${error}`);
    return {
      conversations: [],
      source: "Generic Object",
      count: 0,
      errors,
    };
  }
}
