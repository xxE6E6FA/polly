import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  CheckIcon,
  MicrophoneIcon,
  PaperPlaneTiltIcon,
  SquareIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RecordingWaveform } from "@/components/chat-input/recording-waveform";
import { SendOptionsMenu } from "@/components/chat-input/send-options-menu";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
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
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { cn } from "@/lib/utils";
import type { ConversationId, ReasoningConfig } from "@/types";

const ICON_CLASS = "h-4 w-4 shrink-0";

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
  isSupported?: boolean;
  isRecording?: boolean;
  isTranscribing?: boolean;
  waveform?: number[];
  onStartTranscribe?: () => Promise<void>;
  onCancelTranscribe?: () => Promise<void>;
  onAcceptTranscribe?: () => Promise<void>;
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
  isSupported = false,
  isRecording = false,
  isTranscribing = false,
  waveform = [],
  onStartTranscribe,
  onCancelTranscribe,
  onAcceptTranscribe,
}: SendButtonGroupProps) => {
  const [reasoningConfig] = useReasoningConfig();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasBeenEnabled, setHasBeenEnabled] = useState(false);
  const [isCollapsing, setIsCollapsing] = useState(false);

  // Show dropdown for "send as new conversation" option
  // WHY: When in an existing conversation with input text, users can branch
  // into a new conversation or send to current one via the dropdown.
  const shouldShowDropdown =
    hasExistingMessages &&
    conversationId &&
    onSendAsNewConversation &&
    !isStreaming &&
    hasInputText;

  // Track which segment of the button is hovered for visual feedback
  const [hoveredSegment, setHoveredSegment] = useState<
    "dropdown" | "send" | null
  >(null);

  const dropdownHighlightClass = (() => {
    if (hoveredSegment !== "dropdown") {
      return "bg-transparent";
    }
    if (isStreaming) {
      return "bg-danger/80";
    }
    if (canSend) {
      return "bg-primary/80";
    }
    return "bg-primary/15";
  })();

  const sendHighlightClass = (() => {
    if (hoveredSegment !== "send") {
      return "bg-transparent";
    }
    if (isStreaming) {
      return "bg-danger/75";
    }
    if (canSend) {
      return "bg-primary/80";
    }
    return "bg-primary/15";
  })();

  useEffect(() => {
    if (dropdownOpen) {
      setHoveredSegment("dropdown");
    } else {
      setHoveredSegment(prev => (prev === "dropdown" ? null : prev));
    }
  }, [dropdownOpen]);

  const getButtonTitle = () => {
    if (isStreaming) {
      return "Stop generation";
    }
    if (!hasInputText && isRecording) {
      return "Click to accept recording";
    }
    if (!hasInputText && isTranscribing) {
      return "Transcribing...";
    }
    if (!hasInputText && isSupported) {
      return "Start voice input";
    }
    if (hasApiKeys === false) {
      return "Configure API keys to start chatting";
    }
    if (hasEnabledModels === false) {
      return "Enable models in settings to start chatting";
    }
    if (canSend) {
      return "Send message";
    }
    if (hasInputText) {
      return "Send message";
    }
    return "Start voice input";
  };

  // Manage button expansion/collapse animation
  // WHY: The send button expands from a circle to a pill when the dropdown appears.
  // We use isCollapsing state to trigger a smooth exit animation before actually
  // collapsing, preventing jarring visual jumps.
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

  const renderButtonContent = useMemo(() => {
    if (isStreaming) {
      return (
        <SquareIcon className={ICON_CLASS} weight="fill" aria-hidden="true" />
      );
    }

    if (isLoading || isSummarizing) {
      return (
        <Spinner
          size="sm"
          variant="white"
          className="[&_svg]:h-4 [&_svg]:w-4"
        />
      );
    }

    if (!hasInputText && isTranscribing) {
      return (
        <Spinner
          size="sm"
          variant="white"
          className="[&_svg]:h-4 [&_svg]:w-4"
        />
      );
    }

    if (!hasInputText && isRecording) {
      return (
        <CheckIcon className={ICON_CLASS} weight="bold" aria-hidden="true" />
      );
    }

    if (!hasInputText && isSupported) {
      return <MicrophoneIcon className={ICON_CLASS} aria-hidden="true" />;
    }

    return <PaperPlaneTiltIcon className={ICON_CLASS} aria-hidden="true" />;
  }, [
    isStreaming,
    isLoading,
    isSummarizing,
    hasInputText,
    isSupported,
    isTranscribing,
    isRecording,
  ]);

  const dropdownMenuTriggerAnimationClasses = useMemo(() => {
    if (isExpanded && !isCollapsing) {
      return "opacity-100 scale-100 duration-500 delay-100 ease-bounce";
    }
    if (isCollapsing) {
      return "opacity-0 scale-90 duration-200 ease-out";
    }
    return "opacity-0 scale-75 duration-300 ease-out";
  }, [isExpanded, isCollapsing]);

  const isButtonDisabled = useMemo(() => {
    if (isStreaming) {
      return !onStop;
    }
    const isZeroState = !hasInputText;
    if (isZeroState && isRecording) {
      return false;
    }
    if (isZeroState && (isTranscribing || !isSupported)) {
      return true;
    }
    return !canSend || isLoading || isSummarizing;
  }, [
    isStreaming,
    onStop,
    hasInputText,
    isRecording,
    isTranscribing,
    isSupported,
    canSend,
    isLoading,
    isSummarizing,
  ]);

  const handleButtonClick = useCallback(() => {
    if (isStreaming && onStop) {
      onStop();
      return;
    }
    if (!hasInputText && isRecording && onAcceptTranscribe) {
      onAcceptTranscribe();
      return;
    }
    const isZeroState = !hasInputText;
    if (isZeroState && !isRecording && !isTranscribing && onStartTranscribe) {
      onStartTranscribe();
      return;
    }
    if (hasInputText && !isStreaming) {
      onSend();
    }
  }, [
    isStreaming,
    onStop,
    hasInputText,
    isRecording,
    onAcceptTranscribe,
    isTranscribing,
    onStartTranscribe,
    onSend,
  ]);

  const isRecordingInZeroState = !hasInputText && isRecording;
  const shouldShowWaveform = isRecordingInZeroState;

  const isNotCollapsing = !isCollapsing;
  const canShowHoverScale = isNotCollapsing && !shouldShowWaveform;

  const easingClass = isCollapsing ? "ease-collapse" : "ease-expand";

  // Calculate width based on state
  let widthClass: string;
  if (shouldShowWaveform) {
    widthClass = "w-[120px] duration-300";
  } else if (isExpanded) {
    widthClass = "w-[64px] duration-500";
  } else {
    widthClass = "w-8 duration-300";
  }

  // Calculate background and border styles
  let backgroundClass: string;
  if (isStreaming) {
    backgroundClass = "bg-danger hover:bg-danger/90 border border-danger";
  } else if (canSend || isRecordingInZeroState) {
    backgroundClass = "bg-primary hover:bg-primary/90 border border-primary";
  } else {
    backgroundClass =
      "bg-primary/20 border border-primary/30 dark:bg-primary/15 dark:border-primary/25";
  }

  // Calculate hover scale classes
  let hoverScaleClasses: string | undefined;
  if (canShowHoverScale) {
    hoverScaleClasses = "";
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "relative flex items-stretch",
          "h-8 rounded-full",
          "transition-all",
          easingClass,
          widthClass,
          "overflow-visible",
          isCollapsing && "scale-[0.98]",
          backgroundClass,
          hoverScaleClasses,
          "transform-gpu"
        )}
        style={{
          animation:
            hasBeenEnabled &&
            canSend &&
            !isExpanded &&
            !isCollapsing &&
            !shouldShowWaveform
              ? "button-entrance 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : undefined,
        }}
      >
        {shouldShowWaveform && (
          <>
            <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-0.5 z-10">
              <Tooltip>
                <TooltipTrigger>
                  <ChatInputIconButton
                    type="button"
                    size="sm"
                    variant="default"
                    onClick={() => onAcceptTranscribe?.()}
                    aria-label="Use transcript"
                  >
                    <CheckIcon
                      className="h-3.5 w-3.5"
                      weight="bold"
                      aria-hidden="true"
                    />
                  </ChatInputIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">Use transcript</div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <ChatInputIconButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => onCancelTranscribe?.()}
                    aria-label="Discard recording"
                  >
                    <XIcon
                      className="h-3.5 w-3.5"
                      weight="bold"
                      aria-hidden="true"
                    />
                  </ChatInputIconButton>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">Discard recording</div>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="absolute right-[60px] top-0 bottom-0 left-0 flex items-center overflow-hidden">
              <div className="ml-auto">
                <RecordingWaveform data={waveform} />
              </div>
            </div>
          </>
        )}
        {(isExpanded || isCollapsing) && !shouldShowWaveform && (
          <div
            className="pointer-events-none absolute inset-0 flex overflow-hidden"
            style={{ borderRadius: "inherit" }}
          >
            {/* Hover/focus background highlight for each segment when pill is expanded */}
            <div
              className={cn(
                "flex-1 transition-colors duration-200",
                dropdownHighlightClass
              )}
            />
            <div
              className={cn(
                "flex-1 transition-colors duration-200",
                sendHighlightClass
              )}
            />
          </div>
        )}
        {shouldShowDropdown && (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <Tooltip>
              <TooltipTrigger>
                <DropdownMenuTrigger>
                  <Button
                    disabled={
                      isLoading || isSummarizing || !isExpanded || isCollapsing
                    }
                    type="button"
                    variant="ghost"
                    size="icon-pill"
                    aria-label="More send options"
                    title="More send options"
                    className={cn(
                      "absolute left-0 top-0 bottom-0",
                      "relative z-10",
                      "gap-0",
                      "transition-all transform-gpu",
                      dropdownMenuTriggerAnimationClasses,
                      "hover:bg-transparent",
                      "focus-visible:bg-transparent",
                      "disabled:cursor-not-allowed",
                      "text-primary-foreground",
                      "hover:text-primary-foreground",
                      "focus-visible:text-primary-foreground"
                    )}
                    onMouseEnter={() => setHoveredSegment("dropdown")}
                    onFocus={() => setHoveredSegment("dropdown")}
                    onMouseLeave={() =>
                      setHoveredSegment(prev =>
                        prev === "dropdown" ? null : prev
                      )
                    }
                    onBlur={() =>
                      setHoveredSegment(prev =>
                        prev === "dropdown" ? null : prev
                      )
                    }
                  >
                    <CaretDownIcon
                      className={cn(
                        "h-4 w-4 text-current transition-transform duration-300",
                        dropdownOpen && "rotate-180"
                      )}
                    />
                  </Button>
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
        )}

        <Tooltip>
          <TooltipTrigger>
            <Button
              disabled={isButtonDisabled}
              type={
                isStreaming || (!hasInputText && isRecording)
                  ? "button"
                  : "submit"
              }
              variant="ghost"
              size="icon-pill"
              className={cn(
                "absolute top-0 bottom-0 right-0",
                "relative z-10",
                "gap-0",
                shouldShowWaveform && "opacity-0 pointer-events-none",
                // Keep icon color in sync with state
                isStreaming || canSend || (!hasInputText && isSupported)
                  ? [
                      "text-primary-foreground",
                      "hover:text-primary-foreground",
                      "focus-visible:text-primary-foreground",
                    ]
                  : [
                      "text-primary dark:text-primary/70",
                      "hover:text-primary dark:hover:text-primary/70",
                    ],
                "hover:bg-transparent",
                "focus-visible:bg-transparent",
                "disabled:cursor-not-allowed",
                "transition-colors duration-200"
              )}
              onClick={handleButtonClick}
              onMouseEnter={() => setHoveredSegment("send")}
              onFocus={() => setHoveredSegment("send")}
              onMouseLeave={() =>
                setHoveredSegment(prev => (prev === "send" ? null : prev))
              }
              onBlur={() =>
                setHoveredSegment(prev => (prev === "send" ? null : prev))
              }
            >
              {renderButtonContent}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">{getButtonTitle()}</div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
