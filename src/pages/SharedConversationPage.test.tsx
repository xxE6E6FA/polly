import type { Doc } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}));

const virtualizedMessagesMock = vi.hoisted(() => ({
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
}));

vi.mock(
  "@/components/virtualized-chat-messages",
  () => virtualizedMessagesMock
);
vi.mock("@/components/ui/animated-logo", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  AnimatedLogo: () => <div data-testid="animated-logo" />,
}));
vi.mock("@/components/ui/theme-toggle", () => ({
  /* biome-ignore lint/style/useNamingConvention: mock must mirror export name */
  ThemeToggle: () => <button type="button">toggle theme</button>,
}));

import { useQuery } from "convex/react";

import SharedConversationPage from "./SharedConversationPage";

const useQueryMock = vi.mocked(useQuery);

const renderSharedPage = () => {
  return render(
    <MemoryRouter initialEntries={["/share/share-123"]}>
      <Routes>
        <Route path="/share/:shareId" element={<SharedConversationPage />} />
      </Routes>
    </MemoryRouter>
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
  });

  it("shows a loading state while the shared conversation query resolves", () => {
    useQueryMock.mockReturnValue(undefined);

    renderSharedPage();

    expect(
      screen.getByTestId("shared-conversation-loading")
    ).toBeInTheDocument();
  });

  it("keeps the loading state until messages arrive", () => {
    useQueryMock.mockReturnValue({
      conversation: baseConversation,
      messages: undefined,
    } as unknown);

    renderSharedPage();

    expect(
      screen.getByTestId("shared-conversation-loading")
    ).toBeInTheDocument();
  });

  it("renders the shared conversation once data is available", () => {
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
