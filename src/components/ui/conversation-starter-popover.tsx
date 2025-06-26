import { useEffect, useState } from "react";

import { useNavigate } from "react-router";

import { useAction } from "convex/react";

import { Spinner } from "@/components/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useUser } from "@/hooks/use-user";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";

type ConversationStarterPopoverProps = {
  selectedText: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
};

export const ConversationStarterPopover = ({
  selectedText,
  open,
  onOpenChange,
  children,
  className,
}: ConversationStarterPopoverProps) => {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const generateStarters = useAction(
    api.conversationStarters.generateConversationStarters
  );
  const { user } = useUser();
  const { createNewConversationWithResponse } = useCreateConversation();
  const navigate = useNavigate();
  const { lockSelection, unlockSelection } = useTextSelection();

  useEffect(() => {
    async function fetchPrompts() {
      try {
        setIsLoading(true);
        const generatedPrompts = await generateStarters({ selectedText });
        setPrompts(generatedPrompts);
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to generate conversation starters:", error);
        }
        // Use fallback prompts on error
        setPrompts([
          "Can you explain this in more detail?",
          "What are the implications of this?",
          "How does this relate to other concepts?",
          "Can you give me a practical example?",
          "What are the pros and cons of this approach?",
        ]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPrompts();
  }, [selectedText, generateStarters]);

  useEffect(() => {
    if (open) {
      lockSelection();
    } else {
      unlockSelection();
    }
  }, [open, lockSelection, unlockSelection]);

  const handleStartConversation = async (prompt: string) => {
    if (!user) {
      return;
    }

    try {
      const conversationId = await createNewConversationWithResponse({
        firstMessage: prompt,
        userId: user._id,
        generateTitle: true,
      });

      if (conversationId) {
        // Navigate to conversation - the Convex action already started the assistant response
        navigate(ROUTES.CHAT_CONVERSATION(conversationId));
        onOpenChange(false);
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Failed to start conversation:", error);
      }
      const { toast } = await import("sonner");
      toast.error("Failed to start conversation", {
        description:
          "Unable to create conversation from this prompt. Please try again.",
      });
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild data-conversation-starter="true">
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className={cn("w-[380px] p-0 max-h-[300px]", className)}
        collisionPadding={10}
        data-conversation-starter="true"
        side="bottom"
        sideOffset={8}
      >
        <div className="overflow-hidden rounded-xl border-0 bg-background">
          {isLoading ? (
            <div className="flex items-center justify-center px-4 py-6">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Spinner size="sm" />
                <span className="text-sm">Generating ideas...</span>
              </div>
            </div>
          ) : (
            <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/50 max-h-[300px] overflow-y-auto">
              <div className="space-y-2 p-4">
                {prompts.map(prompt => (
                  <button
                    key={prompt}
                    className="w-full cursor-pointer rounded-md border-0 bg-transparent p-3 text-left text-sm text-foreground transition-colors duration-200 hover:bg-accent/50"
                    onClick={() => handleStartConversation(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
