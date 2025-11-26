import type { Id } from "@convex/_generated/dataModel";
import { ChatCircleIcon, GitBranchIcon } from "@phosphor-icons/react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ReasoningConfig } from "@/types";

type SendOptionsMenuProps = {
  isLoading: boolean;
  isSummarizing: boolean;
  onSendAsNewConversation: (
    navigate: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  personaId?: Id<"personas"> | null;
  reasoningConfig?: ReasoningConfig;
};

export const SendOptionsMenu = ({
  isLoading,
  isSummarizing,
  onSendAsNewConversation,
  personaId,
  reasoningConfig,
}: SendOptionsMenuProps) => {
  return (
    <DropdownMenuContent align="end" sideOffset={8} className={cn("w-64 p-1")}>
      <DropdownMenuItem
        disabled={isLoading || isSummarizing}
        className={cn(
          "flex items-start gap-3 cursor-pointer p-2.5 rounded-md",
          "hover:bg-primary/10 dark:hover:bg-primary/20",
          "focus:bg-primary/10 dark:focus:bg-primary/20",
          "transition-all duration-200",
          "hover:translate-x-0.5"
        )}
        onClick={() =>
          onSendAsNewConversation(true, personaId, reasoningConfig)
        }
      >
        <div className="mt-0.5 flex-shrink-0">
          <ChatCircleIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 stack-sm">
          <p className="text-sm font-medium leading-none">
            Send & open new chat
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Create a new conversation with this message and switch to it
          </p>
        </div>
      </DropdownMenuItem>

      <DropdownMenuItem
        disabled={isLoading || isSummarizing}
        className={cn(
          "flex items-start gap-3 cursor-pointer p-2.5 rounded-md",
          "hover:bg-primary/10 dark:hover:bg-primary/20",
          "focus:bg-primary/10 dark:focus:bg-primary/20",
          "transition-all duration-200",
          "hover:translate-x-0.5"
        )}
        onClick={() =>
          onSendAsNewConversation(false, personaId, reasoningConfig)
        }
      >
        <div className="mt-0.5 flex-shrink-0">
          <GitBranchIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 stack-sm">
          <p className="text-sm font-medium leading-none">
            Branch conversation
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Create a new conversation but stay in the current one
          </p>
        </div>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
};
