import { act, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRetryFromMessage = vi.fn();
const mockSetPrivateMode = vi.fn();
const mockUseChat = vi.fn();
const mockUseQuery = vi.fn();
const mockUseAction = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("@convex/_generated/api", () => ({
  api: {
    conversations: {
      getWithAccessInfo: "conversations.getWithAccessInfo",
      createBranchingConversation: "conversations.createBranchingConversation",
      setStreaming: "conversations.setStreaming",
    },
    apiKeys: {
      hasAnyApiKey: "apiKeys.hasAnyApiKey",
    },
    messages: {
      list: "messages.list",
      refineAssistantMessage: "messages.refineAssistantMessage",
    },
  },
}));

vi.mock("@convex-dev/auth/react", () => ({ useAuthToken: () => "token" }));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useAction: (...args: unknown[]) => mockUseAction(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useConvex: () => ({ action: vi.fn(), mutation: vi.fn(), query: vi.fn() }),
}));

vi.mock("@/hooks/use-chat", () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
}));

vi.mock("@/hooks/use-conversation-model-override", () => ({
  useConversationModelOverride: () => ({}),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useLoaderData: () => ({
      conversationAccessInfo: {
        hasAccess: true,
        isDeleted: false,
        conversation: {
          isArchived: false,
          title: "Conversation",
        },
      },
      messages: [],
      lastUsedModel: null,
      streamingStatus: false,
    }),
  };
});

vi.mock("@/hooks/use-online", () => ({ useOnline: () => true }));

vi.mock("@/providers/private-mode-context", () => ({
  usePrivateMode: () => ({
    isPrivateMode: false,
    setPrivateMode: mockSetPrivateMode,
  }),
}));

vi.mock("@/providers/toast-context", () => ({
  useToast: () => ({
    error: vi.fn(),
    success: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  }),
}));

vi.mock("@/stores/stream-overlays", () => ({
  useStreamOverlays: {
    getState: () => ({
      set: vi.fn(),
      setReasoning: vi.fn(),
      setStatus: vi.fn(),
      clearCitations: vi.fn(),
      clearTools: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/ai/http-stream", () => ({ startAuthorStream: vi.fn() }));
vi.mock("@/lib/ai/image-generation-handlers", () => ({
  retryImageGeneration: vi.fn(),
}));

vi.mock("@/components/unified-chat-view", () => ({
  ["UnifiedChatView"]: () => <div data-testid="unified-chat-view" />,
}));

vi.mock("@/components/ui/offline-placeholder", () => ({
  ["OfflinePlaceholder"]: () => <div data-testid="offline" />,
}));

vi.mock("@/components/ui/not-found-page", () => ({
  ["NotFoundPage"]: () => <div data-testid="not-found" />,
}));

import ChatConversationPage from "./ChatConversationPage";

const conversations = {
  "conv-1": [
    {
      id: "msg-1",
      role: "user" as const,
      content: "Hello",
      imageGeneration: undefined,
    },
  ],
  "conv-2": [
    {
      id: "msg-2",
      role: "user" as const,
      content: "Again",
      imageGeneration: undefined,
    },
  ],
};

describe("ChatConversationPage auto-retry", () => {
  beforeEach(() => {
    mockRetryFromMessage.mockClear();
    mockRetryFromMessage.mockResolvedValue(undefined);
    mockSetPrivateMode.mockClear();
    mockUseAction.mockImplementation(() => vi.fn());
    mockUseMutation.mockImplementation(() => vi.fn());
    mockUseQuery.mockImplementation((queryKey: unknown) => {
      const key = queryKey as string;
      if (key === "conversations.getWithAccessInfo") {
        return {
          hasAccess: true,
          isDeleted: false,
          conversation: {
            isArchived: false,
            title: "Conversation",
          },
        };
      }
      if (key === "apiKeys.hasAnyApiKey") {
        return true;
      }
      return undefined;
    });
    mockUseChat.mockImplementation(
      ({ conversationId }: { conversationId: string }) => ({
        messages:
          conversations[conversationId as keyof typeof conversations] ?? [],
        isLoading: false,
        isStreaming: false,
        sendMessage: vi.fn(),
        editMessage: vi.fn(),
        retryFromMessage: mockRetryFromMessage,
        deleteMessage: vi.fn(),
        stopGeneration: vi.fn(),
      })
    );
  });

  it("retries trailing user message when navigating between conversations", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/chat/:conversationId",
          element: <ChatConversationPage />,
        },
      ],
      {
        initialEntries: ["/chat/conv-1"],
      }
    );

    render(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(mockRetryFromMessage).toHaveBeenCalledWith("msg-1")
    );

    mockRetryFromMessage.mockClear();

    await act(async () => {
      await router.navigate("/chat/conv-2");
    });

    await waitFor(() =>
      expect(mockRetryFromMessage).toHaveBeenCalledWith("msg-2")
    );
  });
});
