import { CheckIcon, XIcon } from "@phosphor-icons/react";
import { ChatInputIconButton } from "@/components/ui/chat-input-icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RecordingWaveform } from "./recording-waveform";

type RecordingControlsProps = {
  waveform: number[];
  onAccept?: () => Promise<void>;
  onCancel?: () => Promise<void>;
};

export const RecordingControls = ({
  waveform,
  onAccept,
  onCancel,
}: RecordingControlsProps) => {
  return (
    <>
      <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-0.5 z-10">
        <Tooltip>
          <TooltipTrigger delayDuration={200}>
            <ChatInputIconButton
              className="border-none shadow-none"
              type="button"
              size="sm"
              variant="default"
              onClick={() => onAccept?.()}
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
          <TooltipTrigger delayDuration={200}>
            <ChatInputIconButton
              className="border-none shadow-none"
              type="button"
              size="sm"
              variant="default"
              onClick={() => onCancel?.()}
              aria-label="Discard recording"
            >
              <XIcon className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
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
  );
};
