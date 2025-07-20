import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  ChatCircleIcon,
  GitBranchIcon,
  PaperPlaneTiltIcon,
  SquareIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { cn } from "@/lib/utils";
import type { ConversationId, ReasoningConfig } from "@/types";

type SendButtonGroupProps = {
  canSend: boolean;
  isStreaming: boolean;
  isLoading: boolean;
  isSummarizing: boolean;
  hasExistingMessages: boolean;
  conversationId?: ConversationId;
  hasInputText: boolean;
  onSend: () => void;
  onStop?: () => void;
  onSendAsNewConversation?: (
    navigate: boolean,
    personaId?: Id<"personas"> | null,
    reasoningConfig?: ReasoningConfig
  ) => void;
  hasApiKeys?: boolean;
  hasEnabledModels?: boolean | null;
  personaId?: Id<"personas"> | null;
  reasoningConfig?: ReasoningConfig;
};

export const SendButtonGroup = ({
  canSend,
  isStreaming,
  isLoading,
  isSummarizing,
  hasExistingMessages,
  conversationId,
  hasInputText,
  onSend,
  onStop,
  onSendAsNewConversation,
  hasApiKeys,
  hasEnabledModels,
  personaId,
  reasoningConfig,
}: SendButtonGroupProps) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasBeenEnabled, setHasBeenEnabled] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);

  const shouldShowDropdown =
    hasExistingMessages &&
    conversationId &&
    onSendAsNewConversation &&
    !isStreaming &&
    hasInputText;

  useEffect(() => {
    const shouldExpand = canSend && shouldShowDropdown;

    if (shouldExpand && !isExpanded) {
      setIsExpanded(true);
      setIsCollapsing(false);
    } else if (!shouldExpand && isExpanded) {
      // Start collapse animation
      setIsCollapsing(true);
      // Delay actual state change for smoother animation
      const timer = setTimeout(() => {
        setIsExpanded(false);
        setIsCollapsing(false);
      }, 100);
      return () => clearTimeout(timer);
    }

    // Track if it's ever been enabled for entrance animation
    if (canSend && !hasBeenEnabled) {
      setHasBeenEnabled(true);
    }
  }, [canSend, shouldShowDropdown, isExpanded, hasBeenEnabled]);

  return (
    <div className="relative">
      <div
        className={cn(
          "relative flex items-stretch overflow-hidden",
          "h-9",
          "transition-all",
          isCollapsing
            ? "ease-&lsqb;cubic-bezier(0.5,0,0.75,0)&rsqb;"
            : "ease-&lsqb;cubic-bezier(0.34,1.56,0.64,1)&rsqb;",
          isExpanded
            ? "w-[72px] rounded-full duration-500"
            : "w-9 rounded-full duration-300",
          isCollapsing && "scale-[0.98]",
          isStreaming
            ? "bg-danger hover:bg-danger/90 border border-danger shadow-md hover:shadow-lg"
            : canSend
              ? "bg-primary hover:bg-primary/90 border border-primary shadow-md hover:shadow-lg"
              : "bg-primary/20 border border-primary/30 shadow-sm dark:bg-primary/15 dark:border-primary/25",
          !isCollapsing && "hover:scale-[1.02] active:scale-[0.98]",
          "transform-gpu"
        )}
        style={{
          animation:
            hasBeenEnabled && canSend && !isExpanded && !isCollapsing
              ? "button-entrance 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : undefined,
        }}
      >
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <TooltipWrapper
            content="More send options"
            open={!dropdownOpen && Boolean(isExpanded) && !isCollapsing}
            side="left"
            delayDuration={500}
          >
            <DropdownMenuTrigger asChild>
              <button
                disabled={
                  isLoading || isSummarizing || !isExpanded || isCollapsing
                }
                type="button"
                className={cn(
                  "absolute left-0 top-0 bottom-0",
                  "w-8",
                  "inline-flex items-center justify-center",
                  "transition-all",
                  isExpanded && !isCollapsing
                    ? "opacity-100 scale-100 duration-500 delay-100 ease-&lsqb;cubic-bezier(0.68,-0.55,0.265,1.55)&rsqb;"
                    : isCollapsing
                      ? "opacity-0 scale-90 duration-200 ease-out"
                      : "opacity-0 scale-75 duration-300 ease-out",
                  !isCollapsing && "hover:bg-black/5 dark:hover:bg-white/5",
                  "disabled:cursor-not-allowed",
                  "focus:outline-none"
                )}
              >
                <CaretDownIcon
                  className={cn(
                    "h-3 w-3",
                    isStreaming ? "text-white" : "text-primary-foreground",
                    "transition-transform duration-300",
                    dropdownOpen && "rotate-180"
                  )}
                />
              </button>
            </DropdownMenuTrigger>
          </TooltipWrapper>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className={cn(
              "w-64 p-1",
              "animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-300"
            )}
          >
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
                onSendAsNewConversation?.(true, personaId, reasoningConfig)
              }
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
                "transition-all duration-200",
                "hover:translate-x-0.5"
              )}
              onClick={() =>
                onSendAsNewConversation?.(false, personaId, reasoningConfig)
              }
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

        <div
          className={cn(
            "absolute left-8 top-1/2 -translate-y-1/2 h-5 w-px",
            "transition-opacity",
            isExpanded && !isCollapsing
              ? "opacity-20 duration-500 delay-150"
              : "opacity-0 duration-150",
            isStreaming ? "bg-white" : "bg-primary-foreground"
          )}
        />

        <button
          disabled={
            isStreaming ? !onStop : !canSend || isLoading || isSummarizing
          }
          type={isStreaming ? "button" : "submit"}
          className={cn(
            "absolute top-0 bottom-0 right-0",
            "w-9",
            "inline-flex items-center justify-center",
            canSend ? "text-primary-foreground" : "",
            "disabled:cursor-not-allowed",
            "focus:outline-none",
            canSend && "hover:bg-black/5 dark:hover:bg-white/5",
            "transition-colors duration-200"
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
          <div
            className={cn(
              "flex items-center justify-center",
              "transition-all",
              isCollapsing || !canSend
                ? "ease-out duration-300"
                : "ease-&lsqb;cubic-bezier(0.34,1.56,0.64,1)&rsqb; duration-500",
              canSend && !isCollapsing
                ? "scale-100 rotate-0"
                : "scale-90 rotate-0"
            )}
            style={{
              animation:
                hasBeenEnabled && canSend && !isCollapsing
                  ? "icon-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  : undefined,
            }}
          >
            {isStreaming ? (
              <SquareIcon
                className={cn("h-3.5 w-3.5 fill-current", "text-white")}
              />
            ) : isLoading || isSummarizing ? (
              <Spinner size="sm" variant="white" className="h-3.5 w-3.5" />
            ) : (
              <PaperPlaneTiltIcon
                className={cn(
                  "h-4 w-4",
                  canSend
                    ? "text-primary-foreground"
                    : "text-primary dark:text-primary/70"
                )}
              />
            )}
          </div>
        </button>
      </div>
    </div>
  );
};
