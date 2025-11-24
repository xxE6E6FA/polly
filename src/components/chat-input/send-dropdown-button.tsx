import type { Id } from "@convex/_generated/dataModel";
import { CaretDownIcon } from "@phosphor-icons/react";
import { SendOptionsMenu } from "@/components/chat-input/send-options-menu";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ReasoningConfig } from "@/types";

type SendDropdownButtonProps = {
  isLoading: boolean;
  isSummarizing: boolean;
  isExpanded: boolean;
  isCollapsing: boolean;
  dropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
  onSendAsNewConversation: (
    navigate: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  personaId?: Id<"personas"> | null;
  reasoningConfig: ReasoningConfig;
};

export const SendDropdownButton = ({
  isLoading,
  isSummarizing,
  isExpanded,
  isCollapsing,
  dropdownOpen,
  onDropdownOpenChange,
  onSendAsNewConversation,
  personaId,
  reasoningConfig,
}: SendDropdownButtonProps) => {
  const animationClasses = (() => {
    if (isExpanded && !isCollapsing) {
      return "opacity-100 scale-100 duration-500 delay-100 ease-bounce";
    }
    if (isCollapsing) {
      return "opacity-0 scale-90 duration-200 ease-out";
    }
    return "opacity-0 scale-75 duration-300 ease-out";
  })();

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={onDropdownOpenChange}>
      <Tooltip>
        <TooltipTrigger>
          <DropdownMenuTrigger>
            <div
              className={cn(
                "absolute left-0 top-0 bottom-0",
                "relative z-10",
                "transition-all transform-gpu",
                animationClasses,
                "hover:bg-transparent",
                "focus-visible:bg-transparent",
                "text-primary-foreground",
                "hover:text-primary-foreground",
                "focus-visible:text-primary-foreground"
              )}
            >
              <ChatInputIconButton
                className="border-none shadow-none"
                disabled={
                  isLoading || isSummarizing || !isExpanded || isCollapsing
                }
                type="button"
                aria-label="More send options"
              >
                <CaretDownIcon
                  className={cn(
                    "transition-transform duration-300",
                    dropdownOpen && "rotate-180"
                  )}
                />
              </ChatInputIconButton>
            </div>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">More send options</div>
        </TooltipContent>
      </Tooltip>
      <SendOptionsMenu
        isLoading={isLoading}
        isSummarizing={isSummarizing}
        onSendAsNewConversation={onSendAsNewConversation}
        personaId={personaId}
        reasoningConfig={reasoningConfig}
      />
    </DropdownMenu>
  );
};
