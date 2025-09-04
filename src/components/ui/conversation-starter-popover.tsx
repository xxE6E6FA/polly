import { api } from "@convex/_generated/api";
import { useAuthToken } from "@convex-dev/auth/react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Spinner } from "@/components/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSelectedModel } from "@/hooks/use-selected-model";
import { useTextSelection } from "@/hooks/use-text-selection";
import { startAuthorStream } from "@/lib/ai/http-stream";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/toast-context";

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
  const generateStartersAction = useAction(
    api.conversationStarters.generateConversationStarters
  );

  const createConversationAction = useAction(
    api.conversations.createConversationAction
  );

  const managedToast = useToast();
  const navigate = useNavigate();
  const { lockSelection, unlockSelection } = useTextSelection();
  const [selectedModel] = useSelectedModel();

  useEffect(() => {
    async function fetchPrompts() {
      setIsLoading(true);
      try {
        const generatedPrompts = await generateStartersAction({ selectedText });
        setPrompts(generatedPrompts);
      } catch (_error) {
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
  }, [selectedText, generateStartersAction]);

  useEffect(() => {
    if (open) {
      lockSelection();
    } else {
      unlockSelection();
    }
  }, [open, lockSelection, unlockSelection]);

  const authToken = useAuthToken();
  const authRef = useRef<string | null | undefined>(authToken);
  useEffect(() => {
    authRef.current = authToken;
  }, [authToken]);
  const waitForToken = async (timeoutMs = 2000) => {
    const start = Date.now();
    let token = authRef.current;
    while (!token && Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 50));
      token = authRef.current;
    }
    return token ?? null;
  };
  const handleStartConversation = async (prompt: string) => {
    try {
      const result = await createConversationAction({
        firstMessage: prompt,
        title: "New Conversation",
        model: selectedModel?.modelId,
        provider: selectedModel?.provider,
      });

      if (result?.conversationId) {
        // Navigate to conversation immediately
        navigate(ROUTES.CHAT_CONVERSATION(result.conversationId));
        onOpenChange(false);

        // Start optimistic HTTP stream in the background; wait briefly for token
        if ("assistantMessageId" in result) {
          setTimeout(() => {
            (async () => {
              try {
                const token = await waitForToken(2000);
                await startAuthorStream({
                  convexUrl: import.meta.env.VITE_CONVEX_URL,
                  authToken: token || undefined,
                  conversationId: result.conversationId,
                  assistantMessageId: result.assistantMessageId,
                  modelId: selectedModel?.modelId,
                  provider: selectedModel?.provider,
                });
              } catch {
                // Ignore errors when starting stream
              }
            })();
          }, 0);
        }
      }
    } catch (_error) {
      managedToast.error("Failed to start conversation", {
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
                  // biome-ignore lint/suspicious/noArrayIndexKey: we don't need a stable key for this
                  key={index}
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
