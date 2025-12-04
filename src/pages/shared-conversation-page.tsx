import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { VirtualizedChatMessages } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ui/theme-toggle";

import { ROUTES } from "@/lib/routes";
import type { ChatMessage, ConversationId } from "@/types";

const logoMaskStyle: CSSProperties = {
  maskImage: "url('/favicon.svg')",
  maskSize: "contain",
  maskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskImage: "url('/favicon.svg')",
  WebkitMaskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
};

export default function SharedConversationPage() {
  const { shareId } = useParams();

  const sharedData = useQuery(
    api.sharedConversations.getSharedConversation,
    shareId ? { shareId } : "skip"
  );

  const pageTitle = useMemo(() => {
    const title = sharedData?.conversation?.title;
    if (typeof title === "string" && title.trim().length > 0) {
      return title;
    }
    return "Polly";
  }, [sharedData?.conversation?.title]);

  if (!shareId) {
    return <NotFoundPage />;
  }

  if (sharedData === undefined) {
    return <SharedConversationLoading />;
  }

  if (sharedData === null) {
    return <NotFoundPage />;
  }

  if (sharedData.messages == null) {
    return <SharedConversationLoading />;
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
    <>
      <title>{pageTitle}</title>
      <div className="flex min-h-[100dvh] w-full flex-col bg-background">
        <div className="border-b bg-muted/30">
          <div className="mx-auto max-w-5xl px-4 sm:px-8">
            <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-4">
              <div className="flex w-full flex-col items-center gap-2 text-center sm:flex-1 sm:flex-row sm:items-center sm:gap-3 sm:text-left">
                <Link
                  to={ROUTES.HOME}
                  className="group flex items-center gap-2 text-foreground"
                  aria-label="Go to Polly home"
                >
                  <span
                    className="polly-logo-gradient-unified h-7 w-7 shrink-0 sm:h-8 sm:w-8"
                    style={logoMaskStyle}
                    aria-hidden="true"
                  />
                  <span className="polly-logo-text-unified text-lg font-semibold leading-none">
                    Polly
                  </span>
                </Link>

                <div className="hidden h-5 w-px flex-shrink-0 bg-border sm:block" />

                <h1 className="min-w-0 truncate text-sm font-medium text-foreground sm:text-base">
                  {conversation.title || "Shared Conversation"}
                </h1>
              </div>

              <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-none sm:justify-end">
                <ThemeToggle
                  className="h-9 w-9 rounded-lg sm:h-8 sm:w-8"
                  size="icon-sm"
                />
                <Button
                  size="sm"
                  variant="primary"
                  className="w-full sm:w-auto sm:px-4"
                >
                  <Link to={ROUTES.HOME}>Try the app</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col bg-background">
          <section className="relative flex min-h-0 flex-1">
            <div className="relative flex flex-1 min-h-0">
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center px-6">
                    <p className="text-sm text-muted-foreground">
                      No messages in this conversation
                    </p>
                  </div>
                ) : (
                  <VirtualizedChatMessages
                    messages={allMessages}
                    isStreaming={false}
                    scrollElement={null}
                    shouldScrollToBottom={false}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const SharedConversationLoading = () => {
  return (
    <div
      className="flex min-h-[100dvh] w-full flex-col bg-background"
      aria-live="polite"
    >
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex shrink-0 items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full sm:h-7 sm:w-7" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="hidden h-5 w-px flex-shrink-0 bg-border sm:block" />
              <Skeleton className="h-4 flex-1" />
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-none sm:justify-end">
              <Skeleton className="h-9 w-9 rounded-lg sm:h-8 sm:w-8" />
              <Skeleton className="h-9 flex-1 rounded-md sm:h-8 sm:w-28 sm:flex-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div
          className="w-full max-w-3xl stack-lg"
          data-testid="shared-conversation-loading"
        >
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <p className="sr-only">Loading shared conversation…</p>
        </div>
      </div>
    </div>
  );
};
