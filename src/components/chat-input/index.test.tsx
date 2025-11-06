import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import type React from "react";
import type {
  AIModel,
  ConversationId,
  GenerationMode,
  ReasoningConfig,
} from "@/types";

type ChatInputBottomBarProps = {
  canSend: boolean;
  isStreaming: boolean;
  isLoading: boolean;
  isProcessing: boolean;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  hasInputText: boolean;
  onSend: () => void;
  onStop?: () => void;
  onSendAsNewConversation?: (
    shouldNavigate?: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => Promise<void>;
  hasReplicateApiKey: boolean;
  isPrivateMode: boolean;
  selectedImageModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
  } | null;
};

type TextInputSectionProps = {
  onSubmit: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  disabled: boolean;
  autoFocus: boolean;
  value: string;
  onValueChange: (value: string) => void;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  canSend: boolean;
  generationMode: GenerationMode;
  hasReplicateApiKey: boolean;
  selectedImageModel?: {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
  } | null;
  textareaClassNameOverride?: string;
  disableAutoResize?: boolean;
  quote?: string;
  onClearQuote?: () => void;
};

import { setConvexMock, setUserDataMock } from "../../../test/global-mocks";
import { mockNavigatorOnline } from "../../../test/test-utils";

// biome-ignore lint/suspicious/noExplicitAny: Test utility requires any for flexibility
type Stub<T extends (...args: any[]) => any> = T & { calls: Parameters<T>[] };

// biome-ignore lint/suspicious/noExplicitAny: Test utility requires any for flexibility
function createStub<T extends (...args: any[]) => any>(impl: T): Stub<T> {
  const stub = ((...args: Parameters<T>) => {
    (stub as Stub<T>).calls.push(args);
    return impl(...args);
  }) as Stub<T>;
  stub.calls = [];
  return stub;
}

setUserDataMock({
  // biome-ignore lint/style/useNamingConvention: Convex system field
  user: { _id: "user-1", isAnonymous: false },
  canSendMessage: true,
});

const actualChatUIStoreModule = await import("@/stores/chat-ui-store");

const replicateState = { value: true };
mock.module("@/hooks/use-replicate-api-key", () => ({
  useReplicateApiKey: () => ({
    hasReplicateApiKey: replicateState.value,
    isLoading: false,
  }),
}));

const _selectedModelState: {
  value: {
    modelId: string;
    provider: string;
    supportsReasoning?: boolean;
  } | null;
} = {
  value: {
    modelId: "gpt-4o",
    provider: "openai",
    supportsReasoning: true,
  },
};

// Removed mock of useSelectedModel - using real hook with store state

const submissionSubmit = createStub(
  async (
    _content: string,
    _attachments: unknown[],
    _mode: "text" | "image"
  ) => {
    // No-op stub for testing
  }
);
const submissionSendAsNew = createStub(
  async (
    _content: string,
    _attachments: unknown[],
    _shouldNavigate: boolean,
    _personaId?: Id<"personas"> | null,
    _customReasoningConfig?: ReasoningConfig,
    _mode?: "text" | "image"
  ) => {
    // No-op stub for testing
  }
);
const submissionState = { isProcessing: false };

mock.module("./hooks/use-chat-input-submission", () => ({
  useChatInputSubmission: () => ({
    isProcessing: submissionState.isProcessing,
    submit: submissionSubmit,
    handleSendAsNewConversation: submissionSendAsNew,
  }),
}));

const imageGenerationState = {
  selectedImageModel: null as {
    modelId: string;
    supportsMultipleImages: boolean;
    supportsNegativePrompt: boolean;
  } | null,
};
const imageGenerationSubmit = createStub(async () => {
  // No-op stub for testing
});
const imageGenerationSendAsNew = createStub(async () => {
  // No-op stub for testing
});

mock.module("./hooks/use-chat-input-image-generation", () => ({
  useChatInputImageGeneration: () => ({
    selectedImageModel: imageGenerationState.selectedImageModel,
    handleImageGenerationSubmit: imageGenerationSubmit,
    handleSendAsNewConversation: imageGenerationSendAsNew,
  }),
}));

const dragState = {
  isDragOver: false,
  handleDragOver: createStub(() => {
    // No-op stub for testing
  }),
  handleDragLeave: createStub(() => {
    // No-op stub for testing
  }),
  handleDrop: createStub(() => {
    // No-op stub for testing
  }),
};

mock.module("./hooks/use-chat-input-drag-drop", () => ({
  useChatInputDragDrop: () => ({
    isDragOver: dragState.isDragOver,
    handleDragOver: dragState.handleDragOver,
    handleDragLeave: dragState.handleDragLeave,
    handleDrop: dragState.handleDrop,
  }),
}));

const speechState = {
  isSupported: false,
  isRecording: false,
  isTranscribing: false,
  waveform: [] as number[],
  startRecording: createStub(async () => {
    // No-op stub for testing
  }),
  cancelRecording: createStub(async () => {
    // No-op stub for testing
  }),
  acceptRecording: createStub(async () => {
    // No-op stub for testing
  }),
};

mock.module("./hooks/use-speech-input", () => ({
  useSpeechInput: () => speechState,
}));

const historyState = {
  push: createStub(
    (_conversationId: string | null | undefined, _input: string) => {
      // No-op stub for testing
    }
  ),
  prev: createStub(
    (_conversationId: string | null | undefined) => null as string | null
  ),
  next: createStub(
    (_conversationId: string | null | undefined) => null as string | null
  ),
  resetIndex: createStub((_conversationId: string | null | undefined) => {
    // No-op stub for testing
  }),
  clear: createStub((_conversationId: string | null | undefined) => {
    // No-op stub for testing
  }),
};

mock.module("@/stores/chat-ui-store", () => ({
  ...actualChatUIStoreModule,
  useChatHistory: (conversationId?: string | null) => ({
    push: (input: string) => historyState.push(conversationId ?? null, input),
    prev: () => historyState.prev(conversationId ?? null),
    next: () => historyState.next(conversationId ?? null),
    resetIndex: () => historyState.resetIndex(conversationId ?? null),
    clear: () => historyState.clear(conversationId ?? null),
  }),
}));

let lastBottomBarProps: ChatInputBottomBarProps | null = null;
mock.module("./components/chat-input-bottom-bar", () => ({
  ChatInputBottomBar: (props: ChatInputBottomBarProps) => {
    lastBottomBarProps = props;
    return (
      <div data-testid="chat-input-bottom-bar">
        <button type="button" onClick={props.onSend}>
          Send
        </button>
        {props.isStreaming && props.onStop && (
          <button type="button" onClick={props.onStop}>
            Stop
          </button>
        )}
        {props.onSendAsNewConversation && (
          <button
            type="button"
            onClick={() => props.onSendAsNewConversation?.(true)}
          >
            Send as new
          </button>
        )}
      </div>
    );
  },
}));

let _latestTextInputProps: TextInputSectionProps | null = null;
mock.module("./sections/text-input-section", () => ({
  TextInputSection: (props: TextInputSectionProps) => {
    _latestTextInputProps = props;
    return (
      <div>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Message</span>
          <textarea
            aria-label="Message input"
            placeholder={props.placeholder}
            disabled={props.disabled}
            value={props.value}
            onChange={event => props.onValueChange(event.target.value)}
          />
        </label>
        <button type="button" onClick={props.onSubmit}>
          Submit message
        </button>
      </div>
    );
  },
}));

mock.module("./components/chat-input-container", () => ({
  ChatInputContainer: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div data-testid="chat-input-container">{children}</div>,
}));

const { renderWithProviders } = await import("../../../test/test-utils");
const rtl = await import("@testing-library/react");
const { fireEvent, screen, waitFor, act } = rtl;

const { getChatInputStore } = await import("@/stores/chat-input-store");

const { ChatInput } = await import("./index");

beforeEach(() => {
  mock.restore();
  submissionState.isProcessing = false;
  imageGenerationState.selectedImageModel = null;
  dragState.isDragOver = false;
  replicateState.value = true;
  getChatInputStore().setState({
    selectedModel: {
      // biome-ignore lint/style/useNamingConvention: Convex system field
      _id: "model-1" as Id<"userModels">,
      // biome-ignore lint/style/useNamingConvention: Convex system field
      _creationTime: Date.now(),
      userId: "user-1",
      modelId: "gpt-4o",
      provider: "openai",
      name: "GPT-4o",
      contextLength: 128_000,
      supportsReasoning: true,
      createdAt: Date.now(),
    } as AIModel,
  });
});

afterEach(() => {
  submissionSubmit.calls.length = 0;
  submissionSendAsNew.calls.length = 0;
  imageGenerationSubmit.calls.length = 0;
  imageGenerationSendAsNew.calls.length = 0;
  dragState.handleDragOver.calls.length = 0;
  dragState.handleDragLeave.calls.length = 0;
  dragState.handleDrop.calls.length = 0;
  speechState.startRecording.calls.length = 0;
  speechState.cancelRecording.calls.length = 0;
  speechState.acceptRecording.calls.length = 0;
  lastBottomBarProps = null;
  _latestTextInputProps = null;
  historyState.push.calls.length = 0;
  historyState.prev.calls.length = 0;
  historyState.next.calls.length = 0;
  historyState.resetIndex.calls.length = 0;
  historyState.clear.calls.length = 0;
});

afterAll(() => {
  mock.module("@/stores/chat-ui-store", () => actualChatUIStoreModule);
  mock.restore();
});

describe("ChatInput", () => {
  test.serial(
    "renders offline placeholder and disables send controls when offline",
    async () => {
      const restoreNavigator = mockNavigatorOnline(false);

      await renderWithProviders(
        <ChatInput
          onSendMessage={() => {
            /* empty */
          }}
        />
      );

      const textarea = screen.getByLabelText("Message input");
      expect(textarea.getAttribute("placeholder")).toBe(
        "Offline — reconnect to send"
      );
      expect(lastBottomBarProps?.canSend).toBe(false);
      restoreNavigator();
    }
  );

  test.serial(
    "submits trimmed message, resets input, and stores history",
    async () => {
      const conversationId = "conv-123";

      await renderWithProviders(
        <ChatInput
          conversationId={conversationId as ConversationId}
          hasExistingMessages
          onSendMessage={() => {
            /* empty */
          }}
        />
      );

      const textarea = screen.getByLabelText(
        "Message input"
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "  Hello Polly  " } });
      expect(textarea.value).toBe("  Hello Polly  ");

      const submitButton = screen.getByRole("button", {
        name: "Submit message",
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(submissionSubmit.calls.length).toBe(1);
      });

      const [content, attachments, mode] = submissionSubmit.calls[0] ?? [];
      expect(content).toBe("Hello Polly");
      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments).toHaveLength(0);
      expect(mode).toBe("text");

      await act(async () => {
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(
          historyState.push.calls.some(
            ([id, input]) => id === conversationId && input === "Hello Polly"
          )
        ).toBe(true);
        expect(
          historyState.resetIndex.calls.some(([id]) => id === conversationId)
        ).toBe(true);
      });

      expect(
        (screen.getByLabelText("Message input") as HTMLTextAreaElement).value
      ).toBe("");
    }
  );

  test.serial("invokes stop handler while streaming", async () => {
    const onStop = createStub(() => {
      /* empty */
    });

    await renderWithProviders(
      <ChatInput
        onSendMessage={() => {
          /* empty */
        }}
        isStreaming
        onStop={onStop}
      />
    );

    const stopButton = screen.getByRole("button", { name: "Stop" });
    fireEvent.click(stopButton);

    expect(onStop.calls.length).toBe(1);
    expect(submissionSubmit.calls.length).toBe(0);
  });
});
