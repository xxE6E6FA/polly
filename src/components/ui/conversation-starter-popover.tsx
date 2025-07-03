import { useEffect, useState } from "react";

import { useNavigate } from "react-router";

import { Spinner } from "@/components/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useTextSelection } from "@/hooks/use-text-selection";
import { useQueryUserId } from "@/hooks/use-query-user-id";
import { useConvexActionOptimized } from "@/hooks/use-convex-cache";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";

// Simple hash function to create stable keys from prompt content
const hashString = (str: string): string => {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString();
};

// Generate a stable key for each prompt
const generatePromptKey = (prompt: string, index: number): string => {
  // Use content hash as primary key, with index as fallback for empty strings
  const contentHash = hashString(prompt.trim());
  return contentHash || `fallback-${index}`;
};

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

  const queryUserId = useQueryUserId();
  const { createConversation } = useCreateConversation();
  const navigate = useNavigate();
  const { lockSelection, unlockSelection } = useTextSelection();

  // Use optimized action hook for generating starters
  const { executeAsync: generateStarters, isLoading } =
    useConvexActionOptimized<string[], { selectedText: string }>(
      api.conversationStarters.generateConversationStarters,
      {
        onSuccess: generatedPrompts => {
          setPrompts(generatedPrompts);
        },
        onError: error => {
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
        },
      }
    );

  useEffect(() => {
    async function fetchPrompts() {
      await generateStarters({ selectedText });
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
    if (!queryUserId) {
      return;
    }

    try {
      const conversationId = await createConversation({
        firstMessage: prompt,
        userId: queryUserId,
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
      <PopoverTrigger asChild className={className}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-4"
        side="top"
        sideOffset={8}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <h3 className="font-medium">Start a conversation</h3>
            <p className="text-sm text-muted-foreground">
              Choose a prompt to begin exploring this topic
            </p>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="space-y-2 text-center">
                <Spinner className="mx-auto" size="sm" />
                <p className="text-sm text-muted-foreground">
                  Generating prompts...
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {prompts.map((prompt, index) => (
                <button
                  key={generatePromptKey(prompt, index)}
                  className={cn(
                    "w-full rounded-lg border bg-background p-3 text-left text-sm transition-colors",
                    "hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                  )}
                  onClick={() => handleStartConversation(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
