import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";
import { act, render, waitFor } from "@testing-library/react";
import * as ReactRouterDom from "react-router-dom";
import {
  createMemoryRouter,
  RouterProvider,
  type useLoaderData,
} from "react-router-dom";
import { mockModuleWithRestore } from "../test/utils";

const createMock = mock;

const mockRetryFromMessage = createMock();
const mockSetPrivateMode = createMock();
const mockUseChat = createMock();
const mockUseQuery = createMock();
const mockUseAction = createMock();
const mockUseMutation = createMock();

let ChatConversationPage: typeof import("./ChatConversationPage").default;

await mockModuleWithRestore("@convex-dev/auth/react", actual => ({
  ...actual,
  useAuthToken: () => "token",
}));

await mockModuleWithRestore("@/providers/private-mode-context", actual => ({
  ...actual,
  usePrivateMode: () => ({
    isPrivateMode: false,
    setPrivateMode: mockSetPrivateMode,
  }),
}));

const registerMocks = () => {
  mock.module("convex/react", () => ({
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useAction: (...args: unknown[]) => mockUseAction(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useConvex: () => ({
      action: createMock(),
      mutation: createMock(),
      query: createMock(),
    }),
  }));

  mock.module("@/hooks/use-chat", () => ({
    useChat: (...args: unknown[]) => mockUseChat(...args),
    mapServerMessageToChatMessage: (msg: unknown) => msg,
  }));

  mock.module("@/hooks/use-conversation-model-override", () => ({
    useConversationModelOverride: () => ({}),
  }));

  mock.module("@/hooks/use-online", () => ({ useOnline: () => true }));

  mock.module("@/providers/toast-context", () => ({
    useToast: () => ({
      error: mock(),
      success: mock(),
      loading: mock(),
      dismiss: mock(),
      dismissAll: mock(),
    }),
  }));

  mock.module("@/stores/stream-overlays", () => ({
    useStreamOverlays: {
      getState: () => ({
        set: mock(),
        setReasoning: mock(),
        setStatus: mock(),
        clearCitations: mock(),
        clearTools: mock(),
      }),
    },
  }));

  mock.module("@/lib/ai/http-stream", () => ({ startAuthorStream: mock() }));
  mock.module("@/lib/ai/image-generation-handlers", () => ({
    handleImageGeneration: mock(),
    retryImageGeneration: mock(),
  }));

  mock.module("@/components/unified-chat-view", () => ({
    ["UnifiedChatView"]: () => <div data-testid="unified-chat-view" />,
  }));

  mock.module("@/components/ui/offline-placeholder", () => ({
    ["OfflinePlaceholder"]: () => <div data-testid="offline" />,
  }));

  mock.module("@/components/ui/not-found-page", () => ({
    ["NotFoundPage"]: () => <div data-testid="not-found" />,
  }));
};

const restoreMocks = () => {
  mock.restore();
};

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

beforeAll(async () => {
  registerMocks();
  const mod = await import("./ChatConversationPage");
  ChatConversationPage = mod.default;
});

describe("ChatConversationPage auto-retry", () => {
  let useLoaderDataSpy: ReturnType<
    typeof spyOn<typeof ReactRouterDom, typeof useLoaderData>
  >;

  beforeEach(() => {
    useLoaderDataSpy = spyOn(ReactRouterDom, "useLoaderData").mockReturnValue({
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
    });
    mockRetryFromMessage.mockClear();
    mockRetryFromMessage.mockResolvedValue(undefined);
    mockSetPrivateMode.mockClear();
    mockUseAction.mockImplementation(() => mock());
    mockUseMutation.mockImplementation(() => mock());
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
        sendMessage: mock(),
        editMessage: mock(),
        retryFromMessage: mockRetryFromMessage,
        deleteMessage: mock(),
        stopGeneration: mock(),
      })
    );
  });

  afterEach(() => {
    useLoaderDataSpy.mockRestore();
  });

  afterAll(() => {
    restoreMocks();
  });

  test("retries trailing user message when navigating between conversations", async () => {
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
