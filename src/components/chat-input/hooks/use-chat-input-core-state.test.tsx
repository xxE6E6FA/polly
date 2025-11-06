import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChatInputCoreState } from "@/components/chat-input/hooks/use-chat-input-core-state";
import {
  createChatInputStore,
  getChatInputStore,
  resetChatInputStoreApi,
  setChatInputStoreApi,
} from "@/stores/chat-input-store";
import type { Attachment, ConversationId } from "@/types";

// Import modules to spy on
const chatInputPreservationModule = await import(
  "@/hooks/use-chat-input-preservation"
);
const chatAttachmentsModule = await import("@/hooks/use-chat-attachments");

const createAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  type: "text",
  url: "memory://attachment",
  name: "note.txt",
  size: 1,
  ...overrides,
});

// Store isolation for Zustand stores
let originalStore: ReturnType<typeof getChatInputStore>;

beforeEach(() => {
  localStorage.clear();
  // Create isolated store instance for each test
  originalStore = getChatInputStore();
  setChatInputStoreApi(createChatInputStore());
});

afterEach(() => {
  // Restore original store instance
  setChatInputStoreApi(originalStore);
  // Clear spies
  mock.restore();
});

describe("useChatInputCoreState", () => {
  test("sets and reads input for new conversations", async () => {
    const conversationId =
      "use-chat-input-core-state:conv-new" as ConversationId;

    // Mock preservation hook
    const mockSetChatInputState = mock(() => {
      /* no-op mock */
    });
    const mockGetChatInputState = mock(() => ({
      input: "",
      attachments: [],
      reasoningConfig: { enabled: false, effort: "medium" as const },
      temperature: undefined,
    }));
    spyOn(
      chatInputPreservationModule,
      "useChatInputPreservation"
    ).mockReturnValue({
      setChatInputState: mockSetChatInputState,
      getChatInputState: mockGetChatInputState,
      clearChatInputState: mock(() => {
        /* no-op mock */
      }),
      clearAllConversationStates: mock(() => {
        /* no-op mock */
      }),
    } as any);

    // Mock attachments hook
    const mockSetAttachments = mock(() => {
      /* no-op mock */
    });
    spyOn(chatAttachmentsModule, "useChatAttachments").mockReturnValue({
      attachments: [],
      setAttachments: mockSetAttachments,
      clearAttachments: mock(() => {
        /* no-op mock */
      }),
    });

    const { result } = renderHook(() =>
      useChatInputCoreState({ conversationId })
    );

    expect(result.current.shouldUsePreservedState).toBe(true);
    expect(result.current.input).toBe("");

    act(() => {
      result.current.setInput("draft message");
    });

    await waitFor(() => {
      expect(result.current.input).toBe("draft message");
    });
  });

  test("clears input and attachments when resetCoreState is called", async () => {
    const conversationId =
      "use-chat-input-core-state:conv-reset" as ConversationId;

    // Mock preservation hook
    const mockClearChatInputState = mock(() => {
      /* no-op mock */
    });
    spyOn(
      chatInputPreservationModule,
      "useChatInputPreservation"
    ).mockReturnValue({
      setChatInputState: mock(() => {
        /* no-op mock */
      }),
      getChatInputState: mock(() => ({
        input: "",
        attachments: [],
        reasoningConfig: { enabled: false, effort: "medium" as const },
        temperature: undefined,
      })),
      clearChatInputState: mockClearChatInputState,
      clearAllConversationStates: mock(() => {
        /* no-op mock */
      }),
    } as any);

    // Mock attachments hook with mutable state
    const mockAttachments = [createAttachment()];
    const mockSetAttachments = mock(
      (value: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
        if (typeof value === "function") {
          mockAttachments.splice(
            0,
            mockAttachments.length,
            ...value(mockAttachments)
          );
        } else {
          mockAttachments.splice(0, mockAttachments.length, ...value);
        }
      }
    );
    spyOn(chatAttachmentsModule, "useChatAttachments").mockReturnValue({
      get attachments() {
        return mockAttachments;
      },
      setAttachments: mockSetAttachments,
      clearAttachments: mock(() => {
        mockAttachments.splice(0, mockAttachments.length);
      }),
    } as any);

    const { result } = renderHook(() =>
      useChatInputCoreState({ conversationId })
    );

    act(() => {
      result.current.setInput("with attachments");
      result.current.setAttachments([createAttachment()]);
    });

    await waitFor(() => {
      expect(result.current.input).toBe("with attachments");
      expect(result.current.attachments.length).toBe(1);
    });

    act(() => {
      result.current.resetCoreState();
    });

    await waitFor(() => {
      expect(result.current.input).toBe("");
      expect(result.current.attachments.length).toBe(0);
    });

    expect(mockClearChatInputState).toHaveBeenCalled();
  });

  test("disables preserved state when conversation already has messages", () => {
    const conversationId =
      "use-chat-input-core-state:conv-existing" as ConversationId;

    // Mock preservation hook
    spyOn(
      chatInputPreservationModule,
      "useChatInputPreservation"
    ).mockReturnValue({
      setChatInputState: mock(() => {
        /* no-op mock */
      }),
      getChatInputState: mock(() => ({
        input: "preserved-input",
        attachments: [],
        reasoningConfig: { enabled: false, effort: "medium" as const },
        temperature: undefined,
      })),
      clearChatInputState: mock(() => {
        /* no-op mock */
      }),
      clearAllConversationStates: mock(() => {
        /* no-op mock */
      }),
    } as any);

    // Mock attachments hook
    spyOn(chatAttachmentsModule, "useChatAttachments").mockReturnValue({
      attachments: [],
      setAttachments: mock(() => {
        /* no-op mock */
      }),
      clearAttachments: mock(() => {
        /* no-op mock */
      }),
    });

    const { result } = renderHook(() =>
      useChatInputCoreState({ conversationId, hasExistingMessages: true })
    );

    expect(result.current.shouldUsePreservedState).toBe(false);
    expect(result.current.input).toBe("");
  });
});
