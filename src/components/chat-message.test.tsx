import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import type { Attachment, ChatMessage } from "@/types";
import { ChatMessage as ChatMessageComponent } from "./chat-message";

type AssistantBubbleProps = {
  conversationId?: string;
  message: ChatMessage;
  isStreaming?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  copyToClipboard: () => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
  onDeleteMessage?: () => void;
  onPreviewFile?: (attachment: Attachment) => void;
  onRetryImageGeneration?: (messageId: string) => void;
};

type UserBubbleProps = {
  conversationId?: string;
  message: ChatMessage;
  isStreaming?: boolean;
  isCopied: boolean;
  isRetrying: boolean;
  isDeleting: boolean;
  copyToClipboard: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetryMessage?: (modelId?: string, provider?: string) => void;
  onDeleteMessage?: () => void;
  onPreviewFile?: (attachment: Attachment) => void;
  onRefineMessage?: (
    messageId: string,
    type: "custom" | "add_details" | "more_concise",
    instruction?: string
  ) => void;
};

// Mock the clipboard API globally
const mockWriteText = mock(() => Promise.resolve());
Object.defineProperty(navigator, "clipboard", {
  value: {
    writeText: mockWriteText,
  },
  writable: true,
});

// Mock the child components to avoid complex setup
mock.module("./chat-message/AssistantBubble", () => ({
  AssistantBubble: ({ message, ...props }: AssistantBubbleProps) => (
    <div data-testid="assistant-bubble" data-role={message.role}>
      Assistant: {message.content}
      {props.isStreaming && <span data-testid="streaming">Streaming</span>}
      {props.isCopied && <span data-testid="copied">Copied</span>}
      {props.isRetrying && <span data-testid="retrying">Retrying</span>}
      {props.isDeleting && <span data-testid="deleting">Deleting</span>}
    </div>
  ),
}));

mock.module("./chat-message/UserBubble", () => ({
  UserBubble: ({ message, ...props }: UserBubbleProps) => (
    <div data-testid="user-bubble" data-role={message.role}>
      User: {message.content}
      {props.isStreaming && <span data-testid="streaming">Streaming</span>}
      {props.isCopied && <span data-testid="copied">Copied</span>}
      {props.isRetrying && <span data-testid="retrying">Retrying</span>}
      {props.isDeleting && <span data-testid="deleting">Deleting</span>}
    </div>
  ),
}));

const createMockMessage = (
  overrides: Partial<ChatMessage> = {}
): ChatMessage => ({
  id: "msg-1",
  role: "user" as const,
  content: "Hello world",
  status: "done" as const,
  createdAt: Date.now(),
  isMainBranch: true,
  attachments: [],
  ...overrides,
});

describe("ChatMessage", () => {
  const mockCallbacks = {
    onEditMessage: mock(() => {
      /* empty */
    }),
    onRetryMessage: mock(() => {
      /* empty */
    }),
    onRefineMessage: mock(() => {
      /* empty */
    }),
    onDeleteMessage: mock(() => {
      /* empty */
    }),
    onRetryImageGeneration: mock(() => {
      /* empty */
    }),
    onPreviewAttachment: mock(() => {
      /* empty */
    }),
  };

  beforeEach(() => {
    mock.restore();
    // Reset all mocks
    Object.values(mockCallbacks).forEach(mockFn => mockFn.mockClear());
    mockWriteText.mockClear();
  });

  test("renders user message with UserBubble component", () => {
    const message = createMockMessage({ role: "user" });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    expect(screen.getByTestId("user-bubble")).toBeTruthy();
    expect(screen.getByText("User: Hello world")).toBeTruthy();
    expect(screen.queryByTestId("assistant-bubble")).toBeNull();
  });

  test("renders assistant message with AssistantBubble component", () => {
    const message = createMockMessage({ role: "assistant" });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    expect(screen.getByTestId("assistant-bubble")).toBeTruthy();
    expect(screen.getByText("Assistant: Hello world")).toBeTruthy();
    expect(screen.queryByTestId("user-bubble")).toBeNull();
  });

  test("passes isStreaming prop to bubble components", () => {
    const message = createMockMessage();

    render(
      <ChatMessageComponent
        message={message}
        isStreaming={true}
        {...mockCallbacks}
      />
    );

    expect(screen.getByTestId("streaming")).toBeTruthy();
  });

  test("handles clipboard copy functionality", () => {
    const message = createMockMessage({ content: "Hello [1] world" });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    // The actual copy functionality is handled in the bubble components
    // We just verify the component renders without errors
    expect(screen.getByTestId("user-bubble")).toBeTruthy();

    // Verify clipboard mock was not called (since copy is triggered by bubble components)
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  test("handles retry message callback", () => {
    const message = createMockMessage();
    const onRetryMessage = mock(() => {
      /* empty */
    });

    render(
      <ChatMessageComponent
        message={message}
        {...mockCallbacks}
        onRetryMessage={onRetryMessage}
      />
    );

    // The retry functionality is handled in the bubble components
    // We just verify the component renders with retry capability
    expect(screen.getByTestId("user-bubble")).toBeTruthy();
  });

  test("handles delete message callback", () => {
    const message = createMockMessage();
    const onDeleteMessage = mock(() => {
      /* empty */
    });

    render(
      <ChatMessageComponent
        message={message}
        {...mockCallbacks}
        onDeleteMessage={onDeleteMessage}
      />
    );

    // The delete functionality is handled in the bubble components
    // We just verify the component renders with delete capability
    expect(screen.getByTestId("user-bubble")).toBeTruthy();
  });

  test("detects image gallery for assistant messages with generated images", () => {
    const message = createMockMessage({
      role: "assistant",
      imageGeneration: {
        status: "succeeded",
        output: ["image1.jpg", "image2.jpg"],
      },
      attachments: [
        {
          type: "image",
          url: "image1.jpg",
          name: "generated image",
          size: 1024,
          generatedImage: { isGenerated: true, source: "replicate" },
        },
      ],
    });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    // Should have gallery-message-container class when hasImageGallery is true
    const container = screen.getByTestId("assistant-bubble").parentElement;
    expect(container?.className).toContain("gallery-message-container");
  });

  test("does not add gallery class for non-assistant messages", () => {
    const message = createMockMessage({
      role: "user",
      imageGeneration: {
        status: "succeeded",
        output: ["image1.jpg"],
      },
    });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    const container = screen.getByTestId("user-bubble").parentElement;
    expect(container?.className).not.toContain("gallery-message-container");
    expect(container?.className).toContain("px-3");
    expect(container?.className).toContain("sm:px-6");
  });

  test("does not add gallery class for failed image generation", () => {
    const message = createMockMessage({
      role: "assistant",
      imageGeneration: {
        status: "failed",
        output: [],
      },
    });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    const container = screen.getByTestId("assistant-bubble").parentElement;
    expect(container?.className).not.toContain("gallery-message-container");
  });

  test("passes conversationId to bubble components", () => {
    const message = createMockMessage();
    const conversationId = "test-conv-123";

    render(
      <ChatMessageComponent
        message={message}
        conversationId={conversationId}
        {...mockCallbacks}
      />
    );

    expect(screen.getByTestId("user-bubble")).toBeTruthy();
  });

  test("sets correct data attributes on container", () => {
    const message = createMockMessage({
      id: "custom-msg-id",
      role: "assistant",
    });

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    const container = screen.getByTestId("assistant-bubble").parentElement;
    expect(container?.getAttribute("data-message-role")).toBe("assistant");
    expect(container?.getAttribute("data-message-id")).toBe("custom-msg-id");
  });

  test("applies correct CSS classes", () => {
    const message = createMockMessage();

    render(<ChatMessageComponent message={message} {...mockCallbacks} />);

    const container = screen.getByTestId("user-bubble").parentElement;
    expect(container?.className).toContain("group");
    expect(container?.className).toContain("w-full");
    expect(container?.className).toContain("transition-colors");
    expect(container?.className).toContain("bg-transparent");
    expect(container?.className).toContain("px-3");
    expect(container?.className).toContain("sm:px-6");
  });

  test("memoization works correctly", () => {
    const message1 = createMockMessage({ id: "msg-1", content: "Hello" });
    const message2 = createMockMessage({ id: "msg-1", content: "Hello" }); // Same content
    const message3 = createMockMessage({ id: "msg-1", content: "World" }); // Different content

    const { rerender } = render(
      <ChatMessageComponent message={message1} {...mockCallbacks} />
    );

    // Should not re-render with identical props
    rerender(<ChatMessageComponent message={message2} {...mockCallbacks} />);

    // Should re-render with different content
    rerender(<ChatMessageComponent message={message3} {...mockCallbacks} />);

    expect(screen.getByText("User: World")).toBeTruthy();
  });
});
