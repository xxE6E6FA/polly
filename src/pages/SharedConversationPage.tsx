import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatedLogo } from "@/components/ui/animated-logo";
import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { VirtualizedChatMessages } from "@/components/virtualized-chat-messages";

import { ROUTES } from "@/lib/routes";
import type { ChatMessage, ConversationId } from "@/types";

export default function SharedConversationPage() {
  const { shareId } = useParams();

  const sharedData = useQuery(
    api.sharedConversations.getSharedConversation,
    shareId ? { shareId } : "skip"
  );

  const sharedTitle = sharedData?.conversation?.title as string | undefined;

  useEffect(() => {
    if (sharedTitle && sharedTitle !== document.title) {
      document.title = sharedTitle;
    }

    return () => {
      document.title = "Polly";
    };
  }, [sharedTitle]);

  if (!shareId) {
    return <NotFoundPage />;
  }

  if (sharedData === undefined) {
    return null;
  }

  if (sharedData === null) {
    return <NotFoundPage />;
  }

  const { conversation, messages } = sharedData;

  const chatMessages: ChatMessage[] = messages.map(
    (msg: Doc<"messages">): ChatMessage => ({
      id: msg._id,
      role: msg.role as ChatMessage["role"],
      content: msg.content,
      status: msg.status,
      reasoning: msg.reasoning,
      model: msg.model,
      provider: msg.provider,
      parentId: msg.parentId,
      isMainBranch: msg.isMainBranch,
      sourceConversationId: msg.sourceConversationId as
        | ConversationId
        | undefined,
      useWebSearch: msg.useWebSearch,
      attachments: undefined,
      createdAt: msg._creationTime,
      metadata: msg.metadata,
      citations: msg.citations,
    })
  );

  const notificationMessage: ChatMessage = {
    id: "shared-notification",
    role: "context" as const,
    content: "This is a shared copy of a conversation from Polly",
    isMainBranch: true,
    createdAt: 0,
  };

  const allMessages = [notificationMessage, ...chatMessages];

  return (
    <div className="flex min-h-[100dvh] w-full flex-col bg-background">
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to={ROUTES.HOME} className="flex items-center gap-2">
                <AnimatedLogo alt="Polly" size={40} floating={false} />
                <span className="hidden text-lg font-semibold text-foreground sm:inline">
                  Polly
                </span>
              </Link>

              <div className="h-5 w-px bg-border" />

              <h1 className="truncate text-sm font-medium text-foreground">
                {conversation.title || "Shared Conversation"}
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild size="sm" variant="primary">
                <Link to={ROUTES.HOME}>Try the app</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {chatMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">
              No messages in this conversation
            </p>
          </div>
        ) : (
          <div className="h-full">
            <VirtualizedChatMessages
              messages={allMessages}
              isStreaming={false}
              onEditMessage={undefined}
              onRetryUserMessage={undefined}
              onRetryAssistantMessage={undefined}
              onDeleteMessage={undefined}
              scrollElement={null}
              shouldScrollToBottom={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
