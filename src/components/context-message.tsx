import { Link } from "react-router";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type ChatMessage } from "@/types";

type ContextMessageProps = {
  message: ChatMessage;
  className?: string;
};

export const ContextMessage = ({ message, className }: ContextMessageProps) => {
  if (message.role !== "context") {
    return null;
  }

  return (
    <div
      className={cn(
        "w-full px-6 py-4 mb-6 border border-accent-coral/20 rounded-xl bg-gradient-to-br from-accent-coral/5 to-accent-cyan/5",
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
                  className="h-6 px-2 text-xs text-accent-coral/80 hover:bg-accent-coral/10 hover:text-accent-coral"
                  size="sm"
                  variant="ghost"
                >
                  <ArrowSquareOutIcon className="mr-1 h-3 w-3" />
                  View original
                </Button>
              </Link>
            )}
          </div>

          <div className="text-sm leading-relaxed text-muted-foreground">
            {message.content}
          </div>
        </div>
      </div>
    </div>
  );
};
