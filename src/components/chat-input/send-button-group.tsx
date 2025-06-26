import {
  CaretDownIcon,
  ChatCircleIcon,
  GitBranchIcon,
  PaperPlaneTiltIcon,
  SquareIcon,
} from "@phosphor-icons/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type SendButtonGroupProps = {
  canSend: boolean;
  isStreaming: boolean;
  isLoading: boolean;
  isSummarizing: boolean;
  hasExistingMessages: boolean;
  conversationId?: string;
  onSend: () => void;
  onStop?: () => void;
  onSendAsNewConversation?: (navigate: boolean) => void;
  hasApiKeys?: boolean;
  hasEnabledModels?: boolean | null;
};

export const SendButtonGroup = ({
  canSend,
  isStreaming,
  isLoading,
  isSummarizing,
  hasExistingMessages,
  conversationId,
  onSend,
  onStop,
  onSendAsNewConversation,
  hasApiKeys,
  hasEnabledModels,
}: SendButtonGroupProps) => {
  const showDropdown =
    hasExistingMessages &&
    conversationId &&
    onSendAsNewConversation &&
    canSend &&
    !isStreaming;

  return (
    <div className="flex items-stretch">
      {/* Send as new conversation dropdown */}
      {showDropdown && (
        <DropdownMenu>
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={isLoading || isSummarizing}
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center font-medium text-sm",
                    "h-9 w-8 p-0 rounded-l-full",
                    canSend
                      ? "bg-primary hover:bg-primary/90 text-primary-foreground border border-r-0 border-primary shadow-md"
                      : "bg-muted/30 text-muted-foreground border border-r-0 border-border/50",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  )}
                >
                  <CaretDownIcon
                    className={cn(
                      "h-3 w-3",
                      canSend ? "text-primary-foreground" : "text-current"
                    )}
                  />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="left" sideOffset={8}>
              <p className="text-xs">More send options</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className={cn(
              "w-64 p-1",
              "animate-in fade-in-0 zoom-in-95 duration-200"
            )}
          >
            <DropdownMenuItem
              disabled={isLoading || isSummarizing}
              className={cn(
                "flex items-start gap-3 cursor-pointer p-2.5 rounded-md",
                "hover:bg-primary/10 dark:hover:bg-primary/20",
                "focus:bg-primary/10 dark:focus:bg-primary/20",
                "transition-colors duration-200"
              )}
              onClick={() => onSendAsNewConversation?.(true)}
            >
              <div className="mt-0.5 flex-shrink-0">
                <ChatCircleIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
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
                "transition-colors duration-200"
              )}
              onClick={() => onSendAsNewConversation?.(false)}
            >
              <div className="mt-0.5 flex-shrink-0">
                <GitBranchIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">
                  Branch conversation
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Create a new conversation but stay in the current one
                </p>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Send/Stop button */}
      <button
        disabled={isStreaming ? !onStop : !canSend}
        type={isStreaming ? "button" : "submit"}
        className={cn(
          "inline-flex items-center justify-center font-medium text-sm",
          "h-9 w-9 p-0 rounded-full transition-all duration-200",
          showDropdown ? "rounded-l-none" : "",
          isStreaming
            ? "bg-danger hover:bg-danger/90 text-white border border-danger shadow-md hover:shadow-lg"
            : canSend
              ? "bg-primary hover:bg-primary/90 text-primary-foreground border border-primary shadow-md hover:shadow-lg"
              : "bg-muted/30 text-muted-foreground cursor-not-allowed border border-border/50",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        title={
          isStreaming
            ? "Stop generation"
            : hasApiKeys === false
              ? "Configure API keys to start chatting"
              : hasEnabledModels === false
                ? "Enable models in settings to start chatting"
                : canSend
                  ? "Send message"
                  : undefined
        }
        onClick={isStreaming ? onStop : onSend}
      >
        {isStreaming ? (
          <SquareIcon className="h-3.5 w-3.5 fill-current" />
        ) : isLoading || isSummarizing ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <PaperPlaneTiltIcon className="h-4 w-4" />
        )}
      </button>
    </div>
  );
};
