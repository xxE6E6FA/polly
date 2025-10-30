import type { Id } from "@convex/_generated/dataModel";
import {
  CaretDownIcon,
  ChatCircleIcon,
  CheckIcon,
  GitBranchIcon,
  MicrophoneIcon,
  PaperPlaneTiltIcon,
  SquareIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
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
import { useReasoningConfig } from "@/hooks/use-reasoning";
import { cn } from "@/lib/utils";
import type { ConversationId, ReasoningConfig } from "@/types";

const ICON_WRAPPER_CLASS = "grid h-full w-full place-items-center text-current";

const ICON_CLASS = "h-4 w-4 shrink-0";

type RecordingWaveformProps = {
  data: number[];
};

const RecordingWaveform = ({ data }: RecordingWaveformProps) => {
  const hasSamples = data.length > 0;
  const barCount = 12;

  const bars = Array.from({ length: barCount }, (_, index) => {
    if (!hasSamples) {
      const progress = index / Math.max(1, barCount - 1);
      const wave = Math.sin(Math.PI * progress);
      const normalized = (wave + 1) / 2;
      const smoothed = normalized ** 0.8;
      return 0.28 + smoothed * 0.24;
    }

    const segmentSize = data.length / barCount;
    const start = Math.floor(index * segmentSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * segmentSize));

    let peak = 0;
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const sample = Math.abs(data[sampleIndex] ?? 0);
      if (sample > peak) {
        peak = sample;
      }
    }

    if (peak < 0.025) {
      return 0.15;
    }

    const amplified = Math.min(1.1, peak * 4.0);
    const curved = amplified ** 0.55;
    return Math.min(1, Math.max(0.15, curved));
  });

  return (
    <div
      className="flex h-8 items-center justify-end gap-0.5 px-2 py-1.5"
      aria-hidden="true"
    >
      {bars.map((value, index) => {
        const height = `${Math.min(1, value) * 100}%`;
        const opacity = 0.5 + value * 0.5;
        const barId = `bar-${index}-${Math.floor(value * 1000)}`;

        return (
          <div
            key={barId}
            className="flex h-full w-0.5 items-center justify-center transition-all duration-500 ease-in-out"
          >
            <div
              className="w-full rounded-full bg-primary-foreground transition-all duration-500 ease-in-out"
              style={{ height, opacity }}
            />
          </div>
        );
      })}
    </div>
  );
};

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

  const shouldShowDropdown =
    hasExistingMessages &&
    conversationId &&
    onSendAsNewConversation &&
    !isStreaming &&
    hasInputText;

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
        <span className={ICON_WRAPPER_CLASS}>
          <SquareIcon className={ICON_CLASS} weight="fill" aria-hidden="true" />
        </span>
      );
    }

    if (isLoading || isSummarizing) {
      return (
        <span className={ICON_WRAPPER_CLASS}>
          <Spinner
            size="sm"
            variant="white"
            className="!grid h-full w-full place-items-center [&_svg]:h-4 [&_svg]:w-4"
          />
        </span>
      );
    }

    if (!hasInputText && isTranscribing) {
      return (
        <span className={ICON_WRAPPER_CLASS}>
          <Spinner
            size="sm"
            variant="white"
            className="!grid h-full w-full place-items-center [&_svg]:h-4 [&_svg]:w-4"
          />
        </span>
      );
    }

    if (!hasInputText && isRecording) {
      return (
        <span className={ICON_WRAPPER_CLASS}>
          <CheckIcon className={ICON_CLASS} weight="bold" aria-hidden="true" />
        </span>
      );
    }

    if (!hasInputText && isSupported) {
      return (
        <span className={ICON_WRAPPER_CLASS}>
          <MicrophoneIcon className={ICON_CLASS} aria-hidden="true" />
        </span>
      );
    }

    return (
      <span className={ICON_WRAPPER_CLASS}>
        <PaperPlaneTiltIcon className={ICON_CLASS} aria-hidden="true" />
      </span>
    );
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
    hoverScaleClasses = isExpanded
      ? "hover:scale-[1.02] active:scale-[0.98]"
      : "hover:scale-105 active:scale-95";
  }

  return (
    <div className="relative">
      <div
        className={cn(
          "chat-input-send-group relative flex items-stretch",
          "h-8",
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
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => onAcceptTranscribe?.()}
                    aria-label="Use transcript"
                  >
                    <CheckIcon
                      className="h-3.5 w-3.5"
                      weight="bold"
                      aria-hidden="true"
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs">Use transcript</div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="h-7 w-7 rounded-full text-primary-foreground hover:bg-primary-foreground/15"
                    onClick={() => onCancelTranscribe?.()}
                    aria-label="Discard recording"
                  >
                    <XIcon
                      className="h-3.5 w-3.5"
                      weight="bold"
                      aria-hidden="true"
                    />
                  </Button>
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
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={
                      isLoading || isSummarizing || !isExpanded || isCollapsing
                    }
                    type="button"
                    variant="ghost"
                    aria-label="More send options"
                    title="More send options"
                    className={cn(
                      "absolute left-0 top-0 bottom-0",
                      "w-8 h-8 p-0",
                      "grid place-items-center rounded-full",
                      "relative z-10",
                      "transition-all transform-gpu",
                      // Upload-like hover/active scale when expanded
                      "hover:scale-105 active:scale-95",
                      dropdownMenuTriggerAnimationClasses,
                      "hover:bg-transparent",
                      "focus-visible:bg-transparent",
                      "disabled:cursor-not-allowed",
                      // Focus ring: use outside ring like upload/send
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      // Text color to drive icon via text-current
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
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className={cn("w-64 p-1")}
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
                  onSendAsNewConversation?.(false, personaId, reasoningConfig)
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
          </DropdownMenu>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              disabled={isButtonDisabled}
              type={
                isStreaming || (!hasInputText && isRecording)
                  ? "button"
                  : "submit"
              }
              variant="ghost"
              className={cn(
                "absolute top-0 bottom-0 right-0 w-8 p-0 h-8 leading-none rounded-full",
                // Use grid centering to align icon perfectly
                "!grid place-items-center !items-center !justify-center !gap-0",
                "relative z-10",
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
                // Background highlight handled by the overlay above; keep button surface transparent
                "disabled:cursor-not-allowed",
                "transition-colors duration-200",
                // Focus ring: use outside ring like upload for consistency
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
