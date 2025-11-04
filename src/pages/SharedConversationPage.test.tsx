import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Doc } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PrivateModeProvider } from "@/providers/private-mode-context";
import { ToastProvider } from "@/providers/toast-context";

const useQueryMock = mock();
const useActionMock = mock();
const useMutationMock = mock();

mock.module("convex/react", () => ({
  useQuery: useQueryMock,
  useAction: useActionMock,
  useMutation: useMutationMock,
}));

const virtualizedMessagesFactory = () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  VirtualizedChatMessages: ({
    messages,
  }: {
    messages: Array<{ id: string; content?: string }>;
  }) => (
    <div data-testid="shared-message-list">
      {messages.map(message => (
        <div key={message.id}>{message.content}</div>
      ))}
    </div>
  ),
});

const virtualizedMessagesMock = virtualizedMessagesFactory();

mock.module(
  "@/components/virtualized-chat-messages",
  () => virtualizedMessagesMock
);
mock.module("@/components/ui/animated-logo", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  AnimatedLogo: () => <div data-testid="animated-logo" />,
}));
mock.module("@/components/ui/theme-toggle", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  ThemeToggle: () => <button type="button">toggle theme</button>,
}));

import SharedConversationPage from "./SharedConversationPage";

const renderSharedPage = () => {
  return render(
    <TooltipProvider>
      <ToastProvider>
        <PrivateModeProvider>
          <MemoryRouter initialEntries={["/share/share-123"]}>
            <Routes>
              <Route
                path="/share/:shareId"
                element={<SharedConversationPage />}
              />
            </Routes>
          </MemoryRouter>
        </PrivateModeProvider>
      </ToastProvider>
    </TooltipProvider>
  );
};

describe("SharedConversationPage", () => {
  const now = Date.now();
  const baseConversation = {
    _id: "conv-1",
    userId: "user-1",
    title: "Shared Demo",
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    isArchived: false,
  } as unknown as Doc<"conversations">;

  beforeEach(() => {
    useQueryMock.mockReset();
    useActionMock.mockReset();
    useMutationMock.mockReset();
  });

  test("shows a loading state while the shared conversation query resolves", () => {
    useQueryMock.mockReturnValue(undefined);

    renderSharedPage();

    expect(
      screen.getByTestId("shared-conversation-loading")
    ).toBeInTheDocument();
  });

  test("keeps the loading state until messages arrive", () => {
    useQueryMock.mockReturnValue({
      conversation: baseConversation,
      messages: undefined,
    } as unknown);

    renderSharedPage();

    expect(
      screen.getByTestId("shared-conversation-loading")
    ).toBeInTheDocument();
  });

  test("renders the shared conversation once data is available", () => {
    useQueryMock.mockReturnValue({
      conversation: baseConversation,
      messages: [
        {
          _id: "msg-1",
          conversationId: "conv-1",
          role: "assistant",
          content: "Hello from Polly",
          status: "done",
          createdAt: now,
          isMainBranch: true,
          attachments: [],
          citations: [],
          provider: "openai",
          model: "gpt-test",
          reasoning: undefined,
          parentId: null,
          sourceConversationId: null,
          metadata: {},
          _creationTime: now,
        } as unknown as Doc<"messages">,
      ],
    });

    renderSharedPage();

    expect(screen.getByText("Shared Demo")).toBeInTheDocument();
    expect(screen.getByText("Hello from Polly")).toBeInTheDocument();
  });
});
