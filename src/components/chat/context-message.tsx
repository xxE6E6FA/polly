import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

type ContextMessageProps = {
  message: ChatMessage;
  className?: string;
};

export const ContextMessage = ({ message, className }: ContextMessageProps) => {
  if (message.role !== "context") {
    return null;
  }

  // Special handling for shared conversation notification
  if (message.id === "shared-notification") {
    return (
      <div className={cn("w-full px-6 py-8 text-center", className)}>
        <p className="text-sm text-muted-foreground mb-1">{message.content}</p>
        <Link to={ROUTES.HOME} className="text-sm text-primary hover:underline">
          Start your own conversation →
        </Link>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full px-6 py-4 mb-6 border rounded-xl bg-gradient-to-br from-primary/5 to-accent-blue/5 border-primary/20",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <h4 className="text-sm font-medium text-accent-coral">
              Context from previous conversation
            </h4>
            {message.sourceConversationId && (
              <Link
                className="inline-flex"
                to={ROUTES.CHAT_CONVERSATION(message.sourceConversationId)}
              >
                <Button
                  className="h-6 px-2 text-xs text-primary/80 hover:bg-primary/10 hover:text-primary"
                  size="sm"
                  variant="ghost"
                >
                  <ArrowSquareOutIcon className="mr-1 h-3 w-3" />
                  View original
                </Button>
              </Link>
            )}
          </div>

          <div className="text-sm leading-relaxed text-muted-foreground selectable-text">
            {message.content}
          </div>
        </div>
      </div>
    </div>
  );
};
