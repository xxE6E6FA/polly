import React from "react";
import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Spinner } from "@/components/spinner";
import { NotFoundPage } from "@/components/ui/not-found-page";

import { ChatMessage } from "@/components/chat-message";
import { ContextMessage } from "@/components/context-message";
import { ThemeToggle } from "@/components/ui/theme-toggle";

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
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  // Not found state
  if (sharedData === null) {
    return <NotFoundPage />;
  }

  const { conversation, messages, sharedAt } = sharedData;

  // Transform messages to match ChatMessage type and filter out sensitive data
  const chatMessages = messages.map(msg => ({
    id: msg._id,
    role: msg.role,
    content: msg.content,
    reasoning: undefined, // Remove reasoning for shared conversations
    model: msg.model,
    provider: msg.provider,
    parentId: msg.parentId,
    isMainBranch: msg.isMainBranch,
    sourceConversationId: msg.sourceConversationId,
    useWebSearch: msg.useWebSearch,
    attachments: undefined, // Remove attachments for privacy
    createdAt: msg._creationTime,
  }));

  // Render the shared conversation view with minimal UI
  return (
    <div className="h-screen w-full bg-background flex flex-col">
      {/* Minimal header for shared conversations */}
      <div className="border-b bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-sm font-medium text-foreground">
                {conversation.title || "Shared Conversation"}
              </h1>
              <span className="text-xs text-muted-foreground">
                Shared on {new Date(sharedAt).toLocaleDateString()}
              </span>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Messages container */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-8 pb-32">
          <div className="max-w-3xl mx-auto space-y-2 sm:space-y-3">
            {chatMessages
              .filter(message => {
                if (message.role === "system") {
                  return false;
                }
                if (message.role === "assistant") {
                  return message.content || message.reasoning;
                }
                return true;
              })
              .sort((a, b) => {
                if (a.role === "context" && b.role !== "context") return -1;
                if (b.role === "context" && a.role !== "context") return 1;
                return 0;
              })
              .map(message => (
                <div key={message.id} id={message.id}>
                  {message.role === "context" ? (
                    <ContextMessage message={message} />
                  ) : (
                    <ChatMessage
                      message={message}
                      isStreaming={false}
                      // Pass undefined for all actions to hide buttons
                      onEditMessage={undefined}
                      onRetryMessage={undefined}
                      onDeleteMessage={undefined}
                    />
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Footer notice */}
      <div className="border-t bg-muted/30 p-4">
        <p className="text-xs text-center text-muted-foreground">
          This is a read-only view of a shared conversation
        </p>
      </div>
    </div>
  );
}
