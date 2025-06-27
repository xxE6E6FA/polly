import { Link, useParams } from "react-router";

import { useQuery } from "convex/react";

import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/components/ui/not-found-page";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { VirtualizedChatMessages } from "@/components/virtualized-chat-messages";
import { ROUTES } from "@/lib/routes";

import { api } from "../../convex/_generated/api";

export default function SharedConversationRoute() {
  const { shareId } = useParams();

  if (!shareId) {
    throw new Error("Share ID is required");
  }

  // Fetch the shared conversation data
  const sharedData = useQuery(api.sharedConversations.getSharedConversation, {
    shareId,
  });

  // Loading state
  if (sharedData === undefined) {
    return null; // Let the route-level Suspense handle the loading state
  }

  // Not found state
  if (sharedData === null) {
    return <NotFoundPage />;
  }

  const { conversation, messages } = sharedData;

  // Transform messages to match ChatMessage type and filter out sensitive data
  const chatMessages = messages.map(msg => ({
    id: msg._id,
    role: msg.role,
    content: msg.content,
    reasoning: undefined, // Remove reasoning for shared conversations
    model: msg.model,
    provider: msg.provider,
    parentId: msg.parentId || undefined,
    isMainBranch: msg.isMainBranch,
    sourceConversationId: msg.sourceConversationId || undefined,
    useWebSearch: msg.useWebSearch || false,
    attachments: undefined, // Remove attachments for privacy
    createdAt: msg._creationTime,
    metadata: msg.metadata || undefined,
    citations: msg.citations || undefined,
  }));

  // Add a notification as a context message - these are shown at the top and scroll with content
  const notificationMessage = {
    id: "shared-notification",
    role: "context" as const,
    content: "This is a shared copy of a conversation from Polly",
    isMainBranch: true,
    createdAt: 0,
    sourceConversationId: undefined,
  };

  // Combine notification with messages
  const allMessages = [notificationMessage, ...chatMessages];

  // Render the shared conversation view with minimal UI
  return (
    <div className="flex h-screen w-full flex-col bg-background">
      {/* Header with branding */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 sm:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Left side - Polly branding and conversation title */}
            <div className="flex items-center gap-3">
              {/* Polly logo */}
              <Link to={ROUTES.HOME} className="flex items-center gap-2">
                <img
                  src="/polly-mascot.png"
                  alt="Polly"
                  className="h-9 w-9 rounded-lg object-contain"
                />
                <span className="hidden text-lg font-semibold text-foreground sm:inline">
                  Polly
                </span>
              </Link>

              {/* Separator */}
              <div className="h-5 w-px bg-border" />

              {/* Conversation title */}
              <h1 className="truncate text-sm font-medium text-foreground">
                {conversation.title || "Shared Conversation"}
              </h1>
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button asChild size="sm" variant="primary">
                <Link to={ROUTES.HOME}>Try the app</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages container */}
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
