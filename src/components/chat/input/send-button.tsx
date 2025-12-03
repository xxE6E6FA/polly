import {
  CheckIcon,
  MicrophoneIcon,
  PaperPlaneTiltIcon,
  SquareIcon,
} from "@phosphor-icons/react";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const ICON_CLASS = "h-4 w-4 shrink-0";

type SendButtonProps = {
  className?: string;
  disabled: boolean;
  type: "button" | "submit";
  isStreaming: boolean;
  isLoading: boolean;
  isSummarizing: boolean;
  hasInputText: boolean;
  isSupported: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  canSend: boolean;
  hasApiKeys?: boolean;
  hasEnabledModels?: boolean | null;
  isQuotaExhausted?: boolean;
  onClick: () => void;
};

const getButtonContent = ({
  isStreaming,
  isLoading,
  isSummarizing,
  hasInputText,
  isTranscribing,
  isRecording,
  isSupported,
}: Pick<
  SendButtonProps,
  | "isStreaming"
  | "isLoading"
  | "isSummarizing"
  | "hasInputText"
  | "isTranscribing"
  | "isRecording"
  | "isSupported"
>) => {
  if (isStreaming) {
    return (
      <>
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner className="h-full w-full [&_svg]:h-full [&_svg]:w-full" />
        </div>
        <SquareIcon
          className="w-3 h-3 text-primary"
          weight="fill"
          aria-hidden="true"
        />
      </>
    );
  }

  if (isLoading || isSummarizing || isTranscribing) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spinner
          variant="white"
          className="h-full w-full [&_svg]:h-full [&_svg]:w-full"
        />
      </div>
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
};

const getButtonTitle = ({
  isStreaming,
  hasInputText,
  isRecording,
  isTranscribing,
  isSupported,
  hasApiKeys,
  hasEnabledModels,
  canSend,
  isQuotaExhausted,
}: Pick<
  SendButtonProps,
  | "isStreaming"
  | "hasInputText"
  | "isRecording"
  | "isTranscribing"
  | "isSupported"
  | "hasApiKeys"
  | "hasEnabledModels"
  | "canSend"
  | "isQuotaExhausted"
>) => {
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
  if (isQuotaExhausted) {
    return "Monthly limit reached - add API keys for unlimited messages";
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

export const SendButton = ({
  className,
  disabled,
  type,
  isStreaming,
  isLoading,
  isSummarizing,
  hasInputText,
  isSupported,
  isRecording,
  isTranscribing,
  canSend,
  hasApiKeys,
  hasEnabledModels,
  isQuotaExhausted,
  onClick,
}: SendButtonProps) => {
  const buttonContent = getButtonContent({
    isStreaming,
    isLoading,
    isSummarizing,
    hasInputText,
    isTranscribing,
    isRecording,
    isSupported,
  });

  const buttonTitle = getButtonTitle({
    isStreaming,
    hasInputText,
    isRecording,
    isTranscribing,
    isSupported,
    hasApiKeys,
    hasEnabledModels,
    canSend,
    isQuotaExhausted,
  });

  return (
    <Tooltip>
      <TooltipTrigger>
        <ChatInputIconButton
          className={className}
          disabled={disabled}
          variant={
            isLoading || isSummarizing || isStreaming || isTranscribing
              ? "ghost"
              : "default"
          }
          type={type}
          onClick={onClick}
          aria-label={buttonTitle}
        >
          {buttonContent}
        </ChatInputIconButton>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">{buttonTitle}</div>
      </TooltipContent>
    </Tooltip>
  );
};
